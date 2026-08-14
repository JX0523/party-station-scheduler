# 技术规范

## 1. 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | React | 18.x | SPA单页应用 |
| 构建工具 | Vite | 5.x | 快速开发构建 |
| 语言 | JavaScript (JSX) | ES2022 | - |
| 路由 | React Router | 6.x | 客户端路由 |
| 状态管理 | React Context | - | 轻量级全局状态 |
| UI样式 | CSS Modules | - | 组件级样式隔离 |
| HTTP客户端 | Supabase JS Client | 2.x | 数据库直连 |
| 后端服务 | Supabase | - | BaaS |
| 数据库 | PostgreSQL | 15 | 通过Supabase管理 |
| 用户认证 | Supabase Auth | - | Email+密码 |
| 图表 | 自行实现 | - | 轻量表格展示 |
| Excel导出 | xlsx | - | SheetJS社区版 |
| 部署 | Vercel | - | 免费托管 |

## 2. 架构图

```
┌──────────────────────────────────────┐
│          浏览器 (Chrome/Edge)         │
├──────────────────────────────────────┤
│         React SPA (Vercel)           │
│  ┌────────┐ ┌──────┐ ┌───────────┐  │
│  │ 登录页  │ │ 首页  │ │ 成员管理   │  │
│  ├────────┤ ├──────┤ ├───────────┤  │
│  │ 课表管理│ │排班页│ │ 统计导出   │  │
│  └────────┘ └──────┘ └───────────┘  │
├──────────────────────────────────────┤
│       Supabase JS Client (SDK)       │
├──────────────────────────────────────┤
│          Supabase Cloud              │
│  ┌──────────┐ ┌───────────────────┐  │
│  │   Auth   │ │  PostgreSQL (RDS) │  │
│  └──────────┘ └───────────────────┘  │
└──────────────────────────────────────┘
```

## 3. 数据库表结构

### 3.1 members — 成员表
```sql
CREATE TABLE members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('部员', '部长', '主席团')),
  phone       TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 course_schedules — 课表
```sql
CREATE TABLE course_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE,
  week_type   TEXT NOT NULL CHECK (week_type IN ('单周', '双周')),
  -- 周一
  mon_34      BOOLEAN DEFAULT false,  -- true=有课不能值班
  mon_67      BOOLEAN DEFAULT false,
  mon_89      BOOLEAN DEFAULT false,
  -- 周二
  tue_34      BOOLEAN DEFAULT false,
  tue_67      BOOLEAN DEFAULT false,
  tue_89      BOOLEAN DEFAULT false,
  -- 周三
  wed_34      BOOLEAN DEFAULT false,
  wed_67      BOOLEAN DEFAULT false,
  wed_89      BOOLEAN DEFAULT false,
  -- 周四
  thu_34      BOOLEAN DEFAULT false,
  thu_67      BOOLEAN DEFAULT false,
  thu_89      BOOLEAN DEFAULT false,
  -- 周五
  fri_34      BOOLEAN DEFAULT false,
  fri_67      BOOLEAN DEFAULT false,
  fri_89      BOOLEAN DEFAULT false,
  -- 周六
  sat_34      BOOLEAN DEFAULT false,
  sat_67      BOOLEAN DEFAULT false,
  sat_89      BOOLEAN DEFAULT false,
  -- 周日
  sun_34      BOOLEAN DEFAULT false,
  sun_67      BOOLEAN DEFAULT false,
  sun_89      BOOLEAN DEFAULT false,
  UNIQUE(member_id, week_type)
);
```

### 3.3 semester_config — 学期配置
```sql
CREATE TABLE semester_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL DEFAULT '新学期',
  first_week_is_odd BOOLEAN DEFAULT true,
  total_weeks       INTEGER DEFAULT 20,
  current_week      INTEGER DEFAULT 1,
  current_mode      TEXT DEFAULT '一般' CHECK (current_mode IN ('一般', '紧急')),
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 slot_config — 每时段人数配置
```sql
CREATE TABLE slot_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  slot            TEXT NOT NULL CHECK (slot IN ('上午', '下午1', '下午2')),
  required_count  INTEGER DEFAULT 1,
  UNIQUE(day_of_week, slot)
);
```

### 3.5 assignments — 排班结果
```sql
CREATE TABLE assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number       INTEGER NOT NULL,
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  slot              TEXT NOT NULL CHECK (slot IN ('上午', '下午1', '下午2')),
  member_id         UUID REFERENCES members(id) ON DELETE CASCADE,
  is_emergency      BOOLEAN DEFAULT false,
  status            TEXT DEFAULT '正常' CHECK (status IN ('正常', '请假')),
  leave_next_week   BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  -- 同一人同一周同一时段唯一，防止重复排班（2026-08-14 新增，见 migration-v4）
  UNIQUE(week_number, day_of_week, slot, member_id)
);
```

### 3.6 duty_stats — 值班统计
```sql
CREATE TABLE duty_stats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  week_number   INTEGER NOT NULL,
  total_hours   REAL DEFAULT 0,
  leave_hours   REAL DEFAULT 0,
  UNIQUE(member_id, week_number)
);
```

### 3.7 day_config — 工作日配置（调休/放假）
```sql
CREATE TABLE day_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number     INTEGER NOT NULL,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_workday      BOOLEAN DEFAULT true,
  substitute_for  INTEGER DEFAULT NULL,  -- NULL=无映射, 1-5=补周几的课
  UNIQUE(week_number, day_of_week)
);
```

