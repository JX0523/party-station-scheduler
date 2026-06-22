/**
 * 综合测试套件 — 覆盖所有用户场景
 * 运行: node test-comprehensive.mjs
 *
 * 测试场景：
 *   1. 调休/放假 — 工作日开关
 *   2. 7天排班 — 周末值班
 *   3. 所有人没课自然空缺
 *   4. 部分时段无人可用
 *   5. 极小规模边缘
 *   6. 多人时段需求
 *   7. 多种部长配额验证
 *   8. 5周连续 + 调休变化
 *   9. 请假补排
 *  10. 随机课表压力测试
 *  11. 极端单双周差异
 *  12. 仅主席团
 *  13. 调休+课表冲突
 *  14. 部长配额跨周均匀
 */
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']
const ALL_SLOT_KEYS = []
for (const d of ALL_DAY_KEYS) {
  for (const s of SLOT_KEYS) {
    ALL_SLOT_KEYS.push(`${d}_${s}`)
  }
}
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

let tests = 0, passed = 0
function assert(label, condition, detail = '') {
  tests++
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    console.log(`  ❌ ${label} — ${detail}`)
  }
}

// ===== 工具函数 =====
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

function makeEmptySchedules(members, weekType = '单周') {
  return members.map(m => {
    const s = { member_id: m.id, week_type: weekType }
    for (const k of ALL_SLOT_KEYS) s[k] = false
    return s
  })
}

function makeRandomSchedules(members, busyRatio, weekType = '单周') {
  return members.map((m, i) => {
    const s = { member_id: m.id, week_type: weekType }
    const seed = i * 17 + (weekType === '双周' ? 31 : 0)
    for (let j = 0; j < ALL_SLOT_KEYS.length; j++) {
      const hash = ((seed * 13 + j * 7) % 100) / 100
      s[ALL_SLOT_KEYS[j]] = hash < busyRatio
    }
    return s
  })
}

function makeDayConfig(workdays) {
  const cfg = {}
  for (let d = 1; d <= 7; d++) {
    cfg[d] = workdays.includes(d)
  }
  return cfg
}

function makeSlotConfig(days, perSlot = 1, overrides = {}) {
  const config = {}
  for (const d of days) {
    for (const slot of SLOTS) {
      config[`${d}_${slot}`] = perSlot
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    config[k] = v
  }
  return config
}

function makeLastWeek(assignments) {
  return assignments.map(a => ({ member_id: a.member_id }))
}

console.log('='.repeat(65))
console.log('🔬 综合测试套件 — 覆盖所有用户场景')
console.log('='.repeat(65))

// ================================================================
// 场景1: 调休/放假 — 工作日开关
// ================================================================
console.log('\n📋 场景1: 调休 — 周三放假，周六上班（清明节调休模拟）')
{
  const members = makeMembers({ '部员': 20, '部长': 8, '主席团': 3 })
  const oddSchedules = makeEmptySchedules(members, '单周')
  const evenSchedules = makeEmptySchedules(members, '双周')

  const dayConfig = makeDayConfig([1, 2, 4, 5, 6])
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5, 6, 7], 1)

  const r = runSchedulingAlgorithm({
    members, schedules: oddSchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSchedules,
    dayConfig
  })

  console.log(`  工作日: 周一二四五+周六(调休)，共5天`)
  console.log(`  生成: ${r.assignments.length}人, ${r.meta.roleLabel}`)

  const wedAssigns = r.assignments.filter(a => a.day_of_week === 3)
  assert('周三(放假)无人排班', wedAssigns.length === 0,
    `周三有${wedAssigns.length}人`)

  const satAssigns = r.assignments.filter(a => a.day_of_week === 6)
  assert('周六(调休)有人排班', satAssigns.length > 0,
    `周六排了${satAssigns.length}人`)

  const sunAssigns = r.assignments.filter(a => a.day_of_week === 7)
  assert('周日(休息)无人排班', sunAssigns.length === 0,
    `周日有${sunAssigns.length}人`)

  const workdays = [1, 2, 4, 5, 6]
  const allCovered = workdays.every(d =>
    r.assignments.some(a => a.day_of_week === d)
  )
  assert('每个工作日至少1人', allCovered,
    workdays.filter(d => !r.assignments.some(a => a.day_of_week === d)).map(d => DAY_NAMES[d-1]).join(','))

  console.log(`  每日分布: ${workdays.map(d => `${DAY_NAMES[d-1]}${r.assignments.filter(a => a.day_of_week === d).length}`).join(', ')}`)
}

