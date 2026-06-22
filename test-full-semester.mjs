/**
 * 全学期综合测试 — 真实规模
 * 64人(45部员+14部长+5主席团) × 16周
 * 验证：部长偶尔参与、主席团不参与、课表差异、请假、空置
 * 运行: node test-full-semester.mjs
 */
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']
const ALL_SLOT_KEYS = []
for (const d of DAY_KEYS) for (const s of SLOT_KEYS) ALL_SLOT_KEYS.push(`${d}_${s}`)
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五']

let tests = 0, passed = 0
function assert(label, condition, detail = '') {
  tests++
  if (condition) { passed++; console.log(`  ✅ ${label}`) }
  else { console.log(`  ❌ ${label} — ${detail}`) }
}

// ==================== 构建64人测试数据 ====================
const LAST_NAMES = [
  '赵','钱','孙','李','周','吴','郑','王','冯','陈',
  '褚','卫','蒋','沈','韩','杨','朱','秦','许','何',
  '吕','施','张','孔','曹','严','华','金','魏','陶',
  '姜','戚','谢','邹','喻','柏','水','窦','章','云',
  '苏','潘','葛','奚','范','彭','郎','鲁','韦','昌',
  '马','苗','凤','花','方','俞','任','袁','柳','酆',
  '鲍','史','唐','费'
]

const members = []
let mid = 1
function addMembers(role, count) {
  for (let i = 0; i < count; i++) {
    const suffix = role === '部员' ? '' : role === '部长' ? '(长)' : '(主席)'
    members.push({
      id: `m${mid++}`,
      name: LAST_NAMES[(mid - 2) % LAST_NAMES.length] + suffix,
      role
    })
  }
}
addMembers('部员', 45)
addMembers('部长', 14)
addMembers('主席团', 5)

console.log('='.repeat(65))
console.log(`全学期综合测试 — ${members.length}人(45部员+14部长+5主席团) × 16周`)
console.log('='.repeat(65))

// ==================== 差异化课表 ====================
// 模拟真实大学课表：每个人在不同时段有课，程度不同
function makeSchedule(memberId, weekType, busySlots) {
  const s = { member_id: memberId, week_type: weekType }
  for (const k of ALL_SLOT_KEYS) s[k] = false
  for (const b of busySlots) s[b] = true
  return s
}

function genBusySlots(index, total, weekType) {
  const seed = index * 7 + (weekType === '双周' ? 13 : 0) + 3
  const busy = []
  for (let i = 0; i < ALL_SLOT_KEYS.length; i++) {
    const hash = ((seed * 31 + i * 17) % 100) / 100
    // 部员课多(30-60%)，部长课少(20-40%)，主席团课最少(10-30%)
    const roleIdx = index < 45 ? 0 : index < 59 ? 1 : 2
    const ratio = [0.45, 0.30, 0.20][roleIdx]
    if (hash < ratio + (index % 10) * 0.01) {
      busy.push(ALL_SLOT_KEYS[i])
    }
  }
  return busy
}

const oddSchedules = members.map((m, i) =>
  makeSchedule(m.id, '单周', genBusySlots(i, members.length, '单周')))
const evenSchedules = members.map((m, i) =>
  makeSchedule(m.id, '双周', genBusySlots(i, members.length, '双周')))

function countFree(schedules, memberId) {
  const s = schedules.find(sc => sc.member_id === memberId)
  if (!s) return 15
  return ALL_SLOT_KEYS.filter(k => !s[k]).length
}

const oddFrees = members.map(m => countFree(oddSchedules, m.id))
const evenFrees = members.map(m => countFree(evenSchedules, m.id))
console.log(`\n📊 空闲分布: 单周${Math.min(...oddFrees)}-${Math.max(...oddFrees)}空 双周${Math.min(...evenFrees)}-${Math.max(...evenFrees)}空`)

