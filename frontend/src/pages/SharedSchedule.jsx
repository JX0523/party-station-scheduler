import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

// 只读共享页：指导老师免登录查看最新排班
// 设计：不套 Layout（无导航栏/页脚），字段已在数据库层裁剪（无电话、无角色）
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const SLOTS = ['上午', '下午1', '下午2']

const ERROR_TEXT = {
  invalid_token: '链接无效，请向管理员索取新的分享链接',
  revoked: '该链接已被管理员停用',
  expired: '该链接已过期，请向管理员索取新的链接',
  network: '网络异常，正在自动重试…'
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

export default function SharedSchedule() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  const fetchData = useCallback(async () => {
    if (!token) return setState({ loading: false, error: 'invalid_token', data: null })
    const { data, error } = await supabase.rpc('get_shared_schedule', { p_token: token })
    if (error) {
      // 网络/权限类错误：保留旧数据继续显示，仅标记网络异常
      return setState(prev => ({ loading: false, error: 'network', data: prev.data }))
    }
    if (!data || data.ok !== true) {
      return setState({ loading: false, error: (data && data.error) || 'invalid_token', data: null })
    }
    setState({ loading: false, error: null, data })
  }, [token])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 60000)
    const onVisible = () => { if (!document.hidden) fetchData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchData])

  // 按「星期 + 时段」分组：一组可能有「正常」与「请假」两种记录
  const grid = useMemo(() => {
    const map = {}
    const items = (state.data && state.data.items) || []
    items.forEach(it => {
      const key = `${it.day}_${it.slot}`
      if (!map[key]) map[key] = { normal: [], leave: [] }
      if (it.status === '请假') map[key].leave.push(it.name)
      else map[key].normal.push(it.name)
    })
    return map
  }, [state.data])

  const content = () => {
    if (state.loading) {
      return <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>加载中…</p>
    }
    if (state.error && state.error !== 'network') {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
          <p style={{ color: '#c62828', fontSize: 15, lineHeight: 1.7 }}>{ERROR_TEXT[state.error] || ERROR_TEXT.invalid_token}</p>
        </div>
      )
    }
    if (state.error === 'network') {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#c62828', fontSize: 15 }}>{ERROR_TEXT.network}</p>
          <button onClick={fetchData} style={{ marginTop: 12, padding: '8px 18px', borderRadius: 6, border: '1px solid #C41E3A', background: '#fff', color: '#C41E3A', cursor: 'pointer' }}>立即重试</button>
        </div>
      )
    }
    const items = (state.data && state.data.items) || []
    if (items.length === 0) {
      return <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>本周尚未排班</p>
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 64 }}>时段</th>
              {DAYS.map(d => <th key={d} style={th}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map(slot => (
              <tr key={slot}>
                <td style={{ ...td, background: '#FFF5F5', fontWeight: 600 }}>{slot}</td>
                {DAYS.map((_, idx) => {
                  const g = grid[`${idx + 1}_${slot}`] || { normal: [], leave: [] }
                  return (
                    <td key={idx} style={td}>
                      {g.normal.map(n => <div key={n} style={{ color: '#1b5e20' }}>✓ {n}</div>)}
                      {g.leave.map(n => <div key={n} style={{ color: '#c62828', fontSize: 12 }}>{n}（请假）</div>)}
                      {g.normal.length === 0 && g.leave.length === 0 && <span style={{ color: '#ccc' }}>—</span>}
                      {g.normal.length === 0 && g.leave.length > 0 && (
                        <div style={{ color: '#c62828', fontSize: 11, marginTop: 2 }}>该时段暂无人</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const d = state.data
  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F5' }}>
      <header style={{ background: '#A6192E', color: '#fff', padding: '14px 16px' }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>党员工作站 · 值班安排</div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>
          {d ? `第 ${d.week} 周（${d.week_type}） · 最后更新 ${fmtTime(d.updated_at)} · 服务端时间 ${fmtTime(d.server_time)}` : '只读视图'}
          {state.error === 'network' && d ? ' · 网络异常，显示的是上次数据' : ''}
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '16px 12px 28px' }}>
        {content()}
      </main>
      <footer style={{ textAlign: 'center', fontSize: 12, color: '#999', padding: '0 16px 24px' }}>
        只读视图 · 由管理员分享 · 页面每 60 秒自动刷新
      </footer>
    </div>
  )
}

const th = { border: '1px solid #E8D5D0', padding: '8px 6px', background: '#C41E3A', color: '#fff', fontSize: 13, fontWeight: 600 }
const td = { border: '1px solid #E8D5D0', padding: '8px 6px', textAlign: 'center', background: '#fff', verticalAlign: 'top', minWidth: 78 }