// ================================================================
// 场景2: 7天全开 — 极端调休
// ================================================================
console.log('\n📋 场景2: 7天全开 — 天天都是工作日')
{
  const members = makeMembers({ '部员': 30, '部长': 10, '主席团': 5 })
  const schedules = makeEmptySchedules(members, '单周')
  const dayConfig = makeDayConfig([1, 2, 3, 4, 5, 6, 7])
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5, 6, 7], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig
  })

  console.log(`  生成: ${r.assignments.length}人, 最多${r.meta.maxPerWeek}人`)

  const coverage = [1, 2, 3, 4, 5, 6, 7].map(d =>
    r.assignments.filter(a => a.day_of_week === d).length
  )
  console.log(`  每日: ${coverage.map((c, i) => `${DAY_NAMES[i]}${c}`).join(' ')}`)

  const coveredDays = coverage.filter(c => c > 0).length
  assert('大部分天有覆盖(≥5天)', coveredDays >= 5, `仅${coveredDays}天`)
  assert('总人次≤maxPerWeek', r.assignments.length <= r.meta.maxPerWeek,
    `${r.assignments.length} > ${r.meta.maxPerWeek}`)
  assert('不崩溃', r.meta !== undefined)
}

// ================================================================
// 场景3: 所有人都有课 → 自然空缺不崩溃
// ================================================================
console.log('\n📋 场景3: 所有人都有课 → 自然空缺')
{
  const members = makeMembers({ '部员': 10 })
  const schedules = members.map(m => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) s[k] = true
    return s
  })
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  console.log(`  生成: ${r.assignments.length}人（预期0，全员满课）`)
  assert('无人可用时生成0条', r.assignments.length === 0,
    `实际${r.assignments.length}条`)
  assert('算法不崩溃', r.meta !== undefined)
}

// ================================================================
// 场景4: 周一上午全员满课 → 该时段空缺，其他时段正常
// ================================================================
console.log('\n📋 场景4: 周一上午全员满课 → 该时段空缺')
{
  const members = makeMembers({ '部员': 15, '部长': 5 })
  const schedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) {
      s[k] = (k === 'mon_34')
    }
    return s
  })
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  const monMorning = r.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  const otherSlots = r.assignments.filter(a => !(a.day_of_week === 1 && a.slot === '上午'))

  console.log(`  周一上午: ${monMorning.length}人（预期0，全满课）`)
  console.log(`  其他时段: ${otherSlots.length}人`)
  assert('周一上午空缺(全员满课)', monMorning.length === 0,
    `排了${monMorning.length}人`)
  assert('其他时段正常排班', otherSlots.length > 0)
}

// ================================================================
// 场景5: 极小规模 — 仅2人
// ================================================================
console.log('\n📋 场景5: 极小规模 — 仅2人（1部员+1部长）')
{
  const members = makeMembers({ '部员': 1, '部长': 1 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  console.log(`  生成: ${r.assignments.length}人, ${r.meta.roleLabel}`)
  assert('算法不崩溃', r.meta !== undefined)
  assert('角色标签合理', r.meta.roleLabel.length > 0)

  const w2 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 2, lastWeek: makeLastWeek(r.assignments),
    allAssignments: r.assignments, makeUpMembers: [],
    otherWeekSchedules: schedules
  })

  const reused = w2.assignments.filter(a =>
    r.assignments.some(prev => prev.member_id === a.member_id)
  ).length
  console.log(`  Week2: ${w2.assignments.length}人, 与Week1重复${reused}人`)
  assert('不连续值班（无重复）', reused === 0, `${reused}人重复`)
}

