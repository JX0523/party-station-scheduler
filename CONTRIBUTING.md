# 贡献指南（CONTRIBUTING）

感谢你愿意改进这个项目！本文档说明**如何在本机跑起来、改代码、跑测试、提交 PR**。

> 如果你是 AI 助手：请先阅读 [`CLAUDE.md`](CLAUDE.md)，那里有针对本项目的硬性约定。

---

## 一、5 分钟跑起来（复现本项目）

### 1. 需要准备
- **Node.js 20+**、**Git**
- 一个 **Supabase 项目**（免费版即可，<https://supabase.com>）

### 2. 克隆 + 安装
```bash
git clone https://github.com/JX0523/party-station-scheduler.git
cd party-station-scheduler/frontend
npm ci        # 若网络慢：npm ci --registry=https://registry.npmmirror.com
```

### 3. 建数据库（Supabase → SQL Editor，按顺序执行）
1. `database/schema.sql` —— 建表 + RLS 策略 + GRANT
2. `database/seed-demo.sql` —— **可选**：灌入演示数据（6 名成员 + 课表 + 一周排班），便于直接看到效果
3. 如需登录：Supabase → Authentication → Users → **Add user**（邮箱 + 密码）
   > 本项目**默认关闭自助注册**（`VITE_ALLOW_REGISTRATION` 控制），账号由管理员创建

### 4. 配置环境变量
```bash
cd frontend
cp .env.example .env
# 编辑 .env，填入 Supabase → Project Settings → API 里的 URL 与 anon key
```

### 5. 启动
```bash
npm run dev      # http://localhost:5173
```

---

## 二、改动前请先跑测试（本项目约定）

```bash
# 在仓库根目录，无需安装依赖（纯 Node 脚本）
Get-ChildItem test-*.mjs | ForEach-Object { node $_ }    # PowerShell
for f in test-*.mjs; do node "$f"; done                   # bash
```

当前基线：**10 个套件 / 324 项用例，全部通过**。你的改动**不应让任何一项失败**。

| 套件 | 覆盖内容 |
|------|---------|
| `test-algorithm.mjs` / `test-phase1-fix.mjs` | 排班算法主逻辑与两阶段策略 |
| `test-equivalence-classes.mjs` | 边界等价类（工作日/角色配额/调休等） |
| `test-holiday-dates.mjs` | 放假功能的日期换算与预览 |
| `test-edge-cases.mjs` | 极端输入、功能叠加、并发边界 |
| `test-xlsx.mjs` | Excel 导入/导出（xlsx 0.20.3） |
| `test-full-semester.mjs` / `test-comprehensive.mjs` | 整学期模拟与综合场景 |

```bash
# 构建与代码检查
cd frontend
npm run build
npm run lint     # 必须 0 error（warning 允许）
```

---

## 三、代码约定

1. **纯函数优先**：算法与日期换算放在 `src/lib/`，不依赖 React/DOM，便于单测
2. **新功能必须带测试**：在根目录新增或扩展 `test-*.mjs`
3. **数据库改动**：迁移写成 `database/migration-vX-说明.sql`，**幂等**（可重复执行），
   且**新建表必须显式 `GRANT`**（Supabase 2026-10-30 起新表不再自动授权，否则前端报 42501）
4. **成员在岗状态语义**（易错，务必遵守）：
   - 排班/课表查询用 `.eq('active', true)` **排除已停用成员**
   - **统计必须包含全部成员**（停用者历史时长不能消失）
   - 删除成员会 `ON DELETE CASCADE` 连带删除其历史排班，UI 必须警告并推荐「停用」
5. **放假/工作日配置**：复用 `day_config`，**不要新建表**；整周全放假 = 该周不排班（算法已如此实现）
6. **错误处理**：所有 Supabase 写操作都要检查 `error` 并用 toast 提示用户
7. **不要提交**：`frontend/.env`、`node_modules`、`dist`、任何含真实姓名/电话的备份（`.gitignore` 已覆盖）

---

## 四、提交与 PR

1. 从 `master` 开分支：`git checkout -b feat/你的功能`
2. 提交信息用中文或英文皆可，建议格式：`类型: 简述`（类型：新增/修复/文档/测试/重构）
3. 推送前自查（CI 也会跑同样的检查）：
   - [ ] 全部测试通过
   - [ ] `npm run build` 成功
   - [ ] `npm run lint` 无 error
   - [ ] 新增行为已补测试
   - [ ] 涉及数据库的改动附了迁移 SQL（含 GRANT）
   - [ ] 更新了 `CHANGELOG.md` 与相关文档
4. 发起 Pull Request，写清「改了什么、为什么、怎么验证」；CI 通过后即可合并

> 本项目由 **GitHub Actions** 自动检查（`.github/workflows/ci.yml`）与自动部署
> （`.github/workflows/deploy.yml`：推送到 `master` 时构建并发布到 GitHub Pages + Netlify）。

---

## 五、可以做什么（欢迎的方向）

- 支持更多排班约束（如「同一人不同时段连排限制」「技能匹配」）
- 移动端体验优化 / 首屏体积优化（当前 JS ≈ 980 KB，可按路由拆包）
- 统计维度扩展（按月、按角色、导出图表）
- 无障碍与多语言
- 补充测试用例（尤其 UI 交互与并发场景）

## 六、行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
