import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import './Navbar.css'

const NAV_ITEMS = [
  { path: '/', label: '🏠 首页' },
  { path: '/members', label: '👥 成员管理' },
  { path: '/schedule', label: '📅 课表管理' },
  { path: '/slot-config', label: '⚙️ 时段配置' },
  { path: '/scheduling', label: '📋 排班管理' },
  { path: '/stats', label: '📊 统计导出' },
  { path: '/semester', label: '📆 学期设置' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand" onClick={() => navigate('/')}>
          <span className="navbar-icon">⭐</span>
          <span className="navbar-title">党员工作站排班系统</span>
        </div>

        <div className="navbar-links">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              className={`navbar-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="navbar-actions">
          <span className="navbar-user">
            {supabase.auth.getSession().then ? '' : ''}
          </span>
          <button className="btn btn-small btn-secondary" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>
    </nav>
  )
}
