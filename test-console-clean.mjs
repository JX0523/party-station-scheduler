/**
 * 全站「控制台零错误」巡检（test-console-clean.mjs）
 *
 * 目的：逐页渲染整个应用（8 个路由），断言 **没有任何 console.error**。
 * 为什么单独做：功能/文案测试可能都过，但控制台一直在报错（key 重复、状态更新时序、
 * 空数据访问属性等）。这类问题用户看不见，答辩时一开 DevTools 就露馅。
 *
 * 做法：给一个“最小可用”的通用假后端（semester_config 有值、其余返回空数组），
 * 逐页渲染 → 收集 console.error → 断言为 0。
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过控制台巡检'); process.exit(0) }
if (!fs.existsSync(JSDOM_PATH)) { console.log('⚠️  未找到 jsdom，跳过'); process.exit(0) }
const bundleName = fs.readdirSync(path.join(DIST, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'))
if (!bundleName) { console.log('⚠️  没有主包，跳过'); process.exit(0) }
const BUNDLE = path.join(DIST, 'assets', bundleName)

let JSDOM = null
try { ({ JSDOM } = await import(pathToFileURL(JSDOM_PATH).href)) } catch { console.log('⚠️  jsdom 无法加载，跳过'); process.exit(0) }

function readProjectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'frontend', '.env'), 'utf8')
    const m = env.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9-]+)\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  return 'demo-project'
}
const PROJECT_REF = readProjectRef()

function makeSession() {
  return {
    access_token: 'fake', refresh_token: 'fake', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', email: 'admin@example.com' },
  }
}
class FakeBroadcastChannel {
  constructor(n) { this.name = n }
  postMessage() {} close() {} addEventListener() {} removeEventListener() {} dispatchEvent() { return true }
}
function defineGlobal(name, value) {
  try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }) }
  catch { try { globalThis[name] = value } catch { /* 忽略 */ } }
}

const SEM = { id: 'sem1', name: '2026 秋', first_week_is_odd: true, total_weeks: 20, current_week: 3, current_mode: '一般' }

function genericStub() {
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/semester_config')) {
      if (method === 'PATCH' || method === 'POST') return json([{}], 200)
      return json(SEM)
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') return json([{}])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

async function renderPage(route) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com' + route, pretendToBeVisual: true,
  })
  const { window } = dom
  defineGlobal('BroadcastChannel', FakeBroadcastChannel)
  defineGlobal('window', window)
  defineGlobal('document', window.document)
  defineGlobal('navigator', window.navigator)
  defineGlobal('location', window.location)
  defineGlobal('history', window.history)
  defineGlobal('localStorage', window.localStorage)
  defineGlobal('sessionStorage', window.sessionStorage)
  defineGlobal('HTMLElement', window.HTMLElement)
  defineGlobal('Node', window.Node)
  defineGlobal('Event', window.Event)
  defineGlobal('CustomEvent', window.CustomEvent)
  defineGlobal('MutationObserver', window.MutationObserver)
  defineGlobal('getComputedStyle', window.getComputedStyle.bind(window))
  defineGlobal('confirm', () => true)
  window.confirm = () => true
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  genericStub()
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 1100))
  console.error = origin
  return {
    errors,
    html: window.document.getElementById('root')?.innerHTML || '',
  }
}

const ROUTES = [
  ['/', '首页'],
  ['/members', '成员管理'],
  ['/schedule', '课表管理'],
  ['/slot-config', '时段配置'],
  ['/scheduling', '排班管理'],
  ['/stats', '统计导出'],
  ['/semester', '学期设置'],
  ['/share/abc123', '只读分享页'],
]

let pass = 0, fail = 0
console.log('全站控制台巡检：')
for (const [route, name] of ROUTES) {
  // 分享页需要 RPC 返回结构化数据；这里给它一个最小成功响应
  if (route.startsWith('/share/')) {
    const origin = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (url.includes('/rest/v1/rpc/get_shared_schedule')) {
        return new Response(JSON.stringify({
          ok: true, week: 3, week_type: '单周', items: [],
          updated_at: new Date().toISOString(), server_time: new Date().toISOString(),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return origin(input, init)
    }
  }
  const { errors, html } = await renderPage(route)
  const ok = errors.length === 0 && html.length > 50
  if (ok) { console.log(`  ✅ ${name}（${route}）无 console 错误`); pass++ }
  else {
    console.log(`  ❌ ${name}（${route}） → ${errors.slice(0, 2).join(' | ') || '页面内容过少'}`); fail++
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（8 个页面渲染均无控制台错误）' : ''))
process.exit(fail === 0 ? 0 : 1)
