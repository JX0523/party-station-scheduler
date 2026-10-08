# 党员工作站排班系统

[![CI](https://github.com/JX0523/party-station-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/JX0523/party-station-scheduler/actions/workflows/ci.yml)
[![Deploy](https://github.com/JX0523/party-station-scheduler/actions/workflows/deploy.yml/badge.svg)](https://github.com/JX0523/party-station-scheduler/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Tests](https://img.shields.io/badge/tests-340%20passed-brightgreen)

为大学党员工作站设计的 **Web 排班管理系统**：管理员在浏览器上完成成员管理、课表录入、自动排班、请假替补、**按日期放假**、值班统计等全流程工作，替代手工排班。

> 🚀 **想自己搭一套 / 二次开发？** 见 [CONTRIBUTING.md](CONTRIBUTING.md)（含 5 分钟复现步骤与演示数据 `database/seed-demo.sql`）。
> 🤖 **用 AI 助手改代码？** 先读 [CLAUDE.md](CLAUDE.md)（项目硬性约定）。

## 线上地址

| 平台 | 地址 | 说明 |
|------|------|------|
| Netlify | https://creative-brioche-5681d2.netlify.app | 主入口（国内访问快） |
| GitHub Pages | https://JX0523.github.io/party-station-scheduler/ | 备用 |
| 数据库 | Supabase（PostgreSQL 15 + Auth + RLS） | 云端，自动保活 |

> 推送 master 分支会自动触发 GitHub Actions 重新构建并部署到两个平台。

## 功能

- **成员管理**：三级角色（部员 > 部长 > 主席团），Excel 批量导入
- **课表驱动排班**：按人录入单/双周课表，有课即不可值班
- **自动排班算法**：两阶段（每日覆盖 + 轮询补充），兼顾公平与连续性
- **请假替补**：标记请假 → 推荐替补 → 下周自动优先补排
- **调休/放假**：每周可配置工作日，周末调休可映射「补周几」的课表
- **按日期放假**（2026-09 新增）：选起止日期即可批量放假（支持连放多天），放假当天不排班；
  周次自动推算 + 写入前预览核对，可一键清理放假日的排班
- **成员停用**：退出成员可「停用」而非删除——不再参与排班，**历史记录与统计全部保留**
- **一般/紧急模式**：紧急模式允许连续值班，人手紧张时兜底
- **统计导出**：按周/整学期汇总值班时长，导出 Excel

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 8 + React Router 7（SPA） |
| 数据 | Supabase：PostgreSQL 15、Auth（邮箱密码）、RLS 行级安全 |
| 导出 | SheetJS (xlsx) |
| 部署 | GitHub Pages + Netlify，GitHub Actions 自动构建 |
| 测试 | 单元测试 + 运行时冒烟测试（**340 项检查**：324 项纯 Node 无依赖 + 16 项 jsdom 页面渲染） |

## 项目结构

```
党员工作站排班系统/
├── README.md / CHANGELOG.md / LICENSE       # 说明、变更记录、MIT 许可证
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md     # 贡献指南、行为准则
├── CLAUDE.md                                # AI 开发指引（改代码前必读）
├── 使用手册.md / 排班操作速查指南.md          # 面向使用者
├── docs/                                    # 需求/技术/设计/执行计划/git 工作流/迁移灾备
├── dev-logs/                                # 每日开发日志（含每次改动的来龙去脉）
├── frontend/                                # React 前端
│   ├── src/lib/                             # 纯函数：排班算法、日期换算（已单测）
│   ├── src/pages/  src/components/          # 页面与组件
│   └── vendor/xlsx-0.20.3.tgz               # 内置修复版依赖（离线可装）
├── database/                                # schema.sql + 迁移脚本 + seed-demo.sql（演示数据）
├── test-*.mjs                               # 11 个测试套件（340 项检查：单元 + 运行时渲染）
├── tools/                                   # 运维脚本：系统审计 / 数据备份 / 数据恢复
└── .github/                                 # CI、部署、保活、Issue/PR 模板
```

## 本地开发 / 复现

```bash
git clone https://github.com/JX0523/party-station-scheduler.git
cd party-station-scheduler/frontend
npm ci               # 网络慢可加 --registry=https://registry.npmmirror.com
cp .env.example .env # 填入自己的 Supabase URL 与 anon key
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 生产构建
npm run lint         # 代码检查（必须 0 error）

# 跑全部测试（在项目根目录）
Get-ChildItem test-*.mjs | ForEach-Object { node $_ }   # PowerShell
for f in test-*.mjs; do node "$f"; done               # bash
# 说明：未安装依赖时，test-xlsx.mjs 与 test-runtime-smoke.mjs 会自动跳过（打印提示），
#      其余套件纯 Node 可跑；执行 npm ci && npm run build 后再跑，即得完整 340 项。
```

**完整复现步骤**（含 Supabase 建表、演示数据、创建账号）：见 [CONTRIBUTING.md](CONTRIBUTING.md) 第一节。
演示数据：在 Supabase SQL Editor 执行 `database/seed-demo.sql`，即可得到 6 名成员 + 课表 + 一周排班。

## 环境变量

复制 `frontend/.env.example` 为 `frontend/.env` 并填写：

```
VITE_SUPABASE_URL=你的Supabase项目URL
VITE_SUPABASE_ANON_KEY=你的公开密钥（anon/publishable）
VITE_ALLOW_REGISTRATION=false   # true=开放登录页自助注册（默认关闭）
```

GitHub Actions 部署时通过仓库 Secrets 注入：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`NETLIFY_AUTH_TOKEN`、`NETLIFY_SITE_ID`。

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/requirements.md](docs/requirements.md) | 产品需求（PRD）与业务规则 |
| [docs/tech-spec.md](docs/tech-spec.md) | 技术规范、数据库设计、变更记录 |
| [docs/design-guide.md](docs/design-guide.md) | UI 设计规范 |
| [docs/execution-plan.md](docs/execution-plan.md) | 分阶段执行计划 |
| [docs/git-workflow.md](docs/git-workflow.md) | git 提交与 CI/CD 部署流程 |
| [docs/migration-and-recovery.md](docs/migration-and-recovery.md) | **换电脑/灾备**：资产清单、新电脑上手、备份恢复、应急处理 |
| [使用手册.md](使用手册.md) | 面向使用者的操作手册 |
| [排班操作速查指南.md](排班操作速查指南.md) | 每周 5 分钟速查 |
| [CHANGELOG.md](CHANGELOG.md) | 版本发布记录 |
| [dev-logs/](dev-logs/) | 每日开发日志 |

## 测试

| 套件 | 数量 | 覆盖 |
|------|:--:|------|
| test-algorithm.mjs | 27 | 算法核心场景 |
| test-basic-functionality.mjs | 59 | 基础功能 |
| test-comprehensive.mjs | 49 | 综合用户场景 |
| test-equivalence-classes.mjs | 62 | 等价类全覆盖（工作日/角色配额/调休/整周放假） |
| test-edge-cases.mjs | 20 | 极端输入、功能叠加、并发边界 |
| test-holiday-dates.mjs | 40 | 放假：日期换算、自动推算、预览文案、不排班 |
| test-xlsx.mjs | 8 | Excel 导入/导出往返（xlsx 0.20.3） |
| test-fixed-behaviors.mjs | 11 | 关键修复回归 |
| test-full-semester.mjs | 14 | 整学期模拟 |
| test-phase1-fix.mjs | 34 | 课表冲突与调休 |
| test-runtime-smoke.mjs | 16 | **运行时冒烟**：加载构建产物，逐页真实渲染（7 个页面）+ 未登录场景 |
| **合计** | **340** | 全部通过（CI 每次提交都会跑） |

## 已知注意点

- 排班算法唯一入口：`frontend/src/lib/scheduling-algorithm.js`（Dashboard/Scheduling 共用）
- `required_count=0` 表示该时段不需要值班；某天全 0 则不排班
- 小团队（<20 人）在一般模式下会出现隔周人数波动，属「不连续值班」的必然结果，必要时切紧急模式
- 新增数据库变更：先改 `database/schema.sql`，再写 `migration-vX-*.sql`，最后登记到 tech-spec 第 7 节
  （**新建表必须显式 `GRANT`**，否则前端报 `permission denied`，详见 CLAUDE.md 第 8 条）
- **成员在岗状态语义**：排班/课表查询排除已停用成员；**统计必须包含全部成员**（停用者历史不能丢）；
  删除成员会 `ON DELETE CASCADE` 连带删除其历史排班，界面已加警告并推荐「停用」
- 放假配置复用 `day_config`（`is_workday=false`），**整周全放假 = 该周不排班**；
  日期→周次依赖「学期设置」的当前周，页面有推算提示与预览行，**每周记得把当前周 +1**

---

## 开源与贡献

- **许可证**：[MIT](LICENSE) —— 可自由使用、修改、分发（保留版权声明即可）
- **贡献**：欢迎提交 Issue / PR，请先读 [CONTRIBUTING.md](CONTRIBUTING.md)；
  提交前跑一遍测试与 `npm run build`（CI 也会检查）
- **数据与隐私**：仓库中**不含任何真实成员数据**（姓名/电话/排班都在你自己的 Supabase 项目里）；
  `.gitignore` 已排除 `.env` 与数据备份目录，请勿把个人数据提交到公开仓库

---

> 最后更新：2026-10-05 ｜ 潘佳欣（B23042125）毕业设计项目