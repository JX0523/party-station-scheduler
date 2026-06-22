/**
 * DaySelector — 工作日配置组件
 * 用于每周设置哪几天上班、哪几天放假/调休
 * 支持调休日映射课表（如周六补周一的课）
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']
const DAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * @param {number} weekNumber - 第几周
 * @param {boolean} locked - 是否锁定
 * @param {function} onChange - 变更回调，接收 rich dayConfig
 */
export default function DaySelector({ weekNumber, locked, onChange }) {
  // dayConfig[1..7] = { isWorkday: true/false, substituteFor: null|1-5 }
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
    // 默认：周一至周五工作日，周六日休息，无调休映射
    for (let d = 1; d <= 7; d++) {
      map[d] = { isWorkday: d <= 5, substituteFor: null }
    }
    if (data) {
      data.forEach(row => {
        map[row.day_of_week] = {
          isWorkday: row.is_workday,
          substituteFor: row.substitute_for || null
        }
      })
    }
    setDayConfig(map)
    if (onChange) onChange(map)
  }

  async function toggle(day) {
    if (locked) return
    const current = dayConfig[day]
    const isWorkday = typeof current === 'object' ? current.isWorkday : current
    const newIsWorkday = !isWorkday
    let newSub = (typeof current === 'object' ? current.substituteFor : null) || null

    if (newIsWorkday && day >= 6 && !newSub) {
      // 周末调休：自动默认补第一个可用的工作日，找不到则补周五
      const weekdays = [1, 2, 3, 4, 5]
      const firstWorkday = weekdays.find(d => {
        const v = dayConfig[d]
        return typeof v === 'object' ? v.isWorkday : v
      })
      newSub = firstWorkday || 5
    }
    if (!newIsWorkday) newSub = null

    const newConfig = {
      ...dayConfig,
      [day]: { isWorkday: newIsWorkday, substituteFor: newSub }
    }
    setDayConfig(newConfig)
    if (onChange) onChange(newConfig)

    // Upsert DB
    setSaving(true)
    const { data: existing } = await supabase
      .from('day_config')
      .select('id')
      .eq('week_number', weekNumber)
      .eq('day_of_week', day)
      .maybeSingle()

    if (existing) {
      await supabase.from('day_config').update({
        is_workday: newIsWorkday,
        substitute_for: newSub
      }).eq('id', existing.id)
    } else {
      await supabase.from('day_config').insert({
        week_number: weekNumber,
        day_of_week: day,
        is_workday: newIsWorkday,
        substitute_for: newSub
      })
    }
    setSaving(false)
  }

  async function changeSubstitution(day, newSub) {
    const sub = parseInt(newSub)
    const newConfig = {
      ...dayConfig,
      [day]: { isWorkday: true, substituteFor: sub }
    }
    setDayConfig(newConfig)
    if (onChange) onChange(newConfig)

    // Update DB
    const { data: existing } = await supabase
      .from('day_config')
      .select('id')
      .eq('week_number', weekNumber)
      .eq('day_of_week', day)
      .maybeSingle()
    if (existing) {
      await supabase.from('day_config').update({ substitute_for: sub }).eq('id', existing.id)
    }
  }

  const workdayCount = Object.values(dayConfig).filter(v =>
    typeof v === 'object' ? v.isWorkday : v
  ).length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '8px 12px', background: '#fafafa', borderRadius: 8,
      border: '1px solid #eee', fontSize: 13
    }}>
      <span style={{ fontWeight: 600, color: '#666', marginRight: 4 }}>工作日:</span>
      {[1, 2, 3, 4, 5, 6, 7].map(day => {
        const info = dayConfig[day]
        const isOn = typeof info === 'object' ? info.isWorkday : info
        const sub = (typeof info === 'object' && info.substituteFor) || null
        const isWeekend = day >= 6
        const isSubstituted = isOn && isWeekend
        return (
          <div key={day} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button
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
            {isSubstituted && (
              <select
                value={sub || ''}
                onChange={e => changeSubstitution(day, e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 10, padding: '1px 3px',
                  borderRadius: 4, border: '1px solid #ffcc80',
                  background: '#FFF8F0', color: '#E65100',
                  cursor: 'pointer', maxWidth: 56
                }}
                title="选择补哪天的课"
              >
                {[1, 2, 3, 4, 5].map(d => (
                  <option key={d} value={d}>补周{DAY_NAMES[d - 1]}</option>
                ))}
              </select>
            )}
          </div>
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
