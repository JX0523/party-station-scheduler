import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={import.meta.env.PROD ? '/party-station-scheduler' : '/'}>
    <App />
  </BrowserRouter>,
)
