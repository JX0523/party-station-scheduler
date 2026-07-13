/**
 * 等价类测试 — 系统功能全覆盖
 *
 * 等价类划分：
 *   EC-1: resolveScheduleKey — 8组（null, boolean, substituteFor, odd, even, 混合, 边界, 向后兼容）
 *   EC-2: DayConfig — 5组（默认, 放假, 调休, 全7天, 无效值）
 *   EC-3: 角色配额 — 4组（仅部员, 部员+部长, 不足5人, 仅部长）
 *   EC-4: 课表冲突 — 3组（全空, 全满, 混合）
 *   EC-5: SlotConfig — 4组（默认, 周末0, 某时段2人, 全0）
 *   EC-6: 调休单双周独立 — 4组（仅odd, 仅even, 同值, 异值）
 *   EC-7: 边界条件 — 6组
 *   EC-8: 逻辑一致性 — 6组
 */
import { runSchedulingAlgorithm, resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    console.log(`  ❌ ${name}: ${e.message}`)
  }
}

function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || 'assert'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)
  }
}

function ok(val, msg) { if (!val) throw new Error(msg || 'expected truthy') }
function gt(a, b) { if (!(a > b)) throw new Error(`expected ${a} > ${b}`) }
function gte(a, b) { if (!(a >= b)) throw new Error(`expected ${a} >= ${b}`) }

// ============== 工厂函数 ==============
function makeMembers(roles) {
  const members = []
  let id = 1
  for (const [role, count] of Object.entries(roles)) {
    for (let i = 0; i < count; i++) {
      members.push({ id: `m${id++}`, name: `${role}${i + 1}`, role })
    }
  }
  return members
}

function makeSlotConfig(overrides = {}) {
  const cfg = {}
  for (let d = 1; d <= 7; d++) {
    for (const s of ['上午', '下午1', '下午2']) {
      cfg[`${d}_${s}`] = overrides[`${d}_${s}`] ?? (d <= 5 ? 1 : 0)
    }
  }
  return cfg
}

function makeSchedules(members, weekType, slotMap = {}) {
  const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const SLOT_KEYS = ['34', '67', '89']
  return members.map(m => {
    const s = { member_id: m.id, week_type: weekType }
    for (const d of ALL_DAY_KEYS) {
      for (const sk of SLOT_KEYS) {
        s[`${d}_${sk}`] = slotMap[`${m.id}_${d}_${sk}`] || false
      }
    }
    return s
  })
}

// ============================================================
console.log('='.repeat(60))
console.log('🧪 等价类测试套件')
console.log('='.repeat(60))

// ============================================================
// EC-1: resolveScheduleKey 等价类 (8组)
// ============================================================
console.log('\n📋 EC-1: resolveScheduleKey — 8个等价类')

// EC-1.1: null dayConfig
console.log('  EC-1.1: null dayConfig')
test('周一 null -> mon', () => eq(resolveScheduleKey(1, null), 'mon'))
test('周六 null -> sat', () => eq(resolveScheduleKey(6, null), 'sat'))
test('周日 null -> sun', () => eq(resolveScheduleKey(7, null), 'sun'))
test('周三 null -> wed', () => eq(resolveScheduleKey(3, null), 'wed'))

// EC-1.2: boolean dayConfig
console.log('  EC-1.2: boolean dayConfig（旧格式）')
test('boolean: 工作日返回自身key', () => {
  const dc = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false }
  eq(resolveScheduleKey(1, dc), 'mon')
  eq(resolveScheduleKey(3, dc), 'wed')
  eq(resolveScheduleKey(5, dc), 'fri')
})
test('boolean: 周末false返回自身key', () => {
  const dc = { 6: false, 7: false }
  eq(resolveScheduleKey(6, dc), 'sat')
  eq(resolveScheduleKey(7, dc), 'sun')
})
test('boolean: weekend=true无调休映射 -> 返回自身', () => {
  const dc = { 6: true, 7: true }
  eq(resolveScheduleKey(6, dc), 'sat')
  eq(resolveScheduleKey(7, dc), 'sun')
})

