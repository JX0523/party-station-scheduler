-- =============================================
-- 调休功能 v2：课表映射
-- 请在 Supabase SQL Editor 中执行此文件
-- =============================================

-- day_config 新增 substitute_for 列
-- NULL = 无映射（正常工作日）
-- 1-5 = 该天补周几的课（对应周一至周五）
ALTER TABLE day_config ADD COLUMN IF NOT EXISTS substitute_for INTEGER DEFAULT NULL;