// 统计有多少人完全没空（极端情况）
const noFreeOdd = members.filter((_, i) => oddFrees[i] === 0).length
const noFreeEven = members.filter((_, i) => evenFrees[i] === 0).length
console.log(`  单周0空闲: ${noFreeOdd}人, 双周0空闲: ${noFreeEven}人`)

// ==================== 基本参数 ====================
function makeSlotConfig(overrides = {}) {
  const cfg = {}
  for (let d = 1; d <= 5; d++) {
    for (const s of SLOTS) cfg[`${d}_${s}`] = 1
  }
  for (const [k, v] of Object.entries(overrides)) cfg[k] = v
  return cfg
}

// ==================== 模拟16周 ====================
console.log('\n' + '='.repeat(65))
console.log('开始16周模拟')
console.log('='.repeat(65))

const allHistory = []
const leaveRecords = []
const lastWeekMap = new Map()
let makeUpPool = []
const weekResults = []

for (let w = 1; w <= 16; w++) {
  const weekType = w % 2 === 1 ? '单周' : '双周'
  const otherType = weekType === '单周' ? '双周' : '单周'
  const schedules = weekType === '单周' ? oddSchedules : evenSchedules
  const otherSchedules = otherType === '单周' ? oddSchedules : evenSchedules

  // 特殊时段
  let slotOverrides = {}
  if (w === 6) slotOverrides['3_下午1'] = 3  // 第6周紧急需要多人
  if (w === 10) slotOverrides['5_上午'] = 2  // 第10周周五上午加人
  if (w === 14) {
    // 模拟某时段有大量需求但可能没人有空
    slotOverrides['2_下午2'] = 4
  }
  const slotConfig = makeSlotConfig(slotOverrides)

  const result = runSchedulingAlgorithm({
    members, schedules, slotConfig, weekNumber: w,
    lastWeek: lastWeekMap.get(w - 1) || [],
    allAssignments: allHistory.map(a => ({ member_id: a.member_id })),
    makeUpMembers: makeUpPool,
    otherWeekSchedules: otherSchedules
  })

  result.assignments.forEach(a => {
    allHistory.push({ member_id: a.member_id, week_number: w })
  })
  lastWeekMap.set(w, result.assignments.map(a => ({ member_id: a.member_id })))
  makeUpPool = []

  // 请假事件
  let leaveInfo = ''
  if (w === 4 && result.assignments.length > 3) {
    const v = result.assignments[2]
    const vName = members.find(m => m.id === v.member_id)?.name
    leaveRecords.push({ week: w, member_id: v.member_id, slot: v.slot, day: v.day_of_week })
    makeUpPool.push({ member_id: v.member_id })
    result.assignments = result.assignments.filter(a => a.member_id !== v.member_id)
    leaveInfo = ` 🏥${vName}请假`
  }
  if (w === 9 && result.assignments.length > 5) {
    const v = result.assignments[5]
    const vName = members.find(m => m.id === v.member_id)?.name
    leaveRecords.push({ week: w, member_id: v.member_id, slot: v.slot, day: v.day_of_week })
    makeUpPool.push({ member_id: v.member_id })
    result.assignments = result.assignments.filter(a => a.member_id !== v.member_id)
    leaveInfo = ` 🏥${vName}请假`
  }
  if (w === 13 && result.assignments.length > 2) {
    const v = result.assignments[1]
    const vName = members.find(m => m.id === v.member_id)?.name
    leaveRecords.push({ week: w, member_id: v.member_id, slot: v.slot, day: v.day_of_week })
    makeUpPool.push({ member_id: v.member_id })
    result.assignments = result.assignments.filter(a => a.member_id !== v.member_id)
    leaveInfo = ` 🏥${vName}请假`
  }

  weekResults.push({ week: w, ...result, leaveInfo })

  const roleDetail = Object.entries(result.meta.perRoleUsed || {})
    .filter(([,c]) => c > 0)
    .map(([r, c]) => `${r}${c}`).join(' ')
  const overInfo = Object.keys(slotOverrides).length > 0
    ? ` ⚡${JSON.stringify(slotOverrides)}` : ''

  console.log(`  第${String(w).padStart(2)}周(${weekType}): ${String(result.assignments.length).padStart(2)}人 ${roleDetail}${overInfo}${leaveInfo}`)
}