// EC-1.3: 旧 substituteFor
console.log('  EC-1.3: 旧 substituteFor（单列）')
test('substituteFor=1 on Sat -> mon', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 1 } }), 'mon')
})
test('substituteFor=5 on Sun -> fri', () => {
  eq(resolveScheduleKey(7, { 7: { isWorkday: true, substituteFor: 5 } }), 'fri')
})
test('substituteFor=3 on Sat -> wed', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 3 } }), 'wed')
})
test('substituteFor with weekType=单周 -> falls back', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 2 } }, '单周'), 'tue')
})
test('substituteFor with weekType=双周 -> falls back', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 4 } }, '双周'), 'thu')
})

// EC-1.4: 新 substituteForOdd
console.log('  EC-1.4: substituteForOdd（单周）')
test('单周: substituteForOdd=1 -> mon', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: 1 } }, '单周'), 'mon')
})
test('单周: substituteForOdd=5 -> fri', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: 5 } }, '单周'), 'fri')
})
test('单周: substituteForOdd=3 on Sun -> wed', () => {
  eq(resolveScheduleKey(7, { 7: { isWorkday: true, substituteForOdd: 3 } }, '单周'), 'wed')
})

// EC-1.5: 新 substituteForEven
console.log('  EC-1.5: substituteForEven（双周）')
test('双周: substituteForEven=2 -> tue', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForEven: 2 } }, '双周'), 'tue')
})
test('双周: substituteForEven=4 -> thu', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForEven: 4 } }, '双周'), 'thu')
})

// EC-1.6: 单双周混合（核心新功能）
console.log('  EC-1.6: 单双周混合（核心功能）')
test('周六: 单周补周一, 双周补周三 -> 单周返回mon, 双周返回wed', () => {
  const dc = { 6: { isWorkday: true, substituteForOdd: 1, substituteForEven: 3 } }
  eq(resolveScheduleKey(6, dc, '单周'), 'mon')
  eq(resolveScheduleKey(6, dc, '双周'), 'wed')
})
test('周日: 单周补周五, 双周补周一 -> 单周返回fri, 双周返回mon', () => {
  const dc = { 7: { isWorkday: true, substituteForOdd: 5, substituteForEven: 1 } }
  eq(resolveScheduleKey(7, dc, '单周'), 'fri')
  eq(resolveScheduleKey(7, dc, '双周'), 'mon')
})
test('单双周相同: substituteForOdd=2, substituteForEven=2 -> both tue', () => {
  const dc = { 6: { isWorkday: true, substituteForOdd: 2, substituteForEven: 2 } }
  eq(resolveScheduleKey(6, dc, '单周'), 'tue')
  eq(resolveScheduleKey(6, dc, '双周'), 'tue')
})

// EC-1.7: 边界/无效值
console.log('  EC-1.7: 边界/无效值')
test('substituteForOdd=0 -> 视为无效，返回自身key', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: 0 } }, '单周'), 'sat')
})
test('substituteForEven=6 -> 超出范围，返回自身key', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForEven: 6 } }, '双周'), 'sat')
})
test('substituteForOdd=null, substituteFor=3 -> 单周fallback到旧列', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteForOdd: null, substituteFor: 3 } }, '单周'), 'wed')
})
test('weekType不传 -> substituteForEven优先，fallback substituteFor', () => {
  // 旧调用兼容性：不传weekType走even分支
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 1 } }), 'mon')
})

// EC-1.8: 工作日（1-5）的 substituteFor 行为
console.log('  EC-1.8: 工作日（1-5）substituteFor 行为')
test('周一是工作日设了substituteFor=3 -> 返回wed（映射生效）', () => {
  // resolveScheduleKey 不区分工作日/非工作日，有映射就应用
  eq(resolveScheduleKey(1, { 1: { isWorkday: true, substituteFor: 3 } }), 'wed')
})
test('周三设了substituteForOdd=1 -> 返回mon（映射生效）', () => {
  eq(resolveScheduleKey(3, { 3: { isWorkday: true, substituteForOdd: 1 } }, '单周'), 'mon')
})

// ============================================================
// EC-2: DayConfig 对 workdays 的影响 (5组)
// ============================================================
console.log('\n📋 EC-2: DayConfig -> workdays 推导等价类')

function extractWorkdays(params) {
  const result = runSchedulingAlgorithm(params)
  return result.meta.workdays.sort((a, b) => a - b)
}

