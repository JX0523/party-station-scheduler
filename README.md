# 党员工作站排班系统

为大学党员工作站设计的 **Web 排班管理系统**：管理员在浏览器上完成成员管理、课表录入、自动排班、请假替补、值班统计等全流程工作，替代手工排班。

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
- **一般/紧急模式**：紧急模式允许连续值班，人手紧张时兜底
- **统计导出**：按周/整学期汇总值班时长，导出 Excel

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 8 + React Router 7（SPA） |
| 数据 | Supabase：PostgreSQL 15、Auth（邮箱密码）、RLS 行级安全 |
| 导出 | SheetJS (xlsx) |
| 部署 | GitHub Pages + Netlify，GitHub Actions 自动构建 |
| 测试 | 纯 Node 单元测试（254 项，无需安装依赖即可运行） |

## 项目结构

```
党员工作站排班系统/
├── CLAUDE.md                 # AI 开发指引（改代码前必读）
├── README.md                 # 本文件
├── CHANGELOG.md              # 发布记录
├── docs/                     # 需求/技术/设计/执行计划 + git 工作流
├── dev-logs/                 # 每日开发日志
├── frontend/                 # React 前端（唯一代码仓库主体）
├── database/                 # 建表 SQL + 迁移脚本
├── test-*.mjs                # 7 个测试套件（254 项）
└── .github/workflows/        # 部署 + Supabase 保活
```

## 本地开发

```bash
cd frontend
npm install
npm run dev          # 开发服务器
npm run build        # 生产构建

# 跑全部测试（在项目根目录，无需装依赖）
Get-ChildItem test-*.mjs | ForEach-Object { node $_ }   # PowerShell
for f in test-*.mjs; do node "$f"; done               # bash
```

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
| test-equivalence-classes.mjs | 60 | 等价类全覆盖 |
| test-fixed-behaviors.mjs | 11 | 2026-08-14 修复回归 |
| test-full-semester.mjs | 14 | 16 周全学期模拟 |
| test-phase1-fix.mjs | 34 | 课表冲突与调休 |

## 已知注意点

- 排班算法唯一入口：`frontend/src/lib/scheduling-algorithm.js`（Dashboard/Scheduling 共用）
- `required_count=0` 表示该时段不需要值班；某天全 0 则不排班
- 小团队（<20 人）在一般模式下会出现隔周人数波动，属「不连续值班」的必然结果，必要时切紧急模式
- 新增数据库变更：先改 `database/schema.sql`，再写 `migration-vX-*.sql`，最后登记到 tech-spec 第 7 节

---

> 最后更新：2026-08-14 ｜ 潘佳欣（B23042125）毕业设计项目