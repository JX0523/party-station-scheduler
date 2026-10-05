/**
 * HolidayPanel — 放假设置（2026-09-24 新增）
 *
 * 功能：
 *  - 选择「开始日期 ~ 结束日期」，一键把区间内每一天设为放假（写入 day_config，is_workday=false）
 *  - 放假期间系统不再自动排班（算法按 day_config 的工作日列表执行，整周放假也不回退）
 *  - 展示已设置的放假日，可按周取消
 *  - 可选：清除这些日期上已生成的排班（仅未锁定周，需确认）
 *
 * 周次换算：**自动推算「第1周周一」**（依据 当前第几周 + 今天日期），管理员无需手工填写；
 *          推算不准时可在面板里手动修正（仅本机记忆）。
 *          真正的放假配置存在数据库 day_config，所有电脑共享。
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  isMonday, expandDateRange, toWeekDaySet, groupHolidayRows, weekdayCN,
  inferSemesterStart, describeWeeks, formatMD, describeHolidayPlan
} from '../lib/holiday-dates.js'

const LS_OVERRIDE = 'dsh_semester_start_override' // 仅当自动推算不准时使用

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function HolidayPanel({ config, onChanged }) {
  const [override, setOverride] = useState(() => localStorage.getItem(LS_OVERRIDE) || '')
  const [showOverride, setShowOverride] = useState(false)
  const [from, setFrom] = useState(todayStr)
  const [to, setTo] = useState(todayStr)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  const totalWeeks = config?.total_weeks || 20
  const currentWeek = config?.current_week || 1

  // 自动推算第1周周一（无需用户填写）；若有手动修正则优先
  const autoStart = inferSemesterStart(currentWeek)
  const startDate = override || autoStart || ''
  const info = describeWeeks(startDate, currentWeek)

  async function loadRows() {
    const { data } = await supabase.from('day_config').select('*').order('week_number').order('day_of_week')
    setRows(data || [])
  }

  useEffect(() => {
    let cancelled = false
    supabase.from('day_config').select('*').order('week_number').order('day_of_week')
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [])

  function saveOverride(v) {
    setOverride(v)
    if (v) localStorage.setItem(LS_OVERRIDE, v)
    else localStorage.removeItem(LS_OVERRIDE)
  }

  function flash(type, text) { setMsg({ type, text }); setTimeout(() => setMsg(null), 7000) }

  // 设为放假
  async function applyHoliday() {
    if (!startDate) return flash('error', '无法推算周次，请在下方「手动修正」里填写第1周周一')
    if (override && !isMonday(override)) return flash('error', '手动指定的「第1周周一」必须是周一，请检查')
    const r = expandDateRange(from, to, startDate, totalWeeks)
    if (r.error) return flash('error', r.error)
    if (r.days.length === 0) return flash('error', '所选区间没有落在学期周次内（请检查日期或「当前周」设置）')

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
      flash('success', `已设置放假 ${done} 天，涉及第 ${weeks} 周${extra}。请到「排班管理」重新生成相关周，或点「清理放假日的排班」。`)
    } finally { setBusy(false) }
  }

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
      flash('success', `已清理 ${removed} 个放假时段上已有的排班。建议到「排班管理」点一次「重新生成」，把有空缺的周补齐。`)
    } finally { setBusy(false) }
  }

  // 实时预览：点「设为放假」之前就能核对周次（防止「当前周」没更新造成偏移）
  const preview = (startDate && from && to) ? expandDateRange(from, to, startDate, totalWeeks) : null
  const previewText = preview && !preview.error ? describeHolidayPlan(preview.days) : ''

  const grouped = groupHolidayRows(rows, startDate || null)
  const holidayCount = rows.filter(r => r.is_workday === false).length

  return (
    <div className="card" id="holiday-panel" style={{ marginBottom: 20, border: '2px solid #C41E3A' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>🎉 放假设置 <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 11 }}>新功能</span></span>
        <button className="btn btn-small btn-secondary" onClick={() => setShowHelp(!showHelp)}>{showHelp ? '收起说明' : '怎么用？'}</button>
      </div>

      <p style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
        选好「开始 / 结束日期」点一下就行，<strong>放假当天系统不会自动排班</strong>（支持连续多天，如连放 13 天）。
        设置后到「排班管理」重新生成相关周，或用下方按钮一键清理。
      </p>

      {/* 自动推算信息（无需用户填写） */}
      {info && (
        <div style={{ fontSize: 12.5, color: '#1565c0', background: '#E3F2FD', border: '1px solid #90CAF9',
          borderRadius: 6, padding: '7px 12px', marginBottom: 10, lineHeight: 1.7 }}>
          📅 系统已自动推算（按「当前第 {currentWeek} 周」）：第1周周一 = <strong>{formatMD(info.week1.from)}</strong>
          （{formatMD(info.week1.from)} ~ {formatMD(info.week1.to)}）；
          本周 = <strong>{formatMD(info.current.from)} ~ {formatMD(info.current.to)}</strong>
          <button className="btn btn-small btn-secondary" style={{ marginLeft: 10, padding: '1px 8px', fontSize: 11 }}
            onClick={() => setShowOverride(!showOverride)}>{showOverride ? '收起修正' : '推算不准？修正'}</button>
        </div>
      )}

      {showOverride && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10,
          background: '#FFF8F0', border: '1px dashed #E0C9A6', borderRadius: 6, padding: '8px 12px' }}>
          <div>
            <label className="form-label" style={{ fontSize: 12 }}>手动指定第1周周一（必须是周一）</label>
            <input type="date" className="form-input" style={{ width: 160 }} value={override}
              onChange={e => saveOverride(e.target.value)} />
          </div>
          <button className="btn btn-small btn-secondary" onClick={() => { saveOverride(''); setShowOverride(false) }}>恢复自动推算</button>
          {override && !isMonday(override) && <span style={{ fontSize: 12, color: '#c62828' }}>⚠️ 不是周一，请修正</span>}
        </div>
      )}

      {/* 输入区（只选日期） */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>放假开始</label>
          <input type="date" className="form-input" style={{ width: 165 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>放假结束</label>
          <input type="date" className="form-input" style={{ width: 165 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={applyHoliday} disabled={busy}>{busy ? '处理中...' : '🌴 设为放假'}</button>
        <button className="btn btn-secondary" onClick={clearAssignments} disabled={busy || holidayCount === 0}>🧹 清理放假日的排班</button>
      </div>

      {/* 放假预览：核对周次用 */}
      {preview && (
        <div style={{ fontSize: 13, marginBottom: 10, padding: '8px 12px', borderRadius: 6,
          background: preview.error ? '#ffebee' : '#f1f8e9',
          color: preview.error ? '#c62828' : '#33691e',
          border: '1px solid ' + (preview.error ? '#ef9a9a' : '#c5e1a5') }}>
          {preview.error ? (
            <span>⚠️ {preview.error}</span>
          ) : (
            <span>
              🔍 <strong>将设置 {preview.days.length} 天放假</strong>：{previewText || '（无）'}
              {preview.outOfRange && preview.outOfRange.length > 0 ? '（另有 ' + preview.outOfRange.length + ' 天超出学期周数，会被忽略）' : ''}
              <div style={{ marginTop: 4, color: '#7cb342', fontSize: 12 }}>
                请核对上面的周次是否符合实际；若不对，说明「当前第 {currentWeek} 周」该更新了
                （去「学期设置」修改，或点上方「推算不准？修正」）。
              </div>
            </span>
          )}
        </div>
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