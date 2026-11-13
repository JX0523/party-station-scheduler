-- ============================================================
-- 6-分享功能自测.sql
--
-- 前提：已执行 5-建分享表-迁移.sql
-- 用法：Supabase → SQL Editor → 全部粘贴 → Run
-- 结果：看下方 Results 表格（每行 PASS / FAIL）
--
-- 设计说明：把检查放进一个函数里，函数返回结果表。
--   · 不依赖临时表（SQL Editor 逐条执行时临时表可能不保留）
--   · 任何一项失败都不会中断整体，会继续跑完并标 FAIL
--   · 跑完自动删除这个临时函数，不留垃圾
-- ============================================================

CREATE OR REPLACE FUNCTION public._share_selftest()
RETURNS TABLE(seq int, name text, result text, detail text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_token text := 'selftest-' || substr(md5(random()::text), 1, 16);
  v_id    uuid;
  v_r     jsonb;
  v_n1    integer;
  v_n2    integer;
  v_bad   text;
BEGIN
  -- 1. 无效令牌
  BEGIN
    v_r := public.get_shared_schedule('not-a-real-token');
    IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN
      seq := 1; name := '无效令牌 → invalid_token'; result := 'FAIL';
      detail := coalesce(v_r::text, 'null'); RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 1; name := '无效令牌 → invalid_token'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 1; name := '无效令牌 → invalid_token'; result := 'PASS'; detail := '';
  RETURN NEXT;

  -- 2. 空令牌 / 超长令牌
  BEGIN
    v_bad := NULL;
    v_r := public.get_shared_schedule('');
    IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN v_bad := '空令牌'; END IF;
    v_r := public.get_shared_schedule(repeat('x', 200));
    IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN
      v_bad := coalesce(v_bad || '、', '') || '超长令牌';
    END IF;
    IF v_bad IS NOT NULL THEN
      seq := 2; name := '空/超长令牌 → invalid_token'; result := 'FAIL'; detail := v_bad;
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 2; name := '空/超长令牌 → invalid_token'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 2; name := '空/超长令牌 → invalid_token'; result := 'PASS'; detail := '';
  RETURN NEXT;

  -- 3. 有效令牌 + 字段裁剪
  BEGIN
    INSERT INTO public.share_links (token, scope, expires_at, created_by)
    VALUES (v_token, 'current_week', now() + interval '1 day', 'selftest@local')
    RETURNING id INTO v_id;

    v_r := public.get_shared_schedule(v_token);
    IF (v_r->>'ok')::boolean IS NOT TRUE THEN
      seq := 3; name := '有效令牌 → ok=true'; result := 'FAIL'; detail := coalesce(v_r::text, 'null');
      RETURN NEXT; RETURN;
    END IF;
    IF NOT (v_r ? 'week') OR NOT (v_r ? 'week_type') OR NOT (v_r ? 'items') THEN
      seq := 3; name := '有效令牌 → ok=true'; result := 'FAIL'; detail := '缺少 week/week_type/items';
      RETURN NEXT; RETURN;
    END IF;
    IF (v_r->>'items') LIKE '%phone%' OR (v_r->>'items') LIKE '%role%'
       OR (v_r->>'items') LIKE '%leave_next_week%' THEN
      seq := 3; name := '有效令牌 → ok=true'; result := 'FAIL'; detail := '返回值含敏感字段';
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 3; name := '有效令牌 → ok=true'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 3; name := '有效令牌 → ok=true 且字段已裁剪'; result := 'PASS';
  detail := 'week=' || coalesce(v_r->>'week', '?') || '，items=' || coalesce(jsonb_array_length(v_r->'items'), 0) || ' 条';
  RETURN NEXT;

  -- 4. 访问计数节流（60 秒内重复调用不重复计数）
  BEGIN
    SELECT view_count INTO v_n1 FROM public.share_links WHERE id = v_id;
    PERFORM public.get_shared_schedule(v_token);
    SELECT view_count INTO v_n2 FROM public.share_links WHERE id = v_id;
    IF v_n2 <> v_n1 THEN
      seq := 4; name := '访问计数节流'; result := 'FAIL'; detail := v_n1 || ' → ' || v_n2;
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 4; name := '访问计数节流'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 4; name := '访问计数节流（60 秒内不重复计数）'; result := 'PASS'; detail := 'view_count 保持 ' || v_n1;
  RETURN NEXT;

  -- 5. 停用 → revoked
  BEGIN
    UPDATE public.share_links SET active = false WHERE id = v_id;
    v_r := public.get_shared_schedule(v_token);
    IF (v_r->>'error') IS DISTINCT FROM 'revoked' THEN
      seq := 5; name := '停用后 → revoked'; result := 'FAIL'; detail := coalesce(v_r::text, 'null');
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 5; name := '停用后 → revoked'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 5; name := '停用后 → revoked'; result := 'PASS'; detail := '';
  RETURN NEXT;

  -- 6. 过期 → expired
  BEGIN
    UPDATE public.share_links SET active = true, expires_at = now() - interval '1 minute' WHERE id = v_id;
    v_r := public.get_shared_schedule(v_token);
    IF (v_r->>'error') IS DISTINCT FROM 'expired' THEN
      seq := 6; name := '过期后 → expired'; result := 'FAIL'; detail := coalesce(v_r::text, 'null');
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 6; name := '过期后 → expired'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 6; name := '过期后 → expired'; result := 'PASS'; detail := '';
  RETURN NEXT;

  -- 7. 清理临时 token
  BEGIN
    DELETE FROM public.share_links WHERE id = v_id;
    IF EXISTS (SELECT 1 FROM public.share_links WHERE id = v_id) THEN
      seq := 7; name := '清理临时 token'; result := 'FAIL'; detail := '删除后仍存在';
      RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    seq := 7; name := '清理临时 token'; result := 'FAIL'; detail := SQLERRM;
    RETURN NEXT; RETURN;
  END;
  seq := 7; name := '清理临时 token'; result := 'PASS'; detail := '';
  RETURN NEXT;
END $$;

-- ↓↓↓ 重点看这里：Results 表格 ↓↓↓
SELECT seq AS 序号, name AS 检查项, result AS 结果, detail AS 说明
FROM public._share_selftest()
ORDER BY seq;

-- 跑完清理掉这个临时函数
DROP FUNCTION IF EXISTS public._share_selftest();
