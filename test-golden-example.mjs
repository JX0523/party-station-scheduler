/**
 * 「白板手算示例」金标准测试（test-golden-example.mjs）
 *
 * 目的：答辩/讲义里用了一个 5 人 4 时段的手算例子。这个测试把**同一组输入**喂给真实算法，
 * 断言输出与文档完全一致 —— 防止“文档写一套、代码跑另一套”在答辩现场翻车。
 *
 * 场景：A、B、E 部员；C 部长；D 主席团；历史 A5/B2/C3/D1/E4；
 *      上周 A 值班、B 上周请假需补排；A 周一上午有课；排周一/周二 各 上午+下午1。
 * 期望（已用真实算法跑出并与讲义对齐）：周一上午=B、周二上午=D、周一下午1=C、周二下午1=E，共 4 条。
 */
import { runSchedulingAlgorithm } from './frontend/src/lib/scheduling-algorithm.js'

const M = (id, role) => ({ id, name: id, role, active: true })
const members = [M('A', '部员'), M('B', '部员'), M('C', '部长'), M('D', '主席团'), M('E', '部员')]
const schedules = [{ member_id: 'A', week_type: '双周', mon_34: true }]
const slotConfig = { '1_上午': 1, '1_下午1': 1, '2_上午': 1, '2_下午1': 1 }
const dayConfig = { 1: { isWorkday: true }, 2: { isWorkday: true }, 3: { isWorkday: false },
  4: { isWorkday: false }, 5: { isWorkday: false }, 6: { isWorkday: false }, 7: { isWorkday: false } }
const hist = { A: 5, B: 2, C: 3, D: 1, E: 4 }
const allAssignments = []
for (const [id, n] of Object.entries(hist)) for (let i = 0; i < n; i++) allAssignments.push({ member_id: id })

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('白板手算示例（金标准）测试：')

const res = runSchedulingAlgorithm({
  members, schedules, slotConfig, weekNumber: 8,
  lastWeek: [{ member_id: 'A' }],
  allAssignments,
  makeUpMembers: [{ member_id: 'B' }],
  otherWeekSchedules: [],
  dayConfig, weekType: '双周', mode: '一般'
})

const key = a => `${a.day_of_week}_${a.slot}`
const got = {}
res.assignments.forEach(a => { got[key(a)] = a.member_id })

console.log('  实际输出：' + JSON.stringify(got))

// 配额：5 人时部员+部长=4 <5 → 启用主席团（这是文档最容易被算错的地方）
check('启用主席团（perRoleMax.主席团 = 1）', res.meta.perRoleMax['主席团'] === 1, JSON.stringify(res.meta.perRoleMax))
check('部员配额为 5（部员不足时部长顶主力）', res.meta.perRoleMax['部员'] === 5, JSON.stringify(res.meta.perRoleMax))

check('周一上午 = B（补排优先）', got['1_上午'] === 'B', String(got['1_上午']))
check('周二上午 = D（主席团启用 + 历史最少）', got['2_上午'] === 'D', String(got['2_上午']))
check('周一下午1 = C（历史 3 < E 的 4）', got['1_下午1'] === 'C', String(got['1_下午1']))
check('周二下午1 = E（剩下唯一可排）', got['2_下午1'] === 'E', String(got['2_下午1']))
check('共 4 条排班、无缺位', res.assignments.length === 4, String(res.assignments.length))
check('没有人被排到有课时段（A 未出现在周一上午）', got['1_上午'] !== 'A')
check('每人本周只排一次', new Set(res.assignments.map(a => a.member_id)).size === res.assignments.length)

// 反例：把部员补到 5 人以上 → 主席团应被排除（验证配额随规模变化）
const moreMembers = members.concat([M('F', '部员'), M('G', '部员')])
const res2 = runSchedulingAlgorithm({
  members: moreMembers, schedules, slotConfig, weekNumber: 8,
  lastWeek: [], allAssignments, makeUpMembers: [],
  otherWeekSchedules: [], dayConfig, weekType: '双周', mode: '一般'
})
check('部员+部长≥5 时不启用主席团（配额为 0）', res2.meta.perRoleMax['主席团'] === 0, JSON.stringify(res2.meta.perRoleMax))
check('此时排班里没有主席团成员 D', res2.assignments.every(a => a.member_id !== 'D'))

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（文档示例与算法输出一致）' : ''))
process.exit(fail === 0 ? 0 : 1)