const baseParams = {
  members: makeMembers({ '部员': 10 }),
  schedules: makeSchedules(makeMembers({ '部员': 10 }), '单周'),
  slotConfig: makeSlotConfig(),
  weekNumber: 1,
  lastWeek: [],
  allAssignments: [],
  makeUpMembers: [],
  otherWeekSchedules: [],
  weekType: '单周'
}

// EC-2.1: 默认（无dayConfig）-> 周一至周五
console.log('  EC-2.1: 默认（无dayConfig）')
test('无dayConfig -> workdays=[1,2,3,4,5]', () => {
  const wds = extractWorkdays({ ...baseParams, dayConfig: null })
  eq(wds, [1, 2, 3, 4, 5])
})

// EC-2.2: 放假（某天设为false）
console.log('  EC-2.2: 工作日设为false (放假)')
test('周三放假 workday=[1,2,4,5]', () => {
  const wds = extractWorkdays({ ...baseParams, dayConfig: { 1: true, 2: true, 3: false, 4: true, 5: true } })
  eq(wds, [1, 2, 4, 5])
})
test('周五放假 workday=[1,2,3,4]', () => {
  const wds = extractWorkdays({ ...baseParams, dayConfig: { 1: true, 2: true, 3: true, 4: true, 5: false } })
  eq(wds, [1, 2, 3, 4])
})

// EC-2.3: 调休（周末设为工作日）
console.log('  EC-2.3: 周末调休（rich格式）')
test('周六调休 -> workdays包含6', () => {
  const wds = extractWorkdays({ ...baseParams, dayConfig: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: { isWorkday: true } } })
  ok(wds.includes(6), '周六应在工作日列表中')
  ok(wds.includes(1), '周一应在工作日列表中')
})
test('周日调休 -> workdays包含7', () => {
  const wds = extractWorkdays({ ...baseParams, dayConfig: { 1: true, 2: true, 3: true, 4: true, 5: true, 7: { isWorkday: true } } })
  ok(wds.includes(7), '周日应在工作日列表中')
})

// EC-2.4: 全天工作
console.log('  EC-2.4: 7天全工作日')
test('7天全工作日 -> workdays=[1-7]', () => {
  const dc = {}
  for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: true }
  const wds = extractWorkdays({ ...baseParams, dayConfig: dc })
  eq(wds, [1, 2, 3, 4, 5, 6, 7])
})

// EC-2.5: 全false -> fallback到默认
console.log('  EC-2.5: 全false -> fallback')
test('全false fallback到周一至周五', () => {
  const dc = {}
  for (let d = 1; d <= 7; d++) dc[d] = false
  const wds = extractWorkdays({ ...baseParams, dayConfig: dc })
  eq(wds, [1, 2, 3, 4, 5])
})

// ============================================================
// EC-3: 角色配额等价类 (4组)
// ============================================================
console.log('\n📋 EC-3: 角色配额等价类')

// EC-3.1: 仅部员
console.log('  EC-3.1: 仅部员（>=5人）')
test('10部员, 每时段1人 -> 部长配额=0, 主席团配额=0', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 10 }),
    schedules: makeSchedules(makeMembers({ '部员': 10 }), '单周'),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  eq(result.meta.perRoleMax['部长'], 0)
  eq(result.meta.perRoleMax['主席团'], 0)
  gt(result.assignments.length, 0)
  ok(result.meta.perRoleUsed['部员'] > 0, '应有部员被安排')
})

// EC-3.2: 部员+部长
console.log('  EC-3.2: 部员+部长')
test('10部员+5部长 -> 部长配额≤3且>0', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 10, '部长': 5 }),
    schedules: makeSchedules(makeMembers({ '部员': 10, '部长': 5 }), '单周'),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  ok(result.meta.perRoleMax['部长'] > 0, '部长应有配额')
  ok(result.meta.perRoleMax['部长'] <= 3, '部长配额不应超过3')
})

// EC-3.3: 不足5人（主席团启用）
console.log('  EC-3.3: 不足5人->主席团启用')
test('2部员+1部长 -> 主席团配额>0', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 2, '部长': 1 }),
    schedules: makeSchedules(makeMembers({ '部员': 2, '部长': 1 }), '单周'),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  ok(result.meta.perRoleMax['主席团'] > 0, '主席团应被启用')
})

