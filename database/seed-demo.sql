-- ============================================================
-- 演示数据（seed-demo.sql）
-- 用途：全新环境一键灌入假数据，便于复现与试玩（成员/课表/一周排班）
-- 执行位置：Supabase → SQL Editor（先执行 schema.sql）
-- ⚠️ 警告：会清空以下表的全部数据，**切勿在生产环境执行**！
--    members / course_schedules / assignments / semester_config / slot_config / day_config
-- ============================================================

-- ---------- 1. 清空（仅演示环境） ----------
TRUNCATE TABLE assignments, course_schedules, day_config, slot_config, semester_config, members CASCADE;

-- ---------- 2. 学期配置 ----------
INSERT INTO semester_config (name, first_week_is_odd, total_weeks, current_week, current_mode)
VALUES ('演示学期（18 周）', true, 18, 1, '一般');

-- ---------- 3. 时段配置：周一至周五 各时段各 1 人；周末 0 人 ----------
INSERT INTO slot_config (day_of_week, slot, required_count)
SELECT d, s, CASE WHEN d <= 5 THEN 1 ELSE 0 END
FROM generate_series(1, 7) AS d,
     unnest(ARRAY['上午', '下午1', '下午2']) AS s;

-- ---------- 4. 成员（6 人：3 部员 + 2 部长 + 1 主席团） ----------
INSERT INTO members (name, role, phone, active) VALUES
  ('演示-张三', '部员',   '13800000001', true),
  ('演示-李四', '部员',   '13800000002', true),
  ('演示-王五', '部员',   '13800000003', true),
  ('演示-赵六', '部长',   '13800000004', true),
  ('演示-钱七', '部长',   '13800000005', true),
  ('演示-孙八', '主席团', '13800000006', true);

-- ---------- 5. 课表：每人各有「单周/双周」两条；部员双周有两天下午有课 ----------
INSERT INTO course_schedules (member_id, week_type)
SELECT id, '单周' FROM members WHERE name LIKE '演示-%';

INSERT INTO course_schedules (member_id, week_type)
SELECT id, '双周' FROM members WHERE name LIKE '演示-%';

-- 给部员在双周加两门课（用于演示「排班自动避开上课时间」）
UPDATE course_schedules s SET mon_67 = true, wed_67 = true
FROM members m
WHERE s.member_id = m.id AND s.week_type = '双周' AND m.role = '部员';

-- ---------- 6. 第 1 周排班（每天上午 1 人；周五一条「请假 + 下周补排」示例） ----------
INSERT INTO assignments (week_number, day_of_week, slot, member_id, status, leave_next_week)
SELECT 1, 1, '上午', id, '正常', false FROM members WHERE name = '演示-张三'
UNION ALL SELECT 1, 2, '上午', id, '正常', false FROM members WHERE name = '演示-李四'
UNION ALL SELECT 1, 3, '上午', id, '正常', false FROM members WHERE name = '演示-王五'
UNION ALL SELECT 1, 4, '上午', id, '正常', false FROM members WHERE name = '演示-赵六'
UNION ALL SELECT 1, 5, '上午', id, '请假', true  FROM members WHERE name = '演示-钱七';

-- ---------- 7. 验证 ----------
SELECT '成员' AS 表, count(*) AS 行数 FROM members
UNION ALL SELECT '课表', count(*) FROM course_schedules
UNION ALL SELECT '排班', count(*) FROM assignments
UNION ALL SELECT '时段配置', count(*) FROM slot_config
UNION ALL SELECT '学期配置', count(*) FROM semester_config;
-- 期望：成员 6 / 课表 12 / 排班 5 / 时段配置 21 / 学期配置 1

-- ---------- 8. 想还原成干净环境？重新执行本文件即可（会先清空） ----------
