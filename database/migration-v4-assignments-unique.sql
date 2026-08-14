-- =============================================
-- 排班唯一约束迁移 v4（2026-08-14）
-- 请在 Supabase SQL Editor 中执行此文件
--
-- 背景：
--   原 assignments 表无唯一约束，同一成员可被重复安排到
--   同一周同一时段（例如双击「加人」、或两个标签页同时生成排班），
--   导致排班表出现重复记录。
--
-- 改动：
--   1. 清理历史重复记录（保留最早的一条）
--   2. 为 assignments 增加唯一约束：
--      UNIQUE(week_number, day_of_week, slot, member_id)
-- =============================================

-- 1. 删除重复排班记录（同一人同一周同一时段只保留最早一条）
DELETE FROM assignments a
USING assignments b
WHERE a.id > b.id
  AND a.week_number = b.week_number
  AND a.day_of_week = b.day_of_week
  AND a.slot = b.slot
  AND a.member_id = b.member_id;

-- 2. 增加唯一约束
ALTER TABLE assignments
  ADD CONSTRAINT assignments_week_day_slot_member_unique
  UNIQUE (week_number, day_of_week, slot, member_id);

-- 说明：
--   - 该约束不影响「同一时段多人值班」（不同 member_id 合法）
--   - 不影响「同一人同周不同时段值班」（不同 day_of_week/slot 合法）
--   - 前端在 add/replace 插入失败时会提示错误信息（见 Dashboard.jsx / Scheduling.jsx）