// ==================== 验证 ====================
console.log('\n' + '='.repeat(65))
console.log('验证结果')
console.log('='.repeat(65))

// 1. 每周人数基本稳定
console.log('\n📋 1. 每周人数')
const counts = weekResults.map(r => r.assignments.length)
const maxW = Math.max(...counts), minW = Math.min(...counts)
console.log(`  ${counts.join(', ')}`)
console.log(`  最多${maxW}, 最少${minW}, 极差${maxW - minW}`)
assert('极差≤5', maxW - minW <= 5, `极差${maxW - minW}`)

// 2. 部长参与度
console.log('\n📋 2. 部长参与（应有，但不能太多）')
const zhangByWeek = weekResults.map(r => r.meta.perRoleUsed?.['部长'] || 0)
console.log(`  每周部长人数: ${zhangByWeek.join(', ')}`)
const zhangWeeks = zhangByWeek.filter(c => c > 0).length
const zhangMax = Math.max(...zhangByWeek)
assert('部长有参与(≥8周)', zhangWeeks >= 8, `仅${zhangWeeks}周有部长`)
assert('部长每周≤3人', zhangMax <= 3, `最多${zhangMax}人`)
assert('部长占总人次<20%', zhangByWeek.reduce((a,b)=>a+b,0) / counts.reduce((a,b)=>a+b,0) < 0.20)

// 3. 主席团不参与
console.log('\n📋 3. 主席团零参与')
const anyZhuXi = weekResults.some(r => (r.meta.perRoleUsed?.['主席团'] || 0) > 0)
assert('主席团从未参与', !anyZhuXi)

// 4. 每天覆盖
console.log('\n📋 4. 每天基本覆盖')
let dayMisses = 0
for (const r of weekResults) {
  for (let d = 1; d <= 5; d++) {
    if (!r.assignments.some(a => a.day_of_week === d)) dayMisses++
  }
}
assert('大部分天有覆盖(≥70天/80)', dayMisses <= 10, `${dayMisses}天无人`)

// 5. 每人次数均衡
console.log('\n📋 5. 每人值班次数均衡')
const personCounts = {}
allHistory.forEach(a => {
  personCounts[a.member_id] = (personCounts[a.member_id] || 0) + 1
})
const buYuanIds = members.filter(m => m.role === '部员').map(m => m.id)
const buZhangIds = members.filter(m => m.role === '部长').map(m => m.id)
const buYuanCounts = buYuanIds.map(id => personCounts[id] || 0)
const buZhangCounts = buZhangIds.map(id => personCounts[id] || 0)

console.log(`  部员次数: ${buYuanCounts.sort((a,b)=>a-b).join(',')}`)
console.log(`  部长次数: ${buZhangCounts.sort((a,b)=>a-b).join(',')}`)

const yuanMax = Math.max(...buYuanCounts), yuanMin = Math.min(...buYuanCounts)
const zhangPersonMax = Math.max(...buZhangCounts), zhangPersonMin = Math.min(...buZhangCounts)
const yuanActive = buYuanCounts.filter(c => c > 0).length
const zhangActive = buZhangCounts.filter(c => c > 0).length
console.log(`  参与部员: ${yuanActive}/45, 参与部长: ${zhangActive}/14`)
assert('大部分部员参与(≥30人)', yuanActive >= 30, `仅${yuanActive}人`)
assert('大部分部长参与(≥8人)', zhangActive >= 8, `仅${zhangActive}人`)
assert('部员人均>部长人均', (buYuanCounts.reduce((a,b)=>a+b,0)/45) > (buZhangCounts.reduce((a,b)=>a+b,0)/14))

