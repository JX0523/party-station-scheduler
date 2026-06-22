import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('注册成功！请检查邮箱确认链接（如未收到请在Supabase后台确认）。')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-decoration">
        <div className="login-star-large">★</div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">⭐</div>
          <h1>党员工作站排班系统</h1>
          <p className="login-subtitle">内部管理系统 · 请使用管理员账号登录</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">邮箱</label>
            <input
              type="email"
              className="form-input"
              placeholder="请输入管理员邮箱"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              type="password"
              className="form-input"
              placeholder="请输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className={`login-message ${error.includes('成功') ? 'success' : 'error'}`}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-large login-btn" disabled={loading}>
            {loading ? '处理中...' : (isRegister ? '注 册' : '登 录')}
          </button>
        </form>

        <div className="login-footer">
          <button
            className="login-toggle"
            onClick={() => { setIsRegister(!isRegister); setError('') }}
          >
            {isRegister ? '已有账号？去登录' : '没有账号？注册管理员'}
          </button>
        </div>
      </div>
    </div>
  )
}
