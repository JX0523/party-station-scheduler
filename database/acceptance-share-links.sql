-- ============================================================
-- acceptance-share-links.sql —— 只读分享功能·上线前验收（纯 SQL 部分）
--
-- 用途：在 Supabase SQL Editor 里跑一次，逐条打印 PASS / FAIL。
--      覆盖“建表、权限、函数、节流”这些**能在数据库里验证**的部分；
--      页面层（老师能否打开、停用是否立刻失效）见 方案\合并上线清单.md。
--
-- 前提：已执行 database/migration-v8-share-links.sql
-- ============================================================

DO $$
DECLARE
  v_ok   boolean;
  v_n    integer;
  v_pass integer := 0;
  v_fail integer := 0;
BEGIN
  RAISE NOTICE '══════ 只读分享功能 · 数据库验收 ══════';

  -- 1. 表存在
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'share_links'
  ) INTO v_ok;
  IF v_ok THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 1/9 share_links 表存在';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 1/9 share_links 表不存在（先跑 migration-v8）'; END IF;

  -- 2. 表启用了 RLS
  SELECT relrowsecurity INTO v_ok FROM pg_class WHERE relname = 'share_links' AND relnamespace = 'public'::regnamespace;
  IF v_ok THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 2/9 share_links 已启用 RLS';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 2/9 share_links 未启用 RLS'; END IF;

  -- 3. 四条策略齐全（SELECT / INSERT / UPDATE / DELETE）
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'share_links';
  IF v_n >= 4 THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 3/9 share_links 策略数 = %（≥4）', v_n;
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 3/9 share_links 策略只有 % 条（应 4 条）', v_n; END IF;

  -- 4. 只读函数存在
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_shared_schedule'
  ) INTO v_ok;
  IF v_ok THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 4/9 函数 get_shared_schedule 存在';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 4/9 函数 get_shared_schedule 不存在'; END IF;

  -- 5. 函数是 SECURITY DEFINER（内部才能绕过 RLS 读表）
  SELECT (prosecdef IS TRUE) INTO v_ok FROM pg_proc
   WHERE proname = 'get_shared_schedule' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_ok THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 5/9 函数为 SECURITY DEFINER';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 5/9 函数不是 SECURITY DEFINER'; END IF;

  -- 6. anon 可以执行该函数（老师免登录的前提）
  IF has_function_privilege('anon', 'public.get_shared_schedule(text)', 'EXECUTE') THEN
    v_pass := v_pass + 1; RAISE NOTICE 'PASS 6/9 anon 有该函数的执行权限';
  ELSE
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL 6/9 anon 没有执行权限（老师打不开）';
  END IF;

  -- 7. anon 不能读业务表（这是“只读”的安全底线）
  IF has_table_privilege('anon', 'public.members', 'SELECT') THEN
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL 7/9 anon 竟然能读 members（权限过大！）';
  ELSE
    v_pass := v_pass + 1; RAISE NOTICE 'PASS 7/9 anon 不能读 members（业务表仍然收口）';
  END IF;

  -- 8. anon 不能写 share_links（只能通过函数间接计数）
  IF has_table_privilege('anon', 'public.share_links', 'SELECT')
     OR has_table_privilege('anon', 'public.share_links', 'INSERT')
     OR has_table_privilege('anon', 'public.share_links', 'UPDATE')
     OR has_table_privilege('anon', 'public.share_links', 'DELETE') THEN
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL 8/9 anon 竟能直接操作 share_links（应收口到函数）';
  ELSE
    v_pass := v_pass + 1; RAISE NOTICE 'PASS 8/9 anon 无法直接读写 share_links';
  END IF;

  -- 9. 节流所需字段存在
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_name = 'share_links' AND column_name IN ('last_viewed_at', 'view_count', 'expires_at', 'active', 'token');
  IF v_n = 5 THEN v_pass := v_pass + 1; RAISE NOTICE 'PASS 9/9 关键字段齐全（token/expires_at/active/view_count/last_viewed_at）';
  ELSE v_fail := v_fail + 1; RAISE NOTICE 'FAIL 9/9 关键字段缺失，只有 % 个（应 5 个）', v_n; END IF;

  RAISE NOTICE '────────── 合计：PASS % / FAIL % ──────────', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '验收未通过：% 项失败，请按上面的 FAIL 项修复后重跑', v_fail;
  END IF;
  RAISE NOTICE '✅ 数据库验收全部通过；接着按 方案\合并上线清单.md 做页面层验证';
END $$;
