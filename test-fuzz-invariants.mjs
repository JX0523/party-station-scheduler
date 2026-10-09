/**
 * 随机模糊测试 + 不变量校验（test-fuzz-invariants.mjs）
 *
 * 思路：用固定种子的伪随机数生成大量「形状各异」的排班场景（人数/角色/课表/时段需求/
 *      工作日与调休/放假/模式/上周已排/补排人员全都随机），然后逐条校验算法必须满足的
 *      不变量。任何一条被打破 = 真实 bug，且能用打印出的种子精确复现。
 *
 * 运行: node test-fuzz-invariants.mjs [轮数] [起始种子]
 */
import { runSchedulingAlgorithm, resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'

const ROUNDS = parseInt(process.argv[2] || '400', 10)
const START_SEED = parseInt(process.argv[3] || '1', 10)

const ROLES = ['部员', '部长', '主席团']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']

// ---------- 可复现随机数 ----------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRng(seed) {
  const r = mulberry32(seed)
  return {
    next: r,
    int: (min, max) => min + Math.floor(r() * (max - min + 1)),
    bool: (p = 0.5) => r() < p,
    pick: arr => arr[Math.floor(r() * arr.length)],
  }
}

// ---------- 随机场景 ----------
function genScenario(seed) {
  const rng = makeRng(seed)
  const memberCount = rng.int(0, 14)
  const members = []
  for (let i = 0; i < memberCount; i++) {
    members.push({ id: 'm' + i, name: '成员' + i, role: rng.pick(ROLES), active: true })
  }

  // 课表：每人一张（随机约 25% 的格子有课）
  const mkSchedule = (m, weekType) => {
    const s = { member_id: m.id, week_type: weekType }
    for (const d of DAY_KEYS) for (const k of SLOT_KEYS) s[`${d}_${k}`] = rng.bool(0.25)
    return s
  }
  const weekType = rng.pick(['单周', '双周'])
  const otherType = weekType === '单周' ? '双周' : '单周'
  const schedules = members.map(m => mkSchedule(m, weekType))
  const otherWeekSchedules = members.map(m => mkSchedule(m, otherType))

  // 时段需求：0~3 人
  const slotConfig = {}
  for (let d = 1; d <= 7; d++) for (const s of SLOTS) slotConfig[`${d}_${s}`] = rng.int(0, 3)

  // 工作日 / 调休 / 整周放假
  const dayConfig = {}
  const allOff = rng.bool(0.12)
  for (let d = 1; d <= 7; d++) {
    const isWorkday = allOff ? false : (d <= 5 ? rng.bool(0.85) : rng.bool(0.2))
    const entry = { isWorkday, substituteForOdd: null, substituteForEven: null }
    if (rng.bool(0.15)) entry.substituteForOdd = rng.int(1, 5)
    if (rng.bool(0.15)) entry.substituteForEven = rng.int(1, 5)
    dayConfig[d] = entry
  }
  const useDayConfig = rng.bool(0.85) // 15% 完全不传 dayConfig（走默认周一~周五）

  const lastWeek = members.filter(() => rng.bool(0.35)).map(m => ({ member_id: m.id }))
  const makeUpMembers = members.filter(() => rng.bool(0.12)).map(m => ({ member_id: m.id }))
  const mode = rng.bool(0.2) ? '紧急' : '一般'
  const weekNumber = rng.int(1, 18)

  return {
    seed, rng, members, schedules, otherWeekSchedules, slotConfig,
    dayConfig: useDayConfig ? dayConfig : null, weekType, lastWeek, makeUpMembers, mode, weekNumber,
  }
}

// 某成员在某天某时段是否有课（考虑调休映射）
function hasClass(memberId, day, slot, scenario) {
  const s = scenario.schedules.find(x => x.member_id === memberId)
  if (!s) return false
  const key = resolveScheduleKey(day, scenario.dayConfig, scenario.weekType)
  const slotKey = SLOT_KEYS[SLOTS.indexOf(slot)]
  return !!s[`${key}_${slotKey}`]
}

