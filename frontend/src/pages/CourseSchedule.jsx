import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const ALL_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const SLOTS = [
  { key: '34', label: '第3-4节\n9:30-11:00' },
  { key: '67', label: '第6-7节\n14:00-15:30' },
  { key: '89', label: '第8-9节\n15:30-17:00' },
]
const ALL_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function CourseSchedule() {
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [weekType, setWeekType] = useState('单周')
  const [schedule, setSchedule] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.from('members').select('*').eq('active', true).order('role').order('name')
      .then(({ data }) => setMembers(data || []))
  }, [])

  useEffect(() => {
    if (!selectedMember) return
    supabase.from('course_schedules')
      .select('*').eq('member_id', selectedMember.id).eq('week_type', weekType)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const s = {}
          ALL_DAY_KEYS.forEach(d => {
            SLOTS.forEach(slot => { s[`${d}_${slot.key}`] = data[`${d}_${slot.key}`] || false })
          })
          setSchedule(s)
        } else {
          const s = {}
          ALL_DAY_KEYS.forEach(d => {
            SLOTS.forEach(slot => { s[`${d}_${slot.key}`] = false })
          })
          setSchedule(s)
        }
      })
  }, [selectedMember, weekType])

  function toggleSlot(key) {
    setSchedule(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave() {
    if (!selectedMember) return
    setSaving(true)
    const existing = await supabase.from('course_schedules')
      .select('id').eq('member_id', selectedMember.id).eq('week_type', weekType).maybeSingle()
    const data = { member_id: selectedMember.id, week_type: weekType, ...schedule }
    if (existing.data) {
      await supabase.from('course_schedules').update(data).eq('id', existing.data.id)
    } else {
      await supabase.from('course_schedules').insert(data)
    }
    setSaving(false)
    showToast('课表保存成功', 'success')
  }

  async function handleCopy() {
    const otherType = weekType === '单周' ? '双周' : '单周'
    const existing = await supabase.from('course_schedules')
      .select('id').eq('member_id', selectedMember.id).eq('week_type', otherType).maybeSingle()
    const data = { member_id: selectedMember.id, week_type: otherType, ...schedule }
    if (existing.data) {
      await supabase.from('course_schedules').update(data).eq('id', existing.data.id)
    } else {
      await supabase.from('course_schedules').insert(data)
    }
    showToast(`已复制到${otherType}课表`, 'success')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">课表管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleCopy} disabled={!selectedMember}>
            📋 复制到另一周
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!selectedMember || saving}>
            {saving ? '保存中...' : '💾 保存课表'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <label className="form-label">选择成员</label>
          <select className="form-select" value={selectedMember?.id || ''}
            onChange={e => {
              const m = members.find(m => m.id === e.target.value)
              setSelectedMember(m || null)
            }}>
            <option value="">-- 请选择成员 --</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>[{m.role}] {m.name}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 120 }}>
          <label className="form-label">周类型</label>
          <select className="form-select" value={weekType} onChange={e => setWeekType(e.target.value)}>
            <option value="单周">单周</option>
            <option value="双周">双周</option>
          </select>
        </div>
      </div>

      {selectedMember ? (
        <div className="card">
          <div className="card-title">{selectedMember.name} 的{weekType}课表</div>
          <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
            🟢 绿色 = 没课（可值班）&nbsp;&nbsp;🔴 红色 = 有课（不可值班）&nbsp;&nbsp;点击格子切换
            &nbsp;&nbsp;|&nbsp;&nbsp;周六日默认没课，仅调休时值班
          </p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>时段</th>
                  {ALL_DAYS.map(d => <th key={d} style={d.includes('六') || d.includes('日') ? { background: '#FFF8E1' } : {}}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(slot => (
                  <tr key={slot.key}>
                    <td style={{ fontWeight: 600, whiteSpace: 'pre-line', textAlign: 'left' }}>{slot.label}</td>
                    {ALL_DAY_KEYS.map(d => {
                      const key = `${d}_${slot.key}`
                      const hasClass = schedule[key]
                      const isWeekend = d === 'sat' || d === 'sun'
                      return (
                        <td key={key}
                          onClick={() => toggleSlot(key)}
                          style={{
                            cursor: 'pointer',
                            background: hasClass ? '#ffebee' : '#e8f5e9',
                            color: hasClass ? '#c62828' : '#2e7d32',
                            fontWeight: 600,
                            transition: 'all 0.15s',
                            userSelect: 'none',
                            borderLeft: isWeekend ? '2px dashed #FFD54F' : undefined
                          }}
                        >
                          {hasClass ? '有课 ✗' : '没课 ✓'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📅</div>
            <p>请先选择一位成员，然后编辑其课表</p>
          </div>
        </div>
      )}
    </div>
  )
}
