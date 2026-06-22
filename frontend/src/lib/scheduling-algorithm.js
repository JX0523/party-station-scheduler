/**
 * 排班算法 — 共享模块
 * Dashboard 和 Scheduling 页面共用
 */

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']
const ROLE_WEIGHT = { '部员': 0, '部长': 1, '主席团': 2 }

/** 所有15个时段key（如 mon_34, mon_67, ...） */
const ALL_SLOT_KEYS = []
for (const d of DAY_KEYS) {
  for (const s of SLOT_KEYS) {
    ALL_SLOT_KEYS.push(`${d}_${s}`)
  }
}

/**
 * @param {Object} params
 * @param {Array}  params.members            - 所有活跃成员
 * @param {Array}  params.schedules          - 当前周类型的课表
 * @param {Object} params.slotConfig         - { "1_上午": 1, ... }
 * @param {number} params.weekNumber         - 第几周
 * @param {Array}  params.lastWeek           - 上周排班 [{member_id}, ...]
 * @param {Array}  params.allAssignments     - 所有历史正常排班
 * @param {Array}  params.makeUpMembers      - 需要补排的人 [{member_id}, ...]
 * @param {Array}  params.otherWeekSchedules - 另一周类型（单/双周）的课表，用于跨周均衡
 * @returns {{ assignments: Array, meta: Object }}
 */
export function runSchedulingAlgorithm({
  members, schedules, slotConfig, weekNumber,
  lastWeek, allAssignments, makeUpMembers,
  otherWeekSchedules
}) {
  const lastWeekIds = new Set((lastWeek || []).map(a => a.member_id))
  const makeUpIds = new Set((makeUpMembers || []).map(a => a.member_id))

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

  // ===== 计算另一周类型的空闲程度 =====
  // otherWeekFreeSlots[id] = 该成员在另一周类型中有多少个时段空闲
  // 值越大 → 另一周越空 → 应该留给另一周 → 本周降低优先级
  // 值越小 → 另一周越忙 → 只能本周排 → 本周提高优先级
  const otherWeekFreeCount = {}
  if (otherWeekSchedules) {
    const otherMap = {}
    otherWeekSchedules.forEach(s => { otherMap[s.member_id] = s })
    for (const m of (members || [])) {
      const s = otherMap[m.id]
      if (!s) {
        // 没录课表 → 另一周全空 → 留到另一周
        otherWeekFreeCount[m.id] = 15
      } else {
        let free = 0
        for (const key of ALL_SLOT_KEYS) {
          if (!s[key]) free++
        }
        otherWeekFreeCount[m.id] = free
      }
    }
  }

  // ===== 角色层级：用总人数判断 =====
  const buYuanTotal = (members || []).filter(m => m.role === '部员').length
  const buZhangTotal = (members || []).filter(m => m.role === '部长').length
  const zhuXiTotal = (members || []).filter(m => m.role === '主席团').length

  let allowedRoles
  let roleLabel
  if (buYuanTotal >= 5) {
    allowedRoles = ['部员']
    roleLabel = '仅部员'
  } else if (buYuanTotal + buZhangTotal >= 5) {
    allowedRoles = ['部员', '部长']
    roleLabel = '部员+部长'
  } else {
    allowedRoles = ['部员', '部长', '主席团']
    roleLabel = '全部角色'
  }

  const totalMembers = (members || []).length

  // 每周上限：每人每两周最多排1次 → 每周最多用一半人
  // ceil → floor 切换：更保守，给下一周留余地
  const maxPerWeek = Math.max(5, Math.floor(totalMembers / 2))

  // 每种角色的每周上限（至少1人，确保不会完全排不了）
  const maxPerRoleThisWeek = {
    '部员': Math.max(1, Math.ceil(buYuanTotal / 2)),
    '部长': Math.max(1, Math.ceil(buZhangTotal / 2)),
    '主席团': Math.max(1, Math.ceil(zhuXiTotal / 2))
  }

  const newAssignments = []
  const thisWeekAssigned = new Set()
  const roleCountThisWeek = { '部员': 0, '部长': 0, '主席团': 0 }

  // 通用过滤+排序
  function getCandidates(extraFilter) {
    let pool = (members || []).filter(m => {
      if (thisWeekAssigned.has(m.id)) return false
      if (lastWeekIds.has(m.id)) return false
      if (!allowedRoles.includes(m.role)) return false
      // 单角色超上限则排除
      if (roleCountThisWeek[m.role] >= maxPerRoleThisWeek[m.role]) return false
      if (extraFilter && !extraFilter(m)) return false
      return true
    })
    pool.sort((a, b) => {
      // 1. 补排人员优先
      const aMakeUp = makeUpIds.has(a.id) ? 0 : 1
      const bMakeUp = makeUpIds.has(b.id) ? 0 : 1
      if (aMakeUp !== bMakeUp) return aMakeUp - bMakeUp

      // 2. 另一周空闲越少（越忙）越优先 — 把灵活的人留给另一周
      if (otherWeekSchedules) {
        const aOther = otherWeekFreeCount[a.id] ?? 15
        const bOther = otherWeekFreeCount[b.id] ?? 15
        if (aOther !== bOther) return aOther - bOther
      }

      // 3. 历史排班次数少的优先（长期公平）
      const hc = (historyCount[a.id] || 0) - (historyCount[b.id] || 0)
      if (hc !== 0) return hc

      // 4. 角色权重：部员 > 部长 > 主席团
      return (ROLE_WEIGHT[a.role] || 0) - (ROLE_WEIGHT[b.role] || 0)
    })
    return pool
  }

  // ===== 第一阶段：每日覆盖 — 每天至少安排1人 =====
  for (let round = 0; round < 5; round++) {
    if (newAssignments.length >= maxPerWeek) break
    const dayCounts = [1, 2, 3, 4, 5].map(d => ({
      day: d,
      cnt: newAssignments.filter(a => a.day_of_week === d).length
    })).sort((a, b) => a.cnt - b.cnt)

    for (const { day, cnt } of dayCounts) {
      if (cnt > 0) continue
      if (newAssignments.length >= maxPerWeek) break

      const pool = getCandidates(null)
      if (pool.length === 0) break

      const pick = pool[0]
      for (let si = 0; si < 3; si++) {
        const slot = SLOTS[si]
        const required = slotConfig[`${day}_${slot}`] || 0
        if (required > 0) {
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
    }
  }

  // ===== 第二阶段：轮询补充 — 每天轮流加1人 =====
  let madeProgress = true
  while (madeProgress && newAssignments.length < maxPerWeek) {
    madeProgress = false
    const dayCounts = [1, 2, 3, 4, 5].map(d => ({
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
        const dKey = DAY_KEYS[day - 1]

        const pool = getCandidates(m => {
          const s = scheduleMap[m.id]
          if (!s) return true
          return !s[`${dKey}_${SLOT_KEYS[SLOTS.indexOf(slot)]}`]
        })

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
      perRoleUsed: roleCountThisWeek
    }
  }
}
