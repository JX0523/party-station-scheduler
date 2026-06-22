-- =============================================
-- 调休功能数据库迁移
-- 请在 Supabase SQL Editor 中执行此文件
-- =============================================

-- 1. 添加 day_config 表
CREATE TABLE IF NOT EXISTS day_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number   INTEGER NOT NULL,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_workday    BOOLEAN DEFAULT true,
  UNIQUE(week_number, day_of_week)
);

-- 2. RLS 策略
DROP POLICY IF EXISTS "允许认证用户读取工作日配置" ON day_config;
DROP POLICY IF EXISTS "允许认证用户插入工作日配置" ON day_config;
DROP POLICY IF EXISTS "允许认证用户更新工作日配置" ON day_config;

CREATE POLICY "允许认证用户读取工作日配置" ON day_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "允许认证用户插入工作日配置" ON day_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "允许认证用户更新工作日配置" ON day_config FOR UPDATE TO authenticated USING (true);

-- 3. course_schedules 添加周六日课表字段
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sat_34 BOOLEAN DEFAULT false;
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sat_67 BOOLEAN DEFAULT false;
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sat_89 BOOLEAN DEFAULT false;
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sun_34 BOOLEAN DEFAULT false;
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sun_67 BOOLEAN DEFAULT false;
ALTER TABLE course_schedules ADD COLUMN IF NOT EXISTS sun_89 BOOLEAN DEFAULT false;

-- 4. 修复 slot_config 的 day_of_week 约束（允许6、7）
ALTER TABLE slot_config DROP CONSTRAINT IF EXISTS slot_config_day_of_week_check;
ALTER TABLE slot_config ADD CONSTRAINT slot_config_day_of_week_check CHECK (day_of_week BETWEEN 1 AND 7);

-- 5. 修复 assignments 的 day_of_week 约束（允许6、7）
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_day_of_week_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_day_of_week_check CHECK (day_of_week BETWEEN 1 AND 7);

-- 6. slot_config 添加周六日默认配置（0人）
INSERT INTO slot_config (day_of_week, slot, required_count) VALUES
  (6, '上午', 0), (6, '下午1', 0), (6, '下午2', 0),
  (7, '上午', 0), (7, '下午1', 0), (7, '下午2', 0)
ON CONFLICT (day_of_week, slot) DO NOTHING;
