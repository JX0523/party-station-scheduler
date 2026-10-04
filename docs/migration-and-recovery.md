# 迁移与灾备手册（换电脑 / 换设备 / 数据恢复）

> **一句话结论**：代码在 **GitHub**、数据在 **Supabase 云端**、网站在 **Netlify / GitHub Pages**——
> **都与你的电脑无关**。换新电脑后：**打开网址就能用**；要改代码，按本文第 3 节做 5 步即可。

---

## 1. 资产清单：什么在哪里

| 资产 | 存放位置 | 换电脑后是否受影响 |
|------|---------|:--:|
| 业务数据（成员/课表/排班/配置） | **Supabase 云端数据库** | ❌ 不受影响 |
| 登录账号（管理员邮箱密码） | **Supabase Auth**（云端） | ❌ 不受影响 |
| 源代码 + 全部文档 | **GitHub** `JX0523/party-station-scheduler`（公开） | ❌ 不受影响 |
| 网站部署 | **Netlify** + **GitHub Pages**（云端自动构建） | ❌ 不受影响 |
| 每日保活 | GitHub Actions `keep-alive.yml`（云端定时） | ❌ 不受影响 |
| 构建用的密钥 | GitHub 仓库 **Secrets**（云端） | ❌ 不受影响 |
| `frontend/.env`（本地开发用） | 只在电脑上（被 gitignore） | ⚠️ **需重建**（见 3.3） |
| `frontend/node_modules`、`dist` | 本地临时产物 | ✅ 重新生成即可 |
| 浏览器里的小设置（放假换算修正、提示已读） | 本机浏览器 localStorage | ✅ 无关紧要，重新设置即可 |
| 手工备份的 JSON（`backups/`） | 你自己选的位置 | ⚠️ 需自己保存到私有位置 |

**不属于本项目、但同样只在本机的资产**（若也要一并搬走）：

| 资产 | 位置 | 说明 |
|------|------|------|
| DSH 对话记录 | `C:\Users\<用户名>\.dsh\sessions` | 本地存储，**登录账号不会自动恢复** |
| DSH 附件/设置/API 密钥 | `C:\Users\<用户名>\.dsh` | 同上 |
| `C:\deepseek harness` 工作目录 | 本地 | 其他工作的文件（考研调研等） |

> 🧰 现成工具：桌面 `DSH迁移工具\换电脑前双击我.bat` —— 换电脑前在**旧电脑**上双击一次，
> 会自动生成完整迁移包（安装程序 + 对话记录 + 工作目录 + 图文恢复说明）。
> 平时无需操作；排班系统本身不依赖该包。

---

## 2. 新电脑上「直接使用」（不写代码，1 分钟）

1. 浏览器打开任一网址：
   - **Netlify**：https://creative-brioche-5681d2.netlify.app
   - **GitHub Pages**：https://JX0523.github.io/party-station-scheduler/
2. 用管理员邮箱 + 密码登录（账号在云端，与电脑无关）
3. 正常使用：排班、放假设置、统计导出……

> 忘记密码：登录页点「忘记密码」或让管理员在 Supabase → Authentication → Users 里重置。

---

## 3. 新电脑上「做开发 / 发布」（5 步）

### 3.1 装两个工具
- **Git**：https://git-scm.com/download/win
- **Node.js 20+**：https://nodejs.org/（安装后命令行 `node -v` 能看到版本即可）

### 3.2 克隆代码
```bash
git clone https://github.com/JX0523/party-station-scheduler.git
cd party-station-scheduler
```

### 3.3 重建 `frontend/.env`（唯一需要手工恢复的本地文件）
从 Supabase 后台取两个值：**Supabase → 你的项目 → Project Settings → API**
```
VITE_SUPABASE_URL=https://mkbcbfzfrdrqywzjbrbu.supabase.co
VITE_SUPABASE_ANON_KEY=<复制 anon / publishable key>
VITE_ALLOW_REGISTRATION=false
```
> 也可以参考 `frontend/.env.example` 的格式。
> ⚠️ **这个文件不要提交到仓库**（`.gitignore` 已忽略）；anon key 本身是公开密钥，但仍按规范放在本地。

### 3.4 安装依赖（用国内镜像更快）
```bash
cd frontend
npm ci --registry=https://registry.npmmirror.com
```

### 3.5 验证并运行
```bash
npm run dev      # 本地开发预览
npm run build    # 生产构建

# 回到仓库根目录跑全部测试（无需依赖，纯 Node）
cd ..
Get-ChildItem test-*.mjs | ForEach-Object { node $_ }   # PowerShell
```

---

## 4. 数据备份与恢复

### 4.0 ⭐ 自动备份（已配置好，你什么都不用做）

| 项目 | 说明 |
|------|------|
| 备份到哪 | 私有仓库 **github.com/JX0523/party-station-backups**（仅你本人可见，已验证 private ✅） |
| 多久一次 | **每周日**北京时间约 11:30 自动执行（Actions 里也能随时手动触发） |
| 备份内容 | 成员 / 课表 / 排班 / 学期配置 / 时段配置 / 放假配置 / 统计表（JSON）+ manifest（含行数） |
| 保留策略 | 永久保留，每周一个文件夹 `backups/年-月-日/` |
| 依赖你的电脑吗 | ❌ **不依赖** —— 由 GitHub 云端执行，旧电脑丢了也照常备份 |
| 首次验证 | 已实测成功：2026-10-04 首份备份（18 成员 / 36 课表 / 47 排班 / 13 天放假配置）✅ |

