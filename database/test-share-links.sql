-- ============================================================
-- test-share-links.sql —— 只读分享功能的数据库自测（验收脚本）
--
-- 前提：已执行 database/migration-v8-share-links.sql
-- 执行位置：Supabase → SQL Editor → 粘贴 → Run
-- 说明：脚本会插入一条临时 token，最后自动删除；可重复执行。
--      任一项不通过会抛异常并中止（按报错修，再重跑）。
-- ============================================================

DO $$
DECLARE
  v_token    text := 'selftest-' || substr(md5(random()::text), 1, 16);
  v_id       uuid;
  v_r        jsonb;
  v_n1       integer;
  v_n2       integer;
BEGIN
  RAISE NOTICE '════ 只读分享功能自测开始 ════';

  -- ---------- 1. 无效令牌 ----------
  v_r := public.get_shared_schedule('not-a-real-token');
  IF (v_r->>'ok')::boolean IS NOT FALSE OR (v_r->>'error') <> 'invalid_token' THEN
    RAISE EXCEPTION '1 未通过：无效令牌应返回 invalid_token，实际 %', v_r;
  END IF;
  RAISE NOTICE '1 ✅ 无效令牌 → invalid_token';

  -- ---------- 2. 空令牌 / 超长令牌 ----------
  v_r := public.get_shared_schedule('');
  IF (v_r->>'error') <> 'invalid_token' THEN
    RAISE EXCEPTION '2a 未通过：空令牌应返回 invalid_token，实际 %', v_r;
  END IF;
  v_r := public.get_shared_schedule(repeat('x', 200));
  IF (v_r->>'error') <> 'invalid_token' THEN
    RAISE EXCEPTION '2b 未通过：超长令牌应返回 invalid_token，实际 %', v_r;
  END IF;
  RAISE NOTICE '2 ✅ 空令牌 / 超长令牌 → invalid_token';

  -- ---------- 3. 正常令牌（当前周） ----------
  INSERT INTO share_links (token, scope, expires_at, created_by)
  VALUES (v_token, 'current_week', now() + interval '1 day', 'selftest@local')
  RETURNING id INTO v_id;

  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '3 未通过：有效令牌应返回 ok=true，实际 %', v_r;
  END IF;
  IF NOT (v_r ? 'week') OR NOT (v_r ? 'week_type') OR NOT (v_r ? 'items') THEN
    RAISE EXCEPTION '3 未通过：返回缺少 week / week_type / items，实际 %', v_r;
  END IF;
  -- 字段裁剪：不应出现电话、角色、内部标记
  IF (v_r->>'items') LIKE '%phone%' OR (v_r->>'items') LIKE '%role%'
     OR (v_r->>'items') LIKE '%leave_next_week%' THEN
    RAISE EXCEPTION '3 未通过：返回值出现了不该暴露的字段，实际 %', v_r->>'items';
  END IF;
  RAISE NOTICE '3 ✅ 有效令牌 → ok=true，字段已裁剪（week=%，items=% 条）', v_r->>'week', jsonb_array_length(v_r->'items');

  -- ---------- 4. 访问计数节流 ----------
  SELECT view_count INTO v_n1 FROM share_links WHERE id = v_id;
  PERFORM public.get_shared_schedule(v_token);   -- 紧接第二次调用
  SELECT view_count INTO v_n2 FROM share_links WHERE id = v_id;
  IF v_n2 <> v_n1 THEN
    RAISE EXCEPTION '4 未通过：60 秒内重复调用不应重复计数（% → %）', v_n1, v_n2;
  END IF;
  RAISE NOTICE '4 ✅ 访问计数节流生效（60 秒内 % 次调用只计 1 次）', 2;

  -- ---------- 5. 停用 → revoked ----------
  UPDATE share_links SET active = false WHERE id = v_id;
  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'error') <> 'revoked' THEN
    RAISE EXCEPTION '5 未通过：停用后应返回 revoked，实际 %', v_r;
  END IF;
  RAISE NOTICE '5 ✅ 停用后 → revoked';

  -- ---------- 6. 过期 → expired ----------
  UPDATE share_links SET active = true, expires_at = now() - interval '1 minute' WHERE id = v_id;
  v_r := public.get_shared_schedule(v_token);
  IF (v_r->>'error') <> 'expired' THEN
    RAISE EXCEPTION '6 未通过：过期后应返回 expired，实际 %', v_r;
  END IF;
  RAISE NOTICE '6 ✅ 过期后 → expired';

  -- ---------- 7. 清理临时数据 ----------
  DELETE FROM share_links WHERE id = v_id;
  RAISE NOTICE '7 ✅ 临时 token 已删除';

  RAISE NOTICE '════ 全部通过 ════';
END $$;

-- ============================================================
-- 附：匿名权限检查（手动看一眼）
-- 1) 匿名不该能读写业务表：用 anon key 访问 /rest/v1/members 应被拒绝
-- 2) 匿名只能调这一个函数：select public.get_shared_schedule('x');
-- 3) 策略应有 4 条：select policyname, cmd from pg_policies where tablename='share_links';
-- ============================================================
