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
  created_at        TIMESTAMPTZ DEFAULT now()
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
- **调休映射**：`resolveScheduleKey(dayOfWeek, dayConfig)` — 根据 `substituteFor` 返回课表 key

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
- RLS 策略：仅认证用户可读写
- 管理员注册通过邀请制（首个管理员手动在Supabase后台添加）
- 所有API调用自动携带JWT Token
