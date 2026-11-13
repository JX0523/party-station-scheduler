/**
 * 课表管理页运行时测试（test-course-ui.mjs）
 *
 * 关键规则：**单周 / 双周是两套独立课表**。
 * 若这条被破坏（例如保存时把 week_type 写错、或“复制到另一周”复制回自己），
 * 就会出现“有课的人被排上班”——属于排班不合规。
 *
 * 覆盖：
 *   C1 选择成员后出现课表网格（21 格）
 *   C2 点一个格子 → 保存 → 写入的记录带正确 member_id / week_type，并把该格置为 true
 *   C3 “复制到另一周”→ 写的是**另一种** week_type（单周→双周）
 *   C4 渲染无 console.error
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过课表页测试'); process.exit(0) }
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

const MEMBERS = [
  { id: 'm1', name: '张三', role: '部员', active: true },
  { id: 'm2', name: '李四', role: '部长', active: true },
]

async function render() {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const writes = []   // 记录所有 insert / update 的 body
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/course_schedules')) {
      if (method === 'POST' || method === 'PATCH') {
        const body = JSON.parse(init.body || '{}')
        writes.push({ method, body })
        return json([{}], method === 'POST' ? 201 : 200)
      }
      // 查询已有记录：返回 null（表示还没保存过）→ 走 insert 分支
      return json(null)
    }
    if (url.includes('/rest/v1/members')) return json(MEMBERS)
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/schedule', pretendToBeVisual: true,
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

function buttonByText(window, text) {
  return Array.from(window.document.querySelectorAll('button')).find(b => (b.textContent || '').trim().includes(text))
}
function selectMember(window, name) {
  const sel = Array.from(window.document.querySelectorAll('select'))
    .find(s => Array.from(s.options).some(o => (o.textContent || '').includes(name)))
  if (!sel) return false
  const opt = Array.from(sel.options).find(o => (o.textContent || '').includes(name))
  const desc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  desc.set.call(sel, opt.value)
  sel.dispatchEvent(new window.Event('change', { bubbles: true }))
  return true
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('课表管理页测试：')

console.log('— C1：选成员后出现课表网格 —')
{
  const { window, html, errors } = await render()
  check('页面出现（课表管理）', html.includes('课表管理'))
  check('渲染无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  const ok = selectMember(window, '张三')
  check('能选择成员「张三」', ok)
  await new Promise(r => setTimeout(r, 700))
  const html2 = window.document.getElementById('root')?.innerHTML || ''
  check('出现该成员的课表标题', html2.includes('张三'))
  check('出现保存按钮', !!buttonByText(window, '保存课表'))
}

console.log('— C2：点格子 → 保存 → 写入带正确的 week_type —')
{
  const { window, writes } = await render()
  selectMember(window, '张三')
  await new Promise(r => setTimeout(r, 700))
  // 点第一个“没课”格子（正文里写着“没课 ✓”）
  const cells = Array.from(window.document.querySelectorAll('td'))
    .filter(td => (td.textContent || '').includes('没课'))
  check('找到可点击的课表格子', cells.length > 0, '实际 ' + cells.length)
  if (cells.length) {
    cells[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 300))
    const saveBtn = buttonByText(window, '保存课表')
    saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 700))
    const w = writes.find(x => x.body && x.body.member_id === 'm1')
    check('保存时写入了该成员的课表', !!w, JSON.stringify(writes.slice(0, 2)))
    check('写入带 week_type（单周）', !!w && w.body.week_type === '单周', w && w.body.week_type)
    const keys = w ? Object.keys(w.body) : []
    check('写入包含 21 个时段字段', keys.filter(k => /^(mon|tue|wed|thu|fri|sat|sun)_(34|67|89)$/.test(k)).length === 21,
      '实际 ' + keys.filter(k => /^(mon|tue|wed|thu|fri|sat|sun)_(34|67|89)$/.test(k)).length)
    check('被点的那一格的值为 true', !!w && Object.entries(w.body).some(([k, v]) => /^(mon|tue|wed|thu|fri|sat|sun)_(34|67|89)$/.test(k) && v === true))
  }
}

console.log('— C3：复制到另一周 → 写的是另一种 week_type —')
{
  const { window, writes } = await render()
  selectMember(window, '张三')
  await new Promise(r => setTimeout(r, 700))
  const copyBtn = buttonByText(window, '复制到另一周')
  check('找到「复制到另一周」按钮', !!copyBtn)
  if (copyBtn) {
    copyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 700))
    const w = writes.find(x => x.body && x.body.week_type === '双周')
    check('复制目标为「双周」（与当前单周不同）', !!w, JSON.stringify(writes.map(x => x.body && x.body.week_type)))
    check('复制时仍写的是同一个成员', !!w && w.body.member_id === 'm1')
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（课表页：网格 / 保存单周 / 复制到双周 / 无报错 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
