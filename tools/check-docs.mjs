// 文档 ↔ 代码一致性检查（CI 用，零依赖）
// 用法：node tools/check-docs.mjs
// 退出码：0 全部一致；1 有矛盾
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const algoPath = path.join(root, 'frontend/src/lib/scheduling-algorithm.js')

const DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  '毕业设计答辩知识体系.md',
  '使用手册.md',
  '排班操作速查指南.md',
]

const algo = fs.readFileSync(algoPath, 'utf8')
const algoLines = algo.replace(/\n$/, '').split('\n').length
const docs = {}
for (const d of DOCS) {
  const p = path.join(root, d)
  docs[d] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

const problems = []
const add = (msg) => problems.push(msg)

// 1) 算法行数
if (algoLines !== 401) add(`算法行数变了：现在 ${algoLines} 行，文档写的是 401——请同步所有“401 行”的表述`)

// 2) 关键实现必须存在
const mustImplement = [
  ['部长配额（部员≥5）', 'Math.max(1, Math.min(3, Math.ceil(buZhangTotal * 0.2)))'],
  ['部长配额（部员<5）', 'Math.max(5, Math.ceil(buZhangTotal / 2))'],
  ['主席团启用条件', '(buYuanTotal + buZhangTotal < 5)'],
  ['每周上限含需求总和', 'Math.max(fairnessBase, neededTotal)'],
]
for (const [name, snippet] of mustImplement) {
  if (!algo.includes(snippet)) add(`代码里找不到「${name}」的原始实现：${snippet}`)
}

// 3) 测试数字口径（README / CONTRIBUTING / 答辩体系）
const testRows = Object.entries(docs).filter(([n]) => /README|CONTRIBUTING|答辩知识体系/.test(n))
for (const [name, text] of testRows) {
  if (!text) continue
  if (!/965/.test(text)) add(`${name}：没有出现 965（测试项数口径）`)
  if (!/24\s*(个)?\s*(测试)?套件/.test(text)) add(`${name}：没有出现“24 个套件”口径`)
  // 历史遗留数字不应出现在“当前状态”表述里
  for (const stale of ['340 项', '324 项', '798 项']) {
    if (text.includes(stale)) add(`${name}：仍出现过期数字「${stale}」`)
  }
}

// 4) 只读分享的有效期选项：界面只有 7/30/长期
if (docs['使用手册.md'] && !/7\s*天\s*\/\s*30\s*天\s*\/\s*长期/.test(docs['使用手册.md'])) {
  add('使用手册：有效期选项应写“7 天 / 30 天 / 长期”（界面没有 90 天）')
}
for (const [name, text] of Object.entries(docs)) {
  if (text && /7\s*\/\s*30\s*\/\s*90/.test(text)) add(`${name}：仍出现“7/30/90”的有效期说法（界面无 90 天）`)
}

// 5) 答辩体系里必须有的算法要点
const defense = docs['毕业设计答辩知识体系.md'] || ''
if (defense) {
  for (const kw of ['四道', '豁免', '维度', '需求总和']) {
    if (!defense.includes(kw)) add(`毕业设计答辩知识体系.md：缺少关键表述「${kw}」`)
  }
  if (/部员少于\s*5\s*人时[，,]?\s*主席团/.test(defense)) {
    add('毕业设计答辩知识体系.md：主席团启用条件写成“部员少于 5 人”（应为“部员+部长<5”）')
  }
}

// 6) 课表格子数（21 = 7 天 × 3 档）：代码里应有 21 个布尔列；文档若提到“21”则应成对出现
const courseCols = (algo.match(/\b(mon|tue|wed|thu|fri|sat|sun)_(34|67|89)\b/g) || []).length
if (courseCols > 0 && courseCols !== 21) add(`课表列数异常：代码里出现 ${courseCols} 个时段字段，应为 21`)
for (const [name, text] of Object.entries(docs)) {
  if (/21\s*(个)?\s*格/.test(text) && !/7\s*天\s*×\s*3/.test(text)) {
    add(`${name}：写“21 格”时要同时说明“7 天 × 3 档”`)
  }
}

// 7) 新功能必须在用户手册里有说明
const manual = docs['使用手册.md'] || ''
if (manual && !manual.includes('只读分享')) add('使用手册.md：缺少“只读分享”一节（新功能未写进手册）')

// 输出
if (!problems.length) {
  console.log(`OK 文档与代码一致（算法 ${algoLines} 行，检查 ${DOCS.length} 份文档）`)
  process.exit(0)
}
console.error(`FAIL 发现 ${problems.length} 处不一致：`)
for (const p of problems) console.error('  - ' + p)
process.exit(1)