// ---------- 不变量校验 ----------
function checkInvariants(res, sc) {
  const errs = []
  const A = res.assignments
  const meta = res.meta

  // I1 同一人同周最多 1 次
  const perMember = {}
  A.forEach(a => { perMember[a.member_id] = (perMember[a.member_id] || 0) + 1 })
  Object.entries(perMember).forEach(([id, c]) => { if (c > 1) errs.push(`I1 同一人同周排了 ${c} 次: ${id}`) })

  // I2 只排在工作日
  A.forEach(a => { if (!meta.workdays.includes(a.day_of_week)) errs.push(`I2 排到非工作日 day=${a.day_of_week}`) })

  // I3/I4 时段容量（含文档 §5.5「每日最低保障回退」语义）
  //   - required>0 的时段：人数不得超过需求
  //   - required=0 的时段：正常绝不排人；唯一例外 = 该天有 required>0 的时段，
  //     且被排的这个人当天「所有 required 时段都有课」→ 回退到空闲时段保证当天有人
  const perSlot = {}
  A.forEach(a => { const k = `${a.day_of_week}_${a.slot}`; perSlot[k] = (perSlot[k] || 0) + 1 })
  Object.entries(perSlot).forEach(([k, c]) => {
    const us = k.indexOf('_')
    const day = parseInt(k.slice(0, us), 10)
    const slot = k.slice(us + 1)
    const req = sc.slotConfig[k] || 0
    if (req > 0) {
      if (c > req) errs.push(`I4 时段 ${k} 超编: ${c} > ${req}`)
      return
    }
    if (c > 1) errs.push(`I3 需求为0的时段 ${k} 排了 ${c} 人（最多允许每日保障的 1 人）`)
    const dayHasReq = SLOTS.some(s => (sc.slotConfig[`${day}_${s}`] || 0) > 0)
    if (!dayHasReq) errs.push(`I3 全天无需求却在 ${k} 排了人`)
    for (const a of A.filter(x => x.day_of_week === day && x.slot === slot)) {
      const allReqBlocked = SLOTS.every(s => {
        const r2 = sc.slotConfig[`${day}_${s}`] || 0
        if (r2 <= 0) return true
        return hasClass(a.member_id, day, s, sc)
      })
      if (!allReqBlocked) errs.push(`I3 ${k} 排了需求为0的时段，但该成员在必填时段有空可排: ${a.member_id}`)
    }
  })

  // I5 不排有课的人（含调休映射）
  A.forEach(a => {
    if (hasClass(a.member_id, a.day_of_week, a.slot, sc)) {
      errs.push(`I5 排了有课的人 ${a.member_id} @ ${a.day_of_week}_${a.slot}`)
    }
  })

  // I6 一般模式：上周已排的人不应再排（补排除外）
  const lastIds = new Set(sc.lastWeek.map(x => x.member_id))
  const makeUpIds = new Set(sc.makeUpMembers.map(x => x.member_id))
  if (sc.mode !== '紧急') {
    A.forEach(a => {
      if (lastIds.has(a.member_id) && !makeUpIds.has(a.member_id)) {
        errs.push(`I6 一般模式排了上周已排的人: ${a.member_id}`)
      }
    })
  }

  // I7 补排优先：未排上的补排人员，其所有可行时段必须已被填满/被别人占用
  const scheduled = new Set(A.map(a => a.member_id))
  for (const mu of sc.makeUpMembers) {
    if (scheduled.has(mu.member_id)) continue
    let feasibleAndFree = 0
    for (const day of meta.workdays) {
      for (const slot of SLOTS) {
        const req = sc.slotConfig[`${day}_${slot}`] || 0
        if (req <= 0) continue
        if (hasClass(mu.member_id, day, slot, sc)) continue
        const used = A.filter(a => a.day_of_week === day && a.slot === slot).length
        if (used < req) feasibleAndFree++
      }
    }
    if (feasibleAndFree > 0) {
      errs.push(`I7 补排人员未排上，但仍有 ${feasibleAndFree} 个空位可用: ${mu.member_id}`)
    }
  }

  // I8 总人数不超过 maxPerWeek
  if (A.length > meta.maxPerWeek) errs.push(`I8 超出每周上限: ${A.length} > ${meta.maxPerWeek}`)

  // I9 整周放假必须 0 条
  if (meta.workdays.length === 0 && A.length > 0) errs.push('I9 整周放假却排了班')

  // I10 紧急模式标记
  if (sc.mode === '紧急') A.forEach(a => { if (a.is_emergency !== true) errs.push('I10 紧急模式未标记 is_emergency') })
  else A.forEach(a => { if (a.is_emergency === true) errs.push('I10 一般模式误标 is_emergency') })

  return errs
}

