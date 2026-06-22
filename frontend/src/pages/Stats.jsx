import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

export default function Stats() {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('semester') // 'week' | 'semester'
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [semesterConfig, setSemesterConfig] = useState(null)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => { loadStats() }, [viewMode, selectedWeek])

  async function loadConfig() {
    const { data: sem } = await supabase.from('semester_config').select('*').limit(1).single()
    setSemesterConfig(sem)
    if (sem?.current_week) {
      setSelectedWeek(sem.current_week)
    }
  }

  async function loadStats() {
    setLoading(true)

    if (viewMode === 'week') {
      // 按周统计
      const { data: members } = await supabase.from('members').select('*').eq('active', true).order('role').order('name')
      const { data: assignments } = await supabase.from('assignments')
        .select('*').eq('week_number', selectedWeek)

      const memberMap = {}
      if (members) members.forEach(m => {
        memberMap[m.id] = { name: m.name, role: m.role, normalHours: 0, leaveCount: 0 }
      })
      if (assignments) {
        assignments.forEach(a => {
          if (memberMap[a.member_id]) {
            if (a.status === '请假') {
              // 请假不计时长
              memberMap[a.member_id].leaveCount += 1
            } else {
              memberMap[a.member_id].normalHours += 1.5
            }
          }
        })
      }

      const result = Object.entries(memberMap).map(([id, info]) => ({
        id, ...info,
        totalHours: info.normalHours  // 总时长 = 正常时长（请假不计）
      })).filter(s => s.totalHours > 0 || s.leaveCount > 0)
        .sort((a, b) => b.totalHours - a.totalHours || b.leaveCount - a.leaveCount)

      setStats(result)
    } else {
      // 整学期汇总
      const { data: members } = await supabase.from('members').select('*').eq('active', true).order('role').order('name')
      const { data: assignments } = await supabase.from('assignments').select('*')

      const memberMap = {}
      if (members) members.forEach(m => {
        memberMap[m.id] = { name: m.name, role: m.role, normalHours: 0, leaveCount: 0 }
      })
      if (assignments) {
        assignments.forEach(a => {
          if (memberMap[a.member_id]) {
            if (a.status === '请假') {
              // 请假不计时长
              memberMap[a.member_id].leaveCount += 1
            } else {
              memberMap[a.member_id].normalHours += 1.5
            }
          }
        })
      }

      const result = Object.entries(memberMap).map(([id, info]) => ({
        id, ...info,
        totalHours: info.normalHours  // 总时长 = 正常时长（请假不计）
      })).sort((a, b) => b.totalHours - a.totalHours || b.leaveCount - a.leaveCount)

      setStats(result)
    }
    setLoading(false)
  }

  function handleExport() {
    const data = stats.map(s => ({
      '姓名': s.name,
      '角色': s.role,
      '正常值班时长(小时)': s.normalHours,
      '请假次数': s.leaveCount,
      '实际总时长(小时)': s.totalHours,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '值班统计')
    const title = viewMode === 'week' ? `第${selectedWeek}周值班统计` : '学期值班统计汇总'
    XLSX.writeFile(wb, `${title}.xlsx`)
  }

  const totalNormal = stats.reduce((s, i) => s + i.normalHours, 0)
  const totalLeave = stats.reduce((s, i) => s + i.leaveCount, 0)
  const totalPeople = stats.filter(s => s.normalHours > 0).length

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">统计导出</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-small ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('week')}>按周查看</button>
          <button className={`btn btn-small ${viewMode === 'semester' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('semester')}>学期汇总</button>
          <button className="btn btn-primary" onClick={handleExport}>📥 导出Excel</button>
        </div>
      </div>

      {viewMode === 'week' && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label className="form-label" style={{ margin: 0 }}>第</label>
          <input type="number" className="form-input" style={{ width: 70, textAlign: 'center' }}
            min="1" value={selectedWeek} onChange={e => setSelectedWeek(parseInt(e.target.value) || 1)} />
          <label className="form-label" style={{ margin: 0 }}>周</label>
          {semesterConfig?.current_week && (
            <span style={{ fontSize: 13, color: '#999', marginLeft: 8 }}>
              （当前第 {semesterConfig.current_week} 周）
            </span>
          )}
        </div>
      )}

      {/* 汇总卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#999' }}>实际值班总时长</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#C41E3A' }}>{totalNormal.toFixed(1)}h</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#999' }}>请假人次</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#E65100' }}>{totalLeave}次</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#999' }}>已值班人数</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalPeople}人</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#999' }}>平均每人时长</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2E7D32' }}>
            {totalPeople > 0 ? (totalNormal / totalPeople).toFixed(1) : '0'}h
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <p>加载中...</p> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>实际值班(h)</th>
                  <th>请假次数</th>
                  <th>合计有效时长(h)</th>
                </tr>
              </thead>
              <tbody>
                {stats.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 40, color: '#999' }}>暂无统计数据</td></tr>
                ) : stats.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td><span className={`badge ${s.role === '部员' ? 'badge-red' : s.role === '部长' ? 'badge-gold' : 'badge-green'}`}>{s.role}</span></td>
                    <td>{s.normalHours.toFixed(1)}</td>
                    <td style={{ color: s.leaveCount > 0 ? '#E65100' : '#999' }}>
                      {s.leaveCount > 0 ? `${s.leaveCount}次（不计时长）` : '-'}
                    </td>
                    <td><strong>{s.totalHours.toFixed(1)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
