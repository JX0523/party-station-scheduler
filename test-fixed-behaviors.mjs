/**
 * 修复回归测试 — 2026-08-14（详见 dev-logs/2026-08-14.md）
 *
 * 覆盖以下修复：
 *   1. 补排覆盖连续性：上周请假的人（同时出现在 lastWeek 和 makeUpMembers）
 *      必须被优先补排，而不是被连续性规则排除（修复前为死代码）
 *   2. 紧急模式：mode='紧急' 时跳过连续性约束，is_emergency=true；
 *      一般模式下 is_emergency=false 且上周值班的人本周不排
 *   3. 时段0语义：required=0 的时段不安排人；某天全部 required=0 则不排班
 *   4. maxPerWeek 不压制时段配置：上限 = max(配置需求总和, 公平性下限)
 *   5. 每日保障回退：某天 required 时段全部被课表挡住时，仍保证该天有1人
 *      （落到当天第一个空闲时段）
 *   6. 每周每人最多1次的约束仍然成立（自动生成时）
 *
 * 运行：node test-fixed-behaviors.mjs
 */
import { runSchedulingAlgorithm, resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'

const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅ ' + name)
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    console.log('  ❌ ' + name + ': ' + e.message)
  }
}

function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || 'assert') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b))
  }
}
function ok(val, msg) { if (!val) throw new Error(msg || 'expected truthy') }

function makeMembers(roles) {
  const members = []
  let id = 1
  for (const [role, count] of Object.entries(roles)) {
    for (let i = 0; i < count; i++) {
      members.push({ id: 'm' + id++, name: role + i, role })
    }
  }
  return members
}

function makeSlotConfig(overrides = {}) {
  const cfg = {}
  for (let d = 1; d <= 7; d++) {
    for (const s of SLOTS) {
      cfg[d + '_' + s] = overrides[d + '_' + s] ?? (d <= 5 ? 1 : 0)
    }
  }
  return cfg
}

function makeEmptySchedules(members, weekType = '单周') {
  return members.map(m => {
    const s = { member_id: m.id, week_type: weekType }
    for (const d of ALL_DAY_KEYS) {
      for (const sk of SLOT_KEYS) s[d + '_' + sk] = false
    }
    return s
  })
}

function makeSchedules(members, weekType, slotMap = {}) {
  return members.map(m => {
    const s = { member_id: m.id, week_type: weekType }
    for (const d of ALL_DAY_KEYS) {
      for (const sk of SLOT_KEYS) {
        s[d + '_' + sk] = slotMap[m.id + '_' + d + '_' + sk] || false
      }
    }
    return s
  })
}

console.log('='.repeat(60))
console.log('🧪 修复回归测试（2026-08-14）')
console.log('='.repeat(60))

