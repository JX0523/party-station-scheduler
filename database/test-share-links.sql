-- ============================================================
-- 6-分享功能自测.sql（test-share-links）
--
-- 前提：已执行 5-建分享表-迁移.sql
-- 用法：Supabase → SQL Editor → 全部粘贴 → Run
--
-- 结果怎么看：
--   ① 下方 "Results" 表格会列出 8 行，每行 result = PASS / FAIL（这是重点）
--   ② 若某行 FAIL，脚本会抛异常中止，并提示具体原因
--   ③ 脚本会插入一条临时 token，最后自动删除，可重复执行
-- ============================================================

-- 结果收集表（只在本次会话内存在）
CREATE TEMP TABLE IF NOT EXISTS _share_test (
  seq    int,
  name   text,
  result text,
  detail text
) ON COMMIT DROP;
TRUNCATE _share_test;

DO $$
DECLARE
  v_token text := 'selftest-' || substr(md5(random()::text), 1, 16);
  v_id    uuid;
  v_r     jsonb;
  v_n1    integer;
  v_n2    integer;
  v_bad   text;
BEGIN
  -- 1. 无效令牌
  v_r := public.get_shared_schedule('not-a-real-token');
  IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN
    INSERT INTO _share_test VALUES (1, '无效令牌 → invalid_token', 'FAIL', coalesce(v_r::text, 'null'));
    RAISE EXCEPTION '第 1 项未通过：无效令牌应返回 invalid_token，实际 %', v_r;
  END IF;
  INSERT INTO _share_test VALUES (1, '无效令牌 → invalid_token', 'PASS', '');

  -- 2. 空令牌 / 超长令牌
  v_r := public.get_shared_schedule('');
  v_bad := NULL;
  IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN v_bad := '空令牌'; END IF;
  v_r := public.get_shared_schedule(repeat('x', 200));
  IF (v_r->>'error') IS DISTINCT FROM 'invalid_token' THEN v_bad := coalesce(v_bad || '、', '') || '超长令牌'; END IF;
  IF v_bad IS NOT NULL THEN
    INSERT INTO _share_test VALUES (2, '空/超长令牌 → invalid_token', 'FAIL', v_bad);
    RAISE EXCEPTION '第 2 项未通过：% 应返回 invalid_token', v_bad;
  END IF;
  INSERT INTO _share_test VALUES (2, '空/超长令牌 → invalid_token', 'PASS', '');

  -- 3. 有效令牌 + 字段裁剪
  INSERT INTO share_links (token, scope, expires_at, created_by)
  VALUES (v_token, 'current_week', now() + interval '1 day', 'selftest@local')
  RETURNING id INTO v_id;

  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    INSERT INTO _share_test VALUES (3, '有效令牌 → ok=true', 'FAIL', coalesce(v_r::text, 'null'));
    RAISE EXCEPTION '第 3 项未通过：有效令牌应返回 ok=true，实际 %', v_r;
  END IF;
  IF NOT (v_r ? 'week') OR NOT (v_r ? 'week_type') OR NOT (v_r ? 'items') THEN
    INSERT INTO _share_test VALUES (3, '有效令牌 → ok=true', 'FAIL', '缺少 week/week_type/items');
    RAISE EXCEPTION '第 3 项未通过：返回缺少 week / week_type / items，实际 %', v_r;
  END IF;
  IF (v_r->>'items') LIKE '%phone%' OR (v_r->>'items') LIKE '%role%'
     OR (v_r->>'items') LIKE '%leave_next_week%' THEN
    INSERT INTO _share_test VALUES (3, '有效令牌 → ok=true', 'FAIL', '返回值含敏感字段');
    RAISE EXCEPTION '第 3 项未通过：返回值出现了不该暴露的字段，实际 %', v_r->>'items';
  END IF;
  INSERT INTO _share_test VALUES (3, '有效令牌 → ok=true 且字段已裁剪', 'PASS',
    'week=' || coalesce(v_r->>'week', '?') || '，items=' || jsonb_array_length(v_r->'items') || ' 条');

  -- 4. 访问计数节流（60 秒内重复调用不重复计数）
  SELECT view_count INTO v_n1 FROM share_links WHERE id = v_id;
  PERFORM public.get_shared_schedule(v_token);
  SELECT view_count INTO v_n2 FROM share_links WHERE id = v_id;
  IF v_n2 <> v_n1 THEN
    INSERT INTO _share_test VALUES (4, '访问计数节流', 'FAIL', v_n1 || ' → ' || v_n2);
    RAISE EXCEPTION '第 4 项未通过：60 秒内重复调用不应重复计数（% → %）', v_n1, v_n2;
  END IF;
  INSERT INTO _share_test VALUES (4, '访问计数节流（60 秒内不重复计数）', 'PASS', 'view_count 保持 ' || v_n1);

  -- 5. 停用 → revoked
  UPDATE share_links SET active = false WHERE id = v_id;
  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'error') IS DISTINCT FROM 'revoked' THEN
    INSERT INTO _share_test VALUES (5, '停用后 → revoked', 'FAIL', coalesce(v_r::text, 'null'));
    RAISE EXCEPTION '第 5 项未通过：停用后应返回 revoked，实际 %', v_r;
  END IF;
  INSERT INTO _share_test VALUES (5, '停用后 → revoked', 'PASS', '');

  -- 6. 过期 → expired
  UPDATE share_links SET active = true, expires_at = now() - interval '1 minute' WHERE id = v_id;
  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'error') IS DISTINCT FROM 'expired' THEN
    INSERT INTO _share_test VALUES (6, '过期后 → expired', 'FAIL', coalesce(v_r::text, 'null'));
    RAISE EXCEPTION '第 6 项未通过：过期后应返回 expired，实际 %', v_r;
  END IF;
  INSERT INTO _share_test VALUES (6, '过期后 → expired', 'PASS', '');

  -- 7. 清理临时数据
  DELETE FROM share_links WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM share_links WHERE id = v_id) THEN
    INSERT INTO _share_test VALUES (7, '清理临时 token', 'FAIL', '删除后仍存在');
    RAISE EXCEPTION '第 7 项未通过：临时 token 没被删除';
  END IF;
  INSERT INTO _share_test VALUES (7, '清理临时 token', 'PASS', '');

  -- 8. 汇总
  INSERT INTO _share_test VALUES (8, '全部检查', 'PASS', '7 项已完成，详见上表');
END $$;

-- ↓↓↓ 重点看这里：Results 表格 ↓↓↓
SELECT seq AS 序号, name AS 检查项, result AS 结果, detail AS 说明
FROM _share_test
ORDER BY seq;
