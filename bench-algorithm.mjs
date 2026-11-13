/**
 * 排班算法性能实测（bench-algorithm.mjs）
 *
 * 模拟一个学期的真实规模：60 名成员（50 部员 / 8 部长 / 2 主席团）、
 * 周一至周五 × 3 个时段、每时段 1—2 人、约三成课程冲突，连续排 20 周。
 * 输出：单周生成耗时的均值/中位数/P95/最大值，以及每周条数与整学期总条数。
 */
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

const ROLES = ['部员', '部长', '主席团']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// 固定种子，保证可复现
let seed = 20261113
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

// 60 人：50 部员 / 8 部长 / 2 主席团
const members = []
for (let i = 0; i < 60; i++) {
  const role = i < 50 ? '部员' : i < 58 ? '部长' : '主席团'
  members.push({ id: `m${i}`, name: `成员${i}`, role, active: true })
}

// 每时段 1—2 人
const slotConfig = {}
for (let d = 1; d <= 5; d++) for (const s of SLOTS) slotConfig[`${d}_${s}`] = rnd() < 0.5 ? 1 : 2

const dayConfig = {}
for (let d = 1; d <= 7; d++) dayConfig[d] = { isWorkday: d <= 5 }

// 每人每周课表：约 30% 的格子有课（单/双周各一套）
function makeSchedule(memberId, weekType) {
  const row = { member_id: memberId, week_type: weekType }
  for (const d of DAY_KEYS) for (const k of SLOT_KEYS) row[`${d}_${k}`] = rnd() < 0.3
  return row
}
const schedulesOdd = members.map(m => makeSchedule(m.id, '单周'))
const schedulesEven = members.map(m => makeSchedule(m.id, '双周'))

const history = []      // 历史正常排班
const times = []
const weeklyCounts = []

for (let week = 1; week <= 20; week++) {
  const weekType = week % 2 === 1 ? '单周' : '双周'
  const schedules = weekType === '单周' ? schedulesOdd : schedulesEven
  const otherWeek = weekType === '单周' ? schedulesEven : schedulesOdd

  const lastWeek = history.filter(a => a.week_number === week - 1)
  // 上周请假、本周补排：每周随机 1—2 人
  const makeUp = []
  if (rnd() < 0.7) {
    const pick = lastWeek[Math.floor(rnd() * Math.max(1, lastWeek.length))]
    if (pick) makeUp.push({ member_id: pick.member_id })
    if (rnd() < 0.4 && lastWeek.length > 1) {
      const pick2 = lastWeek[Math.floor(rnd() * lastWeek.length)]
      if (pick2 && pick2.member_id !== pick.member_id) makeUp.push({ member_id: pick2.member_id })
    }
  }

  const t0 = process.hrtime.bigint()
  const res = runSchedulingAlgorithm({
    members, schedules, slotConfig, weekNumber: week,
    lastWeek, allAssignments: history, makeUpMembers: makeUp,
    otherWeekSchedules: otherWeek, dayConfig, weekType, mode: '一般',
  })
  const t1 = process.hrtime.bigint()
  const ms = Number(t1 - t0) / 1e6
  times.push(ms)
  weeklyCounts.push(res.assignments.length)
  res.assignments.forEach(a => history.push({ ...a, week_number: week }))
}

times.sort((a, b) => a - b)
const mean = times.reduce((s, x) => s + x, 0) / times.length
const median = (times[Math.floor(times.length / 2)] + times[Math.ceil(times.length / 2)]) / 2
const p95 = times[Math.floor(times.length * 0.95)]
const max = times[times.length - 1]

const totalAssignments = weeklyCounts.reduce((s, x) => s + x, 0)
const needed = Object.values(slotConfig).reduce((s, x) => s + x, 0)

console.log('=== 排班算法实测（60 人 × 20 周）===')
console.log(`每周需求人次：${needed}`)
console.log(`单周生成耗时：均值 ${mean.toFixed(2)} ms / 中位数 ${median.toFixed(2)} ms / P95 ${p95.toFixed(2)} ms / 最大 ${max.toFixed(2)} ms`)
console.log(`每周排班条数：最少 ${Math.min(...weeklyCounts)} / 最多 ${Math.max(...weeklyCounts)} / 平均 ${(totalAssignments / weeklyCounts.length).toFixed(1)}`)
console.log(`整学期总条数：${totalAssignments}`)
console.log(`按需求满员口径：${needed} 人次/周 × 20 周 = ${needed * 20} 人次；实际生成 ${totalAssignments} 人次（覆盖率 ${(totalAssignments / (needed * 20) * 100).toFixed(1)}%）`)
