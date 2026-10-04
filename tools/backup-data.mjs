/**
 * 数据库备份脚本 — tools/backup-data.mjs
 *
 * 用途：把线上 Supabase 的全部业务数据导出为 JSON 文件（灾备/换设备/搬迁用）。
 * 说明：Supabase Auth 的账号密码无法导出（云端管理），恢复时在 Supabase 后台重建账号或用邮件重置。
 *
 * 用法（Windows PowerShell）：
 *   $env:SUPABASE_URL="https://xxx.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="sb_secret_xxx"
 *   node tools/backup-data.mjs            # 输出到 backups/时间戳/
 *   node tools/backup-data.mjs D:\我的备份  # 指定目录
 *
 * ⚠️ 备份含成员姓名/电话等个人信息，**不要提交到公开仓库**，请存到私有位置（私有网盘/私有仓库）。
 */
import fs from 'fs'
import path from 'path'

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY || ''
if (!URL_BASE || !KEY) {
  console.error('缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY')
  console.error('示例：$env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_KEY="sb_secret_xxx"; node tools/backup-data.mjs')
  process.exit(1)
}

const TABLES = ['members', 'course_schedules', 'assignments', 'semester_config', 'slot_config', 'day_config', 'duty_stats']
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = path.resolve(process.argv[2] || path.join('backups', stamp))
fs.mkdirSync(outDir, { recursive: true })

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function get(table) {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, { headers: H })
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const manifest = { backedUpAt: new Date().toISOString(), source: URL_BASE, tables: {} }
let totalRows = 0
for (const t of TABLES) {
  try {
    const rows = await get(t)
    fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows, null, 2), 'utf8')
    manifest.tables[t] = rows.length
    totalRows += rows.length
    console.log(`  ✅ ${t}: ${rows.length} 行`)
  } catch (e) {
    manifest.tables[t] = 'ERROR: ' + e.message
    console.log(`  ❌ ${t}: ${e.message}`)
  }
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log('')
console.log(`备份完成：${totalRows} 行 → ${outDir}`)
console.log('⚠️ 含个人信息，请存放在私有位置；不要提交到公开仓库。')