/**
 * 成员管理页运行时测试（test-members-ui.mjs）
 *
 * 关键业务规则（用户强调“不合规矩绝不可以”）：
 *   1) 「停用」必须走 UPDATE active=false，**绝不能删数据**（删了历史排班与统计会一起消失）
 *   2) 「删除」是破坏性操作，必须二次确认；取消则不许发请求
 *   3) 页面要能区分「在职 / 已停用」状态
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过成员页测试'); process.exit(0) }
if (!fs.existsSync(JSDOM_PATH)) { console.log('⚠️  未找到 jsdom，跳过'); process.exit(0) }
const bundleName = fs.readdirSync(path.join(DIST, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'))
if (!bundleName) { console.log('⚠️  没有主包，跳过'); process.exit(0) }
const BUNDLE = path.join(DIST, 'assets', bundleName)

let JSDOM = null
try { ({ JSDOM } = await import(pathToFileURL(JSDOM_PATH).href)) } catch { console.log('⚠️  jsdom 无法加载，跳过'); process.exit(0) }

function readProjectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'frontend', '.env'), 'utf8')
    const m = env.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i)
    if (m) return m[1]
  } catch { /* 忽略 */ }
  return 'demo-project-ref'
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

const MEMBERS = [
  { id: 'm1', name: '张三', role: '部员', phone: '13800000001', active: true },
  { id: 'm2', name: '李四', role: '部长', phone: '13800000002', active: false },
]

async function render({ confirmResult = true } = {}) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const captured = { patch: null, deleteCalled: false, patchUrl: null }
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/members') && method === 'PATCH') {
      captured.patch = JSON.parse(init.body || '{}'); captured.patchUrl = url; return json([{}])
    }
    if (url.includes('/rest/v1/members') && method === 'DELETE') { captured.deleteCalled = true; return json([{}]) }
    if (url.includes('/rest/v1/members')) return json(MEMBERS)
    if (url.includes('/rest/v1/assignments')) return json([])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/members', pretendToBeVisual: true,
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
  defineGlobal('confirm', () => confirmResult)
  window.confirm = () => confirmResult
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))
  console.error = origin
  return { window, errors, captured, html: window.document.getElementById('root')?.innerHTML || '' }
}

function buttonByText(window, text) {
  return Array.from(window.document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === text)
}
function buttonsByText(window, text) {
  return Array.from(window.document.querySelectorAll('button')).filter(b => (b.textContent || '').trim() === text)
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('成员管理页测试：')

console.log('— M1/M2：列表状态区分 —')
{
  const { html, errors } = await render()
  check('页面出现（成员管理）', html.includes('成员管理'))
  check('在职成员显示「在职」', html.includes('在职'))
  check('已停用成员显示「已停用」', html.includes('已停用'))
  check('渲染无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
}

console.log('— M3：停用必须是 UPDATE，绝不能删数据 —')
{
  const { window, captured } = await render({ confirmResult: true })
  const stopBtn = buttonByText(window, '停用')
  check('找到「停用」按钮（只对在职成员显示）', !!stopBtn)
  if (stopBtn) {
    stopBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 600))
    check('停用发出的是 UPDATE（PATCH）', !!captured.patch)
    check('停用把 active 设为 false', captured.patch && captured.patch.active === false, JSON.stringify(captured.patch))
    check('停用**没有**调用删除接口', captured.deleteCalled === false)
    check('停用请求带上了成员 id', !!captured.patchUrl && captured.patchUrl.includes('id=eq.'))
  }
}

console.log('— M4：删除必须二次确认，取消则不发请求 —')
{
  const { window, captured } = await render({ confirmResult: false })
  const delBtns = buttonsByText(window, '删除')
  check('找到「删除」按钮', delBtns.length >= 1)
  if (delBtns.length) {
    delBtns[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 500))
    check('取消确认时不发删除请求', captured.deleteCalled === false)
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（成员页：状态显示 / 停用不删数据 / 删除二次确认 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