// ================================================================
// 场景6: 多人时段需求 — 需要3人
// ================================================================
console.log('\n📋 场景6: 某时段需要3人 — 尽量填满')
{
  const members = makeMembers({ '部员': 20, '部长': 5 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1, {
    '1_上午': 3,
  })

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  const monMorning = r.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  console.log(`  周一上午: ${monMorning.length}人（需3人）`)
  // 算法不强制填满所有slot，但Phase 2应尽量补充
  assert('周一上午至少1人', monMorning.length >= 1,
    `仅${monMorning.length}人`)
  assert('不超需求', monMorning.length <= 3)

  const other = r.assignments.filter(a => !(a.day_of_week === 1 && a.slot === '上午'))
  const otherCounts = {}
  other.forEach(a => {
    const k = `${a.day_of_week}_${a.slot}`
    otherCounts[k] = (otherCounts[k] || 0) + 1
  })
  const maxOther = Math.max(...Object.values(otherCounts), 0)
  assert('其他时段≤1人', maxOther <= 1, `有时段${maxOther}人`)
}

// ================================================================
// 场景7: 部长配额 — 多种部员/部长比例
// ================================================================
console.log('\n📋 场景7: 部长配额 — 多种比例验证')
{
  const testCases = [
    { label: '45部员+14部长(真实规模)', buYuan: 45, buZhang: 14, minZhang: 1, maxZhang: 3 },
    { label: '30部员+12部长', buYuan: 30, buZhang: 12, minZhang: 1, maxZhang: 3 },
    { label: '10部员+16部长', buYuan: 10, buZhang: 16, minZhang: 1, maxZhang: 3 },
    { label: '5部员+13部长', buYuan: 5, buZhang: 13, minZhang: 1, maxZhang: 3 },
    { label: '3部员+8部长(部员<5)', buYuan: 3, buZhang: 8, minZhang: 2, maxZhang: 99 },
    { label: '0部员+10部长(无部员)', buYuan: 0, buZhang: 10, minZhang: 2, maxZhang: 99 },
    { label: '50部员+0部长(无部长)', buYuan: 50, buZhang: 0, minZhang: 0, maxZhang: 0 },
  ]

  for (const tc of testCases) {
    const roles = {}
    if (tc.buYuan > 0) roles['部员'] = tc.buYuan
    if (tc.buZhang > 0) roles['部长'] = tc.buZhang
    roles['主席团'] = 3

    const members = makeMembers(roles)
    const schedules = makeEmptySchedules(members, '单周')
    const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

    const r = runSchedulingAlgorithm({
      members, schedules, slotConfig,
      weekNumber: 1, lastWeek: [], allAssignments: [],
      makeUpMembers: [], otherWeekSchedules: schedules
    })

    const zhangCount = r.meta.perRoleUsed['部长'] || 0
    const zhuXiCount = r.meta.perRoleUsed['主席团'] || 0

    const ok = zhangCount >= tc.minZhang && zhangCount <= tc.maxZhang
    console.log(`  ${tc.label}: 部长${zhangCount}人 ${ok ? '✅' : '❌超出['+tc.minZhang+','+tc.maxZhang+']'} 主席团${zhuXiCount}人`)
    assert(`${tc.label} 部长配额`, ok,
      `部长${zhangCount}, 期望[${tc.minZhang},${tc.maxZhang}]`)
    if (tc.buZhang > 0 && tc.buYuan >= 5) {
      assert(`${tc.label} 主席团不应参与`, zhuXiCount === 0,
        `主席团${zhuXiCount}人`)
    }
  }
}

// ================================================================
// 场景8: 5周连续 — 调休变化+跨周均衡
// ================================================================
console.log('\n📋 场景8: 5周连续—每周调休配置不同')
{
  const members = makeMembers({ '部员': 15, '部长': 8 })
  const oddSchedules = makeRandomSchedules(members, 0.25, '单周')
  const evenSchedules = makeRandomSchedules(members, 0.30, '双周')

  const weekConfigs = [
    { w: 1, type: '单周', days: [1, 2, 3, 4, 5] },
    { w: 2, type: '双周', days: [1, 2, 3, 4, 5, 6] },
    { w: 3, type: '单周', days: [1, 2, 4, 5] },
    { w: 4, type: '双周', days: [1, 2, 3, 4, 5] },
    { w: 5, type: '单周', days: [1, 2, 3, 4, 5, 6, 7] },
  ]

  const allHistory = []
  const weekResults = []
  let lastWeek = []

  for (const cfg of weekConfigs) {
    const schedules = cfg.type === '单周' ? oddSchedules : evenSchedules
    const otherType = cfg.type === '单周' ? '双周' : '单周'
    const otherSchedules = otherType === '单周' ? oddSchedules : evenSchedules

    const dayConfig = makeDayConfig(cfg.days)
    const slotConfig = {}
    for (const d of cfg.days) {
      for (const slot of SLOTS) {
        slotConfig[`${d}_${slot}`] = 1
      }
    }

    const r = runSchedulingAlgorithm({
      members, schedules, slotConfig,
      weekNumber: cfg.w, lastWeek,
      allAssignments: allHistory.map(a => ({ member_id: a.member_id })),
      makeUpMembers: [], otherWeekSchedules: otherSchedules,
      dayConfig
    })

    r.assignments.forEach(a => {
      allHistory.push({ member_id: a.member_id, week_number: cfg.w })
    })
    lastWeek = makeLastWeek(r.assignments)
    weekResults.push({ ...cfg, count: r.assignments.length, meta: r.meta })

    console.log(`  第${cfg.w}周(${cfg.type}): ${cfg.days.length}工作日 → ${r.assignments.length}人, 部长${r.meta.perRoleUsed['部长']}人`)
  }

  let consecViolations = 0
  for (const m of members) {
    const weeks = allHistory.filter(a => a.member_id === m.id)
      .map(a => a.week_number).sort((a, b) => a - b)
    for (let i = 1; i < weeks.length; i++) {
      if (weeks[i] - weeks[i - 1] === 1) consecViolations++
    }
  }
  assert('5周无人连续值班', consecViolations === 0,
    `${consecViolations}次连续`)

  const w3 = weekResults.find(r => r.w === 3)
  const w1 = weekResults.find(r => r.w === 1)
  console.log(`  第3周(放假): ${w3.days.length}工作日=${w3.count}人, 第1周(正常): 5工作日=${w1.count}人`)
}

// ================================================================
// 场景9: 请假补排 — 下周自动优先
// ================================================================
console.log('\n📋 场景9: 请假补排 — 下周自动优先')
{
  const members = makeMembers({ '部员': 15, '部长': 5 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r1 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  const leaveId = r1.assignments[0].member_id

  const r2 = runSchedulingAlgorithm({
    members, schedules: makeEmptySchedules(members, '双周'),
    slotConfig,
    weekNumber: 2,
    lastWeek: makeLastWeek(r1.assignments.filter(a => a.member_id !== leaveId)),
    allAssignments: r1.assignments.filter(a => a.member_id !== leaveId).map(a => ({ member_id: a.member_id })),
    makeUpMembers: [{ member_id: leaveId }],
    otherWeekSchedules: schedules
  })

  const isMakeUp = r2.assignments.some(a => a.member_id === leaveId)
  console.log(`  请假人: ${leaveId}, 第2周补排: ${isMakeUp ? '是 ✅' : '否 ❌'}`)
  assert('请假后下周补排', isMakeUp,
    `${leaveId} 未在第2周补排`)
}

// ================================================================
// 场景10: 大规模随机压力测试 — 50人(35部+12长+3主)×10周
// ================================================================
console.log('\n📋 场景10: 随机课表压力测试 — 50人(35部+12长+3主)×10周')
{
  const members = makeMembers({ '部员': 35, '部长': 12, '主席团': 3 })
  const oddSchedules = makeRandomSchedules(members, 0.35, '单周')
  const evenSchedules = makeRandomSchedules(members, 0.38, '双周')

  const oddFrees = members.map((m, i) =>
    ALL_SLOT_KEYS.filter(k => !oddSchedules[i][k]).length
  )
  console.log(`  单周空闲: ${Math.min(...oddFrees)}~${Math.max(...oddFrees)} (平均${(oddFrees.reduce((a,b)=>a+b,0)/oddFrees.length).toFixed(1)})`)

  const allHistory = []
  let lastWeek = []
  let totalAssignments = 0

  for (let w = 1; w <= 10; w++) {
    const weekType = w % 2 === 1 ? '单周' : '双周'
    const otherType = weekType === '单周' ? '双周' : '单周'
    const schedules = weekType === '单周' ? oddSchedules : evenSchedules
    const otherSchedules = otherType === '单周' ? oddSchedules : evenSchedules

    const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

    const r = runSchedulingAlgorithm({
      members, schedules, slotConfig,
      weekNumber: w, lastWeek,
      allAssignments: allHistory.map(a => ({ member_id: a.member_id })),
      makeUpMembers: [], otherWeekSchedules: otherSchedules
    })

    r.assignments.forEach(a => {
      allHistory.push({ member_id: a.member_id, week_number: w })
    })
    lastWeek = makeLastWeek(r.assignments)
    totalAssignments += r.assignments.length

    const zhang = r.meta.perRoleUsed['部长'] || 0
    const zhuxi = r.meta.perRoleUsed['主席团'] || 0
    if (w <= 5 || w % 3 === 0) {
      console.log(`  第${String(w).padStart(2)}周(${weekType}): ${String(r.assignments.length).padStart(2)}人, 部长${zhang}, 主席团${zhuxi}`)
    }
  }
  console.log(`  ...共10周`)

  const personCounts = {}
  allHistory.forEach(a => {
    personCounts[a.member_id] = (personCounts[a.member_id] || 0) + 1
  })

  const buYuanMembers = members.filter(m => m.role === '部员')
  const buZhangMembers = members.filter(m => m.role === '部长')

  const yuanCounts = buYuanMembers.map(m => personCounts[m.id] || 0)
  const zhangCounts = buZhangMembers.map(m => personCounts[m.id] || 0)

  const yuanMax = Math.max(...yuanCounts), yuanMin = Math.min(...yuanCounts)
  const zhangMax = Math.max(...zhangCounts), zhangMin = Math.min(...zhangCounts)
  const yuanActive = yuanCounts.filter(c => c > 0).length
  const zhangActive = zhangCounts.filter(c => c > 0).length

  console.log(`  统计: 总${totalAssignments}人次, 部员${yuanActive}/35参与, 部长${zhangActive}/12参与`)
  console.log(`  部员次数: ${yuanMin}~${yuanMax}, 部长次数: ${zhangMin}~${zhangMax}`)

  assert('部员极差≤5', yuanMax - yuanMin <= 5,
    `极差${yuanMax - yuanMin}`)
  assert('大部分部员参与(≥25人)', yuanActive >= 25,
    `仅${yuanActive}人`)
  assert('大部分部长参与(≥7人)', zhangActive >= 7,
    `仅${zhangActive}人`)
  assert('主席团不参与', !allHistory.some(h => {
    const m = members.find(x => x.id === h.member_id)
    return m && m.role === '主席团'
  }), '有主席团参与')

  let consec = 0
  for (const m of members) {
    const weeks = allHistory.filter(a => a.member_id === m.id)
      .map(a => a.week_number).sort((a, b) => a - b)
    for (let i = 1; i < weeks.length; i++) {
      if (weeks[i] - weeks[i - 1] === 1) consec++
    }
  }
  assert('0次连续值班', consec === 0, `${consec}次`)
}

// ================================================================
// 场景11: 极端单双周差异 — 跨周均衡
// ================================================================
console.log('\n📋 场景11: 极端单双周差异 — 30人单周空/5人双周空')
{
  const members = makeMembers({ '部员': 25, '部长': 5 })
  const oddSchedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) s[k] = i >= 20
    return s
  })
  const evenSchedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '双周' }
    for (const k of ALL_SLOT_KEYS) s[k] = i >= 5
    return s
  })

  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r1 = runSchedulingAlgorithm({
    members, schedules: oddSchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: evenSchedules
  })

  const w1FromBusyInEven = r1.assignments.filter(a => {
    const idx = members.findIndex(m => m.id === a.member_id)
    return idx >= 5
  }).length
  console.log(`  Week1(单周): ${r1.assignments.length}人, ${w1FromBusyInEven}人来自双周满课组(应优先)`)

  assert('优先排双周满课的人', w1FromBusyInEven >= 3,
    `仅${w1FromBusyInEven}/${r1.assignments.length}`)

  const r2 = runSchedulingAlgorithm({
    members, schedules: evenSchedules, slotConfig,
    weekNumber: 2,
    lastWeek: makeLastWeek(r1.assignments),
    allAssignments: r1.assignments,
    makeUpMembers: [],
    otherWeekSchedules: oddSchedules
  })

  // Week2: 双周只有5人空闲，Week1排过的被lastWeek排除
  const w2FromFreeInEven = r2.assignments.filter(a => {
    const idx = members.findIndex(m => m.id === a.member_id)
    return idx < 5
  }).length
  console.log(`  Week2(双周): ${r2.assignments.length}人, ${w2FromFreeInEven}人来自双周空闲组`)
  // Week2可能不够人，但空闲组的应优先
  assert('Week2空闲组优先', w2FromFreeInEven >= r2.assignments.length * 0.5,
    `仅${w2FromFreeInEven}/${r2.assignments.length}`)
  assert('Week2不崩溃', r2.meta !== undefined)
}