> ⚠️ 该仓库含成员姓名、电话等个人信息，**必须保持 Private**，不要改成公开。
> 💡 每周的备份提交会让仓库保持活跃，不会被 GitHub 判定为闲置而停用定时任务。

**恢复方式**：从该仓库下载某个日期的文件夹 → 用主仓库的 `tools/restore-data.mjs` 恢复（见 4.2）。

### 4.1 手动备份（可选，平时用不到，因为已有 4.0 自动备份）
```powershell
$env:SUPABASE_URL="https://mkbcbfzfrdrqywzjbrbu.supabase.co"
$env:SUPABASE_SERVICE_KEY="<Supabase → Project Settings → API → secret key>"
node tools/backup-data.mjs D:\我的私有备份
```
输出：`members / course_schedules / assignments / semester_config / slot_config / day_config / duty_stats` 的 JSON + `manifest.json`。

> ⚠️ 手动备份同样含个人信息：**只能放在私有位置**（私有网盘 / 私有仓库 / 移动硬盘），
> **绝对不要提交到公开的 GitHub 仓库**。

### 4.2 恢复（灾难时）
1. 在 Supabase 建好数据库结构：SQL Editor 依次执行
   `database/schema.sql` → `migration-dayoff.sql` → `migration-dayoff-v2.sql` → `migration-dayoff-v3.sql` →
   `migration-v4-assignments-unique.sql` → `migration-v5-keepalive.sql` → `migration-v6-data-api-grants.sql`
2. 预演（不写数据）：`node tools/restore-data.mjs 备份目录`
3. 确认后写入：`node tools/restore-data.mjs 备份目录 --confirm`
4. 到系统页面核对：成员数、课表数、各周排班、统计数字一致

> 账号（Auth 用户）无法导出：恢复后在 Supabase → Authentication → Users 重新创建或邀请。

---

## 5. 账号与密钥清单（换电脑前请确认你记得这些账号）

| 服务 | 账号 | 用途 | 找不回时怎么办 |
|------|------|------|----------------|
| GitHub | **JX0523** | 代码仓库、Actions 部署 | 邮箱找回密码 |
| Supabase | 注册邮箱（如 1612245149@qq.com） | 数据库、登录账号 | 邮箱找回；项目数据在云端 |
| Netlify | 团队 JX0523 | 网站托管 | 邮箱找回 |

**GitHub 仓库 Secrets（部署用，云端保存，无需记住值）**：
`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`NETLIFY_AUTH_TOKEN`、`NETLIFY_SITE_ID`
> Secret 只能覆盖不能读回；若丢失：Netlify 令牌在 Netlify → User settings → Applications；
> Supabase 两个值在 Project Settings → API。

---

## 6. 日常运维速查

| 想做什么 | 怎么做 |
|----------|--------|
| 改代码并上线 | 改完 `git add -A && git commit -m "说明" && git push origin master` → 自动构建部署（详见 docs/git-workflow.md） |
| 只改文档 | 同样推送即可；纯文档提交**不会触发部署**（省 Netlify 积分） |
| 数据库结构变更 | 写 `database/migration-vX-*.sql` → Supabase SQL Editor 执行 → 登记到 tech-spec 第 7 节（**新表必须带 GRANT**） |
| 系统体检 | 加临时 Secret `SUPABASE_SERVICE_KEY` → Actions 运行 **System Audit** → 看 `audit-report.md` |
| 保活是否正常 | Actions 里看 **Keep Supabase Alive** 最近运行是否为绿色（每天一次） |
| 数据备份 | 见第 4.1 节 |

---

## 7. 应急处理

| 现象 | 先做什么 |
|------|----------|
| 网站打不开 | 换网络重试（国内对 GitHub/Netlify 偶发不通）；确认网址正确 |
| 网站能开但数据加载不出来 | 多半是 `*.supabase.co` 被网络阻断 → 换网络（手机热点）重试；仍不行检查 Supabase 项目是否被暂停 |
| Supabase 项目被暂停 | Supabase 后台点 **Resume project**（约 2-5 分钟恢复） |
| 部署失败（红色 ✗） | 看 Actions 日志；若提示 Netlify 积分超限，等每月重置或减少部署次数 |
| 排班结果不对 | 检查「学期设置」的**当前周**是否正确；用 Actions → System Audit 跑一次体检 |

---

## 8. 换电脑检查清单（照着打勾即可）

```
□ 记得 GitHub / Supabase / Netlify 三个账号的邮箱与密码（或能通过邮箱找回）
□ 知道两个网站地址，新电脑浏览器能登录系统
□ 需要改代码的：装好 Git + Node，克隆仓库，重建 frontend/.env
□ 数据备份无需操心：已配置每周自动备份到私有仓库 party-station-backups（见 4.0）
□ 旧电脑丢弃前：确认没有重要文件只留在这台机器上（按第 1 节表格逐项核对）
□ 旧电脑清除敏感信息：删除 frontend/.env、node_modules、以及含个人信息的备份文件
```

---

> 📅 最后更新：2026-09-24 ｜ 维护提示：每次新增密钥/服务/迁移脚本后，请回来更新本文第 1、5 节。