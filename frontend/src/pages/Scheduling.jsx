import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { runSchedulingAlgorithm, resolveScheduleKey } from '../lib/scheduling-algorithm.js'
import DaySelector from '../components/DaySelector.jsx'

const ALL_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOTS = ['上午', '下午1', '下午2']
const SLOT_KEYS = ['34', '67', '89']

export default function Scheduling() {
  const [weekNumber, setWeekNumber] = useState(1)
  const [assignments, setAssignments] = useState([])
  const [slotConfig, setSlotConfig] = useState({})
  const [semesterConfig, setSemesterConfig] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showReplace, setShowReplace] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [toast, setToast] = useState(null)
  // 编辑时段人数
  const [editingSlot, setEditingSlot] = useState(null) // { day, slot }
  const [editValue, setEditValue] = useState('')
  const [dayConfig, setDayConfig] = useState(null)
  const generatingRef = useRef(false)  // 防止并发生成导致重复排班

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (semesterConfig) loadAssignments() }, [weekNumber, semesterConfig])

  async function loadAll() {
    const { data: sem } = await supabase.from('semester_config').select('*').limit(1).single()
    setSemesterConfig(sem)
    if (sem?.current_week && !weekNumber) {
      setWeekNumber(sem.current_week)
    }
    await loadSlotConfig()
    setLoading(false)
  }

  async function loadSlotConfig() {
    const { data: slots } = await supabase.from('slot_config').select('*')
    const map = {}
    if (slots) slots.forEach(s => { map[`${s.day_of_week}_${s.slot}`] = s.required_count })
    setSlotConfig(map)
  }

  async function loadAssignments() {
    const { data } = await supabase.from('assignments')
      .select('*, members(name, role)')
      .eq('week_number', weekNumber)
      .order('day_of_week').order('slot')
    setAssignments(data || [])
  }

  function getAssignment(day, slot) {
    return assignments.filter(a => a.day_of_week === day && a.slot === slot)
  }

  function isOddWeek(w) {
    if (!semesterConfig) return w % 2 === 1
    return semesterConfig.first_week_is_odd ? w % 2 === 1 : w % 2 === 0
  }

  const isLocked = semesterConfig?.current_week ? weekNumber < semesterConfig.current_week : false

  // ===== 编辑时段人数 =====
  function startEdit(day, slot) {
    if (isLocked) return
    const key = `${day}_${slot}`
    setEditingSlot({ day, slot })
    setEditValue(String(slotConfig[key] ?? 0))
  }

  async function saveEdit() {
    if (!editingSlot) return
    const { day, slot } = editingSlot
    const val = Math.max(0, parseInt(editValue) || 0)

    // Upsert slot_config
    const { data: existing } = await supabase.from('slot_config')
      .select('id').eq('day_of_week', day).eq('slot', slot).maybeSingle()

    if (existing) {
      await supabase.from('slot_config').update({ required_count: val }).eq('id', existing.id)
    } else {
      await supabase.from('slot_config').insert({ day_of_week: day, slot, required_count: val })
    }

    await loadSlotConfig()
    setEditingSlot(null)
    showToast(`${ALL_DAYS[day - 1]}${slot} 调整为 ${val} 人`, 'success')
  }

  function cancelEdit() {
    setEditingSlot(null)
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter') saveEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  // ===== 自动排班 =====
  async function handleGenerate() {
    if (!semesterConfig) return showToast('请先设置学期配置', 'error')
    if (isLocked) return showToast('该周已结束，排班已锁定不可修改', 'error')
    if (generatingRef.current) return  // 防止并发生成
    generatingRef.current = true
    setGenerating(true)
    try {
      const weekType = isOddWeek(weekNumber) ? '单周' : '双周'
      const otherWeekType = weekType === '单周' ? '双周' : '单周'

      const { data: members } = await supabase.from('members').select('*').eq('active', true)
      const { data: schedules } = await supabase.from('course_schedules').select('*').eq('week_type', weekType)
      const { data: otherWeekSchedules } = await supabase.from('course_schedules').select('*').eq('week_type', otherWeekType)
      const { data: lastWeek } = await supabase.from('assignments').select('member_id').eq('week_number', weekNumber - 1)
      const { data: allAssignments } = await supabase.from('assignments').select('member_id').eq('status', '正常')
      const { data: makeUpMembers } = await supabase.from('assignments').select('member_id').eq('leave_next_week', true)

      const result = runSchedulingAlgorithm({
        members: members || [], schedules: schedules || [],
        slotConfig, weekNumber,
        lastWeek: lastWeek || [], allAssignments: allAssignments || [],
        makeUpMembers: makeUpMembers || [],
        otherWeekSchedules: otherWeekSchedules || [],
        dayConfig
      })

      await supabase.from('assignments').delete().eq('week_number', weekNumber)
      if (result.assignments.length > 0) {
        await supabase.from('assignments').insert(result.assignments)
      }
      if (makeUpMembers && makeUpMembers.length > 0) {
        await supabase.from('assignments').update({ leave_next_week: false }).eq('leave_next_week', true)
      }

      loadAssignments()
      showToast(`成功生成 ${result.assignments.length} 条排班（${result.meta.roleLabel}，上限${result.meta.maxPerWeek}人）`, 'success')
    } catch (e) {
      console.error('生成排班失败:', e)
      showToast('生成失败，请重试', 'error')
    } finally {
      setGenerating(false)
      generatingRef.current = false
    }
  }

  // ===== 请假 =====
  async function handleLeave(assignment) {
    if (isLocked) return showToast('该周已锁定，无法修改', 'error')
    if (!confirm(`确定将 ${assignment.members?.name} 标记为请假吗？\n\n请假后该同学本次值班不计时长，下周将要求补排。`)) return

    await supabase.from('assignments').update({
      status: '请假',
      leave_next_week: true
    }).eq('id', assignment.id)

    // 找替补
    const weekType = isOddWeek(weekNumber) ? '单周' : '双周'
    const { data: schedules } = await supabase.from('course_schedules').select('*').eq('week_type', weekType)
    const { data: members } = await supabase.from('members').select('*').eq('active', true)
    const dKey = resolveScheduleKey(assignment.day_of_week, dayConfig)
    const sKey = SLOT_KEYS[SLOTS.indexOf(assignment.slot)]
    const colKey = `${dKey}_${sKey}`

    const scheduleMap = {}
    if (schedules) schedules.forEach(s => { scheduleMap[s.member_id] = s })

    const available = (members || []).filter(m => {
      if (m.id === assignment.member_id) return false
      const s = scheduleMap[m.id]
      if (!s) return true
      return !s[colKey]
    })

    const roleWeight = { '部员': 0, '部长': 1, '主席团': 2 }
    available.sort((a, b) => (roleWeight[a.role] || 0) - (roleWeight[b.role] || 0))

    setCandidates(available)
    setShowReplace(assignment)
    loadAssignments()
    showToast(`${assignment.members?.name} 已请假，请选择替补`, 'info')
  }

  async function handleReplace(memberId) {
    if (!showReplace) return
    await supabase.from('assignments').insert({
      week_number: showReplace.week_number,
      day_of_week: showReplace.day_of_week,
      slot: showReplace.slot,
      member_id: memberId,
      is_emergency: false,
      status: '正常',
      leave_next_week: false,
    })
    setShowReplace(null)
    setCandidates([])
    loadAssignments()
    showToast('替补安排成功', 'success')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 工作日列表
  function getWorkdays() {
    if (!dayConfig) return [1, 2, 3, 4, 5]
    return [1, 2, 3, 4, 5, 6, 7].filter(d => {
      const v = dayConfig[d]
      return typeof v === 'object' ? v.isWorkday : v
    })
  }
  const workdayList = getWorkdays()

  if (loading) return <div className="page-container"><p>加载中...</p></div>

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">排班管理</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0 }}>第</label>
          <input type="number" className="form-input" style={{ width: 70, textAlign: 'center' }}
            min="1" max={semesterConfig?.total_weeks || 20}
            value={weekNumber} onChange={e => setWeekNumber(parseInt(e.target.value) || 1)} />
          <label className="form-label" style={{ margin: 0 }}>周</label>
          <span style={{ fontSize: 13, color: '#999' }}>
            ({isOddWeek(weekNumber) ? '单周' : '双周'})
          </span>
          {isLocked && (
            <span className="badge" style={{ background: '#999', color: '#fff', fontSize: 13, padding: '4px 10px' }}>
              🔒 已锁定
            </span>
          )}
          {!isLocked && (
            <button className="btn btn-primary btn-large" onClick={handleGenerate} disabled={generating}>
              {generating ? '⏳ 生成中...' : '🔄 自动生成排班'}
            </button>
          )}
          {isLocked && (
            <span style={{ fontSize: 13, color: '#999' }}>
              第 {semesterConfig?.current_week} 周及之前的排班已锁定
            </span>
          )}
        </div>
      </div>

      {isLocked && (
        <div style={{
          background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#E65100'
        }}>
          📌 该周排班已结束并锁定。如需查看统计请前往
          <a href="/stats" style={{ color: '#C41E3A', fontWeight: 600, marginLeft: 4 }}>统计导出</a> 页面。
        </div>
      )}

      {/* 工作日配置 */}
      <div style={{ marginBottom: 12 }}>
        <DaySelector weekNumber={weekNumber} locked={isLocked} onChange={setDayConfig} />
      </div>

      {/* 提示：点击表头数字可调整时段人数 */}
      {!isLocked && (
        <div style={{ fontSize: 13, color: '#999', marginBottom: 8 }}>
          💡 点击表头数字可调整该时段需要的人数，调整后可重新生成排班
        </div>
      )}

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>时段</th>
                {workdayList.map(day => {
                  return (
                    <th key={day}>
                      {ALL_DAYS[day - 1]}
                      <br />
                      {SLOTS.map(slot => {
                        const key = `${day}_${slot}`
                        const val = slotConfig[key] ?? 0
                        const isEditing = editingSlot?.day === day && editingSlot?.slot === slot
                        return (
                          <span key={slot} style={{ display: 'inline-block', margin: '1px 2px' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0" max="99"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                onBlur={saveEdit}
                                autoFocus
                                style={{
                                  width: 32, textAlign: 'center', fontSize: 11,
                                  padding: '1px 2px', border: '1px solid #C41E3A',
                                  borderRadius: 3, background: '#fff'
                                }}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(day, slot)}
                                title="点击修改该时段需要人数"
                                style={{
                                  cursor: isLocked ? 'default' : 'pointer',
                                  fontSize: 11, fontWeight: 400,
                                  color: val > 0 ? '#C41E3A' : '#ccc',
                                  borderBottom: isLocked ? 'none' : '1px dashed #ddd',
                                  padding: '1px 3px'
                                }}
                              >
                                {slot === '上午' ? '' : ''}{val}
                              </span>
                            )}
                            {slot !== '下午2' && <span style={{ fontSize: 10, color: '#ddd' }}>/</span>}
                          </span>
                        )
                      })}
                      <span style={{ fontSize: 10, color: '#999' }}> 人</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map(slot => (
                <tr key={slot}>
                  <td style={{ fontWeight: 600 }}>{slot}</td>
                  {workdayList.map(day => {
                    const list = getAssignment(day, slot)
                    const required = slotConfig[`${day}_${slot}`] || 0
                    return (
                      <td key={day} style={{ minWidth: 140 }}>
                        {list.length === 0 && required > 0 ? (
                          <span style={{ color: '#ccc', fontSize: 13 }}>未安排</span>
                        ) : list.length === 0 && required === 0 ? (
                          <span style={{ color: '#ddd', fontSize: 12 }}>—</span>
                        ) : list.map(a => (
                          <div key={a.id} style={{
                            padding: '6px 10px', margin: '3px 0', borderRadius: 4,
                            background: a.status === '请假' ? '#fff3e0' : '#e8f5e9',
                            border: `1px solid ${a.status === '请假' ? '#ffcc80' : '#a5d6a7'}`,
                            fontSize: 13, display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', gap: 6
                          }}>
                            <span>
                              <strong>{a.members?.name}</strong>
                              <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>{a.members?.role}</span>
                            </span>
                            {a.status === '正常' && !isLocked && (
                              <button className="btn btn-small btn-danger"
                                style={{ padding: '2px 6px', fontSize: 11 }}
                                onClick={() => handleLeave(a)}>请假</button>
                            )}
                            {a.status === '请假' && (
                              <span className="badge badge-orange" title="不计时长，下周补排">已请假</span>
                            )}
                          </div>
                        ))}
                        {required > 0 && list.length < required && (
                          <div style={{ fontSize: 11, color: '#e65100', marginTop: 4 }}>
                            ⚠ 还缺 {required - list.length} 人
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 本周统计 */}
      {assignments.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ textAlign: 'center', minWidth: 120 }}>
            <div style={{ fontSize: 13, color: '#999' }}>本周安排</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#C41E3A' }}>
              {assignments.filter(a => a.status === '正常').length} 人次
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center', minWidth: 120 }}>
            <div style={{ fontSize: 13, color: '#999' }}>请假</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#E65100' }}>
              {assignments.filter(a => a.status === '请假').length} 人次
            </div>
          </div>
        </div>
      )}

      {/* 替补弹窗 */}
      {showReplace && (
        <div className="modal-overlay" onClick={() => setShowReplace(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 500 }}>
            <div className="modal-header">
              <h3>为 {showReplace.slot} 选择替补</h3>
              <button className="modal-close" onClick={() => setShowReplace(null)}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
              原值班人：<strong>{showReplace.members?.name}</strong>（已请假，不计时长，下周补排）
            </p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>姓名</th><th>角色</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {candidates.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 20, color: '#999' }}>暂无可替换的候选人</td></tr>
                  ) : candidates.slice(0, 20).map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td><span className={`badge ${c.role === '部员' ? 'badge-red' : c.role === '部长' ? 'badge-gold' : 'badge-green'}`}>{c.role}</span></td>
                      <td>
                        <button className="btn btn-small btn-primary"
                          onClick={() => handleReplace(c.id)}>选为替补</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
