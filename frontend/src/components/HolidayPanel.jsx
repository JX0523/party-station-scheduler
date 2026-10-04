/**
 * HolidayPanel — 放假设置（2026-09-24 新增）
 *
 * 功能：
 *  - 选择「开始日期 ~ 结束日期」，一键把区间内每一天设为放假（写入 day_config，is_workday=false）
 *  - 放假期间系统不再自动排班（算法按 day_config 的工作日列表执行，整周放假也不回退）
 *  - 展示已设置的放假日，可按周取消
 *  - 可选：清除这些日期上已生成的排班（仅未锁定周，需确认）
 *
 * 说明：日期→周次换算需要「第1周周一」的日期，保存在本机浏览器（localStorage）；
 *      真正的放假配置存在数据库 day_config，所有电脑共享。
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  isMonday, expandDateRange, toWeekDaySet, groupHolidayRows, weekdayCN
} from '../lib/holiday-dates.js'

const LS_KEY = 'dsh_semester_start_date'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function HolidayPanel({ config, onChanged }) {
  const [startDate, setStartDate] = useState(() => localStorage.getItem(LS_KEY) || '')
  const [from, setFrom] = useState(todayStr)
  const [to, setTo] = useState(todayStr)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // {type,text}
  const [showHelp, setShowHelp] = useState(false)

  const totalWeeks = config?.total_weeks || 20
  const currentWeek = config?.current_week || 1

  async function loadRows() {
    const { data } = await supabase.from('day_config').select('*').order('week_number').order('day_of_week')
    setRows(data || [])
  }

  // 首次加载：在回调里 setState（异步），避免 effect 内同步 setState
  useEffect(() => {
    let cancelled = false
    supabase.from('day_config').select('*').order('week_number').order('day_of_week')
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [])

  function saveStart(v) {
    setStartDate(v)
    if (v) localStorage.setItem(LS_KEY, v)
    else localStorage.removeItem(LS_KEY)
  }

  function flash(type, text) { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000) }

  // 设为放假
  async function applyHoliday() {
    if (!startDate) return flash('error', '请先填写「第1周周一」的日期（用于换算周次）')
    if (!isMonday(startDate)) return flash('error', '「第1周周一」必须填周一那一天，请检查')
    const r = expandDateRange(from, to, startDate, totalWeeks)
    if (r.error) return flash('error', r.error)
    if (r.days.length === 0) return flash('error', '所选区间没有落在学期周次内（请检查日期或总周数）')

    setBusy(true)
    try {
      const set = toWeekDaySet(r.days)
      let done = 0
      for (const item of set) {
        const { data: exist } = await supabase.from('day_config')
          .select('id').eq('week_number', item.week).eq('day_of_week', item.day).maybeSingle()
        if (exist) {
          await supabase.from('day_config').update({
            is_workday: false, substitute_for: null, substitute_for_odd: null, substitute_for_even: null
          }).eq('id', exist.id)
        } else {
          await supabase.from('day_config').insert({
            week_number: item.week, day_of_week: item.day, is_workday: false
          })
        }
        done++
      }
      await loadRows()
      if (onChanged) onChanged()
      const weeks = [...new Set(set.map(x => x.week))].join('、')
      const extra = r.outOfRange && r.outOfRange.length ? `（另有 ${r.outOfRange.length} 天超出学期周数，已忽略）` : ''
      flash('success', `已设置放假 ${done} 天，涉及第 ${weeks} 周${extra}。请到「排班管理」重新生成相关周，或点下方按钮清理已有排班。`)
    } finally { setBusy(false) }
  }

  // 取消某一周的放假（删除 is_workday=false 的记录，恢复默认周一~周五）
  async function cancelWeek(week) {
    if (!confirm(`确定取消第 ${week} 周的放假设置吗？\n\n该周将恢复为默认工作日（周一~周五）。`)) return
    setBusy(true)
    try {
      await supabase.from('day_config').delete().eq('week_number', week).eq('is_workday', false)
      await loadRows()
      if (onChanged) onChanged()
      flash('success', `已取消第 ${week} 周的放假设置`)
    } finally { setBusy(false) }
  }

  // 清理放假日上已生成的排班（仅未锁定周）
  async function clearAssignments() {
    const holidays = rows.filter(x => x.is_workday === false && x.week_number >= currentWeek)
    if (holidays.length === 0) return flash('info', '没有可清理的排班（放假日期都属于已锁定的历史周）')
    if (!confirm(`确定删除「放假日期」上已生成的排班吗？\n\n共 ${holidays.length} 个时段记录，只影响第 ${currentWeek} 周及以后（历史周不动），此操作不可撤销。`)) return
    setBusy(true)
    try {
      let removed = 0
      for (const h of holidays) {
        const { error } = await supabase.from('assignments').delete()
          .eq('week_number', h.week_number).eq('day_of_week', h.day_of_week)
        if (!error) removed++
      }
      flash('success', `已清理 ${removed} 个放假时段上已有的排班。建议回到「排班管理」点一次重新生成，把有空缺的周补齐。`)
    } finally { setBusy(false) }
  }

  const grouped = groupHolidayRows(rows, startDate || null)
  const holidayCount = rows.filter(r => r.is_workday === false).length

  return (
    <div className="card" id="holiday-panel" style={{ marginBottom: 20, border: '2px solid #C41E3A' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>🎉 放假设置 <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 11 }}>新功能</span></span>
        <button className="btn btn-small btn-secondary" onClick={() => setShowHelp(!showHelp)}>{showHelp ? '收起说明' : '怎么用？'}</button>
      </div>

      <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        选择日期即可放假，<strong>放假当天系统不会自动排班</strong>（支持连续多天，如连放 13 天假）。
        设置后请到「排班管理」对相关周点一次「重新生成排班」。
      </p>

      {showHelp && (
        <div style={{ background: '#FFF8F0', border: '1px dashed #E0C9A6', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#7a5c3a', lineHeight: 1.8 }}>
          <div>① <strong>先填「第1周周一」</strong>：打开「学期设置」确认学期从哪一周开始，填那一周的周一日期（必须是周一）。<br/>
            ② 选好<strong>开始/结束日期</strong> → 点「设为放假」。<br/>
            ③ 假期结束后想恢复：在下方列表点「取消该周放假」，或把该天改回工作日。<br/>
            ④ 已生成的排班不会自动消失：点「重新生成」或使用「清理放假日的排班」。</div>
          <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>
            「第1周周一」只保存在本机浏览器，用于日期换算；放假配置本身存在云端，所有电脑共享。
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>第1周周一（换算用）</label>
          <input type="date" className="form-input" style={{ width: 160 }} value={startDate}
            onChange={e => saveStart(e.target.value)} />
        </div>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>放假开始</label>
          <input type="date" className="form-input" style={{ width: 160 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>放假结束</label>
          <input type="date" className="form-input" style={{ width: 160 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={applyHoliday} disabled={busy}>{busy ? '处理中...' : '🌴 设为放假'}</button>
        <button className="btn btn-secondary" onClick={clearAssignments} disabled={busy || holidayCount === 0}>🧹 清理放假日的排班</button>
      </div>

      {startDate && !isMonday(startDate) && (
        <div style={{ fontSize: 13, color: '#c62828', marginBottom: 8 }}>⚠️ 填写的「第1周周一」不是周一，请修正（否则周次会算错）</div>
      )}

      {msg && (
        <div style={{ fontSize: 13, marginBottom: 10, padding: '8px 12px', borderRadius: 6,
          background: msg.type === 'error' ? '#ffebee' : msg.type === 'success' ? '#e8f5e9' : '#e3f2fd',
          color: msg.type === 'error' ? '#c62828' : msg.type === 'success' ? '#2e7d32' : '#1565c0' }}>
          {msg.text}
        </div>
      )}

      {/* 已设置放假列表 */}
      <div style={{ fontSize: 13 }}>
        <div style={{ color: '#999', marginBottom: 6 }}>已设置放假：共 {holidayCount} 天</div>
        {grouped.length === 0 ? (
          <div style={{ color: '#bbb' }}>（暂无）</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped.map(g => {
              const locked = g.week < currentWeek
              const daysText = g.days.map(d =>
                d.dateLabel ? `${weekdayCN(d.day)}(${d.dateLabel})` : weekdayCN(d.day)
              ).join('、')
              return (
                <div key={g.week} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: '6px 10px' }}>
                  <strong>第 {g.week} 周</strong>
                  <span style={{ color: '#666' }}>{daysText}</span>
                  {locked && <span className="badge" style={{ background: '#999', color: '#fff', fontSize: 11 }}>已锁定（历史周）</span>}
                  {!locked && (
                    <button className="btn btn-small btn-secondary" onClick={() => cancelWeek(g.week)} disabled={busy}>取消该周放假</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}