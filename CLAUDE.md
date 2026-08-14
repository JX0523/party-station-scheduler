# 党员工作站排班系统 — 项目开发指引

## 项目简介

为大学党员工作站开发的Web排班管理系统。管理员可在不同电脑上通过浏览器访问，完成成员管理、课表录入、自动排班、请假替补、值班统计等全流程工作。

## 文档索引

所有项目标准文档存放在 `docs/` 文件夹内：

| 文档 | 路径 | 说明 |
|------|------|------|
| 项目主页 | [README.md](README.md) | 项目简介、地址、结构、测试 |
| 发布记录 | [CHANGELOG.md](CHANGELOG.md) | 版本变更记录（每次发布前追加） |
| 产品需求文档 | [docs/requirements.md](docs/requirements.md) | 完整的功能需求与业务规则 |
| 技术规范 | [docs/tech-spec.md](docs/tech-spec.md) | 技术栈、架构、数据库设计、变更记录 |
| 设计规范 | [docs/design-guide.md](docs/design-guide.md) | UI设计风格、配色、组件规范 |
| 执行计划 | [docs/execution-plan.md](docs/execution-plan.md) | 分阶段实施步骤与里程碑 |
| Git/部署流程 | [docs/git-workflow.md](docs/git-workflow.md) | git 约定、CI/CD、回滚、数据库迁移流程 |

## 开发日志

每日开发记录存放在 `dev-logs/` 文件夹内，文件命名格式：`YYYY-MM-DD.md`

## 工作约定

1. **开发前**：阅读 `docs/execution-plan.md` 确认当前阶段目标
2. **编码时**：遵循 `docs/tech-spec.md` 的技术选型，参照 `docs/design-guide.md` 的UI规范
3. **功能实现**：对照 `docs/requirements.md` 确保需求覆盖完整
4. **每日收尾**：更新 `dev-logs/` 中当天的日志文件
5. **分步推进**：每个阶段完成后暂停，确认无误再进行下一阶段

## 项目结构

```
党员工作站排班系统/
├── CLAUDE.md                 # 本文件 — 项目指引（其他AI请先读这里）
├── docs/                     # 项目标准文档
│   ├── requirements.md       # 产品需求文档（含变更记录）
│   ├── tech-spec.md          # 技术规范（含数据库设计、变更记录）
│   ├── design-guide.md       # 设计规范
│   └── execution-plan.md     # 执行计划（含阶段六修复记录）
├── dev-logs/                 # 开发日志（YYYY-MM-DD.md）
├── .github/workflows/        # CI/CD
│   ├── deploy.yml            # GitHub Pages + Netlify 双部署
│   └── keep-alive.yml        # Supabase 保活（每周2次ping，防止免费项目被暂停）
├── frontend/                 # React前端项目
│   ├── src/
│   │   ├── components/       # 可复用组件（Navbar, Layout, DaySelector）
│   │   ├── pages/            # 页面组件（Dashboard, Scheduling, Members...）
│   │   ├── hooks/            # 自定义Hooks
│   │   ├── lib/              # Supabase客户端、排班算法
│   │   │   ├── supabase.js
│   │   │   └── scheduling-algorithm.js   # 核心排班算法（唯一算法入口）
│   │   ├── styles/           # 全局样式
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/               # 含 Netlify _redirects（SPA路由）
│   ├── .env                  # 本地配置（VITE_SUPABASE_*，已被gitignore）
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js        # base 读取 VITE_BASE（GitHub Pages 子路径）
├── database/                 # 数据库相关
│   ├── schema.sql            # 建表SQL（含RLS、默认数据、唯一约束）
│   ├── migration-dayoff.sql  # 调休功能迁移v1
│   ├── migration-dayoff-v2.sql # 调休课表映射迁移v2
│   ├── migration-dayoff-v3.sql # 单双周独立课表映射迁移v3
│   └── migration-v4-assignments-unique.sql # 排班唯一约束迁移v4（2026-08-14）
├── test-algorithm.mjs           # 算法单元测试（27项）
├── test-phase1-fix.mjs          # 课表冲突+调休测试（34项）
├── test-comprehensive.mjs       # 综合场景测试（49项）
├── test-full-semester.mjs       # 全学期模拟测试（14项）
├── test-basic-functionality.mjs # 基础功能测试（59项）
├── test-equivalence-classes.mjs # 等价类测试（60项）
└── test-fixed-behaviors.mjs     # 2026-08-14 修复回归测试（11项）
```

## ⚠️ 关键行为说明（改代码前必读）

1. **排班算法唯一入口**：`frontend/src/lib/scheduling-algorithm.js` 的 `runSchedulingAlgorithm(params)`。
   Dashboard 和 Scheduling 两个页面共用，改算法必须同步跑全部 test-*.mjs。
2. **mode 参数**（2026-08-14 新增）：`'一般'（默认）` 排除上周正常值班的人；`'紧急'` 跳过连续性约束，
   生成 `is_emergency=true`。由学期设置页的 `current_mode` 控制，页面调用时从 semester_config 读取。
3. **补排优先级**：`makeUpMembers`（上周请假）优先级最高，**覆盖**连续性约束。
   调用方查询必须满足：`lastWeek` 只取 `status='正常'`；`makeUpMembers` 只取 `week_number=当前周-1`。
4. **时段人数语义**：`required_count=0` = 该时段不需要值班（绝不安排人）；某天全0 = 当天不排班。
   每日最低保障（每天≥1人）只对「至少一个时段>0」的工作日生效。
5. **maxPerWeek**：`max(配置需求总和, max(5, 总人数/2))`，保证时段配置不被上限压制。
6. **assignments 唯一约束**：`(week_number, day_of_week, slot, member_id)` 唯一，防重复排班；
   手动加人/替补插入失败会弹出错误提示（不要绕过约束）。
7. **数据库变更流程**：先在 `database/schema.sql` 更新建表语句，再写一个 `migration-vX-*.sql`，
   并在 tech-spec.md 第7节变更记录中登记。已有数据库需要手动在 Supabase SQL Editor 执行迁移。
8. **环境变量**：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 必填；
   `VITE_ALLOW_REGISTRATION=true` 才显示登录页注册入口（默认关闭）；
   `VITE_BASE` 用于 GitHub Pages 子路径部署。CI secrets 与 `frontend/.env` 保持一致。
9. **测试全部通过**：`Get-ChildItem test-*.mjs | ForEach-Object { node $_ }`（241+11项）。
   新增行为必须补测试（参考 test-fixed-behaviors.mjs 的风格）。

## 快速命令

```bash
# 启动开发服务器
cd frontend && npm run dev

# 构建生产版本
cd frontend && npm run build
```
