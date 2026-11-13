/**
 * 只读分享页 运行时冒烟测试（test-share-route.mjs）
 *
 * 目的：在 Node + jsdom 中加载「构建产物」，验证两件最容易出错的事：
 *   1) 未登录访问 /share/:token 时，**不能**被登录墙拦下（不应渲染登录页）
 *   2) 拿到 RPC 数据后，排班表格能渲染出姓名（含请假标记）
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
  console.log('⚠️  未找到 frontend/dist，跳过分享页冒烟测试（先 npm run build）')
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

// 假的分享数据：第 8 周双周，周一上午张三正常、周三上午李四请假
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

function stubFetch() {
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

async function render(pathname) {
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
  stubFetch()
  await import(pathToFileURL(BUNDLE).href + '?t=' + Date.now())
  await new Promise(r => setTimeout(r, 700))
  return window.document.getElementById('root')?.innerHTML || ''
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { console.log('  ✅ ' + name); pass++ }
  else { console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); fail++ }
}

console.log('分享页冒烟测试：')

// 1) 未登录访问 /share/xxx
const html = await render('/share/deadbeefdeadbeefdeadbeefdeadbeef')
check('未登录时不被登录墙拦下（无“邮箱”登录表单）', !html.includes('邮箱') && !html.includes('登录</button>'), '渲染出了登录页')
check('出现分享页标题', html.includes('值班安排') || html.includes('只读视图'), 'html=' + html.slice(0, 120))
check('渲染出正常值班人「张三」', html.includes('张三'))
check('渲染出请假标记「李四（请假）」', html.includes('李四') && html.includes('请假'))
check('渲染出「王五」作为替补', html.includes('王五'))
check('显示周次信息（第 8 周）', html.includes('第 8 周') || html.includes('8 周'))

console.log('')
console.log(`结果：通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail === 0 ? 0 : 1)
