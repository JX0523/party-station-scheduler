import Navbar from './Navbar.jsx'

export default function Layout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <footer style={{
        textAlign: 'center', padding: '16px', fontSize: '13px',
        color: '#999', borderTop: '1px solid #E8D5D0'
      }}>
        党员工作站排班系统 · 内部管理工具
      </footer>
    </div>
  )
}
