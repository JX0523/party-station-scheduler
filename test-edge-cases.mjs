/**
 * 边界与异常场景测试（2026-09-24 新增）
 * 目标：覆盖极端输入、放假与其他功能叠加、旧格式兼容等，确保系统不崩、行为可预期。
 * 运行: node test-edge-cases.mjs
 */
import { runSchedulingAlgorithm, resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'
import { inferSemesterStart, expandDateRange, toWeekDaySet, dateToWeekDay } from './frontend/src/lib/holiday-dates.js'

let passed = 0, failed = 0
const fails = []
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ❌ ' + name + ' — ' + e.message) }
}
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' 期望' + JSON.stringify(b) + ' 实际' + JSON.stringify(a)) }
function ok(v, m) { if (!v) throw new Error(m || 'expected truthy') }

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SKEYS = ['34', '67', '89']

function members(n, role = '部员') { const a = []; for (let i = 1; i <= n; i++) a.push({ id: 'm' + i, name: 'M' + i, role }); return a }
function sched(list, weekType = '单周', busy = {}) {
  return list.map(m => { const s = { member_id: m.id, week_type: weekType }
    for (const d of ALL_DAYS) for (const k of SKEYS) s[d + '_' + k] = !!busy[m.id + '_' + d + '_' + k]; return s })
}
const slotCfg = (days = [1,2,3,4,5], n = 1) => { const c = {}; for (let d = 1; d <= 7; d++) for (const s of SLOTS) c[d + '_' + s] = days.includes(d) ? n : 0; return c }
const baseParams = (over = {}) => ({ members: members(10), schedules: sched(members(10)), slotConfig: slotCfg(), weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [], otherWeekSchedules: [], weekType: '单周', ...over })

console.log('='.repeat(60))
console.log('🧪 边界与异常场景测试')
console.log('='.repeat(60))

console.log('\n📋 1. 极端输入')
test('0 名成员 → 0 条排班，不崩溃', () => {
  const r = runSchedulingAlgorithm(baseParams({ members: [], schedules: [] }))
  eq(r.assignments.length, 0); ok(r.meta); eq(r.meta.roleLabel, '无可用成员')
})
test('1 名成员 → 最多 1 条（每人每周 1 次）', () => {
  const m = members(1)
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m) }))
  ok(r.assignments.length <= 1, 'got ' + r.assignments.length)
})
test('全员全天有课 → 0 条排班', () => {
  const m = members(8); const busy = {}
  for (const x of m) for (const d of ALL_DAYS) for (const k of SKEYS) busy[x.id + '_' + d + '_' + k] = true
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m, '单周', busy) }))
  eq(r.assignments.length, 0)
})
test('所有时段 required=0 → 0 条', () => {
  const r = runSchedulingAlgorithm(baseParams({ slotConfig: slotCfg([], 0) }))
  eq(r.assignments.length, 0)
})
test('缺少 slotConfig 键（部分时段未配置）→ 未配置时段不排班', () => {
  const sc = { '1_上午': 1 } // 仅周一上午
  const r = runSchedulingAlgorithm(baseParams({ slotConfig: sc }))
  ok(r.assignments.every(a => a.day_of_week === 1 && a.slot === '上午'), '只应排周一上午')
  ok(r.assignments.length >= 1 && r.assignments.length <= 1)
})

console.log('\n📋 2. 放假与其他功能叠加')
test('放假周 + 紧急模式 → 依然不排班（放假优先）', () => {
  const dc = {}; for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: false }
  const r = runSchedulingAlgorithm(baseParams({ dayConfig: dc, mode: '紧急' }))
  eq(r.assignments.length, 0)
})
test('放假 + 有补排人员 → 补排人员也不会被排到放假日', () => {
  const m = members(5)
  const dc = { 1: { isWorkday: false }, 2: { isWorkday: true }, 3: { isWorkday: true }, 4: { isWorkday: true }, 5: { isWorkday: true } }
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m), dayConfig: dc, makeUpMembers: [{ member_id: 'm1' }] }))
  ok(!r.assignments.some(a => a.day_of_week === 1), '周一放假不应有排班')
})
test('周末调休(周六上班) + 周六放假 → 周六不排班', () => {
  const dc = { 1: { isWorkday: true }, 2: { isWorkday: true }, 3: { isWorkday: true }, 4: { isWorkday: true }, 5: { isWorkday: true }, 6: { isWorkday: false }, 7: { isWorkday: false } }
  const r = runSchedulingAlgorithm(baseParams({ dayConfig: dc }))
  ok(!r.assignments.some(a => a.day_of_week === 6 || a.day_of_week === 7))
})
test('调休映射 + 放假：周六补周一课但周六放假 → 用不到映射，不排周六', () => {
  const dc = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: { isWorkday: false, substituteForOdd: 1, substituteForEven: 1 } }
  const r = runSchedulingAlgorithm(baseParams({ dayConfig: dc }))
  ok(!r.assignments.some(a => a.day_of_week === 6))
})
test('旧格式 dayConfig（boolean）+ 单天放假 混用', () => {
  const dc = { 1: true, 2: false, 3: true, 4: true, 5: true }
  const r = runSchedulingAlgorithm(baseParams({ dayConfig: dc }))
  ok(!r.assignments.some(a => a.day_of_week === 2), '周二放假')
  ok(r.assignments.some(a => a.day_of_week === 1), '周一应排班')
})

