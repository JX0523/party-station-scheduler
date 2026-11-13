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

  -- 7. 业务表（members）必须启用 RLS，且策略里不能有 anon（这是“只读”的安全底线）
  --    注意：Supabase 可能给 anon 授予表级 SELECT 权限；只要 RLS 开启且策略仅限 authenticated，
  --    匿名用户实际读不到任何行。所以检查“RLS + 策略角色”比只看权限位更准确。
  SELECT relrowsecurity INTO v_ok FROM pg_class
   WHERE relname = 'members' AND relnamespace = 'public'::regnamespace;
  IF v_ok IS NOT TRUE THEN
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL 7/9 members 未启用 RLS（匿名可能读到数据）';
  ELSE
    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'members' AND ('anon' = ANY(roles));
    IF v_n > 0 THEN
      v_fail := v_fail + 1; RAISE NOTICE 'FAIL 7/9 members 有 % 条策略放给了 anon（应仅 authenticated）', v_n;
    ELSE
      v_pass := v_pass + 1; RAISE NOTICE 'PASS 7/9 members 启用 RLS 且策略不含 anon';
    END IF;
  END IF;

  -- 8. share_links 的策略必须全部限定 authenticated（匿名只能通过函数访问）
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'share_links' AND ('anon' = ANY(roles));
  IF v_n > 0 THEN
    v_fail := v_fail + 1; RAISE NOTICE 'FAIL 8/9 share_links 有 % 条策略放给了 anon（应收口到函数）', v_n;
  ELSE
    v_pass := v_pass + 1; RAISE NOTICE 'PASS 8/9 share_links 策略仅限 authenticated';
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

-- ============================================================
-- ↓↓↓ 重点看这里：Results 表格（即使上面的 NOTICE 看不到，这里也一定显示）↓↓↓
-- ============================================================
SELECT '1 表存在'            AS 检查项, (to_regclass('public.share_links') IS NOT NULL)                      AS 通过,
       coalesce(to_regclass('public.share_links')::text, '不存在')                                          AS 说明
UNION ALL
SELECT '2 表启用 RLS',
       coalesce((SELECT relrowsecurity FROM pg_class WHERE relname='share_links' AND relnamespace='public'::regnamespace), false),
       'relrowsecurity'
UNION ALL
SELECT '3 策略数 ≥ 4',
       ((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='share_links') >= 4),
       '当前 ' || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='share_links') || ' 条'
UNION ALL
SELECT '4 只读函数存在',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n2 ON n2.oid=p.pronamespace
                WHERE n2.nspname='public' AND p.proname='get_shared_schedule'),
       'get_shared_schedule(text)'
UNION ALL
SELECT '5 函数为 SECURITY DEFINER',
       coalesce((SELECT prosecdef FROM pg_proc WHERE proname='get_shared_schedule'
                  AND pronamespace='public'::regnamespace LIMIT 1), false),
       '内部需要绕过 RLS 读表'
UNION ALL
SELECT '6 匿名可执行该函数',
       has_function_privilege('anon', 'public.get_shared_schedule(text)', 'EXECUTE'),
       '老师免登录的前提'
UNION ALL
SELECT '7 members 无 anon 策略',
       ((SELECT relrowsecurity FROM pg_class WHERE relname='members' AND relnamespace='public'::regnamespace) IS TRUE
        AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='members' AND ('anon' = ANY(roles))) = 0),
       '匿名读不到成员表'
UNION ALL
SELECT '8 share_links 策略仅限 authenticated',
       ((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='share_links' AND ('anon' = ANY(roles))) = 0),
       '匿名只能走函数'
UNION ALL
SELECT '9 关键字段齐全',
       ((SELECT count(*) FROM information_schema.columns WHERE table_name='share_links'
          AND column_name IN ('token','expires_at','active','view_count','last_viewed_at')) = 5),
       'token/expires_at/active/view_count/last_viewed_at';