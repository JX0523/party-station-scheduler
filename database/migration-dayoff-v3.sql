-- =============================================
-- 调休功能 v3：单/双周独立课表映射
-- 请在 Supabase SQL Editor 中执行此文件
-- =============================================

-- day_config 新增单周/双周独立的调休课表映射列
-- substitute_for_odd  = 单周补周几的课（1-5，NULL=无映射）
-- substitute_for_even = 双周补周几的课（1-5，NULL=无映射）
-- 保留旧列 substitute_for 向后兼容
ALTER TABLE day_config ADD COLUMN IF NOT EXISTS substitute_for_odd INTEGER DEFAULT NULL;
ALTER TABLE day_config ADD COLUMN IF NOT EXISTS substitute_for_even INTEGER DEFAULT NULL;