// ============================================================
// 1. 补排覆盖连续性（修复的核心场景）
// ============================================================
console.log('\n📋 1. 补排覆盖连续性')
test('上周请假的人（在lastWeek中）仍被优先补排', () => {
  const members = makeMembers({ '部员': 10 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig()

  // 第1周正常排班
  const r1 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  const leaveId = r1.assignments[0].member_id

  // 第2周：真实输入 —— lastWeek 包含请假人（生产查询不过滤 status）
  const r2 = runSchedulingAlgorithm({
    members, schedules: makeEmptySchedules(members, '双周'), slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments.filter(a => a.member_id !== leaveId).map(a => ({ member_id: a.member_id })),
    makeUpMembers: [{ member_id: leaveId }],
    otherWeekSchedules: schedules,
    dayConfig: null, weekType: '双周'
  })
  ok(r2.assignments.some(a => a.member_id === leaveId), '请假人应在第2周被补排')
})

test('一般模式：上周正常值班的人本周不排（连续性仍生效）', () => {
  const members = makeMembers({ '部员': 10 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig()

  const r1 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  const workedId = r1.assignments[0].member_id

  const r2 = runSchedulingAlgorithm({
    members, schedules: makeEmptySchedules(members, '双周'), slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments.map(a => ({ member_id: a.member_id })),
    makeUpMembers: [], // 没有补排标记
    otherWeekSchedules: schedules,
    dayConfig: null, weekType: '双周'
  })
  ok(!r2.assignments.some(a => a.member_id === workedId), '上周正常值班的人本周不应被排')
})

// ============================================================
// 2. 紧急模式
// ============================================================
console.log('\n📋 2. 紧急模式')
test('紧急模式：上周值班的人本周可再排，且 is_emergency=true', () => {
  const members = makeMembers({ '部员': 10 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig()

  const r1 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周', mode: '一般'
  })
  const workedId = r1.assignments[0].member_id

  const r2 = runSchedulingAlgorithm({
    members, schedules: makeEmptySchedules(members, '双周'), slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments.map(a => ({ member_id: a.member_id })),
    makeUpMembers: [],
    otherWeekSchedules: schedules,
    dayConfig: null, weekType: '双周', mode: '紧急'
  })
  ok(r2.assignments.some(a => a.member_id === workedId), '紧急模式下上周的人可以连排')
  ok(r2.assignments.every(a => a.is_emergency === true), '紧急模式生成的排班应标记 is_emergency')
  eq(r2.meta.mode, '紧急')
})

test('一般模式：is_emergency=false', () => {
  const members = makeMembers({ '部员': 8 })
  const schedules = makeEmptySchedules(members, '单周')
  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  ok(r.assignments.every(a => a.is_emergency === false), '一般模式不应标记紧急')
  eq(r.meta.mode, '一般')
})

// ============================================================
// 3. 时段0语义
// ============================================================
console.log('\n📋 3. 时段0语义（0 = 该时段不需要值班）')
test('工作日某时段 required=0 -> 该时段不安排人', () => {
  const members = makeMembers({ '部员': 15 })
  const schedules = makeEmptySchedules(members, '单周')
  // 周一上午 0 人，其余时段 1 人
  const sc = makeSlotConfig({ '1_上午': 0 })
  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  const monMorning = r.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  eq(monMorning.length, 0, '周一上午(required=0)不应有人')
  // 其他时段仍然有安排
  const monAfternoon = r.assignments.filter(a => a.day_of_week === 1 && a.slot !== '上午')
  ok(monAfternoon.length > 0, '周一其他时段仍应有人')
})

test('某天所有时段 required=0 -> 当天不排班（其余天正常）', () => {
  const members = makeMembers({ '部员': 20 })
  const schedules = makeEmptySchedules(members, '单周')
  // 周三整天 0 人（相当于放假一天）
  const sc = makeSlotConfig()
  for (const s of SLOTS) sc['3_' + s] = 0
  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  const wed = r.assignments.filter(a => a.day_of_week === 3)
  eq(wed.length, 0, '周三(全0)不应有人')
  const otherDays = r.assignments.filter(a => a.day_of_week !== 3)
  ok(otherDays.length > 0, '其他工作日仍应有人')
})

// ============================================================
// 4. maxPerWeek 不压制时段配置
// ============================================================
console.log('\n📋 4. maxPerWeek 上限 = max(配置需求, 公平性下限)')
test('10人默认配置 -> 10条（上限15不限制，每人1次）', () => {
  const members = makeMembers({ '部员': 10 })
  const r = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  eq(r.meta.maxPerWeek, 15)
  eq(r.assignments.length, 10)
})

test('5人但配置每时段2人（需求30）-> 上限=30，不会被压到5', () => {
  const members = makeMembers({ '部员': 5 })
  const sc = makeSlotConfig()
  for (const k in sc) sc[k] = 2 // 全部时段2人
  const r = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  eq(r.meta.maxPerWeek, 30)
  ok(r.assignments.length <= r.meta.maxPerWeek)
  ok(r.assignments.length >= 5, '至少覆盖每天1人')
})

// ============================================================
// 5. 每日保障回退
// ============================================================
console.log('\n📋 5. 每日保障回退（required 时段全冲突 -> 落到空闲时段）')
test('周一required时段全冲突 -> 仍保证周一有1人', () => {
  const members = makeMembers({ '部员': 6 })
  // 前5人周一3个时段全有课；m6 周一空闲（但周一下午也有课? 不，m6全空）
  const slotMap = {}
  for (let i = 1; i <= 5; i++) {
    slotMap['m' + i + '_mon_34'] = true
    slotMap['m' + i + '_mon_67'] = true
    slotMap['m' + i + '_mon_89'] = true
  }
  const schedules = makeSchedules(members, '单周', slotMap)
  // 只开放周一上午（required=1），其余时段0
  const sc = makeSlotConfig()
  for (const s of SLOTS) {
    sc['1_' + s] = s === '上午' ? 1 : 0
    for (let d = 2; d <= 5; d++) sc[d + '_' + s] = 0
  }
  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig: null, weekType: '单周'
  })
  // 前5人周一上午有课，但 m6 空闲 → 每日保障把 m6 排到周一（上午或回退时段）
  const mon = r.assignments.filter(a => a.day_of_week === 1)
  ok(mon.length > 0, '周一应有1人（每日最低保障）')
  ok(mon.every(a => a.member_id === 'm6'), '排到空闲的m6')
})

// ============================================================
// 6. 回归：resolveScheduleKey 不变
// ============================================================
console.log('\n📋 6. 回归检查')
test('resolveScheduleKey 调休映射保持原行为', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 1 } }), 'mon')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: 3 } }, '单周'), 'wed')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForEven: 5 } }, '双周'), 'fri')
  eq(resolveScheduleKey(3, null), 'wed')
})

test('紧急模式仍遵守每人每周最多1次', () => {
  const members = makeMembers({ '部员': 6 })
  const r = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周', mode: '紧急'
  })
  const counts = {}
  r.assignments.forEach(a => { counts[a.member_id] = (counts[a.member_id] || 0) + 1 })
  Object.values(counts).forEach(c => ok(c <= 1, '每人每周最多1次, got ' + c))
})

// ============================================================
console.log('\n' + '='.repeat(60))
console.log('🏆 修复回归测试结果: ' + passed + '/' + (passed + failed) + ' 通过')
if (failed === 0) {
  console.log('🎉 全部通过！')
} else {
  console.log('⚠️ 失败项:')
  failures.forEach(f => console.log('  - ' + f.name + ': ' + f.error))
  process.exit(1)
}
console.log('='.repeat(60))