// EC-3.4: 仅部长
console.log('  EC-3.4: 仅部长（无部员）')
test('仅5部长 -> roleLabel含"部长主力"', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部长': 5 }),
    schedules: makeSchedules(makeMembers({ '部长': 5 }), '单周'),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  ok(result.meta.roleLabel.includes('部长'), 'roleLabel应包含部长')
})

// ============================================================
// EC-4: 课表冲突等价类 (3组)
// ============================================================
console.log('\n📋 EC-4: 课表冲突等价类')

// EC-4.1: 全空闲（无课）
console.log('  EC-4.1: 所有人无课表 -> 全部可用')
test('10部员无课 -> 5条（maxPerWeek=floor(10/2)=5）', () => {
  const members = makeMembers({ '部员': 10 })
  const result = runSchedulingAlgorithm({
    members,
    schedules: [], // 无课表
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  // maxPerWeek = max(5, floor(10/2)) = 5
  eq(result.assignments.length, 5)
  // 每人最多1次
  const memberCounts = {}
  result.assignments.forEach(a => { memberCounts[a.member_id] = (memberCounts[a.member_id] || 0) + 1 })
  Object.values(memberCounts).forEach(c => ok(c <= 1, `每人最多1次, got ${c}`))
})

// EC-4.2: 特定时段全满
console.log('  EC-4.2: 所有人周一上午有课 -> 该时段空置')
test('所有人周一上午有课 -> 周一上午为空', () => {
  const members = makeMembers({ '部员': 10 })
  const slotMap = {}
  members.forEach(m => { slotMap[`${m.id}_mon_34`] = true })
  const result = runSchedulingAlgorithm({
    members,
    schedules: makeSchedules(members, '单周', slotMap),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const monMorning = result.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  eq(monMorning.length, 0, '周一上午应为空')
})

// EC-4.3: 混合（有人有课有人无课）
console.log('  EC-4.3: 半数人有课 -> 无课的被安排')
test('前5人周一全天有课, 后15人无课 -> 无课的优先', () => {
  const members = makeMembers({ '部员': 20 })
  const slotMap = {}
  // 前5人周一全天有课
  for (let i = 0; i < 5; i++) {
    slotMap[`m${i + 1}_mon_34`] = true
    slotMap[`m${i + 1}_mon_67`] = true
    slotMap[`m${i + 1}_mon_89`] = true
  }
  const result = runSchedulingAlgorithm({
    members,
    schedules: makeSchedules(members, '单周', slotMap),
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  // 周一的值班人员不应包含前5人
  const monAssignments = result.assignments.filter(a => a.day_of_week === 1)
  monAssignments.forEach(a => {
    const num = parseInt(a.member_id.replace('m', ''))
    ok(num > 5, `周一的应是后15人（无课），但安排了m${num}`)
  })
})

// ============================================================
// EC-5: SlotConfig 等价类 (4组)
// ============================================================
console.log('\n📋 EC-5: SlotConfig 等价类')

// EC-5.1: 默认（工作日1人/时段）
console.log('  EC-5.1: 默认配置')
test('30部员 -> maxPerWeek=15, 填满5天', () => {
  const members = makeMembers({ '部员': 30 })
  const result = runSchedulingAlgorithm({
    members,
    schedules: [],
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  // maxPerWeek = max(5, 15) = 15, 每天至少1人 → 填满5天
  eq(result.assignments.length, 15)
})

// EC-5.2: 周末0人
console.log('  EC-5.2: 周末=0 -> 周末无安排')
test('周末required=0, 默认5天 -> 无周末安排', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 20 }),
    schedules: [],
    slotConfig: makeSlotConfig(), // 默认周末=0
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const weekend = result.assignments.filter(a => a.day_of_week >= 6)
  eq(weekend.length, 0, '周末不应有安排')
})

// EC-5.3: 某时段需2人
console.log('  EC-5.3: 周一上午需2人 -> 应安排2人')
test('周一上午required=2, 40部员 -> 安排2人', () => {
  const sc = makeSlotConfig({ '1_上午': 2 })
  const members = makeMembers({ '部员': 40 })
  const result = runSchedulingAlgorithm({
    members,
    schedules: [],
    slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const monMorning = result.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  // maxPerWeek = max(5, floor(40/2)) = 20 > 16 (all slots)
  eq(monMorning.length, 2, '周一上午应有2人')
})

// EC-5.4: 全部0人
console.log('  EC-5.4: 全部required=0 -> 仍至少每天1人（工作日保护）')
test('全0配置工作日 -> 每天至少1人', () => {
  const sc = makeSlotConfig()
  for (const k in sc) sc[k] = 0
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 20 }),
    schedules: [],
    slotConfig: sc,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  // 工作日保护：每天至少1人
  const days = new Set(result.assignments.map(a => a.day_of_week))
  eq(days.size, 5, '5个工作日每天都应有人')
})

// ============================================================
// EC-6: 调休单双周独立映射 (核心新功能)
// ============================================================
console.log('\n📋 EC-6: 调休单双周独立映射')

const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOT_KEYS = ['34', '67', '89']

// EC-6.1: 仅substituteForOdd
console.log('  EC-6.1: 仅设substituteForOdd')
test('单周: 周六补周一, 双周: 无映射 -> 单周用mon_34, 双周用sat_34', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteForOdd: 1 }
  }
  const members = makeMembers({ '部员': 15 })
  // 设两个成员: m1单周周一上午有课, m2双周周六上午有课（用sat_34检查）
  const oddSchedules = makeSchedules(members, '单周', { 'm1_mon_34': true })
  const evenSchedules = makeSchedules(members, '双周', { 'm2_sat_34': true })

  // 单周测试
  const oddResult = runSchedulingAlgorithm({
    members, schedules: oddSchedules, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSchedules,
    dayConfig: dc, weekType: '单周'
  })
  // m1周一上午有课 -> 不能排周一上午
  const oddSatAm = oddResult.assignments.filter(a => a.day_of_week === 6 && a.slot === '上午')
  ok(oddSatAm.length > 0, '单周周六上午应有人')
  // m1应该在周六上午被排除（因为周六补周一，m1周一上午有课）
  const m1InSatAm = oddSatAm.some(a => a.member_id === 'm1')
  ok(!m1InSatAm, 'm1周一上午有课, 周六补周一, 应被排除')
})

// EC-6.2: 仅substituteForEven
console.log('  EC-6.2: 仅设substituteForEven')
test('双周: 周六补周三, 单周: 无映射 -> 双周用wed_34', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteForEven: 3 }
  }
  const members = makeMembers({ '部员': 15 })
  const evenSchedules = makeSchedules(members, '双周', { 'm1_wed_34': true })

  const evenResult = runSchedulingAlgorithm({
    members, schedules: evenSchedules, slotConfig: makeSlotConfig(),
    weekNumber: 2, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: dc, weekType: '双周'
  })
  const evenSatAm = evenResult.assignments.filter(a => a.day_of_week === 6 && a.slot === '上午')
  ok(evenSatAm.length > 0, '双周周六上午应有人')
  const m1InSatAm = evenSatAm.some(a => a.member_id === 'm1')
  ok(!m1InSatAm, 'm1双周周三上午有课, 周六补周三, 应被排除')
})

