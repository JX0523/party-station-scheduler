import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'

// GitHub Pages 部署时 BASE_URL 为 /party-station-scheduler/，Netlify/Vercel 为 /
const basename = import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL : undefined

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>,
)
