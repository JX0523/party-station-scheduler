-- =============================================
-- 党员工作站排班系统 - 数据库建表SQL
-- 请在 Supabase SQL Editor 中执行此文件
-- =============================================

-- 1. 成员表
CREATE TABLE IF NOT EXISTS members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('部员', '部长', '主席团')),
  phone       TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 课表
CREATE TABLE IF NOT EXISTS course_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE,
  week_type   TEXT NOT NULL CHECK (week_type IN ('单周', '双周')),
  mon_34      BOOLEAN DEFAULT false,
  mon_67      BOOLEAN DEFAULT false,
  mon_89      BOOLEAN DEFAULT false,
  tue_34      BOOLEAN DEFAULT false,
  tue_67      BOOLEAN DEFAULT false,
  tue_89      BOOLEAN DEFAULT false,
  wed_34      BOOLEAN DEFAULT false,
  wed_67      BOOLEAN DEFAULT false,
  wed_89      BOOLEAN DEFAULT false,
  thu_34      BOOLEAN DEFAULT false,
  thu_67      BOOLEAN DEFAULT false,
  thu_89      BOOLEAN DEFAULT false,
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

-- 3. 学期配置
CREATE TABLE IF NOT EXISTS semester_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL DEFAULT '新学期',
  first_week_is_odd BOOLEAN DEFAULT true,
  total_weeks       INTEGER DEFAULT 20,
  current_week      INTEGER DEFAULT 1,
  current_mode      TEXT DEFAULT '一般' CHECK (current_mode IN ('一般', '紧急')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 为已有数据库补加 current_week 列
ALTER TABLE semester_config ADD COLUMN IF NOT EXISTS current_week INTEGER DEFAULT 1;

-- 4. 每时段人数配置
CREATE TABLE IF NOT EXISTS slot_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  slot            TEXT NOT NULL CHECK (slot IN ('上午', '下午1', '下午2')),
  required_count  INTEGER DEFAULT 1,
  UNIQUE(day_of_week, slot)
);

-- 5. 排班结果
CREATE TABLE IF NOT EXISTS assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number       INTEGER NOT NULL,
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  slot              TEXT NOT NULL CHECK (slot IN ('上午', '下午1', '下午2')),
  member_id         UUID REFERENCES members(id) ON DELETE CASCADE,
  is_emergency      BOOLEAN DEFAULT false,
  status            TEXT DEFAULT '正常' CHECK (status IN ('正常', '请假')),
  leave_next_week   BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 6. 值班统计（可选，也可通过 assignments 实时计算）
CREATE TABLE IF NOT EXISTS duty_stats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  week_number   INTEGER NOT NULL,
  total_hours   REAL DEFAULT 0,
  leave_hours   REAL DEFAULT 0,
  UNIQUE(member_id, week_number)
);

-- =============================================
-- RLS 安全策略（仅认证用户可操作）
-- =============================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_stats ENABLE ROW LEVEL SECURITY;

-- 为已认证用户创建访问策略
CREATE POLICY "允许认证用户读取成员" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入成员" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新成员" ON members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "允许认证用户删除成员" ON members FOR DELETE TO authenticated USING (true);

CREATE POLICY "允许认证用户读取课表" ON course_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入课表" ON course_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新课表" ON course_schedules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "允许认证用户删除课表" ON course_schedules FOR DELETE TO authenticated USING (true);

CREATE POLICY "允许认证用户读取学期配置" ON semester_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入学期配置" ON semester_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新学期配置" ON semester_config FOR UPDATE TO authenticated USING (true);

CREATE POLICY "允许认证用户读取时段配置" ON slot_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入时段配置" ON slot_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新时段配置" ON slot_config FOR UPDATE TO authenticated USING (true);

CREATE POLICY "允许认证用户读取排班" ON assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入排班" ON assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新排班" ON assignments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "允许认证用户删除排班" ON assignments FOR DELETE TO authenticated USING (true);

CREATE POLICY "允许认证用户读取统计" ON duty_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入统计" ON duty_stats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新统计" ON duty_stats FOR UPDATE TO authenticated USING (true);

-- =============================================
-- 7. 工作日配置表（调休/放假）
-- =============================================
CREATE TABLE IF NOT EXISTS day_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number   INTEGER NOT NULL,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_workday    BOOLEAN DEFAULT true,
  UNIQUE(week_number, day_of_week)
);

-- =============================================
-- RLS: day_config
-- =============================================
CREATE POLICY "允许认证用户读取工作日配置" ON day_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入工作日配置" ON day_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新工作日配置" ON day_config FOR UPDATE TO authenticated USING (true);

-- =============================================
-- 插入默认时段配置（每时段默认1人，含周六日）
-- =============================================
INSERT INTO slot_config (day_of_week, slot, required_count) VALUES
  (1, '上午', 1), (1, '下午1', 1), (1, '下午2', 1),
  (2, '上午', 1), (2, '下午1', 1), (2, '下午2', 1),
  (3, '上午', 1), (3, '下午1', 1), (3, '下午2', 1),
  (4, '上午', 1), (4, '下午1', 1), (4, '下午2', 1),
  (5, '上午', 1), (5, '下午1', 1), (5, '下午2', 1),
  (6, '上午', 0), (6, '下午1', 0), (6, '下午2', 0),
  (7, '上午', 0), (7, '下午1', 0), (7, '下午2', 0)
ON CONFLICT (day_of_week, slot) DO NOTHING;
