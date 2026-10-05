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
  const [form, setForm] = useState({ name: '', role: '部员', phone: '', active: true })

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    const { data } = await supabase.from('members').select('*').order('created_at')
    setMembers(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditingMember(null)
    setForm({ name: '', role: '部员', phone: '', active: true })
    setShowModal(true)
  }

  function openEdit(m) {
    setEditingMember(m)
    setForm({ name: m.name, role: m.role, phone: m.phone || '', active: m.active !== false })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return showToast('请输入姓名', 'error')
    const payload = { name: form.name.trim(), role: form.role, phone: form.phone, active: form.active !== false }
    const { error } = editingMember
      ? await supabase.from('members').update(payload).eq('id', editingMember.id)
      : await supabase.from('members').insert(payload)
    if (error) return showToast('保存失败：' + error.message, 'error')
    setShowModal(false)
    loadMembers()
    showToast(editingMember ? '修改成功' : '添加成功', 'success')
  }

  async function handleDelete(m) {
    // 先查该成员有多少值班记录：数据库外键是 ON DELETE CASCADE，删除成员会连带删除全部记录
    const { count } = await supabase.from('assignments')
      .select('id', { count: 'exact', head: true }).eq('member_id', m.id)
    const n = count || 0
    const msg = n > 0
      ? '⚠️ 「' + m.name + '」有 ' + n + ' 条值班记录（含已完成的周）。\n\n' +
        '删除成员会【一并永久删除这些记录】，历史统计将随之改变，且无法恢复。\n\n' +
        '如果对方只是退出或暂时不参与，请点「取消」，改用【停用】——停用会保留全部历史记录。\n\n' +
        '确定仍要删除吗？'
      : '确定删除成员「' + m.name + '」吗？'
    if (!confirm(msg)) return
    const { error } = await supabase.from('members').delete().eq('id', m.id)
    if (error) return showToast('删除失败：' + error.message, 'error')
    loadMembers()
    showToast('已删除', 'success')
  }

  // 停用 / 启用：停用后不参与自动排班，但历史值班记录与统计全部保留（推荐用于退出成员）
  async function handleToggleActive(m) {
    const next = m.active === false
    if (!next && !confirm('确定停用「' + m.name + '」吗？\n\n停用后：\n· 不再参与自动排班\n· 历史值班记录与统计【全部保留】\n· 随时可点「启用」恢复\n\n（这是成员退出的推荐做法）')) return
    const { error } = await supabase.from('members').update({ active: next }).eq('id', m.id)
    if (error) return showToast('操作失败：' + error.message, 'error')
    loadMembers()
    showToast(next ? '已启用（参与排班）' : '已停用（保留历史，不再参与排班）', 'success')
  }

  const VALID_ROLES = ['部员', '部长', '主席团']

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet)
        const toInsert = []
        let skipped = 0
        for (const r of rows) {
          const name = String(r['姓名'] || r['name'] || '').trim()
          if (!name) continue
          const role = String(r['角色'] || r['role'] || '部员').trim()
          if (!VALID_ROLES.includes(role)) { skipped++; continue } // 角色无效则跳过该行
          const phone = String(r['手机'] || r['phone'] || '').trim()
          toInsert.push({ name, role, phone, active: true })
        }
        if (toInsert.length === 0) return showToast('未识别到有效数据，请检查Excel格式（角色必须是：部员/部长/主席团）', 'error')
        const { error } = await supabase.from('members').insert(toInsert)
        if (error) return showToast('导入失败：' + error.message, 'error')
        loadMembers()
        showToast('成功导入 ' + toInsert.length + ' 人' + (skipped > 0 ? '，跳过 ' + skipped + ' 行（角色无效或姓名为空）' : ''), 'success')
      } catch (err) {
        showToast('导入失败：' + (err.message || '文件解析错误'), 'error')
      }
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
        <span className="badge" style={{ background: '#2E7D32', color: '#fff' }}>在职 {members.filter(m => m.active !== false).length}人</span>
        {members.some(m => m.active === false) && (
          <span className="badge" style={{ background: '#999', color: '#fff' }}>已停用 {members.filter(m => m.active === false).length}人</span>
        )}
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
              <tr><th>姓名</th><th>角色</th><th>手机号</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, color: '#999' }}>暂无成员数据，请添加成员</td></tr>
              ) : filtered.map(m => (
                <tr key={m.id} style={m.active === false ? { opacity: 0.55 } : undefined}>
                  <td><strong>{m.name}</strong></td>
                  <td><span className={`badge ${m.role === '部员' ? 'badge-red' : m.role === '部长' ? 'badge-gold' : 'badge-green'}`}>{m.role}</span></td>
                  <td>{m.phone || '-'}</td>
                  <td>
                    {m.active === false
                      ? <span className="badge" style={{ background: '#999', color: '#fff' }}>已停用</span>
                      : <span className="badge" style={{ background: '#2E7D32', color: '#fff' }}>在职</span>}
                  </td>
                  <td>
                    <button className="btn btn-small btn-secondary mr-8" onClick={() => openEdit(m)}>编辑</button>
                    <button className="btn btn-small btn-secondary mr-8" onClick={() => handleToggleActive(m)}>
                      {m.active === false ? '启用' : '停用'}
                    </button>
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(m)}>删除</button>
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
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.active !== false}
                  onChange={e => setForm({ ...form, active: e.target.checked })} />
                参与排班（在职）
              </label>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                取消勾选＝停用：不再参与自动排班，但**历史值班记录与统计全部保留**。
              </div>
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