`substitute_for` 用于调休课表映射：周六补周一的课 → `substitute_for = 1`，算法会用 `mon_*` 而非 `sat_*` 检查课表冲突。

## 4. 前端架构要点

### 4.1 排班算法
- **文件**：`frontend/src/lib/scheduling-algorithm.js`
- **入口**：`runSchedulingAlgorithm(params)` — 两阶段算法（Phase 1 每日覆盖 + Phase 2 轮询补充）
- **调休映射**：`resolveScheduleKey(dayOfWeek, dayConfig, weekType)` — 根据 `substituteForOdd/substituteForEven` 返回课表 key
- **mode 参数**（2026-08-14 起支持）：
  - `'一般'（默认）`：排除上周正常值班的人（连续性约束），避免同一人连续两周值班
  - `'紧急'`：跳过连续性约束，允许连排；生成的排班 `is_emergency=true`（在学期设置页切换）
- **补排优先级**（2026-08-14 修复）：`makeUpMembers`（上周请假、`leave_next_week=true`）优先级最高，
  覆盖连续性约束——上周请假的人即使出现在 `lastWeek` 中也会被优先补排。
  调用方（Dashboard/Scheduling）已同步修正查询：`lastWeek` 只取 `status='正常'`，
  `makeUpMembers` 只取 `week_number = 当前周-1` 的请假记录。
- **时段人数语义**（2026-08-14 调整）：`required_count=0` 表示该时段不需要值班，
  绝不安排人；某天所有时段都为0则当天不排班。每日最低保障（每天至少1人）仅对
  「至少一个时段 required>0」的工作日生效：优先填 required 时段，全部冲突时回退到
  当天第一个空闲时段。
- **每周总人次上限**（2026-08-14 调整）：`maxPerWeek = max(配置需求总和, max(5, 总人数/2))`，
  保证「时段人数配置」不会被上限压制；公平性下限（半队人数）仍然防止工作量过度集中。

### 4.2 防重复生成
- `Dashboard.jsx` 和 `Scheduling.jsx` 使用 `useRef` 互斥锁 (`generatingRef`) 防止并发生成导致重复排班
- `try/finally` 确保异常时锁也释放
- 已移除 `<StrictMode>`（开发模式双重挂载会触发并发生成）

## 5. API 调用方式

不写后端代码，前端直接通过 Supabase JS Client 调用数据库：

```js
// 示例：获取所有部员
const { data, error } = await supabase
  .from('members')
  .select('*')
  .eq('role', '部员')
  .eq('active', true)
  .order('name')
```

所有数据库操作通过 Supabase 的 Row Level Security (RLS) 策略保护。

## 6. 安全策略

- Supabase Auth 管理登录
- RLS 策略：仅认证用户可读写（所有 authenticated 用户对全部表有增删改查权限——
  与 PRD「单一管理员角色」设计一致）
- 管理员账号创建方式：
  - **默认关闭公开注册**（2026-08-14 起）：登录页不显示「注册」入口，账号由管理员在
    Supabase 后台手动创建（与使用手册一致）
  - 如需开放注册：在 `frontend/.env` 设置 `VITE_ALLOW_REGISTRATION=true`
- 所有API调用自动携带JWT Token
- ⚠️ 已知风险：anon key 是公开的；若开放注册且 Supabase 开启了邮箱确认，
  任何能访问网址的人注册并确认后即可读写全部数据。建议保持关闭公开注册，
  或在 Supabase 后台限制注册（Authentication → Providers → Email → 关闭 Allow new users）。

---

## 7. 变更记录

### 2026-08-14 — 缺陷修复与功能补全（详见 dev-logs/2026-08-14.md）

| # | 类型 | 改动 | 涉及文件 |
|---|------|------|---------|
| 1 | 修复 | 补排覆盖连续性：上周请假的人即使出现在 lastWeek 也会被优先补排（原为死代码）；调用方 lastWeek 只取 status='正常'，makeUpMembers 只取上周 | scheduling-algorithm.js / Dashboard.jsx / Scheduling.jsx |
| 2 | 功能 | 紧急模式落地：学期设置页可切换 一般/紧急，算法读取 mode 参数，紧急模式跳过连续性约束并标记 is_emergency=true | SemesterConfig.jsx / scheduling-algorithm.js |
| 3 | 修复 | 时段 required=0 不再被强制填1人；某天全0则不排班；每日保障回退逻辑 | scheduling-algorithm.js |
| 4 | 修复 | maxPerWeek = max(配置需求, 公平下限)，不再压制时段人数配置 | scheduling-algorithm.js |
| 5 | 修复 | Dashboard 首次自动生成前先加载 day_config（不再忽略调休配置） | Dashboard.jsx |
| 6 | 修复 | 补排标记只清除/读取上周（避免跨周误优先与误清） | Dashboard.jsx / Scheduling.jsx |
| 7 | 加固 | assignments 增加 UNIQUE(week_number, day_of_week, slot, member_id)，防重复排班；手动加人/替补失败会提示 | schema.sql / migration-v4-assignments-unique.sql / Dashboard.jsx / Scheduling.jsx |
| 8 | 加固 | 成员Excel导入：角色校验、错误提示、跳过行统计 | Members.jsx |
| 9 | 安全 | 登录页默认关闭公开注册（VITE_ALLOW_REGISTRATION 控制） | Login.jsx / .env.example |
| 10 | 测试 | 新增 test-fixed-behaviors.mjs（11项回归）；更新受影响的旧测试 | test-fixed-behaviors.mjs / 各 test-*.mjs |
