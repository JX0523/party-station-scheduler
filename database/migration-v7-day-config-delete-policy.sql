-- ============================================================
-- migration-v7-day-config-delete-policy.sql
-- 修复：day_config 缺少 DELETE 策略，导致「取消该周放假」静默失效
--
-- 现象：设置放假后再点「取消该周放假」，提示成功但放假设置仍在
--       （前端 delete 返回 0 行，且未校验，属于静默失败）
-- 根因：day_config 开启了 RLS，但只建了 SELECT / INSERT / UPDATE 三条策略，
--       没有 DELETE 策略 → PostgreSQL 默认拒绝删除（0 行受影响，不报错）
--
-- 执行位置：Supabase（**生产库和沙盒库都要执行**）→ SQL Editor → Run
-- 幂等：可重复执行
-- ============================================================

-- 1) 补 DELETE 策略
DROP POLICY IF EXISTS "允许认证用户删除工作日配置" ON public.day_config;
CREATE POLICY "允许认证用户删除工作日配置" ON public.day_config
  FOR DELETE TO authenticated USING (true);

-- 2) 授权（若已存在则无副作用）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_config TO service_role;

-- 3) 验证：应能看到 4 条策略（SELECT / INSERT / UPDATE / DELETE）
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'day_config'
ORDER BY cmd;