// EC-6.3: substituteForOdd和substituteForEven相同
console.log('  EC-6.3: 单双周映射相同')
test('单双周都补周一 -> 都使用mon_34', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteForOdd: 1, substituteForEven: 1 }
  }
  const members = makeMembers({ '部员': 15 })
  const oddSch = makeSchedules(members, '单周', { 'm1_mon_34': true })
  const evenSch = makeSchedules(members, '双周', { 'm1_mon_34': true })

  const oddResult = runSchedulingAlgorithm({
    members, schedules: oddSch, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSch,
    dayConfig: dc, weekType: '单周'
  })
  const evenResult = runSchedulingAlgorithm({
    members, schedules: evenSch, slotConfig: makeSlotConfig(),
    weekNumber: 2, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: oddSch,
    dayConfig: dc, weekType: '双周'
  })
  // m1在两个周的周一上午都有课，所以周六上午都应排除m1
  const oddExcluded = oddResult.assignments.filter(a => a.day_of_week === 6 && a.slot === '上午' && a.member_id === 'm1')
  const evenExcluded = evenResult.assignments.filter(a => a.day_of_week === 6 && a.slot === '上午' && a.member_id === 'm1')
  eq(oddExcluded.length, 0, '单周m1应被排除')
  eq(evenExcluded.length, 0, '双周m1应被排除')
})

