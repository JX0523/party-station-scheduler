import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function SemesterConfig() {
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({
    name: '', first_week_is_odd: true, total_weeks: 20,
    current_week: 1
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    const { data } = await supabase.from('semester_config').select('*').limit(1).single()
    if (data) {
      setConfig(data)
      setForm({
        name: data.name,
        first_week_is_odd: data.first_week_is_odd,
        total_weeks: data.total_weeks,
        current_week: data.current_week || 1
      })
    }
  }

  async function handleSave() {
    setSaving(true)
    if (config) {
      await supabase.from('semester_config').update(form).eq('id', config.id)
    } else {
      const { data } = await supabase.from('semester_config').insert(form).select()
      if (data) setConfig(data[0])
    }
    setSaving(false)
    loadConfig()
    showToast('学期配置保存成功', 'success')
  }

  async function handleClearSchedules() {
    if (!confirm('确定清空所有课表数据吗？此操作不可恢复！')) return
    await supabase.from('course_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    showToast('课表已清空', 'success')
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">学期设置</h2>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存设置'}
        </button>
      </div>

      <div className="card" style={{ maxWidth: 600, marginBottom: 24 }}>
        <div className="card-title">学期基本配置</div>
        <div className="form-group">
          <label className="form-label">学期名称</label>
          <input className="form-input" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="例如：2026-2027学年秋季学期" />
        </div>
        <div className="form-group">
          <label className="form-label">总周数</label>
          <input className="form-input" type="number" min="1" max="30"
            value={form.total_weeks}
            onChange={e => setForm({ ...form, total_weeks: parseInt(e.target.value) || 20 })} />
        </div>
        <div className="form-group">
          <label className="form-label">当前是第几周？</label>
          <input className="form-input" type="number" min="1" max={form.total_weeks || 30}
            value={form.current_week}
            onChange={e => setForm({ ...form, current_week: parseInt(e.target.value) || 1 })} />
          <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            当前周及之前的排班将被锁定，不可重新生成。每周结束后请更新当前周。
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">第一周是单周还是双周？</label>
          <select className="form-select" value={form.first_week_is_odd}
            onChange={e => setForm({ ...form, first_week_is_odd: e.target.value === 'true' })}>
            <option value="true">单周</option>
            <option value="false">双周</option>
          </select>
          <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            按学校教学周历设置。例如：第1教学周是单周则选"单周"。
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-title" style={{ color: '#C62828' }}>⚠️ 危险操作</div>
        <p style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
          新学期开始时，可以清空所有旧课表数据。成员信息会保留。
        </p>
        <button className="btn btn-danger" onClick={handleClearSchedules}>
          🗑 清空所有课表
        </button>
      </div>
    </div>
  )
}
