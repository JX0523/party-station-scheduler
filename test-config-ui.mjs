/**
 * 配置类页面运行时测试（test-config-ui.mjs）
 *
 * 覆盖两个“配错了会连锁出错”的页面：
 *   S1 学期设置：学期名称必填 —— 空名称点保存必须**拦下且不发请求**
 *   S2 学期设置：正常保存 → 真的发出写入
 *   S3 时段配置：改一个时段的人数 → 保存 → 写入 21 条，且该时段人数为改后的值
 *   S4 两页渲染均无 console.error
 *
 * 为什么重要：学期名称/周次错 → 全站周次都错；时段人数错 → 排班人数全错。
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过配置页测试'); process.exit(0) }
if (!fs.existsSync(JSDOM_PATH)) { console.log('⚠️  未找到 jsdom，跳过'); process.exit(0) }
const bundleName = fs.readdirSync(path.join(DIST, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'))
if (!bundleName) { console.log('⚠️  没有主包，跳过'); process.exit(0) }
const BUNDLE = path.join(DIST, 'assets', bundleName)

let JSDOM = null
try { ({ JSDOM } = await import(pathToFileURL(JSDOM_PATH).href)) } catch { console.log('⚠️  jsdom 无法加载，跳过'); process.exit(0) }

function readProjectRef() {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'frontend', '.env'), 'utf8')
    const m = env.match(/VITE_SUPABASE_URL\s+=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i) || env.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i)
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

const SEM = { id: 'sem1', name: '2026 秋', first_week_is_odd: true, total_weeks: 20, current_week: 3, current_mode: '一般' }

async function render(pathname, { slotRows = [] } = {}) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const writes = []
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/semester_config')) {
      if (method === 'PATCH' || method === 'POST') { writes.push({ table: 'semester_config', method, body: JSON.parse(init.body || '{}') }); return json([{}], method === 'POST' ? 201 : 200) }
      return json(SEM)
    }
    if (url.includes('/rest/v1/slot_config')) {
      if (method === 'POST' || method === 'PATCH') { writes.push({ table: 'slot_config', method, body: JSON.parse(init.body || 'null') }); return json([{}], method === 'POST' ? 201 : 200) }
      return json(slotRows)
    }
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com' + pathname, pretendToBeVisual: true,
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
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))
  console.error = origin
  return { window, errors, writes, html: window.document.getElementById('root')?.innerHTML || '' }
}

function fieldByLabel(window, labelText) {
  const label = Array.from(window.document.querySelectorAll('label')).find(l => (l.textContent || '').includes(labelText))
  if (!label || !label.parentElement) return null
  return label.parentElement.querySelector('input, select, textarea')
}
function fireChange(window, el, value) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  if (desc && desc.set) desc.set.call(el, value); else el.value = value
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
  el.dispatchEvent(new window.Event('change', { bubbles: true }))
}
function buttonByText(window, text) {
  return Array.from(window.document.querySelectorAll('button')).find(b => (b.textContent || '').includes(text))
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('配置类页面测试：')

console.log('— S1：学期名称为空必须拦下且不写库 —')
{
  const { window, writes, errors, html } = await render('/semester')
  check('学期设置页渲染正常', html.includes('学期设置'))
  check('无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  const nameInput = fieldByLabel(window, '学期名称')
  check('找到「学期名称」输入框', !!nameInput)
  if (nameInput) {
    fireChange(window, nameInput, '')
    await new Promise(r => setTimeout(r, 200))
    const saveBtn = buttonByText(window, '保存设置')
    check('找到「保存设置」按钮', !!saveBtn)
    saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 600))
    const after = window.document.getElementById('root')?.innerHTML || ''
    check('空名称时给出提示', after.includes('请填写学期名称'), after.slice(0, 120))
    check('空名称时没有写库', writes.filter(w => w.table === 'semester_config').length === 0)
  }
}

console.log('— S2：正常名称 → 真的保存 —')
{
  const { window, writes } = await render('/semester')
  const saveBtn = buttonByText(window, '保存设置')
  saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await new Promise(r => setTimeout(r, 700))
  const w = writes.find(x => x.table === 'semester_config')
  check('保存时发出写入请求', !!w, JSON.stringify(writes.map(x => x.table)))
  check('写入内容包含学期名称', !!w && typeof w.body.name === 'string' && w.body.name.length > 0, w && w.body.name)
}

console.log('— S3：时段配置保存 21 条，改动的值要写进去 —')
{
  const { window, writes, errors } = await render('/slotconfig-check-placeholder'.replace('/slotconfig-check-placeholder', '/slot-config'))
  check('无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  const numInputs = Array.from(window.document.querySelectorAll('input[type="number"]'))
  check('页面出现时段人数输入框（21 个）', numInputs.length >= 21, '实际 ' + numInputs.length)
  if (numInputs.length) {
    fireChange(window, numInputs[0], '2')
    await new Promise(r => setTimeout(r, 200))
    const saveBtn = buttonByText(window, '保存配置')
    check('找到「保存配置」按钮', !!saveBtn)
    saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 700))
    const w = writes.find(x => x.table === 'slot_config')
    check('保存时发出 upsert 请求', !!w)
    const rows = w && Array.isArray(w.body) ? w.body : []
    check('写入 21 条时段记录', rows.length === 21, '实际 ' + rows.length)
    check('第一条的 required_count 为改后的 2', rows.length > 0 && rows[0].required_count === 2, JSON.stringify(rows[0]))
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（学期设置校验/保存、时段配置保存 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
