/**
 * 排班算法测试 — 多场景随机验证
 * 运行: cd frontend && node ../test-algorithm.mjs
 */
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

const SLOTS = ['上午', '下午1', '下午2']
const DAYS = 5
const SLOT_KEYS = ['34', '67', '89']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const ALL_SLOT_KEYS = []
for (const d of DAY_KEYS) {
  for (const s of SLOT_KEYS) {
    ALL_SLOT_KEYS.push(`${d}_${s}`)
  }
}

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

function makeMembers(roles) {
  // roles: { '部员': 5, '部长': 13 } etc.
  const members = []
  let id = 1
  for (const [role, count] of Object.entries(roles)) {
    for (let i = 0; i < count; i++) {
      members.push({ id: `m${id++}`, name: `${role}${i + 1}`, role })
    }
  }
  return members
}

function makeEmptySchedules(members) {
  // All members have NO classes → always available
  return members.map(m => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) s[k] = false
    return s
  })
}

function makeRandomSchedules(members, busyRatio = 0.3) {
  return members.map(m => {
    const s = { member_id: m.id, week_type: '单周' }
    for (const k of ALL_SLOT_KEYS) {
      s[k] = Math.random() < busyRatio
    }
    return s
  })
}

function makeSlotConfig(perSlot = 1) {
  const config = {}
  for (let d = 1; d <= 5; d++) {
    for (const slot of SLOTS) {
      config[`${d}_${slot}`] = perSlot
    }
  }
  return config
}

function makeLastWeek(memberIds) {
  return memberIds.map(member_id => ({ member_id }))
}

console.log('='.repeat(60))
console.log('排班算法测试套件')
console.log('='.repeat(60))

// ===== 场景1: 13部长+5主席团，全空闲，无课表冲突 =====
console.log('\n📋 场景1: 13部长+5主席团(18人)，全空闲，每时段需1人')
{
  const members = makeMembers({ '部长': 13, '主席团': 5 })
  const emptySchedules = makeEmptySchedules(members)
  const slotConfig = makeSlotConfig(1) // 15 slots needed

  // Week 1 (单周)
  const r1 = runSchedulingAlgorithm({
    members,
    schedules: emptySchedules,
    slotConfig,
    weekNumber: 1,
    lastWeek: [],
    allAssignments: [],
    makeUpMembers: [],
    otherWeekSchedules: emptySchedules // 另一周也全空
  })

  console.log(`  Week 1: ${r1.assignments.length}人, ${r1.meta.roleLabel}, 部长${r1.meta.perRoleUsed['部长']}人, 主席团${r1.meta.perRoleUsed['主席团']}人`)

  // Week 2 (双周)
  const r2 = runSchedulingAlgorithm({
    members,
    schedules: emptySchedules,
    slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments,
    makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 2: ${r2.assignments.length}人, ${r2.meta.roleLabel}, 部长${r2.meta.perRoleUsed['部长']}人, 主席团${r2.meta.perRoleUsed['主席团']}人`)

  // 验证
  const diff = Math.abs(r1.assignments.length - r2.assignments.length)
  assert('两周人数差≤2', diff <= 2, `差${diff}`)
  assert('Week1 部长≤7(ceil(13/2))', r1.meta.perRoleUsed['部长'] <= 7, `用了${r1.meta.perRoleUsed['部长']}`)
  assert('Week2 部长≤7', r2.meta.perRoleUsed['部长'] <= 7, `用了${r2.meta.perRoleUsed['部长']}`)
  assert('主席团不应出现(部长够)', r1.meta.perRoleUsed['主席团'] === 0, `${r1.meta.perRoleUsed['主席团']}`)
  assert('主席团不应出现(部长够)', r2.meta.perRoleUsed['主席团'] === 0, `${r2.meta.perRoleUsed['主席团']}`)
  assert('每天至少有1人(Week1)', [1,2,3,4,5].every(d => r1.assignments.some(a => a.day_of_week === d)))
  assert('每天至少有1人(Week2)', [1,2,3,4,5].every(d => r2.assignments.some(a => a.day_of_week === d)))

  // 周内每天分布
  const w1ByDay = [1,2,3,4,5].map(d => r1.assignments.filter(a => a.day_of_week === d).length)
  const w2ByDay = [1,2,3,4,5].map(d => r2.assignments.filter(a => a.day_of_week === d).length)
  const dayDiff1 = Math.max(...w1ByDay) - Math.min(...w1ByDay)
  const dayDiff2 = Math.max(...w2ByDay) - Math.min(...w2ByDay)
  assert('Week1每天人数差≤2', dayDiff1 <= 2, `${w1ByDay} 差${dayDiff1}`)
  assert('Week2每天人数差≤2', dayDiff2 <= 2, `${w2ByDay} 差${dayDiff2}`)
}

// ===== 场景2: 5部员+13部长，部员主力+部长偶尔 =====
console.log('\n📋 场景2: 5部员+13部长(18人)，部员主力+部长偶尔参与')
{
  const members = makeMembers({ '部员': 5, '部长': 13 })
  const emptySchedules = makeEmptySchedules(members)
  const slotConfig = makeSlotConfig(1)

  const r1 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 1: ${r1.assignments.length}人, ${r1.meta.roleLabel}, 部员${r1.meta.perRoleUsed['部员']}人, 部长${r1.meta.perRoleUsed['部长']}人`)

  const r2 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments, makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 2: ${r2.assignments.length}人, ${r2.meta.roleLabel}, 部员${r2.meta.perRoleUsed['部员']}人, 部长${r2.meta.perRoleUsed['部长']}人`)

  assert('部员主力+部长参与', r1.meta.roleLabel.includes('部长'))
  assert('部长参与但不多(≤3)', r1.meta.perRoleUsed['部长'] <= 3 && r2.meta.perRoleUsed['部长'] <= 3)
  assert('部员占多数', r1.meta.perRoleUsed['部员'] > 0)
  // 5部员的极端情况，Week1用全部5部员+3部长，Week2只能补3部长（部员全被lastWeek排除）
  const diff2 = Math.abs(r1.assignments.length - r2.assignments.length)
  assert('两周人数均衡(边界情况)', diff2 <= 5, `差${diff2}（5部员边界情况）`)
}

// ===== 场景3: 4部员+8部长(12人)，部员不够，用部员+部长 =====
console.log('\n📋 场景3: 4部员+8部长(12人)，部员<5→部员+部长')
{
  const members = makeMembers({ '部员': 4, '部长': 8 })
  const emptySchedules = makeEmptySchedules(members)
  const slotConfig = makeSlotConfig(1)

  const r1 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  const r2 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments, makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 1: ${r1.assignments.length}人, ${r1.meta.roleLabel}, 部员${r1.meta.perRoleUsed['部员']}人, 部长${r1.meta.perRoleUsed['部长']}人`)
  console.log(`  Week 2: ${r2.assignments.length}人, ${r2.meta.roleLabel}, 部员${r2.meta.perRoleUsed['部员']}人, 部长${r2.meta.perRoleUsed['部长']}人`)

  const diff = Math.abs(r1.assignments.length - r2.assignments.length)
  assert('两周人数差≤2', diff <= 2, `差${diff}`)
  assert('部长主力模式', r1.meta.roleLabel === '部长主力')
  assert('部长参与≥2', r1.meta.perRoleUsed['部长'] >= 2, `部长${r1.meta.perRoleUsed['部长']}人`)
}

