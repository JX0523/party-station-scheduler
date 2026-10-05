/**
 * 放假功能测试 — 日期换算 + 整周放假不排班（2026-09-24 新增）
 * 运行: node test-holiday-dates.mjs
 */
import {
  parseYMD, toUTC, isMonday, utcWeekday, dateToWeekDay,
  formatMD, weekdayCN, expandDateRange, toWeekDaySet, groupHolidayRows,
  addDays, inferSemesterStart, describeWeeks, todayYMD, describeHolidayPlan
} from './frontend/src/lib/holiday-dates.js'
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

let passed = 0, failed = 0
const failures = []
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; failures.push(name + ': ' + e.message); console.log('  ❌ ' + name + ' — ' + e.message) }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + ' 实际 ' + JSON.stringify(a))
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy') }

console.log('='.repeat(60))
console.log('🧪 放假功能测试（日期换算 + 排班跳过）')
console.log('='.repeat(60))

console.log('\n📋 1. 日期解析 parseYMD')
test('正常日期解析', () => { eq(parseYMD('2026-09-24'), { y: 2026, m: 9, d: 24 }) })
test('非法格式返回 null', () => {
  eq(parseYMD('2026/09/24'), null); eq(parseYMD('26-09-24'), null)
  eq(parseYMD(''), null); eq(parseYMD(null), null); eq(parseYMD('abc'), null)
})
test('不存在的日期返回 null（2月30日、13月）', () => {
  eq(parseYMD('2026-02-30'), null); eq(parseYMD('2026-13-01'), null); eq(parseYMD('2026-00-10'), null)
})
test('闰年 2月29 合法', () => { ok(parseYMD('2028-02-29') !== null) })

console.log('\n📋 2. 星期与周一判断')
test('2026-08-31 是周一', () => { eq(isMonday('2026-08-31'), true); eq(utcWeekday('2026-08-31'), 1) })
test('2026-09-07 是周一', () => { eq(isMonday('2026-09-07'), true) })
test('2026-09-24 是周四（day=4）', () => { eq(isMonday('2026-09-24'), false); eq(utcWeekday('2026-09-24'), 4) })
test('周日算 7（不是 0）', () => { eq(utcWeekday('2026-09-06'), 7); eq(utcWeekday('2026-09-13'), 7) })

console.log('\n📋 3. 日期 → 周次/星期 换算')
const START = '2026-08-31' // 第1周周一
test('第1周周一 → week=1, day=1', () => { eq(dateToWeekDay('2026-08-31', START), { week: 1, day: 1 }) })
test('第1周周日 → week=1, day=7', () => { eq(dateToWeekDay('2026-09-06', START), { week: 1, day: 7 }) })
test('第2周周一 → week=2, day=1', () => { eq(dateToWeekDay('2026-09-07', START), { week: 2, day: 1 }) })
test('9月24日(周四) → week=4, day=4', () => { eq(dateToWeekDay('2026-09-24', START), { week: 4, day: 4 }) })
test('无效输入返回 null', () => { eq(dateToWeekDay('bad', START), null); eq(dateToWeekDay('2026-09-24', 'bad'), null) })

console.log('\n📋 4. 日期区间展开（13天连假场景）')
test('10/1~10/13 共 13 天，跨第5~7周', () => {
  const r = expandDateRange('2026-10-01', '2026-10-13', START, 18)
  eq(r.days.length, 13, '天数')
  eq(r.days[0], { date: '2026-10-01', week: 5, day: 4 })
  eq(r.days[12], { date: '2026-10-13', week: 7, day: 2 })
  const weeks = [...new Set(r.days.map(d => d.week))]
  eq(weeks, [5, 6, 7], '涉及周次')
  const w6 = r.days.filter(d => d.week === 6).map(d => d.day)
  eq(w6, [1, 2, 3, 4, 5, 6, 7], '第6周整周')
})
test('单日区间（当天放假）', () => {
  const r = expandDateRange('2026-10-01', '2026-10-01', START, 18)
  eq(r.days.length, 1); eq(r.days[0].week, 5); eq(r.days[0].day, 4)
})
test('结束早于开始 → 报错', () => {
  const r = expandDateRange('2026-10-13', '2026-10-01', START, 18)
  ok(r.error && r.days.length === 0, 'should error')
})
test('格式错误 → 报错', () => {
  ok(expandDateRange('2026/10/01', '2026-10-13', START, 18).error)
  ok(expandDateRange('2026-10-01', 'xxx', START, 18).error)
})
test('超过 120 天 → 报错', () => {
  ok(expandDateRange('2026-01-01', '2026-12-31', START, 18).error)
})
test('超出学期周数的日期被剔除', () => {
  const r = expandDateRange('2027-02-01', '2027-02-03', START, 18) // 远超 18 周
  eq(r.days.length, 0, '有效天数应为 0')
  eq(r.outOfRange.length, 3, '越界天数')
})

