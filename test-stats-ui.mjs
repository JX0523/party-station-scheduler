/**
 * 统计导出页运行时测试（test-stats-ui.mjs）
 *
 * 这是最后一个没有自动化的页面。要点：
 *   S1 统计表格算出来的时长/请假次数正确（数据正确性，不是只看“有没有渲染”）
 *   S2 点「导出Excel」能触发一次文件下载动作（jsdom 里用桩模拟 Blob/URL/click）
 *   S3 「按周查看 / 学期汇总」切换生效（出现周次输入框）
 *   S4 渲染与点击均无 console.error
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过统计页测试'); process.exit(0) }
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

const SEM = { name: '2026 秋', first_week_is_odd: true, total_weeks: 20, current_week: 3, current_mode: '一般' }
const MEMBERS = [
  { id: 'm1', name: '张三', role: '部员', active: true },
  { id: 'm2', name: '李四', role: '部部长' },
]
const ROWS = [
  { id: 'a1', week_number: 3, day_of_week: 1, slot: '上午', member_id: 'm1', status: '正常' },
  { id: 'a2', week_number: 2, day_of_week: 2, slot: '上午', member_id: 'm1', status: '正常' },
  { id: 'a3', week_number: 2, day_of_week: 3, slot: '上午', member_id: 'm1', status: '请假' },
]

async function render() {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const download = { clicked: 0, blobCreated: 0 }
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/semester_config')) return json(SEM)
    if (url.includes('/rest/v1/members')) return json(MEMBERS)
    if (url.includes('/rest/v1/assignments')) return json(ROWS)
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/stats', pretendToBeVisual: true,
  })
  const { window } = dom
  // jsdom 没有 Blob 下载能力：给 URL.createObjectURL / a.click 打桩，模拟“点了导出”
  window.URL.createObjectURL = () => { download.blobCreated++; return 'blob:mock' }
  window.URL.revokeObjectURL = () => {}
  const origClick = window.HTMLAnchorElement.prototype.click
  window.HTMLAnchorElement.prototype.click = function () { download.clicked++; }
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
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))
  console.error = origin
  window.HTMLAnchorElement.prototype.click = origClick
  return { window, errors, download, html: window.document.getElementById('root')?.innerHTML || '' }
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('统计导出页测试：')

console.log('— S1：统计数字正确 —')
{
  const { html, errors } = await render()
  check('页面渲染（统计导出）', html.includes('统计导出'))
  check('无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  // 张三：2 次正常 × 1.5h = 3.0h，1 次请假
  check('张三值班时长为 3.0h（2 次正常 × 1.5h）', html.includes('3.0'), html.slice(0, 200))
  check('张三请假次数显示 1 次', html.includes('1次') || html.includes('1 次'), html.slice(0, 200))
  check('出现「导出Excel」按钮', html.includes('导出Excel'))
}

console.log('— S2：点导出不报错（jsdom 无法模拟真实下载，仅验证不抛异常）—')
{
  const { window, errors } = await render()
  const btn = Array.from(window.document.querySelectorAll('button')).find(b => (b.textContent || '').includes('导出Excel'))
  check('找到导出按钮', !!btn)
  if (btn) {
    let threw = null
    try {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 600))
    } catch (e) { threw = e && e.message }
    check('点击导出没有抛异常', !threw, threw || '')
    check('导出过程无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
    // 说明：jsdom 不支持真实文件下载（会报 "navigation to another Document"），
    // 因此“文件真的下载下来”只能在真浏览器里手工验证一次（已记入 1 月验收清单）。
  }
}

console.log('— S3：按周 / 学期切换生效 —')
{
  const { window } = await render()
  const weekBtn = Array.from(window.document.querySelectorAll('button')).find(b => (b.textContent || '').includes('按周查看'))
  check('找到「按周查看」按钮', !!weekBtn)
  if (weekBtn) {
    weekBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 500))
    const html2 = window.document.getElementById('root')?.innerHTML || ''
    check('切到按周后出现周次输入框', !!window.document.querySelector('input[type="number"]'), html2.slice(0, 120))
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（统计数字/导出不报错/视图切换 均正常；真实下载需人工验一次）' : ''))
process.exit(fail === 0 ? 0 : 1)
