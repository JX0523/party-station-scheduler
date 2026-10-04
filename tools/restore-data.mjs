/**
 * 数据恢复脚本 — tools/restore-data.mjs
 *
 * 用途：把 tools/backup-data.mjs 导出的 JSON 备份恢复到 Supabase（换项目/灾难恢复）。
 *
 * 前置条件：目标数据库已建表（先执行 database/schema.sql，再按顺序执行各 migration-*.sql）。
 *
 * ⚠️ 会写数据！必须显式加 --confirm 才会执行；默认只做预演（dry-run）。
 *
 * 用法：
 *   node tools/restore-data.mjs backups/2026-10-04T07-48-37            # 预演
 *   node tools/restore-data.mjs backups/2026-10-04T07-48-37 --confirm  # 真正写入
 */
import fs from 'fs'
import path from 'path'

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY || ''
const dir = process.argv[2]
const confirm = process.argv.includes('--confirm')
if (!URL_BASE || !KEY || !dir) {
  console.error('用法: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/restore-data.mjs <备份目录> [--confirm]')
  process.exit(1)
}
if (!fs.existsSync(dir)) { console.error('备份目录不存在: ' + dir); process.exit(1) }

// 恢复顺序（先主表后关联表）
const ORDER = ['semester_config', 'slot_config', 'members', 'course_schedules', 'day_config', 'assignments', 'duty_stats']
const ON_CONFLICT = { course_schedules: 'member_id,week_type', assignments: 'week_number,day_of_week,slot,member_id', slot_config: 'day_of_week,slot', day_config: 'week_number,day_of_week', duty_stats: 'member_id,week_number', semester_config: 'id', members: 'id' }
const BATCH = 200

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

console.log(confirm ? '模式：真正写入 ⚠️' : '模式：预演（不写数据，加 --confirm 才会执行）')
console.log('目标: ' + URL_BASE)
console.log('')

for (const t of ORDER) {
  const file = path.join(dir, `${t}.json`)
  if (!fs.existsSync(file)) { console.log(`- ${t}: 备份中无此表，跳过`); continue }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(rows) || rows.length === 0) { console.log(`- ${t}: 0 行，跳过`); continue }
  if (!confirm) { console.log(`- ${t}: 将写入 ${rows.length} 行（预演）`); continue }
  let ok = 0, failed = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const url = `${URL_BASE}/rest/v1/${t}?on_conflict=${encodeURIComponent(ON_CONFLICT[t] || 'id')}`
    const r = await fetch(url, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) })
    if (r.ok) ok += chunk.length
    else { failed += chunk.length; console.log(`  ❌ ${t} 第 ${i / BATCH + 1} 批失败: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`) }
  }
  console.log(`- ${t}: 成功 ${ok} 行${failed ? `，失败 ${failed} 行` : ''}`)
}

console.log('')
if (!confirm) console.log('预演结束。确认无误后加 --confirm 真正写入。')
else console.log('恢复结束。请到系统页面核对：成员数、课表数、各周排班与统计。')