console.log('\n📋 5. 归并 (week, day) 集合')
test('13天连假归并为 13 个 (周,星期) 组合', () => {
  const r = expandDateRange('2026-10-01', '2026-10-13', START, 18)
  const set = toWeekDaySet(r.days)
  eq(set.length, 13, '组合数')
  eq(set[0], { week: 5, day: 4, dates: ['2026-10-01'] })
  eq(set[12], { week: 7, day: 2, dates: ['2026-10-13'] })
})
test('跨年区间正常', () => {
  const s2 = '2026-12-28' // 假设第1周周一(仅测试换算)
  const r = expandDateRange('2026-12-31', '2027-01-02', s2, 18)
  eq(r.days.length, 3)
  eq(r.days[0].week, 1); eq(r.days[2].week, 1, '跨年仍在本周内')
  eq(r.days[2].date, '2027-01-02')
})

console.log('\n📋 6. 展示辅助')
test('formatMD / weekdayCN', () => {
  eq(formatMD('2026-09-14'), '9月14日')
  eq(weekdayCN(1), '周一'); eq(weekdayCN(7), '周日')
})
test('groupHolidayRows 归组并算出日期标签', () => {
  const rows = [
    { id: 1, week_number: 5, day_of_week: 4, is_workday: false },
    { id: 2, week_number: 5, day_of_week: 5, is_workday: false },
    { id: 3, week_number: 6, day_of_week: 1, is_workday: true },  // 调休上班，不计入放假
  ]
  const g = groupHolidayRows(rows, START)
  eq(g.length, 1, '只有一个周有放假记录')
  eq(g[0].week, 5)
  eq(g[0].days.map(d => d.day), [4, 5])
  eq(g[0].days[0].dateLabel, '10月1日')
})

console.log('\n📋 6.4 放假计划预览文案（防周次偏移）')
test('13天连假的预览文案正确', () => {
  const r = expandDateRange('2026-10-01', '2026-10-13', START, 18)
  eq(describeHolidayPlan(r.days), '第5周 周四~周日、第6周 整周、第7周 周一~周二')
})
test('整周放假显示「整周」', () => {
  const r = expandDateRange('2026-09-14', '2026-09-20', START, 18)
  eq(describeHolidayPlan(r.days), '第3周 整周')
})
test('单日放假显示单个星期', () => {
  const r = expandDateRange('2026-09-16', '2026-09-16', START, 18)
  eq(describeHolidayPlan(r.days), '第3周 周三')
})
test('空输入返回空字符串', () => {
  eq(describeHolidayPlan([]), ''); eq(describeHolidayPlan(null), '')
})
test('预览文案与周次集合一致（组合数吻合）', () => {
  const r = expandDateRange('2026-10-19', '2026-10-30', START, 18)
  const txt = describeHolidayPlan(r.days)
  ok(txt.includes('第8周') && txt.includes('第9周'), '应包含第8、9周: ' + txt)
})