function run(sc) {
  return runSchedulingAlgorithm({
    members: sc.members,
    schedules: sc.schedules,
    slotConfig: sc.slotConfig,
    weekNumber: sc.weekNumber,
    lastWeek: sc.lastWeek,
    allAssignments: [],
    makeUpMembers: sc.makeUpMembers,
    otherWeekSchedules: sc.otherWeekSchedules,
    dayConfig: sc.dayConfig,
    weekType: sc.weekType,
    mode: sc.mode,
  })
}

console.log('='.repeat(66))
console.log(`🧪 随机模糊测试：${ROUNDS} 个随机场景 × 10 条不变量`)
console.log('   种子范围: ' + START_SEED + ' ~ ' + (START_SEED + ROUNDS - 1))
console.log('='.repeat(66))

let failures = 0, totalAssignments = 0, scenariosWithAssignments = 0
const firstErrors = []

for (let i = 0; i < ROUNDS; i++) {
  const seed = START_SEED + i
  const sc = genScenario(seed)
  let res
  try {
    res = run(sc)
  } catch (e) {
    failures++
    if (firstErrors.length < 5) firstErrors.push(`种子 ${seed} 抛异常: ${e.message}`)
    continue
  }
  const errs = checkInvariants(res, sc)
  totalAssignments += res.assignments.length
  if (res.assignments.length > 0) scenariosWithAssignments++
  if (errs.length > 0) {
    failures++
    if (firstErrors.length < 5) {
      firstErrors.push(`种子 ${seed}: ${errs.slice(0, 3).join(' | ')}` +
        `\n      （人数${sc.members.length} 工作日[${res.meta.workdays}] 模式${sc.mode} 补排${sc.makeUpMembers.length}人 上周${sc.lastWeek.length}人）`)
    }
  }
}

// 幂等性抽样：同种子跑两次结果必须完全一致
let idemFail = 0
for (let i = 0; i < Math.min(50, ROUNDS); i++) {
  const seed = START_SEED + i
  const a = run(genScenario(seed))
  const b = run(genScenario(seed))
  if (JSON.stringify(a.assignments) !== JSON.stringify(b.assignments)) {
    idemFail++
    if (firstErrors.length < 5) firstErrors.push(`种子 ${seed} 两次运行结果不一致（非确定性）`)
  }
}

console.log('')
console.log('────────── 统计 ──────────')
console.log(`  场景总数        : ${ROUNDS}`)
console.log(`  产生排班的场景  : ${scenariosWithAssignments}`)
console.log(`  累计排班条数    : ${totalAssignments}`)
console.log(`  不变量违例场景  : ${failures}`)
console.log(`  幂等性检查      : 50 组，不一致 ${idemFail} 组`)
console.log('')
console.log(`🏆 场景不变量校验: ${ROUNDS - failures}/${ROUNDS} 通过`)

if (failures === 0 && idemFail === 0) {
  console.log('')
  console.log(`🏆 全部通过：${ROUNDS} 个随机场景均满足全部不变量，且算法确定性可复现`)
  console.log('='.repeat(66))
} else {
  console.log('')
  console.log('⚠️ 发现违例（可用上述种子复现）:')
  firstErrors.forEach(e => console.log('  - ' + e))
  process.exit(1)
}