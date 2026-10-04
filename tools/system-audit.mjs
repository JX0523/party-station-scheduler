/**
 * 系统审计脚本（可复用）— tools/system-audit.mjs
 *
 * 用途：在能访问 Supabase 的网络里跑一次全面体检：
 *   1. 数据完整性审计（重复行、孤儿引用、请假覆盖、每周统计、统计口径）
 *   2. 用【真实数据 + 真实算法】做排班模拟（当前周重排、下周生成与补排、放假场景）
 *
 * 用法：
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/system-audit.mjs [report.md]
 *   （GitHub Actions 中由 .github/workflows/system-audit.yml 调用）
 */
import fs from 'fs'
import { runSchedulingAlgorithm } from '../frontend/src/lib/scheduling-algorithm.js'
import { expandDateRange, toWeekDaySet, inferSemesterStart, describeWeeks } from '../frontend/src/lib/holiday-dates.js'

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY || ''
if (!URL_BASE || !KEY) { console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const out = []
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s) }

async function get(path) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const DAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const SLOTS = ['上午', '下午1', '下午2']

async function main() {
  log('# 系统审计报告')
  log('')
  log('生成时间(UTC): ' + new Date().toISOString())
  log('')

  // ---------- 拉取数据 ----------
  const members = await get('members?select=id,name,role,active,created_at&order=name')
  const schedules = await get('course_schedules?select=*')
  const assignments = await get('assignments?select=*&order=week_number,day_of_week,slot')
  const sem = (await get('semester_config?select=*'))[0] || {}
  const daycfg = await get('day_config?select=*&order=week_number,day_of_week')
  const slotcfg = await get('slot_config?select=*&order=day_of_week,slot')

  log('## 0. 基础规模')
  log(`- 成员: ${members.length} 人（活跃 ${members.filter(m => m.active).length}）`)
  log(`- 课表: ${schedules.length} 份（单周 ${schedules.filter(s => s.week_type === '单周').length} / 双周 ${schedules.filter(s => s.week_type === '双周').length}）`)
  log(`- 排班: ${assignments.length} 条 | 放假配置: ${daycfg.filter(d => d.is_workday === false).length} 天`)
  log(`- 学期: ${sem.name} | 当前第 ${sem.current_week} 周 / 共 ${sem.total_weeks} 周 | 模式 ${sem.current_mode} | 首周${sem.first_week_is_odd ? '单' : '双'}周`)
  log('')

  // ---------- 1. 完整性 ----------
  log('## 1. 数据完整性')
  const memById = new Map(members.map(m => [m.id, m]))
  const dupKeys = new Map()
  for (const a of assignments) { const k = `${a.week_number}|${a.day_of_week}|${a.slot}|${a.member_id}`; dupKeys.set(k, (dupKeys.get(k) || 0) + 1) }
  const dups = [...dupKeys.entries()].filter(([, c]) => c > 1)
  log(`- 重复排班(同周同天同时段同人): ${dups.length === 0 ? '0 ✅' : dups.length + ' ❌'}`)
  const orphans = assignments.filter(a => !memById.has(a.member_id))
  log(`- 引用不存在成员: ${orphans.length === 0 ? '0 ✅' : orphans.length + ' ❌'}`)
  const inactive = assignments.filter(a => memById.has(a.member_id) && memById.get(a.member_id).active === false)
  log(`- 排班指向已停用成员（统计会漏算）: ${inactive.length === 0 ? '0 ✅' : inactive.length + ' ⚠️'}`)
  const schedSet = new Set(schedules.map(s => s.member_id + '|' + s.week_type))
  const noSched = members.filter(m => !schedSet.has(m.id + '|单周') || !schedSet.has(m.id + '|双周'))
  log(`- 缺少单周或双周课表的成员: ${noSched.length === 0 ? '0 ✅' : noSched.map(m => m.name).join(',') + ' ⚠️（视为全空闲）'}`)
  // 请假覆盖
  const slots = new Map()
  for (const a of assignments) { const k = `${a.week_number}|${a.day_of_week}|${a.slot}`; if (!slots.has(k)) slots.set(k, []); slots.get(k).push(a) }
  const uncovered = [...slots.entries()].filter(([, rows]) => rows.some(r => r.status === '请假') && !rows.some(r => r.status === '正常'))
  log(`- 请假但无替补(该时段无人值班): ${uncovered.length === 0 ? '0 ✅' : uncovered.length + ' ⚠️ ' + uncovered.map(([k]) => k).join('; ')}`)
  log('')

  // ---------- 2. 每周统计 ----------
  log('## 2. 每周统计（与页面「统计导出」口径一致：正常 1.5h/条，请假计次不计时）')
  const byWeek = new Map()
  for (const a of assignments) { if (!byWeek.has(a.week_number)) byWeek.set(a.week_number, []); byWeek.get(a.week_number).push(a) }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b)
  let totalH = 0, totalLeave = 0
  for (const w of weeks) {
    const rows = byWeek.get(w)
    const norm = rows.filter(r => r.status === '正常').length
    const leave = rows.filter(r => r.status === '请假').length
    totalH += norm * 1.5; totalLeave += leave
    const days = [...new Set(rows.filter(r => r.status === '正常').map(r => r.day_of_week))].sort((a, b) => a - b).map(d => DAY_CN[d - 1])
    log(`- 第 ${w} 周: ${norm} 正常 / ${leave} 请假 = ${(norm * 1.5).toFixed(1)}h，覆盖 ${days.join('') || '无'}`)
  }
  log(`- **合计: ${totalH.toFixed(1)}h / ${totalLeave} 人次请假**`)
  log('')

  // ---------- 3. 真实数据 + 真实算法：模拟排班 ----------
  log('## 3. 真实数据排班模拟（不写入数据库，纯计算）')
  const startDate = inferSemesterStart(sem.current_week)
  const info = describeWeeks(startDate, sem.current_week)
  log(`- 自动推算: 第1周周一 = ${startDate}（${info?.week1?.from} ~ ${info?.week1?.to}）；本周 = ${info?.current?.from} ~ ${info?.current?.to}`)
  log('')

  const slotConfigMap = {}
  for (const s of slotcfg) slotConfigMap[`${s.day_of_week}_${s.slot}`] = s.required_count

  function dayConfigFor(week) {
    const rows = daycfg.filter(d => d.week_number === week)
    if (rows.length === 0) return null
    const map = {}
    for (let d = 1; d <= 7; d++) map[d] = { isWorkday: d <= 5, substituteForOdd: null, substituteForEven: null }
    for (const r of rows) map[r.day_of_week] = {
      isWorkday: r.is_workday,
      substituteForOdd: r.substitute_for_odd || r.substitute_for || null,
      substituteForEven: r.substitute_for_even || r.substitute_for || null
    }
    return map
  }

  function simulate(week) {
    const weekType = (sem.first_week_is_odd ? week % 2 === 1 : week % 2 === 0) ? '单周' : '双周'
    const other = weekType === '单周' ? '双周' : '单周'
    const activeMembers = members.filter(m => m.active)
    const lastWeek = assignments.filter(a => a.week_number === week - 1 && a.status === '正常').map(a => ({ member_id: a.member_id }))
    const allHistory = assignments.filter(a => a.status === '正常').map(a => ({ member_id: a.member_id }))
    const makeUp = assignments.filter(a => a.leave_next_week && a.week_number === week - 1).map(a => ({ member_id: a.member_id }))
    const res = runSchedulingAlgorithm({
      members: activeMembers,
      schedules: schedules.filter(s => s.week_type === weekType),
      slotConfig: slotConfigMap,
      weekNumber: week,
      lastWeek, allAssignments: allHistory, makeUpMembers: makeUp,
      otherWeekSchedules: schedules.filter(s => s.week_type === other),
      dayConfig: dayConfigFor(week), weekType, mode: sem.current_mode || '一般'
    })
    return { res, weekType, makeUp, lastWeek }
  }

  function checkConflicts(list, weekType) {
    const smap = new Map(schedules.filter(s => s.week_type === weekType).map(s => [s.member_id, s]))
    const DK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const SK = { '上午': '34', '下午1': '67', '下午2': '89' }
    return list.filter(a => { const s = smap.get(a.member_id); return s && s[`${DK[a.day_of_week - 1]}_${SK[a.slot]}`] })
  }

  // 3.1 当前周重排（对照现状）
  const cur = sem.current_week
  const s1 = simulate(cur)
  const conflict1 = checkConflicts(s1.res.assignments, s1.weekType)
  log(`### 3.1 第 ${cur} 周（当前周，${s1.weekType}）重排模拟`)
  log(`- 生成 ${s1.res.assignments.length} 条（上限 ${s1.res.meta.maxPerWeek}，角色策略：${s1.res.meta.roleLabel}）`)
  log(`- 课表冲突: ${conflict1.length === 0 ? '0 ✅' : conflict1.length + ' ❌'}`)
  const days1 = [...new Set(s1.res.assignments.map(a => a.day_of_week))].sort((a, b) => a - b)
  log(`- 覆盖天: ${days1.map(d => DAY_CN[d - 1]).join('') || '无'}`)
  log(`- 每人每周≤1次: ${Object.values(s1.res.assignments.reduce((m, a) => (m[a.member_id] = (m[a.member_id] || 0) + 1, m), {})).every(c => c <= 1) ? '✅' : '❌'}`)
  log('')

  // 3.2 下周生成 + 补排验证
  const nxt = cur + 1
  const s2 = simulate(nxt)
  const conflict2 = checkConflicts(s2.res.assignments, s2.weekType)
  const makeupIds = new Set(s2.makeUp.map(m => m.member_id))
  const madeUp = s2.res.assignments.filter(a => makeupIds.has(a.member_id))
  log(`### 3.2 第 ${nxt} 周（下周，${s2.weekType}）生成模拟`)
  log(`- 需要补排: ${s2.makeUp.length} 人 | 实际排上: ${madeUp.length} 人 ${s2.makeUp.length === 0 ? '(无补排任务)' : (madeUp.length === s2.makeUp.length ? '✅' : '⚠️')}`)
  log(`- 生成 ${s2.res.assignments.length} 条 | 课表冲突 ${conflict2.length === 0 ? '0 ✅' : conflict2.length + ' ❌'}`)
  const days2 = [...new Set(s2.res.assignments.map(a => a.day_of_week))].sort((a, b) => a - b)
  log(`- 覆盖天: ${days2.map(d => DAY_CN[d - 1]).join('') || '无'}`)
  log('')

  // 3.3 放假场景：整周放假 + 13 天连假
  log('### 3.3 放假场景模拟')
  const holWeek = Math.min(nxt + 2, sem.total_weeks)
  const dcAllOff = {}
  for (let d = 1; d <= 7; d++) dcAllOff[d] = { isWorkday: false }
  const weekTypeH = (sem.first_week_is_odd ? holWeek % 2 === 1 : holWeek % 2 === 0) ? '单周' : '双周'
  const rAllOff = runSchedulingAlgorithm({
    members: members.filter(m => m.active),
    schedules: schedules.filter(s => s.week_type === weekTypeH),
    slotConfig: slotConfigMap, weekNumber: holWeek, lastWeek: [], allAssignments: [],
    makeUpMembers: [], otherWeekSchedules: schedules.filter(s => s.week_type === weekTypeH),
    dayConfig: dcAllOff, weekType: weekTypeH, mode: '一般'
  })
  log(`- 整周放假（第 ${holWeek} 周全部 7 天设为放假）→ 生成 ${rAllOff.assignments.length} 条 ${rAllOff.assignments.length === 0 ? '✅（不排班）' : '❌'}`)
  // 13 天连假：从 holWeek 的周一开始
  const mon = describeWeeks(startDate, holWeek)?.current?.from
  if (mon) {
    const end13 = toWeekDaySet(expandDateRange(mon, addDaysStr(mon, 12), startDate, sem.total_weeks).days)
    let bad = 0, total = 0
    for (const w of [...new Set(end13.map(x => x.week))]) {
      const dc = {}
      for (let d = 1; d <= 7; d++) dc[d] = { isWorkday: true }
      for (const x of end13.filter(y => y.week === w)) dc[x.day] = { isWorkday: false }
      const wt = (sem.first_week_is_odd ? w % 2 === 1 : w % 2 === 0) ? '单周' : '双周'
      const rr = runSchedulingAlgorithm({
        members: members.filter(m => m.active), schedules: schedules.filter(s => s.week_type === wt),
        slotConfig: slotConfigMap, weekNumber: w, lastWeek: [], allAssignments: [], makeUpMembers: [],
        otherWeekSchedules: [], dayConfig: dc, weekType: wt, mode: '一般'
      })
      total += rr.assignments.length
      const holDays = end13.filter(y => y.week === w).map(y => y.day)
      bad += rr.assignments.filter(a => holDays.includes(a.day_of_week)).length
    }
    log(`- 13 天连假（${mon} 起）：涉及 ${end13.length} 个(周,星期) 组合，放假日被排班数 = ${bad} ${bad === 0 ? '✅' : '❌'}，其余日仍可正常排班(${total} 条)`)
  }
  log('')

  log('## 4. 结论')
  const problems = []
  if (dups.length) problems.push('存在重复排班')
  if (orphans.length) problems.push('存在孤儿排班引用')
  if (conflict1.length || conflict2.length) problems.push('模拟结果存在课表冲突')
  if (rAllOff.assignments.length) problems.push('整周放假仍生成排班')
  if (s2.makeUp.length !== madeUp.length) problems.push('补排未全部落实')
  log(problems.length === 0 ? '- ✅ 未发现阻塞性问题，系统可正常使用' : '- ⚠️ 发现问题: ' + problems.join('；'))

  const report = out.join('\n')
  const outFile = process.argv[2]
  if (outFile) fs.writeFileSync(outFile, report, 'utf8')
}

function addDaysStr(d, n) {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000
  const x = new Date(t)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

main().catch(e => { console.error('审计失败:', e.message); out.push('审计失败: ' + e.message); try { if (process.argv[2]) fs.writeFileSync(process.argv[2], out.join('\n')) } catch {} process.exit(1) })