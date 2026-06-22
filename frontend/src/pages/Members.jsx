import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

export default function Members() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [filterRole, setFilterRole] = useState('全部')
  const [toast, setToast] = useState(null)

  // 表单
  const [form, setForm] = useState({ name: '', role: '部员', phone: '' })

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').order('created_at')
    setMembers(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditingMember(null)
    setForm({ name: '', role: '部员', phone: '' })
    setShowModal(true)
  }

  function openEdit(m) {
    setEditingMember(m)
    setForm({ name: m.name, role: m.role, phone: m.phone || '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return showToast('请输入姓名', 'error')
    if (editingMember) {
      await supabase.from('members').update(form).eq('id', editingMember.id)
    } else {
      await supabase.from('members').insert(form)
    }
    setShowModal(false)
    loadMembers()
    showToast(editingMember ? '修改成功' : '添加成功', 'success')
  }

  async function handleDelete(id) {
    if (!confirm('确定删除该成员吗？')) return
    await supabase.from('members').delete().eq('id', id)
    loadMembers()
    showToast('已删除', 'success')
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet)
      const toInsert = rows.map(r => ({
        name: String(r['姓名'] || r['name'] || ''),
        role: String(r['角色'] || r['role'] || '部员'),
        phone: String(r['手机'] || r['phone'] || ''),
        active: true
      })).filter(r => r.name)
      if (toInsert.length === 0) return showToast('未识别到有效数据，请检查Excel格式', 'error')
      await supabase.from('members').insert(toInsert)
      loadMembers()
      showToast(`成功导入 ${toInsert.length} 人`, 'success')
    }
    reader.readAsBinaryString(file)
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = filterRole === '全部' ? members : members.filter(m => m.role === filterRole)
  const countByRole = { 部员: members.filter(m => m.role === '部员').length, 部长: members.filter(m => m.role === '部长').length, 主席团: members.filter(m => m.role === '主席团').length }

  if (loading) return <div className="page-container"><p>加载中...</p></div>

  return (
    <div className="page-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2 className="page-title">成员管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
            📥 批量导入
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-primary" onClick={openAdd}>+ 添加成员</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <span className="badge badge-red">部员 {countByRole.部员}人</span>
        <span className="badge badge-gold">部长 {countByRole.部长}人</span>
        <span className="badge badge-green">主席团 {countByRole.主席团}人</span>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['全部', '部员', '部长', '主席团'].map(r => (
          <button key={r} className={`btn btn-small ${filterRole === r ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterRole(r)}>{r}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>姓名</th><th>角色</th><th>手机号</th><th>操作</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, color: '#999' }}>暂无成员数据，请添加成员</td></tr>
              ) : filtered.map(m => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td><span className={`badge ${m.role === '部员' ? 'badge-red' : m.role === '部长' ? 'badge-gold' : 'badge-green'}`}>{m.role}</span></td>
                  <td>{m.phone || '-'}</td>
                  <td>
                    <button className="btn btn-small btn-secondary mr-8" onClick={() => openEdit(m)}>编辑</button>
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(m.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingMember ? '编辑成员' : '添加成员'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">姓名</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="请输入姓名" />
            </div>
            <div className="form-group">
              <label className="form-label">角色</label>
              <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="部员">部员</option>
                <option value="部长">部长</option>
                <option value="主席团">主席团</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">手机号（选填）</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="请输入手机号" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