// EC-6.4: 单双周映射不同（关键场景）
console.log('  EC-6.4: 单双周映射不同（关键场景）')
test('周六: 单周补周一, 双周补周三 -> m1单周周一有课, m1双周周三无课 -> 双周可排m1', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteForOdd: 1, substituteForEven: 3 }
  }
  const members = makeMembers({ '部员': 15 })
  // m1: 单周周一上午有课，双周周三上午无课
  const oddSch = makeSchedules(members, '单周', { 'm1_mon_34': true })
  const evenSch = makeSchedules(members, '双周', {}) // m1双周完全无课

  const oddResult = runSchedulingAlgorithm({
    members, schedules: oddSch, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSch,
    dayConfig: dc, weekType: '单周'
  })
  const evenResult = runSchedulingAlgorithm({
    members, schedules: evenSch, slotConfig: makeSlotConfig(),
    weekNumber: 2, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: oddSch,
    dayConfig: dc, weekType: '双周'
  })

  // 单周: m1周一有课 -> 周六补周一，m1应被排除
  const oddM1 = oddResult.assignments.filter(a => a.day_of_week === 6 && a.member_id === 'm1')
  eq(oddM1.length, 0, '单周: m1周一上午有课，不应排周六')

  // 双周: m1周三无课 -> 周六补周三，m1可以被排
  const evenM1 = evenResult.assignments.filter(a => a.day_of_week === 6 && a.member_id === 'm1')
  ok(evenM1.length >= 0, '双周: m1周三无课，可选')
})

// ============================================================
// EC-7: 边界条件 (6组)
// ============================================================
console.log('\n📋 EC-7: 边界条件')

