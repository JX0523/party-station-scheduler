/**
 * DaySelector — 工作日配置组件
 * 用于每周设置哪几天上班、哪几天放假/调休
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']
const DAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * @param {number} weekNumber - 第几周
 * @param {boolean} locked - 是否锁定
 * @param {function} onChange - 变更回调
 */
export default function DaySelector({ weekNumber, locked, onChange }) {
  // dayConfig[1..7] = true/false (true=工作日需值班)
  const [dayConfig, setDayConfig] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadDayConfig()
  }, [weekNumber])

  async function loadDayConfig() {
    const { data } = await supabase
      .from('day_config')
      .select('*')
      .eq('week_number', weekNumber)

    const map = {}
    // 默认：周一至周五工作日，周六日休息
    for (let d = 1; d <= 7; d++) {
      map[d] = d <= 5
    }
    if (data) {
      data.forEach(row => { map[row.day_of_week] = row.is_workday })
    }
    setDayConfig(map)
    if (onChange) onChange(map)
  }

  async function toggle(day) {
    if (locked) return
    const newVal = !dayConfig[day]
    const newConfig = { ...dayConfig, [day]: newVal }
    setDayConfig(newConfig)
    if (onChange) onChange(newConfig)

    // Upsert
    setSaving(true)
    const { data: existing } = await supabase
      .from('day_config')
      .select('id')
      .eq('week_number', weekNumber)
      .eq('day_of_week', day)
      .maybeSingle()

    if (existing) {
      await supabase.from('day_config').update({ is_workday: newVal }).eq('id', existing.id)
    } else {
      await supabase.from('day_config').insert({
        week_number: weekNumber,
        day_of_week: day,
        is_workday: newVal
      })
    }
    setSaving(false)
  }

  const workdayCount = Object.values(dayConfig).filter(Boolean).length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '8px 12px', background: '#fafafa', borderRadius: 8,
      border: '1px solid #eee', fontSize: 13
    }}>
      <span style={{ fontWeight: 600, color: '#666', marginRight: 4 }}>工作日:</span>
      {[1, 2, 3, 4, 5, 6, 7].map(day => {
        const isOn = dayConfig[day]
        const isWeekend = day >= 6
        return (
          <button
            key={day}
            onClick={() => toggle(day)}
            disabled={locked}
            title={locked ? '已锁定' : `点击切换${DAY_FULL[day - 1]}`}
            style={{
              padding: '4px 10px',
              borderRadius: 14,
              border: isOn ? '2px solid #2E7D32' : '2px solid #ddd',
              background: isOn ? (isWeekend ? '#FFF3E0' : '#E8F5E9') : '#fff',
              color: isOn ? (isWeekend ? '#E65100' : '#2E7D32') : '#ccc',
              fontWeight: isOn ? 600 : 400,
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.5 : 1,
              fontSize: 12,
              transition: 'all 0.15s',
              minWidth: 36
            }}
          >
            {DAY_FULL[day - 1]}
            {isOn && isWeekend && <span style={{ fontSize: 10, marginLeft: 2 }}>调</span>}
            {!isOn && !isWeekend && <span style={{ fontSize: 10, marginLeft: 2 }}>休</span>}
          </button>
        )
      })}
      <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
        {workdayCount}个工作日
        {saving && <span style={{ marginLeft: 6, color: '#C41E3A' }}>保存中...</span>}
      </span>
    </div>
  )
}

export { DAY_FULL }
