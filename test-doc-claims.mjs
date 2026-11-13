/**
 * 「文档承诺」一致性测试（test-doc-claims.mjs）
 *
 * 目的：把讲义/速查卡/笔记里写死的规则与公式，逐条用真实算法验证一遍。
 * 答辩时她会说“部长配额是 max(1,min(3,ceil(部长数×0.2)))”“每周上限是 max(半队人,需求总和)”……
 * 这些数字必须与代码一致，否则一句追问就崩。
 *
 * 每条 check 对应文档中的一句话；任何一条失败都说明“文档或代码有一边错了”。
 */
import { runSchedulingAlgorithm, resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'

const M = (id, role) => ({ id, name: id, role, active: true })
const dayOn = (days) => {
  const d = {}
  for (let i = 1; i <= 7; i++) d[i] = { isWorkday: days.includes(i) }
  return d
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

function run({ members, slotConfig = { '1_上午': 1 }, dayConfig = dayOn([1]), schedules = [], lastWeek = [], allAssignments = [], makeUpMembers = [], otherWeekSchedules = [], mode = '一般', weekType = '单周' }) {
  return runSchedulingAlgorithm({
    members, schedules, slotConfig, weekNumber: 8,
    lastWeek, allAssignments, makeUpMembers, otherWeekSchedules,
    dayConfig, weekType, mode,
  })
}

console.log('文档承诺一致性测试：')

console.log('— 1. 部长配额公式 —')
{
  // 部员≥5：max(1, min(3, ceil(部长×0.2)))
  const m1 = [...Array.from({ length: 10 }, (_, i) => M('y' + i, '部员')), ...Array.from({ length: 20 }, (_, i) => M('z' + i, '部长'))]
  const r1 = run({ members: m1 })
  check('部员10 + 部长20 → 部长配额 = 3（ceil(4) 被 min(3) 封顶）', r1.meta.perRoleMax['部长'] === 3, String(r1.meta.perRoleMax['部长']))

  const m2 = [...Array.from({ length: 5 }, (_, i) => M('y' + i, '部员')), M('z1', '部长')]
  const r2 = run({ members: m2 })
  check('部员5 + 部长1 → 部长配额 = 1（max(1) 保底）', r2.meta.perRoleMax['部长'] === 1, String(r2.meta.perRoleMax['部长']))

  // 部员<5：max(5, ceil(部长/2))
  const m3 = [M('y1', '部员'), M('y2', '部员'), ...Array.from({ length: 4 }, (_, i) => M('z' + i, '部长'))]
  const r3 = run({ members: m3 })
  check('部员2 + 部长4 → 部长配额 = 5（部员不足时部长顶主力）', r3.meta.perRoleMax['部长'] === 5, String(r3.meta.perRoleMax['部长']))
}

console.log('— 2. 主席团启用条件与配额 —')
{
  const big = [...Array.from({ length: 10 }, (_, i) => M('y' + i, '部员')), M('z1', '部长'), M('c1', '主席团')]
  const rb = run({ members: big })
  check('部员+部长≥5 → 主席团配额 = 0（不启用）', rb.meta.perRoleMax['主席团'] === 0, String(rb.meta.perRoleMax['主席团']))

  const small = [M('y1', '部员'), M('z1', '部长'), M('c1', '主席团'), M('c2', '主席团')]
  const rs = run({ members: small })
  check('部员+部长<5 → 启用主席团，配额 = max(1, ceil(2/2)) = 1', rs.meta.perRoleMax['主席团'] === 1, String(rs.meta.perRoleMax['主席团']))
}

console.log('— 3. 每周总人次上限 = max( max(5, 总人数/2), 需求总和 ) —')
{
  const many = Array.from({ length: 60 }, (_, i) => M('m' + i, '部员'))
  const slot1 = {}
  for (const d of [1, 2, 3, 4, 5]) for (const s of ['上午', '下午1', '下午2']) slot1[`${d}_${s}`] = 1
  const r1 = run({ members: many, slotConfig: slot1, dayConfig: dayOn([1, 2, 3, 4, 5]) })
  check('60 人、需求 15 人次 → 上限 = max(30, 15) = 30', r1.meta.maxPerWeek === 30, String(r1.meta.maxPerWeek))

  const few = Array.from({ length: 20 }, (_, i) => M('m' + i, '部员'))
  const slot2 = {}
  for (const d of [1, 2, 3, 4, 5]) for (const s of ['上午', '下午1', '下午2']) slot2[`${d}_${s}`] = 2
  const r2 = run({ members: few, slotConfig: slot2, dayConfig: dayOn([1, 2, 3, 4, 5]) })
  check('20 人、需求 30 人次 → 上限 = max(10, 30) = 30（不被公平下限压制）', r2.meta.maxPerWeek === 30, String(r2.meta.maxPerWeek))
}

console.log('— 4. 整周放假 → 0 条排班 —')
{
  const members = [M('a', '部员'), M('b', '部员')]
  const r = run({ members, slotConfig: { '1_上午': 1 }, dayConfig: dayOn([]) })
  check('所有天都不是工作日 → 0 条排班', r.assignments.length === 0, String(r.assignments.length))
  check('meta.workdays 为空', Array.isArray(r.meta.workdays) && r.meta.workdays.length === 0, JSON.stringify(r.meta.workdays))
}

console.log('— 5. 紧急模式：跳过连续性 + 标记 is_emergency —')
{
  const members = [M('a', '部员'), M('b', '部员')]
  const rNormal = run({ members, lastWeek: [{ member_id: 'a' }, { member_id: 'b' }] })
  check('一般模式：上周值过班的人本周不再排（0 条）', rNormal.assignments.length === 0, String(rNormal.assignments.length))
  const rUrgent = run({ members, lastWeek: [{ member_id: 'a' }, { member_id: 'b' }], mode: '紧急' })
  check('紧急模式：可以排上周值过班的人（≥1 条）', rUrgent.assignments.length >= 1, String(rUrgent.assignments.length))
  check('紧急模式：标记 is_emergency = true', rUrgent.assignments.every(a => a.is_emergency === true))
}

console.log('— 6. 调休映射：周六补周三 → 必须看周三的课表 —')
{
  const slotConfig = { '6_上午': 1 }
  const dayConfig = dayOn([6])
  dayConfig[6] = { isWorkday: true, substituteForOdd: 3, substituteForEven: 3 }
  const withWedClass = [M('a', '部员')]
  const sched = [{ member_id: 'a', week_type: '单周', wed_34: true }]
  const r1 = run({ members: withWedClass, schedules: sched, slotConfig, dayConfig })
  // 按文档：该时段冲突不能硬排，但“每天要有人”会回退到当天其它空闲时段
  check('周三上午有课的人，不会被排到“周六上午”（回退到别的时段）',
    r1.assignments.every(a => a.slot !== '上午'), JSON.stringify(r1.assignments.map(a => a.slot)))
  check('回退时仍然安排了（当天不断岗）', r1.assignments.length === 1, String(r1.assignments.length))

  // 极端：周三全天都有课 → 该天确实无人可排
  const allClass = [{ member_id: 'a', week_type: '单周', wed_34: true, wed_67: true, wed_89: true }]
  const r0 = run({ members: withWedClass, schedules: allClass, slotConfig, dayConfig })
  check('周三全天有课 → 该天确实排不出人（0 条）', r0.assignments.length === 0, String(r0.assignments.length))

  const sched2 = [{ member_id: 'a', week_type: '单周', wed_34: false }]
  const r2 = run({ members: withWedClass, schedules: sched2, slotConfig, dayConfig })
  check('周三没课 → 可以排到周六上午（1 条）', r2.assignments.length === 1 && r2.assignments[0].slot === '上午', JSON.stringify(r2.assignments.map(a => a.slot)))
  check('resolveScheduleKey(6, …, 单周) 返回被补那天的 key（wed）', resolveScheduleKey(6, dayConfig, '单周') === 'wed', resolveScheduleKey(6, dayConfig, '单周'))
}

console.log('— 7. 确定性：同样输入两次跑，结果一致 —')
{
  const members = [M('a', '部员'), M('b', '部长'), M('c', '主席团'), M('d', '部员')]
  const slotConfig = { '1_上午': 1, '1_下午1': 1, '2_上午': 1 }
  const dayConfig = dayOn([1, 2])
  const args = { members, slotConfig, dayConfig, allAssignments: [{ member_id: 'a' }, { member_id: 'b' }] }
  const r1 = run(args); const r2 = run(args)
  check('两次结果完全相同', JSON.stringify(r1.assignments) === JSON.stringify(r2.assignments))
}

console.log('— 8. 源码常量与文档一致（静态检查）—')
{
  const fs = await import('fs')
  const algo = fs.readFileSync('frontend/src/lib/scheduling-algorithm.js', 'utf8')
  const share = fs.readFileSync('frontend/src/pages/SharedSchedule.jsx', 'utf8')
  const mig = fs.readFileSync('database/migration-v8-share-links.sql', 'utf8')
  const schema = fs.readFileSync('database/schema.sql', 'utf8')

  const algoLines = algo.split('\n').length - (algo.endsWith('\n') ? 1 : 0)
  check('算法文件是 401 行（文档口径）', algoLines === 401, String(algoLines))
  check('第一阶段“只试前 3 名候选”（pool.slice(0, 3)）', algo.includes('pool.slice(0, 3)'))
  check('第一阶段外层最多 5 轮（round < 5）', algo.includes('round < 5'))
  check('课表是 21 个布尔列（7 天 × 3 档）',
    (schema.match(/\b(mon|tue|wed|thu|fri|sat|sun)_(34|67|89)\b/g) || []).length === 21)
  check('分享页每 60 秒自动刷新（60000 毫秒）', share.includes('60000'))
  check('数据库访问计数按 60 秒节流', mig.includes("interval '60 seconds'"))
  check('只读函数限制令牌长度 ≤ 64', mig.includes('length(p_token) > 64'))
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（文档里的公式、规则、常量均与代码一致）' : ''))
process.exit(fail === 0 ? 0 : 1)