console.log('\n📋 6.5 自动推算第1周周一（无需用户输入）')
test('当前第2周 + 今天周四(2026-09-24) → 第1周周一 = 2026-09-14', () => {
  eq(inferSemesterStart(2, '2026-09-24'), '2026-09-14')
})
test('当前第1周 + 今天周一 → 第1周周一 = 今天', () => {
  eq(inferSemesterStart(1, '2026-08-31'), '2026-08-31')
})
test('当前第1周 + 今天周日 → 第1周周一 = 6天前', () => {
  eq(inferSemesterStart(1, '2026-09-06'), '2026-08-31')
})
test('当前第5周 + 今天周一 → 往前推4周', () => {
  eq(inferSemesterStart(5, '2026-09-28'), '2026-08-31')
})
test('推算结果始终是周一', () => {
  for (const [w, d] of [[1, '2026-09-24'], [3, '2026-09-24'], [10, '2026-10-01'], [18, '2027-01-01']]) {
    ok(isMonday(inferSemesterStart(w, d)), w + '/' + d + ' 应是周一')
  }
})
test('推算结果可与日期换算闭环（今天的周次 = currentWeek）', () => {
  const start = inferSemesterStart(4, '2026-09-24')
  eq(dateToWeekDay('2026-09-24', start), { week: 4, day: 4 })
})
test('非法 currentWeek 返回 null', () => {
  eq(inferSemesterStart(0, '2026-09-24'), null)
  eq(inferSemesterStart('x', '2026-09-24'), null)
  eq(inferSemesterStart(2, 'bad-date'), null)
})
test('addDays 跨月/跨年', () => {
  eq(addDays('2026-09-30', 1), '2026-10-01')
  eq(addDays('2026-12-31', 1), '2027-01-01')
  eq(addDays('2027-01-01', -1), '2026-12-31')
})
test('describeWeeks 输出第1周与当前周范围', () => {
  const d = describeWeeks('2026-09-14', 2)
  eq(d.week1, { from: '2026-09-14', to: '2026-09-20' })
  eq(d.current, { from: '2026-09-21', to: '2026-09-27' })
})

console.log('\n📋 7. 排班算法联动（整周放假不排班）')
function makeMembers(n) {
  const m = []; for (let i = 1; i <= n; i++) m.push({ id: 'm' + i, name: '成员' + i, role: '部员' })
  return m
}
function makeSchedules(members) {
  return members.map(m => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
      for (const k of ['34', '67', '89']) s[d + '_' + k] = false
    return s
  })
}
const members = makeMembers(10)
const schedules = makeSchedules(members)
const slotConfig = {}
for (let d = 1; d <= 7; d++) for (const s of ['上午', '下午1', '下午2']) slotConfig[d + '_' + s] = d <= 5 ? 1 : 0

test('整周 7 天全放假 → 0 条排班（修复前会回退周一~周五）', () => {
  const dc = {}; for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: false }
  const r = runSchedulingAlgorithm({ members, schedules, slotConfig, weekNumber: 6, lastWeek: [], allAssignments: [], makeUpMembers: [], otherWeekSchedules: schedules, dayConfig: dc, weekType: '单周' })
  eq(r.assignments.length, 0)
  eq(r.meta.workdays, [])
})
test('13天连假对应的三周（第5~7周）都不排班', () => {
  const r = expandDateRange('2026-10-01', '2026-10-13', START, 18)
  const set = toWeekDaySet(r.days)
  let total = 0
  for (const w of [5, 6, 7]) {
    const dc = {}
    for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: true }
    for (const item of set.filter(x => x.week === w)) dc[item.day] = { isWorkday: false }
    const res = runSchedulingAlgorithm({ members, schedules, slotConfig, weekNumber: w, lastWeek: [], allAssignments: [], makeUpMembers: [], otherWeekSchedules: schedules, dayConfig: dc, weekType: '单周' })
    const days = [...new Set(res.assignments.map(a => a.day_of_week))]
    const holidayDays = set.filter(x => x.week === w).map(x => x.day)
    for (const hd of holidayDays) ok(!days.includes(hd), '第' + w + '周 day' + hd + ' 不应有排班')
    total += res.assignments.length
  }
  ok(total > 0, '非放假日仍应有排班')
})
test('只放周五 → 其他四天正常排班', () => {
  const dc = {}
  for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: d <= 5 && d !== 5 }
  const r = runSchedulingAlgorithm({ members, schedules, slotConfig, weekNumber: 3, lastWeek: [], allAssignments: [], makeUpMembers: [], otherWeekSchedules: schedules, dayConfig: dc, weekType: '单周' })
  ok(!r.assignments.some(a => a.day_of_week === 5), '周五不应有排班')
  eq([...new Set(r.assignments.map(a => a.day_of_week))].sort((x, y) => x - y), [1, 2, 3, 4])
})

console.log('\n' + '='.repeat(60))
console.log(`🏆 放假功能测试结果: ${passed}/${passed + failed} 通过`)
if (failed === 0) console.log('🎉 全部通过！')
else { console.log('⚠️ 失败项:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('='.repeat(60))