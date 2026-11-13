import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'

// GitHub Pages 部署时 BASE_URL 为 /party-station-scheduler/，Netlify/Vercel 为 /
const basename = import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL : undefined

// 深链恢复：public/404.html 会把原路径存进 sessionStorage.redirect 再跳回首页，
// 这里在路由挂载前把地址换回原路径，避免分享链接在 GitHub Pages 上丢失。
const redirectPath = sessionStorage.getItem('redirect')
if (redirectPath && redirectPath !== '/') {
  sessionStorage.removeItem('redirect')
  window.history.replaceState(null, '', redirectPath)
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>,
)