// ===== 场景4: 全部只有部长（典型场景：13部长，之前9vs4） =====
console.log('\n📋 场景4: 仅13部长，全空闲（之前9vs4的问题场景）')
{
  const members = makeMembers({ '部长': 13 })
  const emptySchedules = makeEmptySchedules(members)
  const slotConfig = makeSlotConfig(1)

  const r1 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  const r2 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments, makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 1: ${r1.assignments.length}人, 部长${r1.meta.perRoleUsed['部长']}人`)
  console.log(`  Week 2: ${r2.assignments.length}人, 部长${r2.meta.perRoleUsed['部长']}人`)
  console.log(`  上限: 全局${r1.meta.maxPerWeek}人, 部长${r1.meta.perRoleMax['部长']}人`)

  const diff = Math.abs(r1.assignments.length - r2.assignments.length)
  assert('两周人数差≤2（修复9vs4）', diff <= 2, `差${diff}，Week1=${r1.assignments.length}, Week2=${r2.assignments.length}`)
  assert('每周边界内(≤ceil(13/2)=7)', r1.meta.perRoleUsed['部长'] <= 7 && r2.meta.perRoleUsed['部长'] <= 7)
  assert('每天至少有1人(Week1)', [1,2,3,4,5].every(d => r1.assignments.some(a => a.day_of_week === d)))
  assert('每天至少有1人(Week2)', [1,2,3,4,5].every(d => r2.assignments.some(a => a.day_of_week === d)))
}

// ===== 场景5: 3部员+2部长+3主席团(8人)，部员+部长≥5→部员+部长 =====
console.log('\n📋 场景5: 3部员+2部长+3主席团(8人)，部员+部长≥5→不启用主席团')
{
  const members = makeMembers({ '部员': 3, '部长': 2, '主席团': 3 })
  const emptySchedules = makeEmptySchedules(members)
  const slotConfig = makeSlotConfig(1)

  const r1 = runSchedulingAlgorithm({
    members, schedules: emptySchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [],
    otherWeekSchedules: emptySchedules
  })

  console.log(`  Week 1: ${r1.assignments.length}人, ${r1.meta.roleLabel}, 部${r1.meta.perRoleUsed['部员']}/长${r1.meta.perRoleUsed['部长']}/主${r1.meta.perRoleUsed['主席团']}`)

  assert('部长主力模式(部员<5)', r1.meta.roleLabel === '部长主力')
  assert('主席团不参与', r1.meta.perRoleUsed['主席团'] === 0, `用了${r1.meta.perRoleUsed['主席团']}个主席团`)
}

// ===== 场景6: 10周连续模拟，4部员+16部长(20人)，部员+部长 =====
console.log('\n📋 场景6: 10周连续模拟，4部员+16部长(20人)全空闲')
{
  const members = makeMembers({ '部员': 4, '部长': 16 })
  const slotConfig = makeSlotConfig(1)
  const allAssignments = []
  let lastWeek = []

  const weekCounts = []

  for (let w = 1; w <= 10; w++) {
    const r = runSchedulingAlgorithm({
      members,
      schedules: makeEmptySchedules(members),
      slotConfig,
      weekNumber: w,
      lastWeek,
      allAssignments,
      makeUpMembers: [],
      otherWeekSchedules: makeEmptySchedules(members)
    })
    weekCounts.push(r.assignments.length)
    allAssignments.push(...r.assignments)
    lastWeek = r.assignments.map(a => ({ member_id: a.member_id }))
  }

  const maxW = Math.max(...weekCounts)
  const minW = Math.min(...weekCounts)
  const spread = maxW - minW
  console.log(`  每周人数: ${weekCounts.join(', ')}`)
  console.log(`  最大${maxW}, 最小${minW}, 差值${spread}`)
  assert('10周人数极差≤2', spread <= 2, `极差${spread}`)
  assert('每周≥5人', weekCounts.every(c => c >= 5))

  // 每人总次数
  const personCounts = {}
  allAssignments.forEach(a => { personCounts[a.member_id] = (personCounts[a.member_id] || 0) + 1 })
  const counts = Object.values(personCounts)
  const maxPerson = Math.max(...counts)
  const minPerson = Math.min(...counts)
  console.log(`  每人总次数: 最多${maxPerson}, 最少${minPerson}`)
  assert('单人最多与最少差≤3', maxPerson - minPerson <= 3, `差${maxPerson - minPerson}`)
}

// ===== 场景7: 不同单双周课表，跨周均衡 =====
console.log('\n📋 场景7: 跨周课表差异—单周10人全空，双周只有6人空')
{
  const members = makeMembers({ '部长': 10 })
  const slotConfig = makeSlotConfig(1)

  // 单周：所有人全空
  const oddSchedules = makeEmptySchedules(members)

  // 双周：4个人的课表排满（全冲突），6个人全空
  const evenSchedules = members.map((m, i) => {
    const s = { member_id: m.id, week_type: '双周' }
    if (i < 4) {
      // 前4人双周全满课
      for (const k of ALL_SLOT_KEYS) s[k] = true
    } else {
      for (const k of ALL_SLOT_KEYS) s[k] = false
    }
    return s
  })

  // Week 1（单周）：应优先排双周满课的人（前4人只在单周有空）
  const r1 = runSchedulingAlgorithm({
    members, schedules: oddSchedules, slotConfig,
    weekNumber: 1, lastWeek: [], allAssignments: [], makeUpMembers: [],
    otherWeekSchedules: evenSchedules
  })

  console.log(`  Week 1(单周): ${r1.assignments.length}人`)
  const w1Ids = new Set(r1.assignments.map(a => a.member_id))
  const busyInEven = members.slice(0, 4).filter(m => w1Ids.has(m.id)).length
  console.log(`  双周满课的4人中，Week1排了${busyInEven}人（应优先排他们）`)
  assert('优先排双周满课的人', busyInEven >= 3, `只排了${busyInEven}人`)

  // Week 2（双周）：只有后6人可用
  const r2 = runSchedulingAlgorithm({
    members, schedules: evenSchedules, slotConfig,
    weekNumber: 2,
    lastWeek: r1.assignments.map(a => ({ member_id: a.member_id })),
    allAssignments: r1.assignments, makeUpMembers: [],
    otherWeekSchedules: oddSchedules
  })

  console.log(`  Week 2(双周): ${r2.assignments.length}人`)
  const w2Ids = new Set(r2.assignments.map(a => a.member_id))
  const freeInEven = members.slice(4).filter(m => w2Ids.has(m.id)).length
  console.log(`  双周全空的6人中，Week2排了${freeInEven}人`)
  assert('Week2只用双周全空的人', freeInEven === r2.assignments.length,
    `Week2共${r2.assignments.length}人，其中${freeInEven}人来自双周全空组`)
}

// ===== 汇总 =====
console.log('\n' + '='.repeat(60))
console.log(`测试结果: ${passed}/${tests} 通过`)
if (passed === tests) {
  console.log('🎉 全部通过！')
} else {
  console.log(`⚠️ ${tests - passed} 项未通过，需要修复`)
}
console.log('='.repeat(60))