// ================================================================
// 场景12: 仅主席团 — 极端人力不足
// ================================================================
console.log('\n📋 场景12: 仅主席团 — 极端人力不足')
{
  const members = makeMembers({ '主席团': 5 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules
  })

  console.log(`  生成: ${r.assignments.length}人, ${r.meta.roleLabel}`)
  assert('不崩溃', r.meta !== undefined)
  assert('主席团必须参与', r.meta.perRoleUsed['主席团'] > 0)

  const r2 = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 2,
    lastWeek: makeLastWeek(r.assignments),
    allAssignments: r.assignments,
    makeUpMembers: [],
    otherWeekSchedules: schedules
  })

  const reused = r2.assignments.filter(a =>
    r.assignments.some(prev => prev.member_id === a.member_id)
  ).length
  console.log(`  Week2: ${r2.assignments.length}人, 与Week1重复${reused}人`)
  assert('不连续值班', reused === 0, `${reused}人重复`)
}

// ================================================================
// 场景13: 调休+课表冲突 — 周六上班但有人有课
// ================================================================
console.log('\n📋 场景13: 调休+课表冲突 — 周六上班有人有课')
{
  const members = makeMembers({ '部员': 20, '部长': 5 })
  const schedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) s[k] = false
    if (i < 5) { s['sat_34'] = true; s['sat_67'] = true }  // 前5人周六全天有课
    return s
  })

  const dayConfig = makeDayConfig([1, 2, 3, 4, 5, 6])
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5, 6], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig
  })

  const satAssigns = r.assignments.filter(a => a.day_of_week === 6)
  console.log(`  周六共: ${satAssigns.length}人`)

  // 周六排的人不应来自前5个满课的
  const satIds = new Set(satAssigns.map(a => a.member_id))
  const busyIds = new Set(members.slice(0, 5).map(m => m.id))
  const conflict = [...satIds].filter(id => busyIds.has(id))
  assert('周六不排满课的人', conflict.length === 0,
    `排了${conflict.length}个满课的人`)
}

