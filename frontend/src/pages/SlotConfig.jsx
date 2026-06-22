import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]
const SLOTS = ['上午', '下午1', '下午2']

export default function SlotConfig() {
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    const { data } = await supabase.from('slot_config').select('*')
    const map = {}
    if (data) {
      data.forEach(d => { map[`${d.day_of_week}_${d.slot}`] = { id: d.id, count: d.required_count } })
    }
    // 默认值：周一至周五每时段1人，周六日0人
    for (let d = 1; d <= 7; d++) {
      const defaultCount = d <= 5 ? 1 : 0
      SLOTS.forEach(s => {
        if (!map[`${d}_${s}`]) map[`${d}_${s}`] = { id: null, count: defaultCount }
      })
    }
    setConfig(map)
  }

  function setCount(day, slot, val) {
    const key = `${day}_${slot}`
    setConfig(prev => ({ ...prev, [key]: { ...prev[key], count: Math.max(0, parseInt(val) || 0) } }))
  }

  async function handleSave() {
    setSaving(true)
    const upserts = []
    for (let d = 1; d <= 7; d++) {
      SLOTS.forEach(s => {
        const key = `${d}_${s}`
        upserts.push({
          id: config[key]?.id || undefined,
          day_of_week: d,
          slot: s,
          required_count: config[key]?.count || 0
        })
      })
    }
    await supabase.from('slot_config').upsert(upserts, { onConflict: 'day_of_week,slot' })
    setSaving(false)
    showToast('时段配置保存成功', 'success')
    loadConfig()
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">时段人数配置</h2>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存配置'}
        </button>
      </div>

      <p style={{ fontSize: 14, color: '#999', marginBottom: 16 }}>
        设置每天每个时段需要安排几名同学值班。设为0表示该时段不需要值班。
        周六日默认不需要值班（0人），调休时可调整。
      </p>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>时段</th>
                {DAYS.map((d, i) => (
                  <th key={d} style={i >= 5 ? { background: '#FFF8E1', color: '#8B6914' } : {}}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map(s => (
                <tr key={s}>
                  <td style={{ fontWeight: 600 }}>{s}</td>
                  {DAY_NUMBERS.map(d => {
                    const key = `${d}_${s}`
                    const isWeekend = d >= 6
                    return (
                      <td key={d}>
                        <input
                          type="number"
                          className="form-input"
                          style={{
                            width: 80, textAlign: 'center', margin: '0 auto',
                            background: isWeekend ? '#FFFDF5' : undefined
                          }}
                          min="0" max="10"
                          value={config[key]?.count ?? (isWeekend ? 0 : 1)}
                          onChange={e => setCount(d, s, e.target.value)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
