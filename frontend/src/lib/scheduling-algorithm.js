/**
 * 排班算法 — 共享模块
 * Dashboard 和 Scheduling 页面共用
 *
 * 角色策略：
 * - 部员：主力，占大部分时段
 * - 部长：偶尔参与（每周2-3人），不排除
 * - 主席团：仅在部员+部长总数<5时才启用
 * - 无人可排就空着，不强制填充
 */

const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']
const ROLE_WEIGHT = { '部员': 0, '部长': 1, '主席团': 2 }

/** 所有21个时段key（7天×3时段），用于跨周课表计算 */
const ALL_SLOT_KEYS = []
for (const d of ALL_DAY_KEYS) {
  for (const s of SLOT_KEYS) {
    ALL_SLOT_KEYS.push(`${d}_${s}`)
  }
}

/**
 * @param {Object} params
 * @param {Array}   params.members            - 所有活跃成员
 * @param {Array}   params.schedules          - 当前周类型的课表
 * @param {Object}  params.slotConfig         - { "1_上午": 1, ... }
 * @param {number}  params.weekNumber         - 第几周
 * @param {Array}   params.lastWeek           - 上周排班 [{member_id}, ...]
 * @param {Array}   params.allAssignments     - 所有历史正常排班
 * @param {Array}   params.makeUpMembers      - 需要补排的人 [{member_id}, ...]
 * @param {Array}   params.otherWeekSchedules - 另一周类型（单/双周）的课表
 * @param {Object}  params.dayConfig          - { 1:true, 2:true, ... 7:false } 工作日配置
 * @returns {{ assignments: Array, meta: Object }}
 */
