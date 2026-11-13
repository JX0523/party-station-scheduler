/**
 * 首页「放假设置」面板运行时测试（test-holiday-ui.mjs）
 *
 * 重点回归一个真实踩过的坑：**「取消该周放假」点了没生效**。
 * 根因是 day_config 缺少 DELETE 策略，数据库删 0 行却不报错，前端以为成功。
 * 现在的代码会检查“真的删掉了几行”，删除为 0 时给出明确提示。
 *
 * 覆盖：
 *   H1 面板渲染出已有放假周
 *   H2 取消放假 → 确实发出 DELETE（且带周次条件）
 *   H3 删除 0 行（缺策略）→ 明确提示，不假装成功
 *   H4 删除成功 → 提示已取消并显示删除条数
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')

if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过放假面板测试'); process.exit(0) }
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

// 已有放假：第 6 周周二、周三设为放假（is_workday=false）
const DAY_ROWS = [
  { id: 'd1', week_number: 6, day_of_week: 2, is_workday: false, substitute_for: null },
  { id: 'd2', week_number: 6, day_of_week: 3, is_workday: false, substitute_for: null },
]
const SEM = { name: '2026 秋', first_week_is_odd: true, total_weeks: 20, current_week: 3, current_mode: '一般' }

async function render({ deleteRows = [] } = {}) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }

  const captured = { deleteUrl: null, deleteMethod: null }
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/day_config') && method === 'DELETE') {
      captured.deleteUrl = url
      captured.deleteMethod = method
      return json(deleteRows)
    }
    if (url.includes('/rest/v1/day_config')) return json(DAY_ROWS)
    if (url.includes('/rest/v1/semester_config')) return json(SEM)
    if (url.includes('/rest/v1/slot_config')) return json([])
    if (url.includes('/rest/v1/assignments')) return json([])
    if (url.includes('/rest/v1/members')) return json([])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/', pretendToBeVisual: true,
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
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))
  console.error = origin
  return { window, errors, captured, html: window.document.getElementById('root')?.innerHTML || '' }
}

function clickCancelWeek(window) {
  const btn = Array.from(window.document.querySelectorAll('button'))
    .find(b => (b.textContent || '').includes('取消该周放假'))
  if (!btn) return false
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  return true
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('放假设置面板测试（含“取消放假”回归）：')

console.log('— H1/H3：面板渲染 + 删除 0 行必须报错（防“假成功”）—')
{
  const { window, errors, captured, html } = await render({ deleteRows: [] })
  check('面板出现（放假设置）', html.includes('放假设置'))
  check('显示已设置的放假周', html.includes('第 6 周') || html.includes('6 周'))
  check('渲染无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  const clicked = clickCancelWeek(window)
  check('找到「取消该周放假」按钮', clicked)
  if (clicked) {
    await new Promise(r => setTimeout(r, 600))
    check('确实发出了 DELETE 请求', captured.deleteMethod === 'DELETE')
    check('DELETE 带了周次条件（week_number）', !!captured.deleteUrl && captured.deleteUrl.includes('week_number'))
    const after = window.document.getElementById('root')?.innerHTML || ''
    check('删除 0 行时给出明确提示（不假装成功）',
      after.includes('没有删除任何记录') || after.includes('migration-v7'), after.slice(0, 120))
  }
}

console.log('— H4：删除成功 → 提示已取消 —')
{
  const { window } = await render({ deleteRows: [{ id: 'd1' }, { id: 'd2' }] })
  const clicked = clickCancelWeek(window)
  check('再次找到「取消该周放假」按钮', clicked)
  if (clicked) {
    await new Promise(r => setTimeout(r, 600))
    const after = window.document.getElementById('root')?.innerHTML || ''
    check('成功后提示“已取消”并给出条数',
      after.includes('已取消') && (after.includes('删除 2') || after.includes('2 条')), after.slice(0, 160))
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（放假面板：渲染 / 取消请求 / 0 行报错 / 成功提示 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
