/**
 * 只读分享功能 运行时冒烟测试（test-share-route.mjs）
 *
 * 场景一：未登录访问 /share/:token —— 不能被登录墙拦下，且能渲染姓名/请假/替补
 * 场景二：已登录访问 /semester —— 面板出现；点「生成链接」会发出正确的插入请求，
 *         并展示出完整链接
 *
 * 依赖：frontend/node_modules/jsdom、frontend/dist（npm run build）
 *      任一缺失则优雅跳过，退出码 0。
 *
 * 运行：node test-share-route.mjs
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')

if (!fs.existsSync(DIST)) {
  console.log('⚠️  未找到 frontend/dist，跳过分享功能冒烟测试（先 npm run build）')
  process.exit(0)
}
if (!fs.existsSync(JSDOM_PATH)) {
  console.log('⚠️  未找到 jsdom，跳过（先 npm ci）')
  process.exit(0)
}
const assetsDir = path.join(DIST, 'assets')
const bundleName = fs.readdirSync(assetsDir).find(f => f.startsWith('index-') && f.endsWith('.js'))
if (!bundleName) { console.log('⚠️  dist/assets 下没有主包，跳过'); process.exit(0) }
const BUNDLE = path.join(assetsDir, bundleName)

let JSDOM = null
try {
  ({ JSDOM } = await import(pathToFileURL(JSDOM_PATH).href))
} catch (e) {
  console.log('⚠️  jsdom 无法在当前 Node 版本加载，跳过')
  process.exit(0)
}

// 会话 key 需要 Supabase 项目 ref（与 supabase-js 的存储键格式一致）
function readProjectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'frontend', '.env'), 'utf8')
    const m = env.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  try {
    const code = fs.readFileSync(BUNDLE, 'utf8')
    const m = code.match(/https:\/\/([a-z0-9]{15,})\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  return 'demo-project-ref'
}

const PROJECT_REF = readProjectRef()

// 假的分享数据：第 8 周双周，周一上午张三正常、周三上午李四请假 + 王五替补
const FAKE_RPC = {
  ok: true,
  week: 8,
  week_type: '双周',
  updated_at: new Date().toISOString(),
  server_time: new Date().toISOString(),
  items: [
    { day: 1, slot: '上午', name: '张三', status: '正常' },
    { day: 3, slot: '上午', name: '李四', status: '请假' },
    { day: 3, slot: '上午', name: '王五', status: '正常' }
  ]
}

function makeSession() {
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', email: 'admin@example.com' }
  }
}

class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.onmessage = null }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true }
}

function defineGlobal(name, value) {
  try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }) }
  catch { try { globalThis[name] = value } catch { /* 忽略 */ } }
}

// 场景一：未登录 + 分享数据
function stubFetchShare() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/rest/v1/rpc/get_shared_schedule')) return json(FAKE_RPC)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

// 场景二：已登录 + 面板交互（捕获插入请求）
let capturedInsert = null
function stubFetchPanel() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/share_links') && method === 'POST') {
      capturedInsert = JSON.parse(init.body || '{}')
      return json([{}], 201)
    }
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

async function render(pathname, { loggedIn = false, stub = stubFetchShare } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com' + pathname,
    pretendToBeVisual: true,
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
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  if (loggedIn) {
    window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  }
  stub()
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 700))
  return { window, rootHtml: window.document.getElementById('root')?.innerHTML || '' }
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('分享功能冒烟测试：')
console.log('— 场景一：未登录打开分享链接 —')
{
  const { rootHtml } = await render('/share/deadbeefdeadbeefdeadbeefdeadbeef')
  check('不被登录墙拦下（无邮箱登录表单）', !rootHtml.includes('邮箱') && !rootHtml.includes('登录</button>'), '渲染出了登录页')
  check('出现分享页标题', rootHtml.includes('值班安排') || rootHtml.includes('只读视图'))
  check('渲染出正常值班人「张三」', rootHtml.includes('张三'))
  check('渲染出「李四（请假）」', rootHtml.includes('李四') && rootHtml.includes('请假'))
  check('渲染出替补「王五」', rootHtml.includes('王五'))
  check('显示周次信息（第 8 周）', rootHtml.includes('第 8 周') || rootHtml.includes('8 周'))
}

console.log('— 场景二：已登录在学期设置页生成链接 —')
{
  capturedInsert = null
  const { window, rootHtml } = await render('/semester', { loggedIn: true, stub: stubFetchPanel })
  check('面板出现（含“分享给老师”与“生成链接”）', rootHtml.includes('分享给老师') && rootHtml.includes('生成链接'))
  const btn = Array.from(window.document.querySelectorAll('button'))
    .find(b => (b.textContent || '').includes('生成链接'))
  check('找到“生成链接”按钮', !!btn)
  if (btn) {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 500))
    const html2 = window.document.getElementById('root')?.innerHTML || ''
    check('点击后发起插入请求', capturedInsert !== null)
    check('插入的 token 是 32 位随机串', capturedInsert && typeof capturedInsert.token === 'string' && capturedInsert.token.length === 32)
    check('默认范围是 current_week', capturedInsert && capturedInsert.scope === 'current_week')
    check('插入不含 week_number（当前周模式）', capturedInsert && capturedInsert.week_number === null)
    check('创建后页面展示完整链接', html2.includes('/share/'))
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（分享页免登录 + 面板生成链路均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
