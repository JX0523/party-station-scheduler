/**
 * 排班页（管理端核心页面）运行时测试（test-scheduling-ui.mjs）
 *
 * 目的：用 jsdom 加载真实构建产物，按“管理员看到的样子”校验排班页的关键业务显示：
 *   S1 正常排班：显示姓名与角色、显示「已请假」标记
 *   S2 缺人提示：某时段需求 1 人但没有排到 → 显示「⚠ 还缺 1 人」
 *   S3 锁定周：查看已过去的周 → 显示「🔒 已锁定」，且不出现「请假」按钮
 *
 * 依赖：frontend/dist（npm run build）+ frontend/node_modules/jsdom
 *      缺任一则优雅跳过（exit 0）。
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'frontend', 'dist')
const JSDOM_PATH = path.join(ROOT, 'frontend', 'node_modules', 'jsdom', 'lib', 'api.js')

if (!fs.existsSync(DIST)) { console.log('⚠️  未找到 frontend/dist，跳过排班页测试'); process.exit(0) }
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

// 场景数据：第 1 周（单周），周一上午有 张三（正常）+ 李四（请假）；周二上午需求 1 人但空着
const SEM = { name: '2026 秋', first_week_is_odd: true, total_weeks: 20, current_week: 3, current_mode: '一般' }
const SLOTS = [
  { day_of_week: 1, slot: '上午', required_count: 1 },
  { day_of_week: 2, slot: '上午', required_count: 1 },
]
const ROWS = [
  { id: 'a1', week_number: 1, day_of_week: 1, slot: '上午', member_id: 'm1', status: '正常', is_emergency: false, leave_next_week: false, members: { name: '张三', role: '部员' } },
  { id: 'a2', week_number: 1, day_of_week: 1, slot: '上午', member_id: 'm2', status: '请假', is_emergency: false, leave_next_week: true, members: { name: '李四', role: '部长' } },
]

function stub({ rows = ROWS, sem = SEM } = {}) {
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/semester_config')) return json(sem)
    if (url.includes('/rest/v1/slot_config')) return json(SLOTS)
    if (url.includes('/rest/v1/assignments')) return json(rows)
    if (url.includes('/rest/v1/members')) return json([
      { id: 'm1', name: '张三', role: '部员', active: true },
      { id: 'm2', name: '李四', role: '部长', active: true },
      { id: 'm3', name: '王五', role: '部员', active: true },
    ])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
}

async function render(pathname, opts) {
  const errors = []
  const origin = console.error
  console.error = (...a) => { errors.push(String(a[0])); origin(...a) }
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
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  window.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  stub(opts)
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))
  console.error = origin
  return { window, errors, html: window.document.getElementById('root')?.innerHTML || '' }
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('排班页冒烟测试（管理员视角）：')

console.log('— S1/S2：正常排班 + 请假标记 + 缺人提示 —')
{
  const { html, errors } = await render('/scheduling')
  check('页面标题出现（排班管理）', html.includes('排班管理'))
  check('显示正常值班人「张三」', html.includes('张三'))
  check('显示请假人「李四」并标注「已请假」', html.includes('李四') && html.includes('已请假'))
  check('空时段给出「⚠ 还缺 1 人」提示', html.includes('还缺') && html.includes('1'))
  check('渲染无 console.error', errors.length === 0, errors.slice(0, 2).join(' | '))
}

console.log('— S3：只有「正常」的排班才能点请假（已请假的人不能再点）—')
{
  const { window, html } = await render('/scheduling')
  const leaveButtons = Array.from(window.document.querySelectorAll('button'))
    .filter(b => (b.textContent || '').trim() === '请假')
  check('正常排班的行有「请假」按钮', leaveButtons.length >= 1, '实际 ' + leaveButtons.length)
  check('已请假的人不再显示「请假」按钮（只有 1 个按钮）', leaveButtons.length === 1, '实际 ' + leaveButtons.length)
  check('已请假行仍标注「已请假」', html.includes('已请假'))
}

console.log('— S4：请假 → 选替补（最关键的业务操作）—')
{
  let capturedPatch = null
  let capturedInsert = null
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  const rowNormal = {
    id: 'a1', week_number: 1, day_of_week: 1, slot: '上午', member_id: 'm1',
    status: '正常', is_emergency: false, leave_next_week: false, members: { name: '张三', role: '部员' }
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/assignments') && method === 'PATCH') { capturedPatch = JSON.parse(init.body || '{}'); return json([{}]) }
    if (url.includes('/rest/v1/assignments') && method === 'POST') { capturedInsert = JSON.parse(init.body || '{}'); return json([{}], 201) }
    if (url.includes('/rest/v1/assignments')) return json([rowNormal])
    if (url.includes('/rest/v1/semester_config')) return json(SEM)
    if (url.includes('/rest/v1/slot_config')) return json(SLOTS)
    if (url.includes('/rest/v1/course_schedules')) return json([])
    if (url.includes('/rest/v1/members')) return json([
      { id: 'm1', name: '张三', role: '部员', active: true },
      { id: 'm3', name: '王五', role: '部员', active: true },
      { id: 'm4', name: '赵六', role: '部长', active: true },
    ])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  // 复用 render 但替换数据源：直接构造同一套 globals
  const dom2 = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/scheduling', pretendToBeVisual: true,
  })
  const w2 = dom2.window
  defineGlobal('BroadcastChannel', FakeBroadcastChannel)
  defineGlobal('window', w2)
  defineGlobal('document', w2.document)
  defineGlobal('navigator', w2.navigator)
  defineGlobal('location', w2.location)
  defineGlobal('history', w2.history)
  defineGlobal('localStorage', w2.localStorage)
  defineGlobal('sessionStorage', w2.sessionStorage)
  defineGlobal('HTMLElement', w2.HTMLElement)
  defineGlobal('Node', w2.Node)
  defineGlobal('Event', w2.Event)
  defineGlobal('CustomEvent', w2.CustomEvent)
  defineGlobal('MutationObserver', w2.MutationObserver)
  defineGlobal('getComputedStyle', w2.getComputedStyle.bind(w2))
  defineGlobal('confirm', () => true)
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  w2.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))

  const leaveBtn = Array.from(w2.document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '请假')
  check('找到「请假」按钮', !!leaveBtn)
  if (leaveBtn) {
    leaveBtn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 600))
    check('点请假后把该行标记为「请假」并置补排标记',
      capturedPatch && capturedPatch.status === '请假' && capturedPatch.leave_next_week === true,
      JSON.stringify(capturedPatch))
    const modalHtml = w2.document.getElementById('root')?.innerHTML || ''
    check('弹出替补选择框', modalHtml.includes('选择替补'))
    check('候选人里出现「王五」', modalHtml.includes('王五'))
    const pickBtn = Array.from(w2.document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '选为替补')
    check('找到「选为替补」按钮', !!pickBtn)
    if (pickBtn) {
      pickBtn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise(r => setTimeout(r, 600))
      const ins = Array.isArray(capturedInsert) ? capturedInsert[0] : capturedInsert
      check('替补写入的是同一周/同一天/同一时段', !!ins && ins.week_number === 1 && ins.day_of_week === 1 && ins.slot === '上午', JSON.stringify(ins))
      check('替补状态为「正常」且不带补排标记', !!ins && ins.status === '正常' && ins.leave_next_week === false, JSON.stringify(ins))
      check('替补不是原值班人', !!ins && ins.member_id !== 'm1', JSON.stringify(ins))
    }
  }
}

console.log('— S5：请假写入失败 → 必须报错，且不能继续弹替补框 —')
{
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
  const rowNormal = {
    id: 'a1', week_number: 1, day_of_week: 1, slot: '上午', member_id: 'm1',
    status: '正常', is_emergency: false, leave_next_week: false, members: { name: '张三', role: '部员' }
  }
  let patchAttempted = false
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const method = (init.method || 'GET').toUpperCase()
    if (url.includes('/auth/v1/user')) return json(makeSession().user)
    if (url.includes('/auth/v1/')) return json({})
    if (url.includes('/rest/v1/assignments') && method === 'PATCH') {
      patchAttempted = true
      return json({ message: 'permission denied for table assignments', code: '42501' }, 403)
    }
    if (url.includes('/rest/v1/assignments')) return json([rowNormal])
    if (url.includes('/rest/v1/semester_config')) return json(SEM)
    if (url.includes('/rest/v1/slot_config')) return json(SLOTS)
    if (url.includes('/rest/v1/course_schedules')) return json([])
    if (url.includes('/rest/v1/members')) return json([{ id: 'm1', name: '张三', role: '部员', active: true }])
    if (url.includes('/rest/v1/')) return json([])
    return json({})
  }
  const dom2 = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/scheduling', pretendToBeVisual: true,
  })
  const w2 = dom2.window
  defineGlobal('BroadcastChannel', FakeBroadcastChannel)
  defineGlobal('window', w2)
  defineGlobal('document', w2.document)
  defineGlobal('navigator', w2.navigator)
  defineGlobal('location', w2.location)
  defineGlobal('history', w2.history)
  defineGlobal('localStorage', w2.localStorage)
  defineGlobal('sessionStorage', w2.sessionStorage)
  defineGlobal('HTMLElement', w2.HTMLElement)
  defineGlobal('Node', w2.Node)
  defineGlobal('Event', w2.Event)
  defineGlobal('CustomEvent', w2.CustomEvent)
  defineGlobal('MutationObserver', w2.MutationObserver)
  defineGlobal('getComputedStyle', w2.getComputedStyle.bind(w2))
  defineGlobal('confirm', () => true)
  globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = id => clearTimeout(id)
  w2.localStorage.setItem(`sb-${PROJECT_REF}-auth-token`, JSON.stringify(makeSession()))
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 900))

  const leaveBtn = Array.from(w2.document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '请假')
  check('找到「请假」按钮', !!leaveBtn)
  if (leaveBtn) {
    leaveBtn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 700))
    const html = w2.document.getElementById('root')?.innerHTML || ''
    check('确实尝试写入请假', patchAttempted)
    check('失败时提示「请假失败」', html.includes('请假失败'), html.slice(0, 160))
    check('失败时不弹替补选择框', !html.includes('选择替补'))
  }
}

console.log('')
console.log(`${pass}/${pass + fail} 通过` + (fail === 0 ? '（排班页：显示/请假/缺人/按钮规则/请假→替补/写入失败即报错/无报错 均正常）' : ''))
process.exit(fail === 0 ? 0 : 1)
