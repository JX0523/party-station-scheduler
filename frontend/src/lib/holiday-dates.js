/**
 * 放假日期换算 — 纯函数模块（可单测，无 DOM 依赖）
 *
 * 用途：把「真实日期」换算成系统使用的「第几周 + 星期几」，用于批量设置放假。
 * 系统按 (week_number, day_of_week) 存储工作日配置（day_config 表），
 * 因此需要知道「第 1 周周一是哪天」才能把日期映射成周次。
 *
 * 约定：
 * - 日期字符串统一为 'YYYY-MM-DD'
 * - day_of_week：1=周一 ... 7=周日（与数据库 CHECK 一致）
 * - 全部用 UTC 运算，避免时区导致的差一天问题
 */

/** 解析 'YYYY-MM-DD' → {y,m,d}；非法返回 null */
export function parseYMD(str) {
  if (typeof str !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim())
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // 校验真实存在（防 2026-02-30）
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return { y, m: mo, d }
}

/** 'YYYY-MM-DD' → UTC 毫秒；非法返回 null */
export function toUTC(str) {
  const p = parseYMD(str)
  if (!p) return null
  return Date.UTC(p.y, p.m - 1, p.d)
}

/** 是否周一（用于校验「第1周周一」填写是否正确） */
export function isMonday(str) {
  const t = toUTC(str)
  if (t === null) return false
  return new Date(t).getUTCDay() === 1
}

/** day_of_week：1=周一 ... 7=周日 */
export function utcWeekday(str) {
  const t = toUTC(str)
  if (t === null) return null
  const d = new Date(t).getUTCDay()
  return d === 0 ? 7 : d
}

const DAY_MS = 86400000

/** Date → 'YYYY-MM-DD'（UTC 口径） */
export function toYMD(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** 今天（本地日期，取年月日后转 UTC 口径字符串） */
export function todayYMD(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 日期加减天数 */
export function addDays(dateStr, n) {
  const t = toUTC(dateStr)
  if (t === null) return null
  return toYMD(new Date(t + n * DAY_MS))
}

/**
 * 自动推算「第1周周一」——依据系统设定：current_week 就是包含"今天"的那一周。
 * 无需管理员手工填写；若推算不准（例如当前周没及时更新），可在界面上手动修正。
 *
 * @param {number} currentWeek 学期配置里的当前周（1..total）
 * @param {string} [today] 'YYYY-MM-DD'，默认今天
 * @returns {string|null} 第1周周一的日期
 */
export function inferSemesterStart(currentWeek, today = todayYMD()) {
  const w = Number(currentWeek)
  if (!Number.isFinite(w) || w < 1) return null
  const day = utcWeekday(today)
  if (day === null) return null
  // 本周周一
  const thisMonday = addDays(today, -(day - 1))
  if (thisMonday === null) return null
  // 往前推 (w-1) 周
  return addDays(thisMonday, -7 * (w - 1))
}

/**
 * 推算结果的展示信息（第1周周一 ~ 该周周日 / 本周范围）
 */
export function describeWeeks(semesterStart, currentWeek) {
  if (!semesterStart) return null
  const start = semesterStart
  const startSun = addDays(start, 6)
  const curMon = addDays(start, 7 * (currentWeek - 1))
  const curSun = addDays(curMon, 6)
  return { week1: { from: start, to: startSun }, current: { from: curMon, to: curSun } }
}

/**
 * 日期 → { week, day }
 * @param {string} dateStr 目标日期 'YYYY-MM-DD'
 * @param {string} semesterStartStr 第1周周一的日期 'YYYY-MM-DD'
 * @returns {{week:number, day:number}|null}
 */
export function dateToWeekDay(dateStr, semesterStartStr) {
  const t = toUTC(dateStr)
  const s = toUTC(semesterStartStr)
  const day = utcWeekday(dateStr)
  if (t === null || s === null || day === null) return null
  const diffDays = Math.round((t - s) / DAY_MS)
  const week = Math.floor(diffDays / 7) + 1
  return { week, day }
}

/** 日期文案：'2026-09-14' → '9月14日' */
export function formatMD(dateStr) {
  const p = parseYMD(dateStr)
  if (!p) return dateStr
  return `${p.m}月${p.d}日`
}

export function weekdayCN(day) {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][day - 1] || '?'
}

/**
 * 展开日期区间 → 逐日 {date, week, day}
 * @returns {{days:Array, error?:string, outOfRange?:Array}}
 */
export function expandDateRange(startStr, endStr, semesterStartStr, totalWeeks) {
  const a = toUTC(startStr); const b = toUTC(endStr)
  if (a === null || b === null) return { days: [], error: '日期格式不正确，请使用 YYYY-MM-DD' }
  if (b < a) return { days: [], error: '结束日期不能早于开始日期' }
  const span = Math.round((b - a) / DAY_MS) + 1
  if (span > 120) return { days: [], error: '日期跨度太大（最多 120 天），请分段设置' }
  const days = []; const outOfRange = []
  for (let i = 0; i < span; i++) {
    const d = new Date(a + i * DAY_MS)
    const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const wd = dateToWeekDay(ymd, semesterStartStr)
    if (!wd) return { days: [], error: '第1周周一日期不正确' }
    const item = { date: ymd, week: wd.week, day: wd.day }
    if (totalWeeks && (wd.week < 1 || wd.week > totalWeeks)) outOfRange.push(item)
    else days.push(item)
  }
  return { days, outOfRange }
}

/**
 * 把逐日列表归并成 (week, day) 集合（供写库使用）
 */
export function toWeekDaySet(days) {
  const map = new Map()
  for (const d of days) {
    const k = `${d.week}_${d.day}`
    if (!map.has(k)) map.set(k, { week: d.week, day: d.day, dates: [] })
    map.get(k).dates.push(d.date)
  }
  return [...map.values()].sort((x, y) => x.week - y.week || x.day - y.day)
}

/**
 * 把 day_config 行里的放假记录整理成可展示列表（按周分组）
 * 仅认 is_workday === false 的行（显式放假）
 */
export function groupHolidayRows(rows, semesterStartStr) {
  const out = new Map()
  for (const r of (rows || [])) {
    if (r.is_workday !== false) continue
    const key = r.week_number
    if (!out.has(key)) out.set(key, [])
    let dateLabel = ''
    if (semesterStartStr) {
      const t = toUTC(semesterStartStr)
      if (t !== null) {
        const dd = new Date(t + ((r.week_number - 1) * 7 + (r.day_of_week - 1)) * DAY_MS)
        dateLabel = `${dd.getUTCMonth() + 1}月${dd.getUTCDate()}日`
      }
    }
    out.get(key).push({ day: r.day_of_week, isWorkday: false, dateLabel, id: r.id })
  }
  return [...out.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, days]) => ({ week, days: days.sort((x, y) => x.day - y.day) }))
}