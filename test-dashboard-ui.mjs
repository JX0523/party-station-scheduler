/**
 * 首页「自动生成排班」运行时测试（test-dashboard-ui.mjs）
 *
 * 为什么测：打开首页时若本周没排班，系统会**自动跑算法并写入数据库**。
 * 这是“看不见的自动行为”——一旦失败，管理员打开首页只会看到空白，
 * 而且不会有人发现是“自动生成静默失败”。属于典型“改了没生效”隐患。
 *
 * 覆盖：
 *   D1 首页正常渲染、无 console 错误
 *   D2 本周无排班 → 自动调用算法并 POST 写入
 *   D3 写入内容符合规则：同一周、只排工作日、时段有需求、状态为“正常”
 *   D4 已排过班的周（有数据）→ **不应再次自动生成**（避免覆盖人工调整）
 *
 * 依赖 frontend/dist + jsdom，缺任一则跳过。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')
if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过首页测试'); process.exit(0) }
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
const SLOTS = [{ id: 's1', day_of_week: 1, slot: '上午', required_count: 1 }]
const MEMBERS = [
  { id: 'm1', name: '张三', role: '部员', active: true },
  { id: 'm2', name: '李四', role: '部员', active: true },
  { id: 'm3', name: '王五', role: '部长', active: true },
]

async function render({ existingAssignments = [] } = {}) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
  const inserts = []
  let assignmentsGetCount = 0
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/assignments') && method === 'POST') {
      inserts.push(JSON.parse(init.body || '[]'))
      return json([{}], 201)
    }
    if (url.includes('/rest/v1/assignments') && method === 'DELETE') return json([{}])
    if (url.includes('/rest/v1/assignments')) {
      assignmentsGetCount++
      // 第一次读：按场景返回；后续读（写入后刷新视图）返回写入的记录（补上 members 关联，模拟真实 join）
      if (assignmentsGetCount === 1) return json(existingAssignments)
      if (!inserts.length) return json(existingAssignments)
      const roleOf = (id) => (MEMBERS.find(m => m.id === id) || {})
      return json(inserts[0].map(r => {
        const mem = roleOf(r.member_id)
        return { ...r, members: { name: mem.name || '—', role: mem.role || '部员' } }
      }))
    }
    if (url.includes('/rest/v1/semester_config')) return json(SEM)
    if (url.includes('/rest/v1/slot_config')) return json(SLOTS)
    if (url.includes('/rest/v1/members')) return json(MEMBERS)
    if (url.includes('/rest/v1/course_schedules')) return json([])
    if (url.includes('/rest/v1/day_config')) return json([])
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
  window.confirm = () => true
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 1400))
  console.error = origin
  return { window, errors, inserts, html: window.document.getElementById('root')?.innerHTML || '' }
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('首页自动生成排班测试：')

console.log('— D1/D2/D3：本周无排班 → 自动生成并写入 —')
{
  const { window, errors, inserts, html } = await render({ existingAssignments: [] })
  check('首页渲染正常（含放假设置入口）', html.includes('放假设置'))
  check('渲染无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
  check('自动生成了排班并写入数据库', inserts.length >= 1, '实际 ' + inserts.length)
  const rows = inserts[0] || []
  check('写入的是数组且至少 1 条', Array.isArray(rows) && rows.length >= 1, JSON.stringify(rows).slice(0, 120))
  check('写入的周次 = 当前周(3)', rows.every(r => r.week_number === 3), JSON.stringify(rows.map(r => r.week_number)))
  check('只排在有需求的时段（周一上午）', rows.every(r => r.day_of_week === 1 && r.slot === '上午'), JSON.stringify(rows.map(r => `${r.day_of_week}_${r.slot}`)))
  check('状态均为「正常」', rows.every(r => r.status === '正常'))
  const after = window.document.getElementById('root')?.innerHTML || ''
  check('页面随后显示出值班人姓名', MEMBERS.some(m => after.includes(m.name)), after.slice(0, 120))
}

console.log('— D4：本周已有排班 → 不应再次自动生成（避免覆盖人工调整）—')
{
  const existing = [{ id: 'x1', week_number: 3, day_of_week: 1, slot: '上午', member_id: 'm3', status: '正常', members: { name: '王五', role: '部长' } }]
  const { inserts, html } = await render({ existingAssignments: existing })
  check('已有排班时不写入新数据', inserts.length === 0, JSON.stringify(inserts).slice(0, 120))
  check('页面显示已有的值班人', html.includes('王五'))
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（首页：自动生成/写入规则/不覆盖已有排班 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
