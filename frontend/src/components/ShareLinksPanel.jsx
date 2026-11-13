import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// 分享链接管理面板：生成 / 列表 / 复制 / 停用
// 挂载位置：学期设置页底部

function genToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function shareUrl(token) {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : base + '/'
  return `${window.location.origin}${prefix}share/${token}`
}

export default function ShareLinksPanel({ currentWeek = 1, totalWeeks = 20 }) {
  const [list, setList] = useState([])
  const [scope, setScope] = useState('current_week')
  const [week, setWeek] = useState(currentWeek)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [latest, setLatest] = useState('')

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000) }

  const load = useCallback(async () => {
    const { data } = await supabase.from('share_links').select('*').order('created_at', { ascending: false })
    setList(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    // 指定周时校验周次，避免写入 NaN
    const weekNum = Number(week)
    if (scope === 'week' && (!Number.isFinite(weekNum) || weekNum < 1 || weekNum > totalWeeks)) {
      return flash('error', `请输入 1—${totalWeeks} 之间的周次`)
    }
    setBusy(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const expires = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
      const token = genToken()
      const { error } = await supabase.from('share_links').insert({
        token,
        scope,
        week_number: scope === 'week' ? weekNum : null,
        expires_at: expires,
        created_by: (userData && userData.user && userData.user.email) || null
      })
      if (error) return flash('error', '生成失败：' + error.message)
      setLatest(shareUrl(token))
      await load()
      flash('success', '已生成分享链接（下方可直接复制）')
    } finally { setBusy(false) }
  }

  async function handleCopy(token) {
    try {
      await navigator.clipboard.writeText(shareUrl(token))
      flash('success', '链接已复制，可直接发给老师')
    } catch {
      flash('error', '复制失败，请手动复制：' + shareUrl(token))
    }
  }

  async function handleToggle(row) {
    const { error } = await supabase.from('share_links').update({ active: !row.active }).eq('id', row.id)
    if (error) return flash('error', '操作失败：' + error.message)
    await load()
    flash('success', row.active ? '已停用该链接' : '已重新启用')
  }

  async function handleDelete(row) {
    if (!confirm('删除后不可恢复（停用即可让链接失效）。确定删除这条记录吗？')) return
    const { error } = await supabase.from('share_links').delete().eq('id', row.id)
    if (error) return flash('error', '删除失败：' + error.message)
    await load()
    flash('success', '已删除')
  }

  return (
    <div className="card" style={{ marginTop: 20, border: '2px solid #1565c0' }}>
      <div className="card-title">🔗 分享给老师（只读链接）</div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
        老师打开链接即可看到<strong>当前最新</strong>值班安排，无需登录、不能修改、看不到电话。
        有人请假或换人，老师刷新页面就能看到。停用后链接立即失效。
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>范围</label>
          <select className="form-input" style={{ width: 150 }} value={scope} onChange={e => setScope(e.target.value)}>
            <option value="current_week">当前周</option>
            <option value="week">指定周</option>
          </select>
        </div>
        {scope === 'week' && (
          <div>
            <label className="form-label" style={{ fontSize: 12 }}>第几周</label>
            <input type="number" min="1" max={totalWeeks} className="form-input" style={{ width: 100 }}
              value={week} onChange={e => setWeek(e.target.value)} />
          </div>
        )}
        <div>
          <label className="form-label" style={{ fontSize: 12 }}>有效期</label>
          <select className="form-input" style={{ width: 130 }} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>7 天</option>
            <option value={30}>30 天</option>
            <option value={0}>长期</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
          {busy ? '生成中…' : '🔗 生成链接'}
        </button>
      </div>

      {msg && (
        <div style={{ fontSize: 13, marginBottom: 10, padding: '8px 12px', borderRadius: 6,
          background: msg.type === 'error' ? '#ffebee' : '#e8f5e9',
          color: msg.type === 'error' ? '#c62828' : '#2e7d32' }}>{msg.text}</div>
      )}

      {latest && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="form-input" readOnly value={latest} onFocus={e => e.target.select()}
            style={{ flex: 1, fontSize: 12.5, fontFamily: 'monospace' }} />
          <button className="btn btn-secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(latest); flash('success', '已复制') }
            catch { flash('error', '请手动选中复制') }
          }}>复制</button>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ color: '#999', fontSize: 13 }}>还没有分享链接</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['令牌（后 6 位）', '范围', '到期', '访问', '最近访问', '状态', '操作'].map(h => (
                <th key={h} style={{ border: '1px solid #e0e0e0', padding: '6px 8px', background: '#f5f5f5' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id}>
                <td style={{ ...cell, fontFamily: 'monospace' }}>…{r.token.slice(-6)}</td>
                <td style={cell}>{r.scope === 'week' ? `第 ${r.week_number} 周` : '当前周'}</td>
                <td style={cell}>{r.expires_at ? new Date(r.expires_at).toLocaleDateString('zh-CN') : '长期'}</td>
                <td style={cell}>{r.view_count || 0}</td>
                <td style={cell}>{r.last_viewed_at ? new Date(r.last_viewed_at).toLocaleString('zh-CN') : '—'}</td>
                <td style={cell}>
                  {(() => {
                    const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now()
                    if (expired) return <span style={{ color: '#ef6c00' }}>已过期</span>
                    return <span style={{ color: r.active ? '#2e7d32' : '#c62828' }}>{r.active ? '生效' : '已停用'}</span>
                  })()}
                </td>
                <td style={cell}>
                  <button className="btn btn-small btn-secondary" onClick={() => handleCopy(r.token)}>复制</button>{' '}
                  <button className="btn btn-small btn-secondary" onClick={() => handleToggle(r)}>{r.active ? '停用' : '启用'}</button>{' '}
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(r)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const cell = { border: '1px solid #e0e0e0', padding: '6px 8px', textAlign: 'center' }
