# 更新日志 (CHANGELOG)

本文件按时间倒序列出每次版本发布的内容。每次提交推送前请在此追加一条记录。

格式说明：
- `新增` = 新功能；`修复` = bug 修复；`变更` = 行为/语义调整；`加固` = 安全/健壮性；`文档` = 文档

---

## [2026-09-24] — 换电脑/灾备保障：迁移手册 + 备份恢复工具

### 新增
- `docs/migration-and-recovery.md`：**迁移与灾备手册**（资产清单、新电脑上手、备份恢复、账号密钥清单、应急处理、检查清单）
- `tools/backup-data.mjs`：一键导出全部业务表为 JSON（含 manifest）
- `tools/restore-data.mjs`：按依赖顺序恢复数据；**默认预演，必须 `--confirm` 才写入**

### 验证
- 全新电脑模拟（克隆到干净目录）：**311 项测试全过**；`npm ci` 157 包 4 秒；`npm run build` 成功产出 dist
- 仓库无机器专属绝对路径；文档/脚本在克隆中齐全

---

## [2026-09-24] — 深度测试轮：真实数据审计 + 边界测试 + 小修复

### 测试
- 新增 `test-edge-cases.mjs`（20 项边界/异常场景）；新增 `tools/system-audit.mjs` 系统审计脚本
- **全量 9 个套件 / 311 项用例 / 0 失败**
- 真实数据审计（GitHub Actions 通道执行）：成员/课表/排班完整性全部通过，
  模拟当前周与下周生成零课表冲突，整周放假与 13 天连假均不排班，**未发现阻塞性问题**

### 修复
- 算法角色标签：0 名成员时改为显示「无可用成员」（此前会显示「全部角色」，且该分支不可达）

---

## [2026-09-24] — 新功能：放假设置（按日期放假）+ 修复整周放假仍排班

### 新增
- **放假设置面板**（首页）：选择「开始日期 ~ 结束日期」即可批量放假，支持连续多天（如连放 13 天）；
  列出已放假日历日期、可按周取消；可一键清理放假日上已生成的排班（仅未锁定周）
- 首页顶部「新功能」提示横幅（可关闭）；排班管理页同步提示入口
- 新增日期换算纯函数库 `frontend/src/lib/holiday-dates.js` 与测试 `test-holiday-dates.mjs`（26 项）

### 修复
- **整周放假仍被排班**（核心）：算法在「显式把整周设为放假」时会回退成默认周一~周五；
  现改为仅当完全没有工作日配置时才回退，显式全放假 = 该周不排班

### 体验优化
- **放假设置无需填写任何换算信息**：第1周周一由系统按「当前周 + 今天」自动推算，
  面板顶部显示推算结果（第1周周一 & 本周日期范围）供核对；推算不准时可一键手动修正

### 测试
- 全量 291/291 通过（原 254 + 放假功能 35 + 等价类 2）

---

## [2026-09-24] — 应对 Supabase Data API 授权政策变更（2026-10-30 生效）

### 加固
- **新建表将不再自动获得 Data API 权限**（Supabase 官方政策，2026-10-30 起生效）：
  `database/schema.sql` 新增第 9 节，为现有 8 张表补齐显式 `GRANT`；业务表仅授权
  `authenticated`/`service_role`（匿名不可读写），`keep_alive_pings` 额外授权 `anon` 供保活使用
- 新增 `database/migration-v6-data-api-grants.sql`：幂等授权脚本 + 新增表模板 + 授权验证 SQL，
  可在 Supabase SQL Editor 执行一次使授权显式化（现有表本就已授权，属可选加固）

### 文档
- `CLAUDE.md` 新增第 8 条硬性约定：**任何新建表的迁移必须同时写 GRANT**（附示例），
  否则前端会报 `permission denied for table xxx`（SQLSTATE 42501）
- `docs/tech-spec.md` 新增 3.8 节：政策说明、影响范围、最小权限口径

### 说明
- 现有表和现有功能**不受影响**（官方明确：现有授权保留，无需任何操作即可继续运行）

### 安全核实（追加）
- 借 GitHub Actions 通道核实 Supabase Auth 配置：**`disable_signup: true`（自助注册已关闭）**，
  实测随机账号注册被拒绝（`signup_disabled`）——外部无法再通过注册获取系统数据
- 核实用的临时仓库 Secret 与一次性工作流已全部移除，仓库未遗留敏感信息

---

## [2026-08-21] — Supabase 保活机制升级

### 修复
- **免费项目仍被标记「低活跃度」**（核心）：保活 ping 由每周 2 次 SELECT 改为
  **每天 1 次 INSERT 真实写操作**——SELECT 可能命中缓存不计入 Supabase 的活动检测，
  INSERT 是无法被缓存绕过的数据库写事务