// ================================================================
// 场景14: 部长3周连续配额验证
// ================================================================
console.log('\n📋 场景14: 部长3周连续 — 配额均匀使用')
{
  const members = makeMembers({ '部员': 20, '部长': 15, '主席团': 3 })
  const schedules = makeEmptySchedules(members, '单周')
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5], 1)

  let lastWeek = [], allHistory = []
  const zhangByWeek = []

  for (let w = 1; w <= 3; w++) {
    const r = runSchedulingAlgorithm({
      members, schedules, slotConfig,
      weekNumber: w, lastWeek,
      allAssignments: allHistory.map(a => ({ member_id: a.member_id })),
      makeUpMembers: [], otherWeekSchedules: schedules
    })

    r.assignments.forEach(a => {
      allHistory.push({ member_id: a.member_id, week_number: w })
    })
    lastWeek = r.assignments.map(a => ({ member_id: a.member_id }))
    zhangByWeek.push(r.meta.perRoleUsed['部长'] || 0)
    console.log(`  第${w}周: ${r.assignments.length}人, 部长${r.meta.perRoleUsed['部长']}人`)
  }

  const zhangSpread = Math.max(...zhangByWeek) - Math.min(...zhangByWeek)
  console.log(`  部长分布: ${zhangByWeek.join(', ')}, 极差${zhangSpread}`)
  assert('部长极差≤1', zhangSpread <= 1,
    `极差${zhangSpread}`)
  assert('部长每周≤3', zhangByWeek.every(c => c <= 3))
}

