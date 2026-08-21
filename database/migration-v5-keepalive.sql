-- =============================================
-- 迁移 v5：保活心跳表（2026-08-21）
-- 用途：GitHub Actions 每天 INSERT 一行，形成真实数据库写操作，
--       可靠重置 Supabase 免费项目的 7 天不活跃计时器。
-- 背景：之前的保活方式是 SELECT 查询，可能被缓存命中而不计入活动，
--       导致项目仍被标记「低活跃度」。INSERT 写操作无法被缓存绕过。
-- 执行方式：Supabase SQL Editor 手动执行本文件（一次性）
-- =============================================

CREATE TABLE IF NOT EXISTS keep_alive_pings (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pinged_at  TIMESTAMPTZ DEFAULT now(),
  source     TEXT DEFAULT 'github-actions'
);

ALTER TABLE keep_alive_pings ENABLE ROW LEVEL SECURITY;

-- 该表不含任何敏感数据，允许 anon 角色插入/删除
-- （keep-alive workflow 使用 VITE_SUPABASE_ANON_KEY 调用）
CREATE POLICY "允许匿名插入心跳" ON keep_alive_pings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "允许匿名删除心跳" ON keep_alive_pings FOR DELETE TO anon USING (true);
