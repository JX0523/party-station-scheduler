# 更新日志 (CHANGELOG)

本文件按时间倒序列出每次版本发布的内容。每次提交推送前请在此追加一条记录。

格式说明：
- `新增` = 新功能；`修复` = bug 修复；`变更` = 行为/语义调整；`加固` = 安全/健壮性；`文档` = 文档

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