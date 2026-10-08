/**
 * Excel 导入/导出测试（2026-10-05 新增）
 * 背景：为修复 xlsx 高危漏洞，库从 0.18.5 升级到官方修复版 0.20.3（本地 vendor 固定），
 *      必须验证「统计导出」与「成员Excel导入」两条路径完全正常。
 * 运行: node test-xlsx.mjs
 */
// xlsx 位于 frontend/node_modules（由 npm ci 安装，或从 vendor 目录解出）。
// 若未安装依赖，则优雅跳过本套件，保证「根目录测试无需依赖」这一特性依然成立。
let XLSX = null
for (const spec of ['./frontend/node_modules/xlsx/xlsx.mjs', 'xlsx']) {
  try { XLSX = await import(spec); break } catch { /* 继续尝试下一个 */ }
}
if (!XLSX) {
  console.log('⚠️  未找到 xlsx 依赖，跳过 Excel 测试套件。')
  console.log('   如需运行： cd frontend && npm ci   然后重新执行本脚本。')
  process.exit(0)
}
import fs from 'fs'
import path from 'path'

let passed = 0, failed = 0
const fails = []
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ❌ ' + name + ' — ' + e.message) }
}
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' 期望' + JSON.stringify(b) + ' 实际' + JSON.stringify(a)) }
function ok(v, m) { if (!v) throw new Error(m || 'expected truthy') }

console.log('='.repeat(60))
console.log('🧪 Excel 导入/导出测试（xlsx 0.20.3 修复版）')
console.log('='.repeat(60))

console.log('\n📋 1. 版本与安全（确认用的是修复版）')
test('xlsx 版本 >= 0.20.0（已修复原型污染/ReDoS）', () => {
  const v = XLSX.version
  const [maj, min] = v.split('.').map(Number)
  ok(maj > 0 || min >= 20, '当前版本 ' + v + ' 仍低于 0.20.0')
})

console.log('\n📋 2. 统计导出路径（Stats.jsx 用的 API）')
test('json_to_sheet → book_new → book_append_sheet → 写文件字节', () => {
  const data = [
    { 姓名: '张三', 角色: '部长', 值班次数: 3, 总时长: 4.5, 请假次数: 0 },
    { 姓名: '李四', 角色: '部员', 值班次数: 2, 总时长: 3, 请假次数: 1 },
    { 姓名: '王五', 角色: '主席团', 值班次数: 1, 总时长: 1.5, 请假次数: 0 },
  ]
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '值班统计')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  ok(buf && buf.length > 1000, '生成的文件应大于 1KB，实际 ' + (buf ? buf.length : 0))
  // 写盘再读回（模拟用户下载后打开）
  const tmp = path.join(process.env.TEMP || '.', 'test-stats.xlsx')
  fs.writeFileSync(tmp, buf)
  const wb2 = XLSX.read(fs.readFileSync(tmp), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]])
  eq(rows.length, 3, '行数')
  eq(rows[0].姓名, '张三', '中文姓名')
  eq(rows[0].总时长, 4.5, '数值')
  eq(wb2.SheetNames[0], '值班统计', '工作表名')
  fs.unlinkSync(tmp)
})

console.log('\n📋 3. 成员导入路径（Members.jsx 用的 binary 读法）')
test('binary 字符串读取 + sheet_to_json（与页面导入逻辑一致）', () => {
  const src = [
    { 姓名: '测试甲', 学号: '2026001', 电话: '13800000001', 角色: '部员' },
    { 姓名: '测试乙', 学号: '2026002', 电话: '13800000002', 角色: '部长' },
  ]
  const ws = XLSX.utils.json_to_sheet(src)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '成员')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  // 模拟 FileReader.readAsBinaryString 的结果
  const binary = buf.toString('binary')
  const wb2 = XLSX.read(binary, { type: 'binary' })
  const sheet = wb2.Sheets[wb2.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet)
  eq(rows.length, 2)
  eq(rows[0].姓名, '测试甲'); eq(rows[1].角色, '部长')
  eq(rows[0].电话, '13800000001', '电话应保持文本')
})
test('表头别名兼容（页面会把「名称/职位」等列名归一化）', () => {
  const src = [{ 名称: '别名甲', 职位: '部员' }]
  const ws = XLSX.utils.json_to_sheet(src)
  const rows = XLSX.utils.sheet_to_json(ws)
  ok(rows[0].名称 === '别名甲' && rows[0].职位 === '部员', '别名列应能读出')
})

console.log('\n📋 4. 数据健壮性')
test('200 行数据往返无损', () => {
  const data = []
  for (let i = 1; i <= 200; i++) data.push({ 序号: i, 姓名: '成员' + i, 时长: i * 1.5 })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'S')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  const back = XLSX.utils.sheet_to_json(XLSX.read(buf, { type: 'buffer' }).Sheets.S)
  eq(back.length, 200)
  eq(back[199].姓名, '成员200'); eq(back[199].时长, 300)
})
test('姓名含特殊字符不破坏文件', () => {
  const data = [{ 姓名: '阿"卜<i>杜拉·买买提_123', 时长: 1.5 }]
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  const back = XLSX.utils.sheet_to_json(XLSX.read(buf, { type: 'buffer' }).Sheets.S)
  eq(back[0].姓名, '阿"卜<i>杜拉·买买提_123')
})
test('空数据表不崩溃', () => {
  const ws = XLSX.utils.json_to_sheet([])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  ok(buf.length > 0, '空表也应能生成文件')
})
test('传错文件时不崩溃：要么抛可控错误、要么解析出 0 条有效数据（页面会提示格式不对）', () => {
  const inputs = ['这不是一个excel文件', '', '\u0000\u0001\u0002乱码', 'PK\x03\x04损坏的zip头']
  for (const input of inputs) {
    let rows = null
    try {
      const wb = XLSX.read(input, { type: 'binary' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet)
    } catch { rows = [] }
    // 与 Members.jsx 相同的过滤：没有「姓名」列 → 有效数据为 0
    const valid = (rows || []).filter(r => String(r['姓名'] || r['name'] || '').trim())
    eq(valid.length, 0, '无效输入不应产生有效成员行')
  }
})

console.log('\n' + '='.repeat(60))
console.log(`🏆 Excel 测试结果: ${passed}/${passed + failed} 通过`)
if (failed === 0) console.log('🎉 全部通过！')
else { console.log('⚠️ 失败项:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('='.repeat(60))