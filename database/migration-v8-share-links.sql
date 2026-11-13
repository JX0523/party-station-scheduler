-- ============================================================
-- migration-v8-share-links.sql
-- 功能：只读分享链接（指导老师免登录查看最新排班）
-- 执行位置：Supabase → SQL Editor（**沙盒库先跑，验证通过再跑生产库**）
-- 幂等：可重复执行
-- 设计说明见 毕设想法与发现.md 第十二章、第二十~二十二章
-- ============================================================

-- ------------------------------------------------------------
-- 1. 分享链接表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,
  scope           text NOT NULL DEFAULT 'current_week'
                  CHECK (scope IN ('current_week', 'week')),
  week_number     integer NULL,
  expires_at      timestamptz NULL,
  active          boolean NOT NULL DEFAULT true,
  created_by      text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_viewed_at  timestamptz NULL,
  view_count      integer NOT NULL DEFAULT 0
);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_links_select_authenticated" ON public.share_links;
CREATE POLICY "share_links_select_authenticated" ON public.share_links
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "share_links_insert_authenticated" ON public.share_links;
CREATE POLICY "share_links_insert_authenticated" ON public.share_links
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "share_links_update_authenticated" ON public.share_links;
CREATE POLICY "share_links_update_authenticated" ON public.share_links
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "share_links_delete_authenticated" ON public.share_links;
CREATE POLICY "share_links_delete_authenticated" ON public.share_links
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO service_role;

-- ------------------------------------------------------------
-- 2. 只读取值函数（匿名可调，唯一对外入口）
--    只返回展示所需字段：星期、时段、姓名、状态
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_schedule(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link       share_links%ROWTYPE;
  v_week       integer;
  v_week_type  text;
  v_items      jsonb;
  v_updated_at timestamptz;
BEGIN
  -- 2.0 入参基本校验
  IF p_token IS NULL OR length(p_token) = 0 OR length(p_token) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- 2.1 校验令牌
  SELECT * INTO v_link FROM share_links WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_link.active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- 2.2 确定要看的周次
  IF v_link.scope = 'week' AND v_link.week_number IS NOT NULL THEN
    v_week := v_link.week_number;
  ELSE
    SELECT current_week INTO v_week FROM semester_config ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_week IS NULL THEN
    v_week := 1;
  END IF;

  -- 2.3 该周是单周还是双周
  SELECT CASE
           WHEN (first_week_is_odd AND v_week % 2 = 1)
             OR (NOT first_week_is_odd AND v_week % 2 = 0)
           THEN '单周' ELSE '双周'
         END
    INTO v_week_type
  FROM semester_config ORDER BY created_at DESC LIMIT 1;

  -- 2.4 取排班（只取展示需要的字段）
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'day',    a.day_of_week,
             'slot',   a.slot,
             'name',   coalesce(m.name, '—'),
             'status', a.status
           ) ORDER BY a.day_of_week,
                      CASE a.slot WHEN '上午' THEN 1 WHEN '下午1' THEN 2 ELSE 3 END
         ), '[]'::jsonb)
    INTO v_items
  FROM assignments a
  LEFT JOIN members m ON m.id = a.member_id
  WHERE a.week_number = v_week;

  SELECT max(created_at) INTO v_updated_at
  FROM assignments WHERE week_number = v_week;

  -- 2.5 记一笔访问（节流：距上次记录超过 60 秒才更新，避免写放大）
  UPDATE share_links
     SET view_count = view_count + 1,
         last_viewed_at = now()
   WHERE id = v_link.id
     AND (last_viewed_at IS NULL OR now() - last_viewed_at > interval '60 seconds');

  RETURN jsonb_build_object(
    'ok', true,
    'week', v_week,
    'week_type', v_week_type,
    'updated_at', v_updated_at,
    'server_time', now(),
    'items', v_items
  );
END;
$$;

-- 2.6 只允许匿名/登录用户调用这一个函数
REVOKE ALL ON FUNCTION public.get_shared_schedule(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_schedule(text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. 自检
-- ------------------------------------------------------------
-- 3.1 应返回 {"ok": false, "error": "invalid_token"}
-- SELECT public.get_shared_schedule('not-a-real-token');

-- 3.2 应返回 4 行（SELECT / INSERT / UPDATE / DELETE）
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'share_links' ORDER BY cmd;