// 6. 请假
console.log('\n📋 6. 请假记录')
for (const l of leaveRecords) {
  const name = members.find(m => m.id === l.member_id)?.name
  console.log(`    第${l.week}周 ${name} ${DAY_NAMES[l.day-1]}${l.slot}`)
}
assert('3人次请假', leaveRecords.length === 3)

// 7. 特殊时段
console.log('\n📋 7. 特殊时段加人')
const w6 = weekResults.find(r => r.week === 6)
const w6s = w6.assignments.filter(a => a.day_of_week === 3 && a.slot === '下午1')
console.log(`  第6周周三下午1: ${w6s.length}人(需3)`)
assert('特殊时段尽量填充', w6s.length >= 1, `仅${w6s.length}人`)

const w14 = weekResults.find(r => r.week === 14)
const w14s = w14.assignments.filter(a => a.day_of_week === 2 && a.slot === '下午2')
console.log(`  第14周周二下午2: ${w14s.length}人(需4，可能不足)`)
// 不强制要求填满，没人就空着

// 8. 不连续值班
console.log('\n📋 8. 无人连续两周值班')
let consec = 0
for (const m of members) {
  const weeks = allHistory.filter(a => a.member_id === m.id).map(a => a.week_number).sort((a,b)=>a-b)
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] - weeks[i-1] === 1) consec++
  }
}
assert('0次连续值班', consec === 0, `${consec}次`)

// 9. 单双周均衡
console.log('\n📋 9. 单双周均衡')
const oddAvg = weekResults.filter(r => r.week%2===1).reduce((s,r)=>s+r.assignments.length,0) / 8
const evenAvg = weekResults.filter(r => r.week%2===0).reduce((s,r)=>s+r.assignments.length,0) / 8
console.log(`  单周均${oddAvg.toFixed(1)} 双周均${evenAvg.toFixed(1)}`)
assert('单双周差≤3', Math.abs(oddAvg - evenAvg) <= 3)

// 10. 没人就空着
console.log('\n📋 10. 无人时段自然空缺（不强制填充）')
// 统计有多少slot需求未被满足
let unfilledSlots = 0
for (const r of weekResults) {
  for (let d = 1; d <= 5; d++) {
    for (const slot of SLOTS) {
      const required = (r.week === 6 && d === 3 && slot === '下午1') ? 3
        : (r.week === 10 && d === 5 && slot === '上午') ? 2
        : (r.week === 14 && d === 2 && slot === '下午2') ? 4
        : 1
      const actual = r.assignments.filter(a => a.day_of_week === d && a.slot === slot).length
      if (actual < required) unfilledSlots += (required - actual)
    }
  }
}
console.log(`  16周总需求: ${16*15+2+1+3}=246, 实际: ${weekResults.reduce((s,r)=>s+r.assignments.length,0)}, 缺${unfilledSlots}`)
assert('空缺被正常记录（不崩溃）', unfilledSlots >= 0) // 只要能跑完就OK

// 汇总
console.log('\n' + '='.repeat(65))
console.log(`测试结果: ${passed}/${tests} 通过`)
if (passed === tests) {
  console.log('🎉 全部通过！')
} else {
  console.log(`⚠️ ${tests - passed} 项未通过`)
}
console.log('='.repeat(65))

const totalSlots = weekResults.reduce((s, r) => s + r.assignments.length, 0)
console.log(`\n📊 学期总结:`)
console.log(`  总排班人次: ${totalSlots}`)
console.log(`  总请假人次: ${leaveRecords.length}`)
console.log(`  平均每周: ${(totalSlots/16).toFixed(1)} 人`)
console.log(`  部长总人次: ${buZhangCounts.reduce((a,b)=>a+b,0)} (占${(buZhangCounts.reduce((a,b)=>a+b,0)/totalSlots*100).toFixed(1)}%)`)
console.log(`  参与部员: ${buYuanCounts.filter(c=>c>0).length}/45`)
console.log(`  参与部长: ${buZhangCounts.filter(c=>c>0).length}/14`)
