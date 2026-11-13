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
let rpcCallCount = 0
function stubFetchShare() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/rest/v1/rpc/get_shared_schedule')) { rpcCallCount++; return json(FAKE_RPC) }
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

// 场景四：已登录 + 列表里已有一条链接（测停用/复制）
let capturedUpdate = null
const EXISTING_ROW = {
  id: '11111111-2222-3333-4444-555555555555',
  token: 'a'.repeat(26) + 'def456',   // 32 位，末 6 位为 def456（便于断言列表展示）
  scope: 'current_week',
  week_number: null,
  expires_at: null,
  active: true,
  created_by: 'admin@example.com',
  created_at: new Date().toISOString(),
  last_viewed_at: null,
  view_count: 3
}

function stubFetchPanelWithRow() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/share_links') && (method === 'PATCH' || method === 'PUT')) {
      capturedUpdate = JSON.parse(init.body || '{}')
      return json([{}], 200)
    }
    if (url.includes('/rest/v1/share_links') && method === 'POST') {
      capturedInsert = JSON.parse(init.body || '{}')
      return json([{}], 201)
    }
    if (url.includes('/rest/v1/share_links')) return json([EXISTING_ROW])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

// 场景五：分享接口返回错误
function stubRpcError(code) {
  return function () {
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json' } })
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (url.includes('/rest/v1/rpc/get_shared_schedule')) return json({ ok: false, error: code })
      if (url.includes('/auth/v1/')) return json({})
      if (url.includes('/rest/v1/')) return json([])
      return json({})
    }
  }
}

// 场景六：接口成功但没有排班
function stubRpcEmpty() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/rest/v1/rpc/get_shared_schedule')) {
      return json({ ok: true, week: 8, week_type: '双周', items: [], updated_at: new Date().toISOString(), server_time: new Date().toISOString() })
    }
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}


// 场景十：数据库未初始化时，面板必须明确提示（不能假装“没有链接”）
function stubFetchPanelMissingTable() {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/share_links')) {
      return json({ message: 'relation "public.share_links" does not exist' }, 404)
    }
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

async function render(pathname, { loggedIn = false, stub = stubFetchShare, redirect = null } = {}) {
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
  // 模拟 GitHub Pages 的 404.html：把原路径存进 sessionStorage.redirect 再跳回首页
  if (redirect) {
    window.sessionStorage.setItem('redirect', redirect)
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

console.log('— 场景三：GitHub Pages 深链恢复（404 跳回首页后应回到分享页）—')
{
  // 首页地址 + sessionStorage 里记着原分享路径，模拟 Pages 的 404 重定向行为
  const { window, rootHtml } = await render('/', {
    stub: stubFetchShare,
    redirect: '/share/deadbeefdeadbeefdeadbeefdeadbeef'
  })
  check('地址被还原为分享路径', window.location.pathname === '/share/deadbeefdeadbeefdeadbeefdeadbeef',
    '实际: ' + window.location.pathname)
  check('还原后渲染的是分享页（不是登录页/首页）',
    (rootHtml.includes('值班安排') || rootHtml.includes('只读视图')) && !rootHtml.includes('登录</button>'))
  check('sessionStorage 里的 redirect 已被清空', !window.sessionStorage.getItem('redirect'))
}

console.log('— 场景四：管理面板的停用/复制（管理员日常操作）—')
{
  capturedUpdate = null
  const { window, rootHtml } = await render('/semester', { loggedIn: true, stub: stubFetchPanelWithRow })
  check('列表渲染出已有链接（显示“生效”与访问次数）',
    rootHtml.includes('生效') && rootHtml.includes('3'))
  check('列表显示令牌后 6 位', rootHtml.includes('def456'))

  const toggleBtn = Array.from(window.document.querySelectorAll('button'))
    .find(b => (b.textContent || '').trim() === '停用')
  check('找到“停用”按钮', !!toggleBtn)
  if (toggleBtn) {
    toggleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 500))
    const html2 = window.document.getElementById('root')?.innerHTML || ''
    check('点“停用”发出了更新请求', capturedUpdate !== null)
    check('更新内容为 active=false', capturedUpdate && capturedUpdate.active === false)
    check('页面给出了操作反馈', html2.includes('已停用') || html2.includes('停用该链接'))
  }

  // 剪贴板在 jsdom 中不可用：点“复制”必须优雅降级，不能白屏
  const copyBtn = Array.from(window.document.querySelectorAll('button'))
    .find(b => (b.textContent || '').trim() === '复制')
  check('找到“复制”按钮', !!copyBtn)
  if (copyBtn) {
    copyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 300))
    const html3 = window.document.getElementById('root')?.innerHTML || ''
    check('剪贴板不可用时给出提示而非崩溃',
      html3.includes('复制失败') || html3.includes('手动复制') || html3.includes('已复制'))
    check('页面仍然正常（未白屏）', html3.includes('分享给老师'))
  }
}