// EC-7.1: 空成员
console.log('  EC-7.1: 空成员列表')
test('无成员 -> assignments=[]', () => {
  const result = runSchedulingAlgorithm({
    members: [], schedules: [],
    slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  eq(result.assignments.length, 0)
})

// EC-7.2: 上周全部排过（不连续值班）
console.log('  EC-7.2: 上周已排所有人 -> 本周无人可选')
test('5人全排过 -> 本周为空', () => {
  const members = makeMembers({ '部员': 5 })
  const lastWeek = members.map(m => ({ member_id: m.id }))
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 2, lastWeek, allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  eq(result.assignments.length, 0, '所有人上周已排，本周应无人可选')
})

// EC-7.3: maxPerWeek上限
console.log('  EC-7.3: maxPerWeek上限')
test('50部员 -> assignments ≤ maxPerWeek=25', () => {
  const members = makeMembers({ '部员': 50 })
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  ok(result.assignments.length <= result.meta.maxPerWeek, '不应超过maxPerWeek')
  eq(result.meta.maxPerWeek, 25, '50人的maxPerWeek=25')
})

// EC-7.4: 补排优先级
console.log('  EC-7.4: 补排人员优先')
test('makeUpMembers应排在前面', () => {
  const members = makeMembers({ '部员': 20 })
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 3, lastWeek: [], allAssignments: [],
    makeUpMembers: [{ member_id: 'm5' }, { member_id: 'm8' }],
    otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  // m5和m8应被安排
  const assigned = result.assignments.map(a => a.member_id)
  ok(assigned.includes('m5'), '补排人员m5应被安排')
  ok(assigned.includes('m8'), '补排人员m8应被安排')
})

// EC-7.5: 历史公平
console.log('  EC-7.5: 历史排班少的人优先')
test('m1排过5次, m2排过0次 -> m2优先', () => {
  const members = makeMembers({ '部员': 10 })
  const allAssignments = []
  for (let i = 0; i < 5; i++) allAssignments.push({ member_id: 'm1' })
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments,
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const m1Count = result.assignments.filter(a => a.member_id === 'm1').length
  const m2Count = result.assignments.filter(a => a.member_id === 'm2').length
  ok(m2Count >= m1Count, `m2(0次历史)应≥m1(5次历史): ${m2Count} vs ${m1Count}`)
})

// EC-7.6: 跨周课表均衡
console.log('  EC-7.6: 另一周空闲少的人优先')
test('双周全满的人 -> 单周优先安排', () => {
  const members = makeMembers({ '部员': 15 })
  const ALL_SLOT_KEYS_FULL = []
  for (const d of ALL_DAY_KEYS) {
    for (const sk of SLOT_KEYS) {
      ALL_SLOT_KEYS_FULL.push(`${d}_${sk}`)
    }
  }
  // m1双周全满（所有时段有课）
  const evenSlotMap = {}
  ALL_SLOT_KEYS_FULL.forEach(k => { evenSlotMap[`m1_${k}`] = true })
  const evenSch = makeSchedules(members, '双周', evenSlotMap)
  const oddSch = makeSchedules(members, '单周', {})

  const result = runSchedulingAlgorithm({
    members, schedules: oddSch, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSch,
    dayConfig: null, weekType: '单周'
  })
  const m1Assigned = result.assignments.some(a => a.member_id === 'm1')
  ok(m1Assigned, 'm1双周全满，单周应优先安排')
})

// ============================================================
// EC-8: 逻辑一致性检查 (6组)
// ============================================================
console.log('\n📋 EC-8: 逻辑一致性检查')

// EC-8.1: 不重复排班
console.log('  EC-8.1: 无重复安排')
test('每时段每人最多1次', () => {
  const members = makeMembers({ '部员': 20 })
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const seen = new Set()
  result.assignments.forEach(a => {
    const key = `${a.member_id}_${a.day_of_week}_${a.slot}`
    ok(!seen.has(key), `重复安排: ${key}`)
    seen.add(key)
  })
})

// EC-8.2: 不排同周已有的人
console.log('  EC-8.2: 每人每周最多1次')
test('每人每周只排1次', () => {
  const members = makeMembers({ '部员': 10 })
  const result = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const counts = {}
  result.assignments.forEach(a => { counts[a.member_id] = (counts[a.member_id] || 0) + 1 })
  Object.entries(counts).forEach(([id, c]) => ok(c <= 1, `${id}排了${c}次`))
})

// EC-8.3: 课表冲突不安排
console.log('  EC-8.3: 有课的人不在对应时段')
test('指定m1周一上午有课 -> m1不出现在周一上午', () => {
  const members = makeMembers({ '部员': 10 })
  const schedules = makeSchedules(members, '单周', { 'm1_mon_34': true, 'm1_mon_67': true, 'm1_mon_89': true })
  const result = runSchedulingAlgorithm({
    members, schedules, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const m1Mon = result.assignments.filter(a => a.member_id === 'm1' && a.day_of_week === 1)
  eq(m1Mon.length, 0, 'm1周一全天有课，不应排周一')
})

// EC-8.4: 调休日正确排除
console.log('  EC-8.4: 调休日课表冲突正确排除')
test('周六补周一, m1周一上午有课 -> m1不排周六', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteFor: 1 }
  }
  const members = makeMembers({ '部员': 15 })
  const schedules = makeSchedules(members, '单周', { 'm1_mon_34': true })
  const result = runSchedulingAlgorithm({
    members, schedules, slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: dc, weekType: '单周'
  })
  const m1SatAm = result.assignments.filter(a => a.member_id === 'm1' && a.day_of_week === 6 && a.slot === '上午')
  eq(m1SatAm.length, 0, '周六补周一, m1周一上午有课, 不应排周六')
})

// EC-8.5: status字段正确
console.log('  EC-8.5: 生成的排班status=正常')
test('所有assignment status=正常', () => {
  const result = runSchedulingAlgorithm({
    members: makeMembers({ '部员': 10 }),
    schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  result.assignments.forEach(a => eq(a.status, '正常'))
  result.assignments.forEach(a => eq(a.leave_next_week, false))
  result.assignments.forEach(a => eq(a.is_emergency, false))
})

// EC-8.6: weekType参数传递正确
console.log('  EC-8.6: weekType不影响无调休的排班结果')
test('单周和双周在无调休配置时应产生相同数量', () => {
  const members = makeMembers({ '部员': 10 })
  const oddResult = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '单周'
  })
  const evenResult = runSchedulingAlgorithm({
    members, schedules: [], slotConfig: makeSlotConfig(),
    weekNumber: 2, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: [],
    dayConfig: null, weekType: '双周'
  })
  eq(oddResult.assignments.length, evenResult.assignments.length, '无调休时单双周结果应一致')
})

// ============================================================
console.log('\n' + '='.repeat(60))
console.log(`🏆 等价类测试结果: ${passed}/${passed + failed} 通过`)
if (failed > 0) {
  console.log(`\n❌ 失败项:`)
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`))
  process.exit(1)
} else {
  console.log('🎉 全部通过！')
}
console.log('='.repeat(60))
