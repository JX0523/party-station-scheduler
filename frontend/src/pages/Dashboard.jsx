import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { runSchedulingAlgorithm } from '../lib/scheduling-algorithm.js'
import DaySelector from '../components/DaySelector.jsx'

const ALL_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const ALL_DAYS_SHORT = ['一', '二', '三', '四', '五', '六', '日']
const SLOTS = ['上午', '下午1', '下午2']
const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const SLOT_KEYS = ['34', '67', '89']

export default function Dashboard() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [slotConfig, setSlotConfig] = useState({})
  const [weekAssignments, setWeekAssignments] = useState([])
  const [pastWeeks, setPastWeeks] = useState([]) // [{weekNumber, assignments}]
  const [stats, setStats] = useState({ members: 0, schedules: 0 })
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)
  const [showAdd, setShowAdd] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [addMode, setAddMode] = useState(null)
  const [dayConfig, setDayConfig] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: sem } = await supabase.from('semester_config').select('*').limit(1).single()
    setConfig(sem)

    const { data: slots } = await supabase.from('slot_config').select('*')
    const scMap = {}
    if (slots) slots.forEach(s => { scMap[`${s.day_of_week}_${s.slot}`] = s.required_count })
    setSlotConfig(scMap)

    const { count: mc } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('active', true)
    const { count: sc } = await supabase.from('course_schedules').select('*', { count: 'exact', head: true })
    setStats({ members: mc || 0, schedules: sc || 0 })

    if (sem) {
      const cw = sem.current_week || 1
      // 加载本周
      const { data: curr } = await supabase.from('assignments')
        .select('*, members(name, role)')
        .eq('week_number', cw).order('day_of_week').order('slot')
      setWeekAssignments(curr || [])

      // 加载所有历史周 (week 1 到 cw-1)
      if (cw > 1) {
        const { data: allPast } = await supabase.from('assignments')
          .select('*, members(name, role)')
          .lt('week_number', cw)
          .order('week_number').order('day_of_week').order('slot')

        // 按周分组
        const grouped = {}
        if (allPast) {
          allPast.forEach(a => {
            if (!grouped[a.week_number]) grouped[a.week_number] = []
            grouped[a.week_number].push(a)
          })
        }
        const pastList = Object.entries(grouped)
          .map(([wn, assigns]) => ({ weekNumber: parseInt(wn), assignments: assigns }))
          .sort((a, b) => b.weekNumber - a.weekNumber) // 最近的在前
        setPastWeeks(pastList)
      }

      // 本周没排班就自动生成
      if (!curr || curr.length === 0) {
        await autoGenerate(sem, scMap)
      }
    }
  }

  async function autoGenerate(sem, scMap) {
    setGenerating(true)
    const cw = sem.current_week || 1
    const weekType = (sem.first_week_is_odd ? cw % 2 === 1 : cw % 2 === 0) ? '单周' : '双周'
    const otherWeekType = weekType === '单周' ? '双周' : '单周'

    const { data: members } = await supabase.from('members').select('*').eq('active', true)
    const { data: schedules } = await supabase.from('course_schedules').select('*').eq('week_type', weekType)
    const { data: otherWeekSchedules } = await supabase.from('course_schedules').select('*').eq('week_type', otherWeekType)
    const { data: lastWeek } = await supabase.from('assignments').select('member_id').eq('week_number', cw - 1)
    const { data: allAssignments } = await supabase.from('assignments').select('member_id').eq('status', '正常')
    const { data: makeUpMembers } = await supabase.from('assignments').select('member_id').eq('leave_next_week', true)

    const result = runSchedulingAlgorithm({
      members: members || [], schedules: schedules || [],
      slotConfig: scMap, weekNumber: cw,
      lastWeek: lastWeek || [], allAssignments: allAssignments || [],
      makeUpMembers: makeUpMembers || [],
      otherWeekSchedules: otherWeekSchedules || [],
      dayConfig
    })

    if (result.assignments.length > 0) {
      await supabase.from('assignments').delete().eq('week_number', cw)
      await supabase.from('assignments').insert(result.assignments)
      if (makeUpMembers && makeUpMembers.length > 0) {
        await supabase.from('assignments').update({ leave_next_week: false }).eq('leave_next_week', true)
      }
    }

    const { data: curr } = await supabase.from('assignments')
      .select('*, members(name, role)')
      .eq('week_number', cw).order('day_of_week').order('slot')
    setWeekAssignments(curr || [])

    setGenerating(false)
    showToast(`本周排班已自动生成：${result.assignments.length} 条（${result.meta.roleLabel}）`, 'success')
  }

  function getAssignments(list, day, slot) {
    return (list || []).filter(a => a.day_of_week === day && a.slot === slot)
  }

  async function handleLeave(assignment) {
    if (!confirm(`确定将 ${assignment.members?.name} 标记为请假吗？\n\n请假后不计时长，下周补排。`)) return
    await supabase.from('assignments').update({
      status: '请假', leave_next_week: true
    }).eq('id', assignment.id)

    const cw = config?.current_week || 1
    const weekType = ((config?.first_week_is_odd ? cw % 2 === 1 : cw % 2 === 0)) ? '单周' : '双周'
    const { data: schedules } = await supabase.from('course_schedules').select('*').eq('week_type', weekType)
    const { data: members } = await supabase.from('members').select('*').eq('active', true)
    const dKey = ALL_DAY_KEYS[assignment.day_of_week - 1]
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
    const rw = { '部员': 0, '部长': 1, '主席团': 2 }
    available.sort((a, b) => (rw[a.role] || 0) - (rw[b.role] || 0))

    setCandidates(available)
    setShowAdd(assignment)
    setAddMode('replace')
    loadCurrentWeek()
    showToast(`${assignment.members?.name} 已请假，请选择替补`, 'info')
  }

  async function handleAddPerson(day, slot) {
    const cw = config?.current_week || 1
    const weekType = ((config?.first_week_is_odd ? cw % 2 === 1 : cw % 2 === 0)) ? '单周' : '双周'
    const { data: schedules } = await supabase.from('course_schedules').select('*').eq('week_type', weekType)
    const { data: members } = await supabase.from('members').select('*').eq('active', true)
    const dKey = ALL_DAY_KEYS[day - 1]
    const sKey = SLOT_KEYS[SLOTS.indexOf(slot)]
    const colKey = `${dKey}_${sKey}`

    const scheduleMap = {}
    if (schedules) schedules.forEach(s => { scheduleMap[s.member_id] = s })

    const alreadyHere = new Set(
      weekAssignments.filter(a => a.day_of_week === day && a.slot === slot).map(a => a.member_id)
    )
    const available = (members || []).filter(m => {
      if (alreadyHere.has(m.id)) return false
      const s = scheduleMap[m.id]
      if (!s) return true
      return !s[colKey]
    })
    const rw = { '部员': 0, '部长': 1, '主席团': 2 }
    available.sort((a, b) => (rw[a.role] || 0) - (rw[b.role] || 0))

    setCandidates(available)
    setShowAdd({ day, slot })
    setAddMode('add')
  }

  async function confirmAddReplace(memberId) {
    if (!showAdd) return
    const cw = config?.current_week || 1

    if (addMode === 'add') {
      await supabase.from('assignments').insert({
        week_number: cw, day_of_week: showAdd.day, slot: showAdd.slot,
        member_id: memberId, is_emergency: false,
        status: '正常', leave_next_week: false
      })
      showToast('已添加值班人员', 'success')
    } else {
      await supabase.from('assignments').insert({
        week_number: showAdd.week_number, day_of_week: showAdd.day_of_week,
        slot: showAdd.slot, member_id: memberId,
        is_emergency: false, status: '正常', leave_next_week: false
      })
      showToast('替补安排成功', 'success')
    }
    setShowAdd(null)
    setCandidates([])
    setAddMode(null)
    loadCurrentWeek()
    loadPastWeeks()
  }

  async function loadCurrentWeek() {
    const cw = config?.current_week || 1
    const { data: curr } = await supabase.from('assignments')
      .select('*, members(name, role)')
      .eq('week_number', cw).order('day_of_week').order('slot')
    setWeekAssignments(curr || [])
  }

  async function loadPastWeeks() {
    const cw = config?.current_week || 1
    if (cw <= 1) return
    const { data: allPast } = await supabase.from('assignments')
      .select('*, members(name, role)')
      .lt('week_number', cw)
      .order('week_number').order('day_of_week').order('slot')
    const grouped = {}
    if (allPast) {
      allPast.forEach(a => {
        if (!grouped[a.week_number]) grouped[a.week_number] = []
        grouped[a.week_number].push(a)
      })
    }
    const pastList = Object.entries(grouped)
      .map(([wn, assigns]) => ({ weekNumber: parseInt(wn), assignments: assigns }))
      .sort((a, b) => b.weekNumber - a.weekNumber)
    setPastWeeks(pastList)
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 获取本周工作日列表
  function getWorkdays() {
    if (!dayConfig) return [1, 2, 3, 4, 5]
    return [1, 2, 3, 4, 5, 6, 7].filter(d => dayConfig[d])
  }
  const workdayList = getWorkdays()

  const today = new Date().getDay()
  const cw = config?.current_week || 1

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">首页仪表盘</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {generating && <span style={{ fontSize: 14, color: '#C41E3A' }}>⏳ 自动生成排班中...</span>}
          <button className="btn btn-secondary btn-small" onClick={() => navigate('/semester')}>
            ⚙️ 学期设置
          </button>
        </div>
      </div>

      {/* 信息卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#999' }}>当前学期</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{config?.name || '未设置'}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#999' }}>当前周</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            第 {cw} 周 / 共 {config?.total_weeks || 20} 周
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#999' }}>成员</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{stats.members} 人</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#999' }}>已录入课表</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{stats.schedules} 份</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#999' }}>已完成周</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2E7D32' }}>{pastWeeks.length} 周</div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={async () => {
          if (config) { setGenerating(true); await autoGenerate(config, slotConfig) }
        }} disabled={generating}>
          🔄 重新生成
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/schedule')}>📅 录课表</button>
        <button className="btn btn-secondary" onClick={() => navigate('/members')}>👥 成员</button>
        <button className="btn btn-secondary" onClick={() => navigate('/scheduling')}>📋 排班详情</button>
        <button className="btn btn-secondary" onClick={() => navigate('/stats')}>📊 统计导出</button>
      </div>

      {/* ===== 工作日配置 ===== */}
      <div style={{ marginBottom: 12 }}>
        <DaySelector weekNumber={cw} locked={false} onChange={setDayConfig} />
      </div>

      {/* ===== 本周值班表（大，可操作） ===== */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            📋 本周值班表 — 第 {cw} 周
            {generating && <span style={{ fontSize: 13, color: '#C41E3A', marginLeft: 8 }}>生成中...</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>
            点击「请假」|「+加人」操作
          </span>
        </div>

        {weekAssignments.length === 0 && !generating ? (
          <div className="empty-state">
            <p>本周暂无排班</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }}
              onClick={async () => { if (config) { setGenerating(true); await autoGenerate(config, slotConfig) } }}>
              生成排班
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>时段</th>
                  {workdayList.map(day => {
                    const isToday = day === today
                    return (
                      <th key={day} style={isToday ? { background: '#FFF3E0', borderBottom: '3px solid #E65100' } : {}}>
                        {ALL_DAYS[day - 1]}
                        {isToday && <span style={{ fontSize: 10, color: '#E65100', display: 'block' }}>今天</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(slot => (
                  <tr key={slot}>
                    <td style={{ fontWeight: 600, fontSize: 14 }}>{slot}</td>
                    {workdayList.map(day => {
                      const list = getAssignments(weekAssignments, day, slot)
                      const isToday = day === today
                      return (
                        <td key={day} style={{
                          minWidth: 110, verticalAlign: 'top',
                          background: isToday ? '#FFF8F0' : 'transparent'
                        }}>
                          {list.map(a => (
                            <div key={a.id} style={{
                              padding: '5px 8px', margin: '2px 0', borderRadius: 4,
                              background: a.status === '请假' ? '#fff3e0' : '#e8f5e9',
                              border: `1px solid ${a.status === '请假' ? '#ffcc80' : '#a5d6a7'}`,
                              fontSize: 13, display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', gap: 4
                            }}>
                              <span>
                                <strong>{a.members?.name}</strong>
                                <span style={{ fontSize: 11, color: '#999', marginLeft: 3 }}>{a.members?.role}</span>
                              </span>
                              {a.status === '正常' ? (
                                <button className="btn btn-small btn-danger"
                                  style={{ padding: '1px 5px', fontSize: 10 }}
                                  onClick={() => handleLeave(a)}>请假</button>
                              ) : (
                                <span style={{ fontSize: 10, color: '#E65100', background: '#fff', padding: '1px 4px', borderRadius: 2 }}>请假</span>
                              )}
                            </div>
                          ))}
                          <button
                            style={{
                              display: 'block', width: '100%', marginTop: 3, padding: '2px 0',
                              fontSize: 11, color: '#C41E3A', background: 'none',
                              border: '1px dashed #ddd', borderRadius: 4, cursor: 'pointer'
                            }}
                            onClick={() => handleAddPerson(day, slot)}
                          >+ 加人</button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {weekAssignments.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 13, color: '#666', flexWrap: 'wrap' }}>
            <span>正常：<strong style={{ color: '#2E7D32' }}>{weekAssignments.filter(a => a.status === '正常').length}</strong> 人次</span>
            <span>请假：<strong style={{ color: '#E65100' }}>{weekAssignments.filter(a => a.status === '请假').length}</strong> 人次</span>
            <span>覆盖：<strong>{workdayList.filter(d => weekAssignments.some(a => a.day_of_week === d && a.status === '正常')).length}/{workdayList.length}</strong> 天</span>
          </div>
        )}
      </div>

      {/* ===== 历史周值班表（小，只读） ===== */}
      {pastWeeks.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#666' }}>
            📌 已完成的历史值班表（已锁定）
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
            {pastWeeks.map(({ weekNumber: wn, assignments: list }) => {
              const hasLeaves = list.some(a => a.status === '请假')
              return (
                <div key={wn} className="card" style={{ padding: '12px 16px' }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span>第 {wn} 周</span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>
                      {list.filter(a => a.status === '正常').length}人次
                      {hasLeaves && <span style={{ color: '#E65100', marginLeft: 6 }}>{list.filter(a => a.status === '请假').length}人请假</span>}
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '3px 6px' }}></th>
                          {DAYS_SHORT.map(d => <th key={d} style={{ padding: '3px 4px', fontSize: 11 }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {SLOTS.map(slot => (
                          <tr key={slot}>
                            <td style={{ padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{slot}</td>
                            {[1, 2, 3, 4, 5].map(day => {
                              const items = getAssignments(list, day, slot)
                              return (
                                <td key={day} style={{ padding: '2px 4px' }}>
                                  {items.length === 0 ? (
                                    <span style={{ color: '#ddd' }}>—</span>
                                  ) : items.map(a => (
                                    <div key={a.id} style={{
                                      padding: '1px 4px', margin: '1px 0', borderRadius: 2,
                                      background: a.status === '请假' ? '#fff3e0' : '#f5f5f5',
                                      fontSize: 11, whiteSpace: 'nowrap'
                                    }}>
                                      {a.members?.name}
                                      {a.status === '请假' && <span style={{ color: '#E65100', fontSize: 10 }}> 假</span>}
                                    </div>
                                  ))}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 加人/替补弹窗 */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(null); setCandidates([]); setAddMode(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 420 }}>
            <div className="modal-header">
              <h3>{addMode === 'add'
                ? `为 ${DAYS[(showAdd.day || showAdd.day_of_week) - 1]}${showAdd.slot || ''} 添加值班人`
                : `为 ${showAdd.slot} 选择替补`}</h3>
              <button className="modal-close" onClick={() => { setShowAdd(null); setCandidates([]); setAddMode(null) }}>✕</button>
            </div>
            {addMode === 'replace' && (
              <p style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
                原值班人：<strong>{showAdd.members?.name}</strong>（不计时长，下周补排）
              </p>
            )}
            <div className="table-wrapper">
              <table>
                <thead><tr><th>姓名</th><th>角色</th><th>操作</th></tr></thead>
                <tbody>
                  {candidates.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 20, color: '#999' }}>暂无可选人员</td></tr>
                  ) : candidates.slice(0, 20).map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td><span className={`badge ${c.role === '部员' ? 'badge-red' : c.role === '部长' ? 'badge-gold' : 'badge-green'}`}>{c.role}</span></td>
                      <td>
                        <button className="btn btn-small btn-primary"
                          onClick={() => confirmAddReplace(c.id)}>
                          {addMode === 'add' ? '添加' : '选为替补'}
                        </button>
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
