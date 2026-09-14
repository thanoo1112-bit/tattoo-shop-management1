-- ============================================================
-- 157 TATTOO — SCHEMA DISCOVERY + BASELINE VERIFY
-- SELECT ONLY — NO MUTATIONS WHATSOEVER
-- Run in Supabase SQL Editor to verify rollback + real schema
-- ============================================================


-- ============================================================
-- SECTION 1: BASELINE COUNTS (verify DO block rolled back)
-- ============================================================
SELECT
  'BASELINE' AS sec,
  metric,
  value
FROM (
  SELECT 1  AS ord, 'artists_total'   AS metric, COUNT(*)::text AS value FROM public.artists
  UNION ALL SELECT 2, 'artists_active', COUNT(*)::text FROM public.artists WHERE is_active = true
  UNION ALL SELECT 3, 'artists_bom_exists',
    (CASE WHEN EXISTS (SELECT 1 FROM public.artists WHERE id = '9aee0ce8-2c11-4b22-a52d-296807070d12')
     THEN 'YES ✓' ELSE 'MISSING ⚠' END)
  UNION ALL SELECT 4, 'artists_bas_exists',
    (CASE WHEN EXISTS (SELECT 1 FROM public.artists WHERE id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')
     THEN 'YES ✓' ELSE 'MISSING ⚠' END)
  UNION ALL SELECT 5, 'bookings_total',         COUNT(*)::text FROM public.bookings
  UNION ALL SELECT 6, 'booking_sessions_total', COUNT(*)::text FROM public.booking_sessions
  UNION ALL SELECT 7, 'booking_payments_total', COUNT(*)::text FROM public.booking_payments
  UNION ALL SELECT 8, 'booking_payment_submissions_total', COUNT(*)::text FROM public.booking_payment_submissions
  UNION ALL SELECT 9, 'estimate_requests_total', COUNT(*)::text FROM public.estimate_requests
  UNION ALL SELECT 10,'profiles_total',          COUNT(*)::text FROM public.profiles
  UNION ALL SELECT 11,'customers_total',         COUNT(*)::text FROM public.customers
) t
ORDER BY ord;


-- ============================================================
-- SECTION 2: booking_payment_submissions — ALL COLUMNS
-- ============================================================
SELECT
  'BPS_COLUMNS' AS sec,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name   = 'booking_payment_submissions'
ORDER BY c.ordinal_position;


-- ============================================================
-- SECTION 3: booking_payments — ALL COLUMNS
-- ============================================================
SELECT
  'BP_COLUMNS' AS sec,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.ordinal_position
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name   = 'booking_payments'
ORDER BY c.ordinal_position;


-- ============================================================
-- SECTION 4: ALL FK CONSTRAINTS on booking_payment_submissions
-- ============================================================
SELECT
  'BPS_FK' AS sec,
  kcu.column_name          AS local_column,
  ccu.table_name           AS references_table,
  ccu.column_name          AS references_column,
  rc.constraint_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = rc.constraint_name
 AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE kcu.table_schema = 'public'
  AND kcu.table_name   = 'booking_payment_submissions'
ORDER BY kcu.column_name;


-- ============================================================
-- SECTION 5: ALL FK CONSTRAINTS on booking_payments
-- ============================================================
SELECT
  'BP_FK' AS sec,
  kcu.column_name          AS local_column,
  ccu.table_name           AS references_table,
  ccu.column_name          AS references_column,
  rc.constraint_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = rc.constraint_name
 AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE kcu.table_schema = 'public'
  AND kcu.table_name   = 'booking_payments'
ORDER BY kcu.column_name;


-- ============================================================
-- SECTION 6: WHICH TABLES REFERENCE booking_payments
--   (what else has an FK pointing TO booking_payments)
-- ============================================================
SELECT
  'REFS_TO_BP' AS sec,
  kcu.table_name           AS child_table,
  kcu.column_name          AS child_column,
  ccu.table_name           AS parent_table,
  ccu.column_name          AS parent_column,
  rc.constraint_name,
  rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = rc.constraint_name
 AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE ccu.table_schema = 'public'
  AND ccu.table_name   = 'booking_payments'
ORDER BY kcu.table_name, kcu.column_name;


-- ============================================================
-- SECTION 7: WHICH TABLES REFERENCE bookings
-- ============================================================
SELECT
  'REFS_TO_BOOKINGS' AS sec,
  kcu.table_name           AS child_table,
  kcu.column_name          AS child_column,
  ccu.table_name           AS parent_table,
  ccu.column_name          AS parent_column,
  rc.constraint_name,
  rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = rc.constraint_name
 AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE ccu.table_schema = 'public'
  AND ccu.table_name   = 'bookings'
ORDER BY kcu.table_name, kcu.column_name;


-- ============================================================
-- SECTION 8: WHICH TABLES REFERENCE artists
-- ============================================================
SELECT
  'REFS_TO_ARTISTS' AS sec,
  kcu.table_name           AS child_table,
  kcu.column_name          AS child_column,
  rc.constraint_name,
  rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = rc.constraint_name
 AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE ccu.table_schema = 'public'
  AND ccu.table_name   = 'artists'
ORDER BY kcu.table_name, kcu.column_name;


-- ============================================================
-- SECTION 9: SAMPLE booking_payment_submissions rows (max 5)
--   To see actual column names in real data
-- ============================================================
SELECT
  'BPS_SAMPLE' AS sec,
  bps.*
FROM public.booking_payment_submissions bps
LIMIT 5;


-- ============================================================
-- SECTION 10: SAMPLE booking_payments rows (max 5)
-- ============================================================
SELECT
  'BP_SAMPLE' AS sec,
  bp.*
FROM public.booking_payments bp
LIMIT 5;


-- ============================================================
-- SECTION 11: PROTECTED IDENTITY VERIFICATION
-- ============================================================
SELECT
  'PROTECTED' AS sec,
  check_name,
  result
FROM (
  SELECT 1 AS ord, 'admin@ profile exists' AS check_name,
    CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE email = 'admin@157tattoo.com')
    THEN 'INTACT ✓' ELSE 'MISSING ⚠' END AS result

  UNION ALL SELECT 2, 'artist1@ profile exists',
    CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE email = 'artist1@157tattoo.com')
    THEN 'INTACT ✓' ELSE 'MISSING ⚠' END

  UNION ALL SELECT 3, 'Chang Bom artist exists',
    CASE WHEN EXISTS (SELECT 1 FROM public.artists WHERE id = '9aee0ce8-2c11-4b22-a52d-296807070d12')
    THEN 'INTACT ✓' ELSE 'MISSING ⚠' END

  UNION ALL SELECT 4, 'Chang Bas artist exists',
    CASE WHEN EXISTS (SELECT 1 FROM public.artists WHERE id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')
    THEN 'INTACT ✓' ELSE 'MISSING ⚠' END

  UNION ALL SELECT 5, 'Bom bookings count',
    (SELECT COUNT(*)::text FROM public.bookings WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12')

  UNION ALL SELECT 6, 'Bom sessions count',
    (SELECT COUNT(*)::text FROM public.booking_sessions WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12')

  UNION ALL SELECT 7, 'Bas bookings count',
    (SELECT COUNT(*)::text FROM public.bookings WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 8, 'Bas sessions count',
    (SELECT COUNT(*)::text FROM public.booking_sessions WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')

) t
ORDER BY ord;
