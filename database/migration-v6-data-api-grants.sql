-- =============================================
-- 迁移 v6：Data API 显式授权（GRANT）
-- 日期：2026-09-24
-- 适用：Supabase 2026-10-30 政策变更
--
-- 背景：
--   Supabase 公告：自 2026-10-30 起，public schema 中【新建的表】不再自动获得
--   Data API 访问权限，必须在建表迁移中显式 GRANT，否则 supabase-js / PostgREST
--   访问会返回 permission denied（PostgreSQL 错误码 42501）。
--   现有表不受影响（保留当前授权），因此本迁移对现有项目属于「可选加固」：
--   执行后授权状态与 Supabase 历史行为一致，并可保证 10-30 之后新建表统一带授权。
--
-- 本文件内容：
--   1. 为 8 张现有表补齐 GRANT（幂等，可重复执行）
--   2. 附「以后新增表的模板」，新表请连同 GRANT 一起写在同一个迁移文件里
--
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run
-- =============================================

-- ---------- 1. 业务表：仅认证用户与服务角色可读写 ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.members,
  public.course_schedules,
  public.semester_config,
  public.slot_config,
  public.assignments,
  public.duty_stats,
  public.day_config
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.members,
  public.course_schedules,
  public.semester_config,
  public.slot_config,
  public.assignments,
  public.duty_stats,
  public.day_config
TO service_role;

-- ---------- 2. 保活心跳表：匿名需 INSERT/DELETE（GitHub Actions 保活使用） ----------
GRANT SELECT, INSERT, DELETE ON public.keep_alive_pings TO anon;
GRANT SELECT, INSERT, DELETE ON public.keep_alive_pings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keep_alive_pings TO service_role;

-- ---------- 3. 自增/序列权限（新表若用 identity/serial，必要时一并授予） ----------
-- 本项目的 keep_alive_pings.id 使用 GENERATED ALWAYS AS IDENTITY，身份列随表授权，
-- 无需单独 GRANT；若将来改用 serial 或显式 sequence，请按下面模板补授：
-- GRANT USAGE, SELECT ON SEQUENCE public.你的表_id_seq TO authenticated, service_role;

-- =============================================
-- 【以后新增表的模板 — 请复制这段到新迁移文件中】
-- =============================================
-- CREATE TABLE IF NOT EXISTS public.新表名 (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   ...
-- );
-- ALTER TABLE public.新表名 ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "..." ON public.新表名 FOR SELECT TO authenticated USING (true);
-- -- ... 其他 RLS 策略 ...
--
-- -- ⚠️ 自 2026-10-30 起必须显式授权，否则 Data API 无法访问：
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.新表名 TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.新表名 TO service_role;

-- =============================================
-- 验证（执行后可选运行，确认授权已生效）
-- =============================================
-- SELECT table_name, grantee, string_agg(privilege_type, ', ') AS privileges
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- GROUP BY table_name, grantee
-- ORDER BY table_name, grantee;
