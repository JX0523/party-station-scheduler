import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './lib/supabase.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Members from './pages/Members.jsx'
import CourseSchedule from './pages/CourseSchedule.jsx'
import SlotConfig from './pages/SlotConfig.jsx'
import Scheduling from './pages/Scheduling.jsx'
import Stats from './pages/Stats.jsx'
import SemesterConfig from './pages/SemesterConfig.jsx'

export const AuthContext = createContext(null)

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#FFF8F0'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <p style={{ color: '#666' }}>加载中...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <AuthContext.Provider value={session}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/members" element={<Members />} />
          <Route path="/schedule" element={<CourseSchedule />} />
          <Route path="/slot-config" element={<SlotConfig />} />
          <Route path="/scheduling" element={<Scheduling />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/semester" element={<SemesterConfig />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthContext.Provider>
  )
}

export default App