// ================================================================
// 场景15: 纯周末调休 — 只有周六日上班（极端）
// ================================================================
console.log('\n📋 场景15: 纯周末调休 — 仅周六日工作日')
{
  const members = makeMembers({ '部员': 10, '部长': 3 })
  const schedules = makeEmptySchedules(members, '单周')
  const dayConfig = makeDayConfig([6, 7])  // 只有周六日
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5, 6, 7], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig
  })

  console.log(`  工作日: 仅周六日, 生成${r.assignments.length}人`)
  const weekdays = r.assignments.filter(a => [1, 2, 3, 4, 5].includes(a.day_of_week))
  assert('周一至周五无人排班', weekdays.length === 0,
    `有${weekdays.length}人`)
  assert('算法不崩溃', r.meta !== undefined)
}

// ================================================================
// 场景16: 调休课表映射 — 周六补周一，算法用周一课表检查冲突
// ================================================================
console.log('\n📋 场景16: 调休课表映射 — 周六补周一，冲突检查用mon_*')
{
  const members = makeMembers({ '部员': 15, '部长': 3 })
  // m1-m3: 周一上午有课(mon_34)，但周六全空
  // m4-m6: 周六上午有课(sat_34)，但周一全空
  const schedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) s[k] = false
    if (i < 3) s['mon_34'] = true       // 前3人周一上午有课
    if (i >= 3 && i < 6) s['sat_34'] = true  // 中3人周六上午有课
    if (i >= 6 && i < 9) s['mon_34'] = true; s['mon_67'] = true  // 后3人周一全天有课
    return s
  })

  // Rich dayConfig: 周六补周一
  const dayConfig = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteFor: 1 }
  }
  const slotConfig = makeSlotConfig([1, 2, 3, 4, 5, 6], 1)

  const r = runSchedulingAlgorithm({
    members, schedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules,
    dayConfig
  })

  const satAssigns = r.assignments.filter(a => a.day_of_week === 6)
  const satAM = satAssigns.filter(a => a.slot === '上午')
  // 周六上午：m1-m3有mon_34（应被排除），m4-m6有sat_34（不应被排除，因为调休后查mon_*）
  console.log(`  周六共${satAssigns.length}人, 上午${satAM.length}人`)

  // 检查：有mon_34的人不应出现在周六上午
  const monBusyIds = members.slice(0, 3).map(m => m.id)
  const satAMIds = new Set(satAM.map(a => a.member_id))
  const conflictFromMon = monBusyIds.filter(id => satAMIds.has(id))
  assert('mon_34有课的人不排周六上午', conflictFromMon.length === 0,
    `排了${conflictFromMon.length}人`)

  // 检查：有sat_34的人可以排周六上午（因为调休后查的是mon_*不是sat_*）
  const satBusyIds = members.slice(3, 6).map(m => m.id)
  const satBusyInAM = satBusyIds.filter(id => satAMIds.has(id))
  console.log(`  sat_34有课的人在周六上午: ${satBusyInAM.length}人（应该被允许）`)

  // 周六上午至少有人（从没有mon_34的人中选）
  assert('周六上午有人值班', satAM.length > 0)

  // 周一上午：m1-m3有mon_34不应被排
  const monAM = r.assignments.filter(a => a.day_of_week === 1 && a.slot === '上午')
  const monAMIds = new Set(monAM.map(a => a.member_id))
  const monConflict = monBusyIds.filter(id => monAMIds.has(id))
  assert('mon_34有课的人也不排周一上午', monConflict.length === 0)
}

// ================================================================
// 汇总
// ================================================================
console.log('\n' + '='.repeat(65))
console.log(`🏆 综合测试结果: ${passed}/${tests} 通过`)
if (passed === tests) {
  console.log('🎉 全部通过！')
} else {
  console.log(`⚠️ ${tests - passed} 项未通过`)
}
console.log('='.repeat(65))