export function runSchedulingAlgorithm({
  members, schedules, slotConfig, weekNumber,
  lastWeek, allAssignments, makeUpMembers,
  otherWeekSchedules, dayConfig
}) {
  const lastWeekIds = new Set((lastWeek || []).map(a => a.member_id))
  const makeUpIds = new Set((makeUpMembers || []).map(a => a.member_id))

  // ===== 工作日列表（默认周一至周五） =====
  const workdays = []
  if (dayConfig) {
    for (let d = 1; d <= 7; d++) {
      if (dayConfig[d]) workdays.push(d)
    }
  }
  if (workdays.length === 0) {
    // 默认周一至周五
    workdays.push(1, 2, 3, 4, 5)
  }
  const dayKeyMap = {} // dayNum → 'mon'/'tue'/...
  for (let d = 1; d <= 7; d++) {
    dayKeyMap[d] = ALL_DAY_KEYS[d - 1]
  }

  // 历史排班次数统计
  const historyCount = {}
  if (allAssignments) {
    allAssignments.forEach(a => {
      historyCount[a.member_id] = (historyCount[a.member_id] || 0) + 1
    })
  }

  // 课表映射（当前周类型）
  const scheduleMap = {}
  if (schedules) {
    schedules.forEach(s => { scheduleMap[s.member_id] = s })
  }

  // ===== 另一周空闲程度 =====
  const otherWeekFreeCount = {}
  if (otherWeekSchedules) {
    const otherMap = {}
    otherWeekSchedules.forEach(s => { otherMap[s.member_id] = s })
    for (const m of (members || [])) {
      const s = otherMap[m.id]
      if (!s) {
        otherWeekFreeCount[m.id] = ALL_SLOT_KEYS.length
      } else {
        let free = 0
        for (const key of ALL_SLOT_KEYS) {
          if (!s[key]) free++
        }
        otherWeekFreeCount[m.id] = free
      }
    }
  }

  // ===== 角色统计 =====
  const buYuanTotal = (members || []).filter(m => m.role === '部员').length
  const buZhangTotal = (members || []).filter(m => m.role === '部长').length
  const zhuXiTotal = (members || []).filter(m => m.role === '主席团').length
  const totalMembers = (members || []).length

  // ===== 角色配额设计 =====
  let buZhangQuota = 0
  if (buZhangTotal > 0) {
    if (buYuanTotal >= 5) {
      buZhangQuota = Math.max(1, Math.min(3, Math.ceil(buZhangTotal * 0.2)))
    } else {
      buZhangQuota = Math.max(5, Math.ceil(buZhangTotal / 2))
    }
  }

  const needZhuXi = (buYuanTotal + buZhangTotal < 5)
  const zhuXiQuota = needZhuXi
    ? Math.max(1, Math.ceil(zhuXiTotal / 2))
    : 0

  const maxPerWeek = Math.max(5, Math.floor(totalMembers / 2))

  const maxPerRoleThisWeek = {
    '部员': maxPerWeek,
    '部长': buZhangQuota,
    '主席团': zhuXiQuota
  }

  let roleLabel
  if (needZhuXi) {
    roleLabel = '全部角色'
  } else if (buYuanTotal >= 5 && buZhangTotal > 0) {
    roleLabel = `部员主力+部长≤${buZhangQuota}人`
  } else if (buYuanTotal >= 5) {
    roleLabel = '仅部员'
  } else if (buZhangTotal > 0) {
    roleLabel = '部长主力'
  } else {
    roleLabel = '无可用成员'
  }

  const newAssignments = []
  const thisWeekAssigned = new Set()
  const roleCountThisWeek = { '部员': 0, '部长': 0, '主席团': 0 }

  function buZhangGap() {
    return Math.max(0, buZhangQuota - (roleCountThisWeek['部长'] || 0))
  }

  // 通用筛选+排序
  function getCandidates(extraFilter, phase = 1) {
    let pool = (members || []).filter(m => {
      if (thisWeekAssigned.has(m.id)) return false
      if (lastWeekIds.has(m.id)) return false
      if (m.role === '主席团' && !needZhuXi) return false
      const cap = maxPerRoleThisWeek[m.role]
      if (cap !== undefined && (roleCountThisWeek[m.role] || 0) >= cap) return false
      if (extraFilter && !extraFilter(m)) return false
      return true
    })

    pool.sort((a, b) => {
      // 1. 补排人员优先
      const aMakeUp = makeUpIds.has(a.id) ? 0 : 1
      const bMakeUp = makeUpIds.has(b.id) ? 0 : 1
      if (aMakeUp !== bMakeUp) return aMakeUp - bMakeUp

      // 2. 配额优先：部长未达周配额时，优先于部员
      if (phase === 2) {
        const gap = buZhangGap()
        if (gap > 0) {
          const aIsZhang = a.role === '部长' ? 0 : 1
          const bIsZhang = b.role === '部长' ? 0 : 1
          if (aIsZhang !== bIsZhang) return aIsZhang - bIsZhang
        }
      }

      // 3. 另一周空闲越少越优先
      if (otherWeekSchedules) {
        const aOther = otherWeekFreeCount[a.id] ?? ALL_SLOT_KEYS.length
        const bOther = otherWeekFreeCount[b.id] ?? ALL_SLOT_KEYS.length
        if (aOther !== bOther) return aOther - bOther
      }

      // 4. 历史排班次数少的优先
      const hc = (historyCount[a.id] || 0) - (historyCount[b.id] || 0)
      if (hc !== 0) return hc

      // 5. 角色权重：部员 > 部长 > 主席团
      return (ROLE_WEIGHT[a.role] || 0) - (ROLE_WEIGHT[b.role] || 0)
    })
    return pool
  }

  // ===== 第一阶段：每个工作日至少安排1人 =====
  const workdaySet = new Set(workdays)
  for (let round = 0; round < 5; round++) {
    if (newAssignments.length >= maxPerWeek) break
    const dayCounts = workdays.map(d => ({
      day: d,
      cnt: newAssignments.filter(a => a.day_of_week === d).length
    })).sort((a, b) => a.cnt - b.cnt)

    for (const { day, cnt } of dayCounts) {
      if (cnt > 0) continue
      if (newAssignments.length >= maxPerWeek) break

      const pool = getCandidates(null, 1)
      if (pool.length === 0) break

      // 尝试从pool中找到该天有可用时段的人
      let assigned = false
      for (let pi = 0; pi < Math.min(3, pool.length); pi++) {
        const pick = pool[pi]
        const dKey = dayKeyMap[day]
        for (let si = 0; si < 3; si++) {
          const slot = SLOTS[si]
          const sKey = SLOT_KEYS[si]
          const required = slotConfig[`${day}_${slot}`] || 0
          if (required > 0) {
            // 检查课表冲突
            const sc = scheduleMap[pick.id]
            if (sc && sc[`${dKey}_${sKey}`]) continue // 该时段有课，跳过
            assigned = true
            thisWeekAssigned.add(pick.id)
            roleCountThisWeek[pick.role] = (roleCountThisWeek[pick.role] || 0) + 1
            newAssignments.push({
              week_number: weekNumber, day_of_week: day, slot,
              member_id: pick.id, is_emergency: false,
              status: '正常', leave_next_week: false
            })
            historyCount[pick.id] = (historyCount[pick.id] || 0) + 1
            break
          }
        }
        if (assigned) break
      }
    }
  }

  // ===== 第二阶段：轮询补充 =====
  let madeProgress = true
  while (madeProgress && newAssignments.length < maxPerWeek) {
    madeProgress = false
    const dayCounts = workdays.map(d => ({
      day: d,
      cnt: newAssignments.filter(a => a.day_of_week === d).length
    })).sort((a, b) => a.cnt - b.cnt)

    for (const { day } of dayCounts) {
      if (newAssignments.length >= maxPerWeek) break

      const slotCounts = [0, 1, 2].map(si => {
        const slot = SLOTS[si]
        const required = slotConfig[`${day}_${slot}`] || 0
        const already = newAssignments.filter(a => a.day_of_week === day && a.slot === slot).length
        return { si, slot, required, already, need: required - already }
      }).filter(s => s.need > 0)
        .sort((a, b) => a.already - b.already)

      for (const { slot } of slotCounts) {
        if (newAssignments.length >= maxPerWeek) break
        const dKey = dayKeyMap[day]
        const sKey = SLOT_KEYS[SLOTS.indexOf(slot)]

        const pool = getCandidates(m => {
          const s = scheduleMap[m.id]
          if (!s) return true
          return !s[`${dKey}_${sKey}`]
        }, 2)

        if (pool.length > 0) {
          const pick = pool[0]
          thisWeekAssigned.add(pick.id)
          roleCountThisWeek[pick.role] = (roleCountThisWeek[pick.role] || 0) + 1
          newAssignments.push({
            week_number: weekNumber, day_of_week: day, slot,
            member_id: pick.id, is_emergency: false,
            status: '正常', leave_next_week: false
          })
          historyCount[pick.id] = (historyCount[pick.id] || 0) + 1
          madeProgress = true
          break
        }
      }
    }
  }

  return {
    assignments: newAssignments,
    meta: {
      roleLabel,
      maxPerWeek,
      totalMembers,
      perRoleMax: maxPerRoleThisWeek,
      perRoleUsed: roleCountThisWeek,
      workdays
    }
  }
}
