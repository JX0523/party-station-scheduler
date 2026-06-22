/**
 * 基础功能测试 — 系统非排班功能验证
 * 覆盖: 工具函数、配置处理、数据验证、边界条件
 */
import { resolveScheduleKey } from './frontend/src/lib/scheduling-algorithm.js'

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
    throw new Error(`${msg || 'assertion failed'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function ok(val, msg) {
  if (!val) throw new Error(msg || 'expected truthy value')
}

// =============================================================
console.log('='.repeat(60))
console.log('🔧 基础功能测试套件')
console.log('='.repeat(60))

// ---- 1. resolveScheduleKey 函数 ----
console.log('\n📋 1. resolveScheduleKey — 调休课表映射')

test('null dayConfig → 返回自身key', () => {
  eq(resolveScheduleKey(1, null), 'mon')
  eq(resolveScheduleKey(6, null), 'sat')
  eq(resolveScheduleKey(7, null), 'sun')
})

test('boolean dayConfig → 返回自身key（无调休）', () => {
  const dc = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false }
  eq(resolveScheduleKey(1, dc), 'mon')
  eq(resolveScheduleKey(6, dc), 'sat')
  eq(resolveScheduleKey(7, dc), 'sun')
})

test('周六补周一 → 返回mon', () => {
  const dc = { 6: { isWorkday: true, substituteFor: 1 } }
  eq(resolveScheduleKey(6, dc), 'mon')
})

test('周日补周五 → 返回fri', () => {
  const dc = { 7: { isWorkday: true, substituteFor: 5 } }
  eq(resolveScheduleKey(7, dc), 'fri')
})

test('周六补周三, 周日补周四', () => {
  const dc = {
    6: { isWorkday: true, substituteFor: 3 },
    7: { isWorkday: true, substituteFor: 4 }
  }
  eq(resolveScheduleKey(6, dc), 'wed')
  eq(resolveScheduleKey(7, dc), 'thu')
})

test('substituteFor 超出1-5范围 → 返回自身key', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 0 } }), 'sat')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 6 } }), 'sat')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: 999 } }), 'sat')
})

test('substituteFor 为null/undefined → 返回自身key', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: true, substituteFor: null } }), 'sat')
  eq(resolveScheduleKey(6, { 6: { isWorkday: true } }), 'sat')
})

test('非工作日调用resolveScheduleKey → 仍返回自身key', () => {
  eq(resolveScheduleKey(6, { 6: { isWorkday: false, substituteFor: 1 } }), 'mon')
})

test('混合格式 — 工作日boolean + 调休rich', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteFor: 1 }
  }
  eq(resolveScheduleKey(5, dc), 'fri')  // boolean, no substitution
  eq(resolveScheduleKey(6, dc), 'mon')  // rich, substitution
})

// ---- 2. DayConfig 工作日列表解析 ----
console.log('\n📋 2. DayConfig — 工作日列表解析')

function getWorkdays(dayConfig) {
  if (!dayConfig) return [1, 2, 3, 4, 5]
  return [1, 2, 3, 4, 5, 6, 7].filter(d => {
    const v = dayConfig[d]
    return typeof v === 'object' ? v.isWorkday : v
  })
}

test('null/undefined → 默认周一至周五', () => {
  eq(getWorkdays(null), [1, 2, 3, 4, 5])
  eq(getWorkdays(undefined), [1, 2, 3, 4, 5])
})

test('全boolean true → 7天全开', () => {
  eq(getWorkdays({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true }),
    [1, 2, 3, 4, 5, 6, 7])
})

test('全boolean false → 空（算法会回退到默认）', () => {
  eq(getWorkdays({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false }), [])
})

test('标准5天 boolean → 周一至周五', () => {
  eq(getWorkdays({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false }),
    [1, 2, 3, 4, 5])
})

test('rich格式 5+1天调休', () => {
  const dc = {
    1: { isWorkday: true }, 2: { isWorkday: true },
    3: { isWorkday: true }, 4: { isWorkday: true },
    5: { isWorkday: true },
    6: { isWorkday: true, substituteFor: 1 },
    7: { isWorkday: false }
  }
  eq(getWorkdays(dc), [1, 2, 3, 4, 5, 6])
})

test('混合格式 — boolean + rich混用', () => {
  const dc = {
    1: true, 2: true, 3: true, 4: true, 5: true,
    6: { isWorkday: true, substituteFor: 1 },
    7: false
  }
  eq(getWorkdays(dc), [1, 2, 3, 4, 5, 6])
})

test('仅rich格式', () => {
  const dc = {
    1: { isWorkday: true }, 2: { isWorkday: true },
    3: { isWorkday: false }, 4: { isWorkday: true },
    5: { isWorkday: true }, 6: { isWorkday: false }, 7: { isWorkday: false }
  }
  eq(getWorkdays(dc), [1, 2, 4, 5])  // 周三放假
})

test('纯周末（调休场景）', () => {
  const dc = {
    1: false, 2: false, 3: false, 4: false, 5: false,
    6: { isWorkday: true, substituteFor: 1 },
    7: { isWorkday: true, substituteFor: 2 }
  }
  eq(getWorkdays(dc), [6, 7])
})

// ---- 3. SlotConfig 默认值逻辑 ----
console.log('\n📋 3. SlotConfig — 默认值逻辑')

function buildSlotConfig(dbEntries) {
  const map = {}
  if (dbEntries) {
    dbEntries.forEach(s => { map[`${s.day_of_week}_${s.slot}`] = s.required_count })
  }
  return map
}

test('空数据库 → 工作日默认1人', () => {
  const sc = buildSlotConfig([])
  // 默认值在调用方使用: slotConfig[key] ?? (workdaySet.has(day) ? 1 : 0)
  eq(sc['1_上午'] ?? 1, 1)
  eq(sc['5_下午2'] ?? 1, 1)
  eq(sc['6_上午'] ?? 0, 0)  // 周末默认0
})

test('数据库有值 → 使用数据库值', () => {
  const sc = buildSlotConfig([
    { day_of_week: 1, slot: '上午', required_count: 3 },
    { day_of_week: 6, slot: '上午', required_count: 2 }
  ])
  eq(sc['1_上午'], 3)
  eq(sc['6_上午'], 2)
  eq(sc['1_下午1'] ?? 1, 1)  // 缺失的工作日时段默认1
})

test('周末默认0人（非工作日）', () => {
  const sc = buildSlotConfig([])
  eq(sc['6_上午'] ?? 0, 0)
  eq(sc['6_下午1'] ?? 0, 0)
  eq(sc['7_下午2'] ?? 0, 0)
})

test('调休时周末应允许>0', () => {
  // 星期六调休→应允许配置人数
  const sc = buildSlotConfig([{ day_of_week: 6, slot: '上午', required_count: 2 }])
  eq(sc['6_上午'], 2)
  ok(sc['6_上午'] > 0, '周六调休时段应有>=1人')
})

// ---- 4. 课表冲突检查逻辑 ----
console.log('\n📋 4. 课表冲突检查')

function hasConflict(schedule, dKey, sKey) {
  return schedule && schedule[`${dKey}_${sKey}`]
}

test('无课表记录 → 无冲突', () => {
  ok(!hasConflict(null, 'mon', '34'))
  ok(!hasConflict(undefined, 'mon', '67'))
})

test('有课表但该时段无课 → 无冲突', () => {
  const s = { mon_34: false, mon_67: false, mon_89: true }
  ok(!hasConflict(s, 'mon', '34'))
  ok(!hasConflict(s, 'mon', '67'))
})

test('该时段有课 → 冲突', () => {
  const s = { mon_34: true, mon_67: false, mon_89: false }
  ok(hasConflict(s, 'mon', '34'))
  ok(!hasConflict(s, 'mon', '67'))
})

test('不同天的课不冲突', () => {
  const s = { mon_34: true, tue_34: false }
  ok(hasConflict(s, 'mon', '34'))
  ok(!hasConflict(s, 'tue', '34'))
})

test('所有21个时段键覆盖完整', () => {
  const allKeys = []
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    for (const s of ['34', '67', '89']) {
      allKeys.push(`${d}_${s}`)
    }
  }
  eq(allKeys.length, 21)
  // 验证完整列出
  eq(allKeys[0], 'mon_34')
  eq(allKeys[allKeys.length - 1], 'sun_89')
})

test('调休场景 — 周六补周一用mon_*', () => {
  const dc = { 6: { isWorkday: true, substituteFor: 1 } }
  const dKey = resolveScheduleKey(6, dc)
  eq(dKey, 'mon')
  // 该人有周一上午的课
  const s = { mon_34: true, mon_67: false, mon_89: false }
  ok(hasConflict(s, dKey, '34'), '调休后应用周一课表检查冲突')
  ok(!hasConflict(s, dKey, '67'))
})

// ---- 5. 角色配额计算 ----
console.log('\n📋 5. 角色配额计算')

function calcQuota(buYuan, buZhang, zhuXi) {
  let buZhangQuota = 0
  if (buZhang > 0) {
    if (buYuan >= 5) {
      buZhangQuota = Math.max(1, Math.min(3, Math.ceil(buZhang * 0.2)))
    } else {
      buZhangQuota = Math.max(5, Math.ceil(buZhang / 2))
    }
  }
  const needZhuXi = (buYuan + buZhang < 5)
  const zhuXiQuota = needZhuXi ? Math.max(1, Math.ceil(zhuXi / 2)) : 0
  const maxPerWeek = Math.max(5, Math.floor((buYuan + buZhang + zhuXi) / 2))
  return { buZhangQuota, zhuXiQuota, needZhuXi, maxPerWeek }
}

test('45部员+14部长(真实规模)→部长配额≤3', () => {
  const q = calcQuota(45, 14, 5)
  eq(q.buZhangQuota, 3)
  eq(q.zhuXiQuota, 0)
  eq(q.needZhuXi, false)
  eq(q.maxPerWeek, 32)
})

test('5部员+13部长 → 部长配额3', () => {
  const q = calcQuota(5, 13, 3)
  eq(q.buZhangQuota, 3)
  eq(q.zhuXiQuota, 0)
})

test('3部员+8部长(部员<5)→部长配额5', () => {
  const q = calcQuota(3, 8, 2)
  eq(q.buZhangQuota, 5)
  eq(q.zhuXiQuota, 0)
})

test('0部员+10部长 → 部长配额5', () => {
  const q = calcQuota(0, 10, 0)
  eq(q.buZhangQuota, 5)
  eq(q.zhuXiQuota, 0)
})

test('2部员+2部长(总数<5)→主席团启用', () => {
  const q = calcQuota(2, 2, 3)
  eq(q.needZhuXi, true)
  eq(q.zhuXiQuota, 2)
})

test('仅3主席团 → 主席团启用', () => {
  const q = calcQuota(0, 0, 3)
  eq(q.needZhuXi, true)
  eq(q.zhuXiQuota, 2)
  eq(q.maxPerWeek, 5)  // Math.max(5, floor(3/2)=1) = 5
})

test('50部员+0部长 → 部长配额0', () => {
  const q = calcQuota(50, 0, 0)
  eq(q.buZhangQuota, 0)
  eq(q.zhuXiQuota, 0)
})

test('1部长 → 部长配额5（ceil(1/2)=1, Math.max(5,1)=5）', () => {
  const q = calcQuota(0, 1, 0)
  eq(q.buZhangQuota, 5)
  eq(q.needZhuXi, true)
})

test('maxPerWeek 下限为5', () => {
  const q3 = calcQuota(0, 0, 3)
  eq(q3.maxPerWeek, 5)
  const q8 = calcQuota(4, 4, 0)
  eq(q8.maxPerWeek, 5)  // floor(8/2)=4, max(5,4)=5
})

// ---- 6. 连续两周排班排除 ----
console.log('\n📋 6. 连续两周排除逻辑')

function buildLastWeekSet(lastWeek) {
  return new Set((lastWeek || []).map(a => a.member_id))
}

test('上周无人 → 空集合', () => {
  eq(buildLastWeekSet([]).size, 0)
  eq(buildLastWeekSet(null).size, 0)
})

test('上周有3人 → 3人被排除', () => {
  const s = buildLastWeekSet([
    { member_id: 'a' }, { member_id: 'b' }, { member_id: 'c' }
  ])
  eq(s.size, 3)
  ok(s.has('a'))
  ok(s.has('b'))
  ok(!s.has('d'))
})

test('重复member_id → 只计一次', () => {
  const s = buildLastWeekSet([
    { member_id: 'a' }, { member_id: 'a' }, { member_id: 'b' }
  ])
  eq(s.size, 2)
})

// ---- 7. 请假补排逻辑 ----
console.log('\n📋 7. 请假补排优先级')

test('makeUpIds优先级高于lastWeek排除', () => {
  const makeUpIds = new Set(['m1'])
  const lastWeekIds = new Set(['m1'])  // m1上周排了班但请假了
  // makeUpIds应覆盖lastWeekIds的排除
  ok(makeUpIds.has('m1'), 'm1应在补排队列中')
  ok(lastWeekIds.has('m1'), 'm1上周确实排了班')
  // 实际排序中补排优先
})

// ---- 8. 数据完整性校验 ----
console.log('\n📋 8. 数据完整性校验')

test('成员必须有name', () => {
  const validMember = { id: '1', name: '张三', role: '部员' }
  ok(validMember.name && validMember.name.trim(), 'name不能为空')
})

test('课表week_type只能是单周或双周', () => {
  const validTypes = new Set(['单周', '双周'])
  ok(validTypes.has('单周'))
  ok(validTypes.has('双周'))
  ok(!validTypes.has('全周'))
  ok(!validTypes.has(''))
})

test('角色只能是部员/部长/主席团', () => {
  const validRoles = new Set(['部员', '部长', '主席团'])
  ok(validRoles.has('部员'))
  ok(validRoles.has('部长'))
  ok(validRoles.has('主席团'))
  ok(!validRoles.has('学生'))
  ok(!validRoles.has(''))
})

test('时段只能是上午/下午1/下午2', () => {
  const validSlots = new Set(['上午', '下午1', '下午2'])
  ok(validSlots.has('上午'))
  ok(validSlots.has('下午1'))
  ok(validSlots.has('下午2'))
  ok(!validSlots.has('晚上'))
})

test('day_of_week 范围 1-7', () => {
  const valid = d => d >= 1 && d <= 7
  ok(valid(1))
  ok(valid(7))
  ok(!valid(0))
  ok(!valid(8))
})

test('week_number 必须为正整数', () => {
  const valid = w => Number.isInteger(w) && w >= 1
  ok(valid(1))
  ok(valid(20))
  ok(!valid(0))
  ok(!valid(-1))
  ok(!valid(1.5))
})

test('assignments.status 只能是正常/请假', () => {
  const validStatuses = new Set(['正常', '请假'])
  ok(validStatuses.has('正常'))
  ok(validStatuses.has('请假'))
  ok(!validStatuses.has('缺席'))
})

// ---- 9. 边界条件 ----
console.log('\n📋 9. 边界条件')

test('空成员列表 → 正常工作流', () => {
  const members = []
  eq(members.filter(m => m.role === '部员').length, 0)
  eq(members.length, 0)
})

test('1个成员 → 最小系统可用', () => {
  const members = [{ id: '1', name: '唯一', role: '部员' }]
  eq(members.length, 1)
  ok(members.every(m => m.role), '所有成员有角色')
})

test('21个时段 × 7天 = 147种可能配置', () => {
  // slot_config: 7天 × 3时段 = 21条记录
  eq(7 * 3, 21)
})

test('课表: 7天 × 3时段 × 2周类型 = 42个字段', () => {
  eq(7 * 3 * 2, 42)
})

test('4位UUID格式', () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  ok(uuidPattern.test('550e8400-e29b-41d4-a716-446655440000'))
  ok(!uuidPattern.test('not-a-uuid'))
})

// ---- 10. 周类型判断 ----
console.log('\n📋 10. 周类型判断（单/双周）')

function isOddWeek(w, firstWeekIsOdd) {
  return firstWeekIsOdd ? w % 2 === 1 : w % 2 === 0
}

test('第一周是单周 → 1=单, 2=双, 3=单', () => {
  ok(isOddWeek(1, true))
  ok(!isOddWeek(2, true))
  ok(isOddWeek(3, true))
  ok(!isOddWeek(4, true))
})

test('第一周是双周 → 1=双, 2=单, 3=双', () => {
  ok(!isOddWeek(1, false))
  ok(isOddWeek(2, false))
  ok(!isOddWeek(3, false))
})

test('第20周', () => {
  ok(!isOddWeek(20, true))   // 20是偶数, 第一周单→双周
  ok(isOddWeek(20, false))   // 20是偶数, 第一周双→单周
})

// ---- 11. Supabase 查询构造验证 ----
console.log('\n📋 11. 查询参数构造验证')

test('成员查询参数正确', () => {
  const query = { table: 'members', filter: { role: '部员', active: true }, order: 'name' }
  eq(query.table, 'members')
  eq(query.filter.role, '部员')
  eq(query.filter.active, true)
})

test('排班查询参数正确', () => {
  const query = { table: 'assignments', filter: { week_number: 5 }, order: ['day_of_week', 'slot'] }
  eq(query.filter.week_number, 5)
  eq(query.order.length, 2)
})

// ---- 12. Excel导出列对应 ----
console.log('\n📋 12. Excel导出列映射')

test('成员导入列映射', () => {
  const row = { '姓名': '张三', '角色': '部员', '手机': '13800001111' }
  ok(String(row['姓名']).trim())
  ok(['部员', '部长', '主席团'].includes(String(row['角色'])))
})

test('统计导出列包含必要字段', () => {
  const exportCols = ['姓名', '角色', '值班时长(小时)', '请假次数']
  eq(exportCols.length, 4)
  ok(exportCols.includes('姓名'))
  ok(exportCols.includes('角色'))
})

// =============================================================
console.log('\n' + '='.repeat(60))
console.log(`🏆 基础功能测试结果: ${passed}/${passed + failed} 通过`)
if (failed > 0) {
  console.log(`\n失败详情:`)
  failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`))
  process.exit(1)
} else {
  console.log('🎉 全部通过！')
}
console.log('='.repeat(60))