console.log('— 场景五：分享页的三类错误态 —')
{
  const cases = [
    ['revoked', '已被管理员停用'],
    ['expired', '已过期'],
    ['invalid_token', '链接无效']
  ]
  for (const [code, expect] of cases) {
    const { rootHtml } = await render('/share/deadbeefdeadbeefdeadbeefdeadbeef', { stub: stubRpcError(code) })
    check(`${code} → 显示「${expect}」`, rootHtml.includes(expect))
  }
}

console.log('— 场景六：本周尚未排班（空态）—')
{
  const { rootHtml } = await render('/share/deadbeefdeadbeefdeadbeefdeadbeef', { stub: stubRpcEmpty })
  check('显示「本周尚未排班」而不是空白页', rootHtml.includes('尚未排班'))
}

// 测试辅助：按 label 文本定位表单控件（页面上有多个 select/input，不能用 querySelector 抓第一个）
function fieldByLabel(window, labelText) {
  const label = Array.from(window.document.querySelectorAll('label'))
    .find(l => (l.textContent || '').includes(labelText))
  if (!label || !label.parentElement) return null
  return label.parentElement.querySelector('input, select, textarea')
}

function fireChange(window, el, value, valueKind = 'value') {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, valueKind)
  if (desc && desc.set) desc.set.call(el, value)
  else el[valueKind] = value
  el.dispatchEvent(new window.Event('change', { bubbles: true }))
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

// 受控数字输入框在 jsdom 里模拟“真的输入”比较脆弱，这里直接调用组件的 onChange 处理器
function invokeReactOnChange(el, value) {
  const key = Object.keys(el).find(k => k.startsWith('__reactProps$'))
  if (!key) return false
  const props = el[key]
  if (props && typeof props.onChange === 'function') {
    props.onChange({ target: { value } })
    return true
  }
  return false
}

console.log('— 场景七：切回标签页会自动刷新（改动能看到）—')
{
  rpcCallCount = 0
  const { window } = await render('/share/deadbeefdeadbeefdeadbeefdeadbeef', { stub: stubFetchShare })
  check('首次加载取了一次数据', rpcCallCount >= 1, '实际 ' + rpcCallCount)
  // 模拟用户切回标签页（页面可见）
  Object.defineProperty(window.document, 'hidden', { value: false, configurable: true })
  window.document.dispatchEvent(new window.Event('visibilitychange'))
  await new Promise(r => setTimeout(r, 500))
  check('切回标签页后重新取数（说明会自动刷新）', rpcCallCount >= 2, '实际 ' + rpcCallCount)
}

console.log('— 场景八：面板“指定周”模式 —')
{
  capturedInsert = null
  const { window } = await render('/semester', { loggedIn: true, stub: stubFetchPanel })
  const scopeSel = fieldByLabel(window, '范围')
  check('找到「范围」下拉框', !!scopeSel)
  if (scopeSel) {
    fireChange(window, scopeSel, 'week')
    await new Promise(r => setTimeout(r, 300))
    const weekInput = fieldByLabel(window, '第几周')
    check('切到“指定周”后出现「第几周」输入框', !!weekInput)
    if (weekInput) {
      invokeReactOnChange(weekInput, '9')
      await new Promise(r => setTimeout(r, 150))
      const genBtn = Array.from(window.document.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes('生成链接'))
      genBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 500))
      check('指定周生成时 scope=week', capturedInsert && capturedInsert.scope === 'week', JSON.stringify(capturedInsert))
      // 说明：jsdom 无法可靠驱动受控 number 输入框的值，这里只验证“带上了 week_number”这一条链路；
      // 非法周次拦截（0/空）在 1 月真库验收时按清单手工覆盖。
      check('指定周生成时带上了 week_number',
        capturedInsert && typeof capturedInsert.week_number === 'number', JSON.stringify(capturedInsert))
    }
  }
}

console.log('— 场景十：数据库未初始化时面板要明确提示 —')
{
  const { rootHtml } = await render('/semester', { loggedIn: true, stub: stubFetchPanelMissingTable })
  check('面板提示“读取分享链接失败”', rootHtml.includes('读取分享链接失败'))
  check('提示里说明可能是没跑迁移脚本', rootHtml.includes('迁移脚本') || rootHtml.includes('migration-v8'))
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（分享页免登录 + 面板生成/停用/复制 + 三种错误态 + 空态 + 深链 + 自动刷新 + 指定周 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