- **心跳表无限增长**：新增 30 天自动清理（DELETE 旧心跳行）

### 变更
- 新增 `keep_alive_pings` 心跳表（[migration-v5-keepalive.sql](database/migration-v5-keepalive.sql)，
  需在 Supabase SQL Editor 手动执行）

### 文档
- tech-spec.md 第 7 节登记变更；新增 dev-logs/2026-08-21.md

---

## [2026-08-14] — 缺陷修复与功能补全（commit d6c3a41）

这是第一次正式记录的发布。此前项目通过 git 持续开发但未维护 CHANGELOG。

### 新增
- **紧急模式**（PRD F9 落地）：学期设置页可切换 一般/紧急；算法新增 `mode` 参数，
  紧急模式跳过「不连续值班」约束并标记排班为 `is_emergency=true`
- **回归测试**：新增 `test-fixed-behaviors.mjs`（11 项），覆盖本次所有修复
- **文档**：README.md、CHANGELOG.md、docs/git-workflow.md、CLAUDE.md 关键行为说明

### 修复
- **请假后「下周补排」失效**（核心）：补排优先级现在覆盖连续性约束；
  `lastWeek` 只统计 `status='正常'` 的人，补排名单/标记清除只限定上一周
- **时段人数设为 0 被强制填 1 人**：现在 0 = 该时段不需要值班；某天全 0 则不排班
- **maxPerWeek 压制时段配置**：上限改为 `max(配置需求总和, max(5, 总人数/2))`
- **Dashboard 首次自动生成忽略调休配置**：生成前先加载 day_config
- **补排标记跨周误清**：读取与清除都限定上一周

### 加固
- **assignments 唯一约束** `UNIQUE(week_number, day_of_week, slot, member_id)`：
  防重复排班（schema.sql + migration-v4-assignments-unique.sql，**已执行并验证**）
- **Excel 导入校验**：角色合法性、错误提示、跳过行统计
- **默认关闭公开注册**：登录页注册入口由 `VITE_ALLOW_REGISTRATION=true` 控制

### 变更
- 测试语义更新：EC-4.1（10条）、EC-5.4（全0不排班）、EC-6.x（调休日需手动设置时段人数）、
  phase1 测试6、algorithm 场景3/6、full-semester 请假模拟

### 数据库
- 执行 `database/migration-v4-assignments-unique.sql`：清理历史重复（实际 0 条）+ 添加唯一约束，已生效

### 部署
- GitHub Actions run #29 部署成功（GitHub Pages + Netlify 均 HTTP 200）

---

## [2026-06-22 及之前] — 项目开发期

项目初始开发（React + Vite + Supabase），从零搭建到 6 大功能模块 + 241 项测试 + 双平台部署。
历史提交记录见 git log（commit 9006ca0、1bac605、7fa88d7 等）。
## [2026-08-21] — Netlify 构建积分优化 + 部署流水线加固（追加）

- **修复**：Netlify 免费额度（300 构建积分/月）使用达 75%——部署工作流加 paths 过滤，
  只有前端代码变更才触发部署（纯文档/测试/日志提交零消耗）
- **加固**：新增 netlify-autofix.yml 工作流，自动调用 Netlify API 关闭 Netlify 自身的
  GitHub 自动构建（stop_builds=true，已生效）；网站更新仍由 GitHub Actions 免费完成
- **变更**：frontend/index.html 增加 description meta
- **流程**：确立「每次操作后：检查→写文档→上传→验证」标准流程（见 CLAUDE.md）
## [2026-08-21] — Netlify 部署 403 真相与最终修复（追加2）

- **真相**：部署 403 的根因是 **Netlify 积分超限**（300/月 用尽，`Account credit usage exceeded`），
  非配置问题；Netlify 在积分用尽时封禁一切新部署，8/25 周期重置后自动恢复
- **修复**：netlify-autofix.yml v3 将站点恢复为 stop_builds=true（自动构建停止），
  并留档 netlify-autofix-report.txt（前后配置对比）
- **影响**：8/25 前 Netlify 无法接收新部署（GitHub Pages 不受影响，正常更新）；
  8/25 后 GitHub Actions 部署自动恢复

## [2026-09-09] — 投入使用前检查：数据清理 + 1处修复 + 安全检查

- **数据清理**：删除第 3/4/5 周测试/预生成排班 44 条 + 第 1/3/4/5 周混乱 day_config 14 条；
  第 1、2 周真实排班 26 条逐一比对未动（详见 dev-logs/2026-09-09.md）
- **修复**：Scheduling 页生成空结果不再误删整周（与 Dashboard 对齐）
- **安全检查**：公开注册实测为开启状态（建议后台关闭 Allow new users）；测试账号已删除
- **模拟验证**：第 3 周切换时 6/6 请假补排生效、零课表冲突、5 天全覆盖