console.log('\n📋 3. 连续性与补排边界')
test('lastWeek 含重复 member_id → 去重后仍正常排除', () => {
  const m = members(6)
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m), lastWeek: [{ member_id: 'm1' }, { member_id: 'm1' }, { member_id: 'm2' }] }))
  ok(!r.assignments.some(a => a.member_id === 'm1' || a.member_id === 'm2'))
})
test('补排人员同时出现在 lastWeek → 仍被优先排上（覆盖连续性）', () => {
  const m = members(6)
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m), lastWeek: [{ member_id: 'm3' }], makeUpMembers: [{ member_id: 'm3' }] }))
  ok(r.assignments.some(a => a.member_id === 'm3'), '补排人员应被排上')
})
test('上周全员排过 + 无补排 → 本周 0 条（无人可用）', () => {
  const m = members(5)
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m), lastWeek: m.map(x => ({ member_id: x.id })) }))
  eq(r.assignments.length, 0)
})
test('紧急模式 + 上周全员排过 → 仍可排班（允许连排）', () => {
  const m = members(5)
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m), lastWeek: m.map(x => ({ member_id: x.id })), mode: '紧急' }))
  ok(r.assignments.length > 0, '紧急模式应能排班')
  ok(r.assignments.every(a => a.is_emergency === true))
})

console.log('\n📋 4. 课表冲突与调休映射')
test('resolveScheduleKey 旧字段兼容', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 3 } }), 'wed')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: 2 } }, '单周'), 'tue')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForEven: 4 } }, '双周'), 'thu')
  eq(resolveScheduleKey(3, null), 'wed')
})
test('调休日补周X：有课的人被排除', () => {
  const m = members(4)
  const busy = { 'm1_mon_34': true }
  const dc = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: { isWorkday: true, substituteForOdd: 1 } }
  const r = runSchedulingAlgorithm(baseParams({ members: m, schedules: sched(m, '单周', busy), dayConfig: dc, slotConfig: slotCfg([1,2,3,4,5,6]) }))
  const sat = r.assignments.filter(a => a.day_of_week === 6 && a.slot === '上午')
  ok(!sat.some(a => a.member_id === 'm1'), 'm1 周一上午有课，补周一课表的周六上午不应排他')
})

console.log('\n📋 5. 日期/放假换算边界')
test('当前周超过总周数：推算仍返回合法周一', () => {
  const s = inferSemesterStart(30, '2026-10-04')
  eq(dateToWeekDay(s, s).week, 1)
  ok(new Date(s + 'T00:00:00Z').getUTCDay() === 1)
})
test('跨年 13 天假期展开正确（2026-12-28 起）', () => {
  const start = '2026-12-28'
  const r = expandDateRange('2026-12-28', '2027-01-09', start, 18)
  eq(r.days.length, 13)
  eq(r.days[0], { date: '2026-12-28', week: 1, day: 1 })
  eq(r.days[12].date, '2027-01-09')
  const set = toWeekDaySet(r.days)
  eq(set.length, 13)
})
test('区间刚好 120 天允许，121 天报错', () => {
  ok(!expandDateRange('2026-01-01', '2026-04-30', '2026-01-05', 30).error, '120天应允许')
  ok(expandDateRange('2026-01-01', '2026-05-01', '2026-01-05', 30).error, '121天应报错')
})
test('放假日期落在周末也支持（周末默认本就放假，不冲突）', () => {
  const r = expandDateRange('2026-10-03', '2026-10-04', '2026-09-07', 18) // 周六、周日
  eq(r.days.length, 2)
  eq(r.days.map(d => d.day), [6, 7])
})

console.log('\n' + '='.repeat(60))
console.log(`🏆 边界测试结果: ${passed}/${passed + failed} 通过`)
if (failed === 0) console.log('🎉 全部通过！')
else { console.log('⚠️ 失败项:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('='.repeat(60))