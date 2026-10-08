/**
 * 运行时冒烟测试（test-runtime-smoke.mjs）
 *
 * 目的：在 Node + jsdom 中真正加载「构建产物」，逐个路由渲染页面，
 *      以捕捉「构建通过但运行时崩溃」这类问题（比单元测试更接近真实使用）。
 *
 * 依赖：需要 frontend/node_modules/jsdom 与 frontend/dist（先 npm ci && npm run build）。
 *      任一缺失则优雅跳过并退出 0，保证不影响其他测试流程。
 *
 * 运行: node test-runtime-smoke.mjs
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')

if (!fs.existsSync(DIST)) {
  console.log('⚠️  未找到 frontend/dist，跳过运行时冒烟测试（先执行 npm run build）')
  process.exit(0)
}
if (!fs.existsSync(JSDOM_PATH)) {
  console.log('⚠️  未找到 jsdom，跳过运行时冒烟测试（先执行 npm ci）')
  process.exit(0)
}

const bundleName = fs.readdirSync(path.join(DIST, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'))
if (!bundleName) { console.log('⚠️  dist/assets 下没有主包，跳过'); process.exit(0) }
const BUNDLE = path.join(DIST, 'assets', bundleName)

const { JSDOM } = await import(pathToFileURL(JSDOM_PATH).href)

// 从 frontend/.env 读取真实 Supabase 项目 ref —— 会话在 localStorage 中的键名依赖它
function readProjectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'frontend', '.env'), 'utf8')
    const m = env.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  // 兜底：从构建产物里解析（Vite 会把 env 内联进 bundle）
  try {
    const code = fs.readFileSync(BUNDLE, 'utf8')
    const m = code.match(/https:\/\/([a-z0-9]{15,})\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  return null
}

const PROJECT_REF = readProjectRef()

// 各路由期望出现的界面文字（用于判断页面是否真的渲染出来）
const ROUTES = [
  { path: '/', name: '首页(Dashboard)', expect: ['放假设置', '当前周'] },
  { path: '/members', name: '成员管理', expect: ['成员管理', '添加成员'] },
  { path: '/schedule', name: '课表管理', expect: ['课表'] },
  { path: '/slot-config', name: '时段配置', expect: ['时段'] },
  { path: '/scheduling', name: '排班管理', expect: ['排班管理'] },
  { path: '/stats', name: '统计导出', expect: ['统计导出', '导出Excel'] },
  { path: '/semester', name: '学期设置', expect: ['学期'] },
]

function makeSession() {
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', email: 'demo@example.com',
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
}

// 全局收集运行时错误
const errors = []

// Node 中部分全局属性（如 navigator）是只读 getter，必须用 defineProperty 覆盖
function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch {
    try { globalThis[name] = value } catch { /* 忽略无法覆盖的全局 */ }
  }
}

// supabase-js 用 BroadcastChannel 做多标签页会话同步；Node 原生实现与 jsdom 的事件类不兼容，
// 因此提供一个空实现（不影响单页渲染验证）。
class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.onmessage = null }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true }
}

function installGlobals(dom, loggedIn) {
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
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  if (loggedIn) {
    const session = makeSession()
    window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(session))
  }
  window.addEventListener('error', e => errors.push('window.error: ' + (e.message || e.error)))
  process.on('unhandledRejection', r => errors.push('unhandledRejection: ' + (r && r.message ? r.message : r)))
}

// 模拟网络：认证接口返回会话；REST 接口返回空数组（页面渲染空数据即可）
function stubFetch(dom) {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/token')) return json(makeSession())
    if (url.includes('/auth/v1/logout')) return json({})
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/')) {
      // 单条查询（.single()）需要对象；其余返回空数组；count 查询返回空数组 + count 头
      const isSingle = url.includes('Accept') || (init.headers && JSON.stringify(init.headers).includes('vnd.pgrst.object'))
      return json(isSingle ? {} : [])
    }
    return json({})
  }
}

async function renderRoute(route, loggedIn) {
  errors.length = 0
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com' + route.path,
    pretendToBeVisual: true,
  })
  installGlobals(dom, loggedIn)
  stubFetch(dom)
  const bundleUrl = pathToFileURL(BUNDLE).href + '?t=' + Date.now()
  await import(bundleUrl)
  // 等待 React 渲染与异步请求落地
  await new Promise(r => setTimeout(r, 400))
  const html = dom.window.document.getElementById('root')?.innerHTML || ''
  return { html, dom }
}

let passed = 0, failed = 0
const fails = []
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ✅ ' + name) }
  else { failed++; fails.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')) }
}

console.log('='.repeat(64))
console.log('🧪 运行时冒烟测试（真实加载构建产物 + jsdom 渲染）')
console.log('  主包: ' + bundleName)
console.log('='.repeat(64))

// 场景 A：未登录 → 应渲染登录页
console.log('\n📋 A. 未登录状态')
try {
  const { html, dom } = await renderRoute({ path: '/' }, false)
  check('渲染出登录界面', html.includes('登录') || html.includes('邮箱') || html.includes('password'), '实际长度 ' + html.length)
  check('渲染过程无运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '))
  dom.window.close()
} catch (e) {
  check('未登录页面渲染', false, e.message)
}

// 场景 B：已登录 → 逐个路由渲染
console.log('\n📋 B. 已登录状态（逐路由渲染）')
if (!PROJECT_REF) {
  console.log('  ⚠️  无法确定 Supabase 项目 ref（缺少 frontend/.env），跳过已登录场景')
  console.log('')
  console.log(`🏆 冒烟测试结果: ${passed}/${passed + failed} 通过（仅未登录场景）`)
  process.exit(failed === 0 ? 0 : 1)
}
console.log('  会话键: sb-' + PROJECT_REF + '-auth-token')
for (const route of ROUTES) {
  try {
    const { html, dom } = await renderRoute(route, true)
    const missing = route.expect.filter(t => !html.includes(t))
    check(`${route.name} 渲染正常（含关键元素）`, html.length > 50 && missing.length === 0,
      'HTML长度 ' + html.length + (missing.length ? '，缺: ' + missing.join(',') : ''))
    check(`${route.name} 无运行时错误`, errors.length === 0, errors.slice(0, 2).join(' | '))
    dom.window.close()
  } catch (e) {
    check(route.name + ' 渲染', false, e.message)
  }
}

console.log('\n' + '='.repeat(64))
console.log(`🏆 冒烟测试结果: ${passed}/${passed + failed} 通过`)
if (failed === 0) console.log('🎉 全部通过：所有页面均能正常渲染')
else { console.log('⚠️ 失败项:'); fails.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('='.repeat(64))
