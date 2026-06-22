# 党员工作站排班系统 — 项目开发指引

## 项目简介

为大学党员工作站开发的Web排班管理系统。管理员可在不同电脑上通过浏览器访问，完成成员管理、课表录入、自动排班、请假替补、值班统计等全流程工作。

## 文档索引

所有项目标准文档存放在 `docs/` 文件夹内：

| 文档 | 路径 | 说明 |
|------|------|------|
| 产品需求文档 | [docs/requirements.md](docs/requirements.md) | 完整的功能需求与业务规则 |
| 技术规范 | [docs/tech-spec.md](docs/tech-spec.md) | 技术栈、架构、数据库设计 |
| 设计规范 | [docs/design-guide.md](docs/design-guide.md) | UI设计风格、配色、组件规范 |
| 执行计划 | [docs/execution-plan.md](docs/execution-plan.md) | 分阶段实施步骤与里程碑 |

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
├── CLAUDE.md                 # 本文件 — 项目指引
├── docs/                     # 项目标准文档
│   ├── requirements.md       # 产品需求文档
│   ├── tech-spec.md          # 技术规范
│   ├── design-guide.md       # 设计规范
│   └── execution-plan.md     # 执行计划
├── dev-logs/                 # 开发日志
│   └── YYYY-MM-DD.md
├── frontend/                 # React前端项目
│   ├── src/
│   │   ├── components/       # 可复用组件（Navbar, Layout, DaySelector）
│   │   ├── pages/            # 页面组件（Dashboard, Scheduling, Members...）
│   │   ├── hooks/            # 自定义Hooks
│   │   ├── lib/              # Supabase客户端、排班算法
│   │   │   ├── supabase.js
│   │   │   └── scheduling-algorithm.js
│   │   ├── styles/           # 全局样式
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── database/                 # 数据库相关
│   ├── schema.sql            # 建表SQL（含RLS、默认数据）
│   ├── migration-dayoff.sql  # 调休功能迁移v1
│   └── migration-dayoff-v2.sql # 调休课表映射迁移v2
├── test-algorithm.mjs        # 算法单元测试（27项）
├── test-phase1-fix.mjs       # 课表冲突+调休测试（32项）
├── test-comprehensive.mjs    # 综合场景测试（49项）
└── test-full-semester.mjs    # 全学期模拟测试（14项）
```

## 快速命令

```bash
# 启动开发服务器
cd frontend && npm run dev

# 构建生产版本
cd frontend && npm run build
```
