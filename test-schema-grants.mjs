/**
 * 数据库授权合规检查（test-schema-grants.mjs）
 *
 * 背景：Supabase 自 2026-10-30 起，public schema 中【新建的表】不再自动获得
 *      Data API 访问权限，必须在建表时显式 GRANT，否则报 permission denied (42501)。
 *
 * 本测试静态解析 database/*.sql，确保：
 *   1. 每张表都 GRANT 给了 authenticated 与 service_role（否则前端/接口访问不到）
 *   2. 业务表【不】授权给 anon（最小权限：未登录用户不能读业务数据）
 *   3. keep_alive_pings 必须授权给 anon（每日保活工作流依赖）
 *   4. 每张表都启用了 RLS，且至少配置了一条策略（有授权无 RLS = 越权风险）
 *   5. 任何 CREATE TABLE 的迁移文件，必须同时包含对应的 GRANT
 *
 * 运行: node test-schema-grants.mjs
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DB_DIR = path.join(ROOT, 'database')
const SCHEMA = path.join(DB_DIR, 'schema.sql')

let passed = 0, failed = 0
const fails = []
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name) }
  catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ❌ ' + name + ' — ' + e.message) }
}
function ok(v, m) { if (!v) throw new Error(m || 'assert') }

/** 去掉 SQL 注释（-- 行注释），避免把模板/示例当成真实语句 */
function stripComments(sql) {
  return sql.split('\n').map(line => {
    const i = line.indexOf('--')
    return i >= 0 ? line.slice(0, i) : line
  }).join('\n')
}

/** 提取 CREATE TABLE 的表名 */
function tablesIn(sql) {
  const out = []
  const re = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?["']?(\w+)["']?/gi
  let m
  while ((m = re.exec(sql))) out.push(m[1])
  return [...new Set(out)]
}

/** 提取 GRANT 语句 → { 表名: Set<授权对象> }（支持多行、多表） */
function grantsIn(sql) {
  const map = {}
  const re = /GRANT\s+([\s\S]*?)\s+TO\s+([\w\s,]+?)\s*;/gi
  let m
  while ((m = re.exec(sql))) {
    const objects = m[1]
    const grantees = m[2].split(',').map(s => s.trim()).filter(Boolean)
    const tableRe = /(?:public\.)?["']?(\w+)["']?(?=\s*(?:,|$))/g
    // 只取 「ON <列表>」 部分中的表名：去掉 GRANT 后面的权限关键字
    const onPart = objects.replace(/^[\s\S]*?\bON\b/i, '')
    let t
    while ((t = tableRe.exec(onPart))) {
      const name = t[1]
      if (!name || /^(SELECT|INSERT|UPDATE|DELETE|ALL|PRIVILEGES|USAGE|TRUNCATE|REFERENCES|TRIGGER)$/i.test(name)) continue
      map[name] = map[name] || new Set()
      grantees.forEach(g => map[name].add(g))
    }
  }
  return map
}

ok(fs.existsSync(SCHEMA), '找不到 database/schema.sql')
const schemaRaw = fs.readFileSync(SCHEMA, 'utf8')
const schema = stripComments(schemaRaw)
const tables = tablesIn(schema)
const grants = grantsIn(schema)

console.log('='.repeat(64))
console.log('🧪 数据库授权合规检查（Supabase 2026-10-30 政策）')
console.log('='.repeat(64))
console.log('  发现表: ' + tables.join(', '))

console.log('\n📋 1. 每张表都必须授权给 authenticated 与 service_role')
for (const t of tables) {
  test(t + ' 已授权 authenticated', () => ok(grants[t] && grants[t].has('authenticated'), '缺少 TO authenticated 的 GRANT'))
  test(t + ' 已授权 service_role', () => ok(grants[t] && grants[t].has('service_role'), '缺少 TO service_role 的 GRANT'))
}

console.log('\n📋 2. 最小权限：业务表不得授权给 anon')
for (const t of tables) {
  if (t === 'keep_alive_pings') continue
  test(t + ' 未授权 anon（最小权限）', () => ok(!(grants[t] && grants[t].has('anon')), '业务表不应向匿名用户开放'))
}

console.log('\n📋 3. 保活表必须授权 anon（GitHub Actions 每日心跳）')
test('keep_alive_pings 已授权 anon', () => ok(grants['keep_alive_pings'] && grants['keep_alive_pings'].has('anon'), '缺少 TO anon 的 GRANT，保活会失败'))

console.log('\n📋 4. 每张表都启用 RLS 且至少有一条策略')
for (const t of tables) {
  const rlsRe = new RegExp('ALTER\\s+TABLE\\s+(?:public\\.)?' + t + '\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY', 'i')
  test(t + ' 已启用 RLS', () => ok(rlsRe.test(schema), '未 ENABLE ROW LEVEL SECURITY'))
  const polRe = new RegExp('CREATE\\s+POLICY\\s+[\\s\\S]*?ON\\s+(?:public\\.)?' + t + '\\b', 'i')
  test(t + ' 至少有一条策略', () => ok(polRe.test(schema), '有 RLS 但没有策略 = 谁都读不到'))
}

console.log('\n📋 5. 每个建表迁移都必须自带 GRANT（政策核心）')
const migrationFiles = fs.readdirSync(DB_DIR).filter(f => /^migration-.*\.sql$/i.test(f))
for (const file of migrationFiles) {
  const raw = stripComments(fs.readFileSync(path.join(DB_DIR, file), 'utf8'))
  const created = tablesIn(raw)
  if (created.length === 0) continue
  const g = grantsIn(raw)
  for (const t of created) {
    test(file + ' 为 ' + t + ' 提供 GRANT', () => {
      ok(g[t], '建表却没有 GRANT（2026-10-30 后该表将无法通过 Data API 访问）')
      ok(g[t].has('authenticated'), 'GRANT 缺少 authenticated')
      ok(g[t].has('service_role'), 'GRANT 缺少 service_role')
    })
  }
}

console.log('\n' + '='.repeat(64))
console.log(`🏆 授权合规检查: ${passed}/${passed + failed} 通过`)
if (failed === 0) {
  console.log('🎉 全部通过：每张表都有显式授权 + RLS + 策略，符合 2026-10-30 新政策')
  console.log('='.repeat(64))
} else {
  console.log('⚠️ 问题:')
  fails.forEach(f => console.log('  - ' + f))
  process.exit(1)
}