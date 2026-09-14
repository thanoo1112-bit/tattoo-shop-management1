-- ============================================================
-- 157 TATTOO — FULL TEST DATA AUDIT v3
-- SELECT ONLY — SCHEMA VERIFIED
-- Supabase SQL Editor — Safe to Run
-- ============================================================
-- VERIFIED SCHEMA:
--   flash_reservations.flash_design_id → flash_designs.id
--   flash_designs.artist_id            → artists.id
--   portfolio_artworks.artist_id       → artists.id
--   booking_payment_summary            → VIEW (SELECT only)
--   payment_settings                   → global config, no artist_id
-- ============================================================
-- PROTECTED — NEVER INCLUDE IN ANY DELETE:
--   Chang Bom  9aee0ce8-2c11-4b22-a52d-296807070d12
--   Chang Bas  d5af5064-d973-4bbb-b205-1ab6b2929abb
--   admin@157tattoo.com
--   artist1@157tattoo.com
-- ============================================================


-- ============================================================
-- SECTION A: ALL public.artists
-- ============================================================
SELECT
  'A' AS sec,
  a.id,
  a.name,
  a.nickname,
  a.slug,
  a.user_id,
  a.is_active,
  a.status,
  a.sort_order,
  a.created_at,
  CASE
    WHEN a.id IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    ) THEN 'REAL — PROTECTED'
    ELSE 'TEST / SEEDED'
  END AS classification
FROM public.artists a
ORDER BY
  CASE WHEN a.id IN (
    '9aee0ce8-2c11-4b22-a52d-296807070d12',
    'd5af5064-d973-4bbb-b205-1ab6b2929abb'
  ) THEN 0 ELSE 1 END,
  a.sort_order NULLS LAST,
  a.created_at;


-- ============================================================
-- SECTION B: CANDIDATE TEST ARTISTS
-- ============================================================
SELECT
  'B' AS sec,
  a.id         AS artist_id,
  a.name       AS artist_name,
  a.nickname,
  a.is_active,
  a.sort_order,
  a.created_at
FROM public.artists a
WHERE a.id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY a.created_at;


-- ============================================================
-- SECTION C: PER-TEST-ARTIST DEPENDENCY COUNTS
-- flash_reservations joined through flash_design_id → artist_id
-- ============================================================
SELECT
  'C'  AS sec,
  a.id   AS artist_id,
  a.name AS artist_name,
  a.is_active,

  (SELECT COUNT(*)
   FROM public.bookings b
   WHERE b.artist_id = a.id
  ) AS bookings,

  (SELECT COUNT(*)
   FROM public.booking_sessions bs
   WHERE bs.artist_id = a.id
  ) AS sessions,

  (SELECT COUNT(*)
   FROM public.estimate_requests er
   WHERE er.artist_id = a.id
  ) AS estimates,

  (SELECT COUNT(*)
   FROM public.flash_designs fd
   WHERE fd.artist_id = a.id
  ) AS flash_designs,

  (SELECT COUNT(*)
   FROM public.flash_reservations fr
   JOIN public.flash_designs fd2
     ON fd2.id = fr.flash_design_id
   WHERE fd2.artist_id = a.id
  ) AS flash_reservations,

  (SELECT COUNT(*)
   FROM public.portfolio_artworks pa
   WHERE pa.artist_id = a.id
  ) AS portfolio_artworks

FROM public.artists a
WHERE a.id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY bookings DESC, sessions DESC;


-- ============================================================
-- SECTION D: EXACT TEST BOOKINGS
-- ============================================================
SELECT
  'D' AS sec,
  b.id               AS booking_id,
  b.artist_id,
  a.name             AS artist_name,
  b.customer_user_id,
  b.status,
  b.date,
  b.created_at
FROM public.bookings b
JOIN public.artists a ON a.id = b.artist_id
WHERE b.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY b.created_at;


-- ============================================================
-- SECTION E: EXACT TEST SESSIONS
-- ============================================================
SELECT
  'E' AS sec,
  bs.id           AS session_id,
  bs.artist_id,
  a.name          AS artist_name,
  bs.booking_id,
  bs.status,
  bs.session_date,
  bs.created_at
FROM public.booking_sessions bs
JOIN public.artists a ON a.id = bs.artist_id
WHERE bs.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY bs.created_at;


-- ============================================================
-- SECTION F: EXACT TEST ESTIMATE REQUESTS
-- ============================================================
SELECT
  'F' AS sec,
  er.id               AS estimate_id,
  er.artist_id,
  a.name              AS artist_name,
  er.customer_user_id,
  er.status,
  er.created_at
FROM public.estimate_requests er
JOIN public.artists a ON a.id = er.artist_id
WHERE er.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY er.created_at;


-- ============================================================
-- SECTION G: EXACT TEST FLASH DESIGNS
-- ============================================================
SELECT
  'G' AS sec,
  fd.id          AS flash_id,
  fd.artist_id,
  a.name         AS artist_name,
  fd.title,
  fd.is_available,
  fd.created_at
FROM public.flash_designs fd
JOIN public.artists a ON a.id = fd.artist_id
WHERE fd.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY fd.created_at;


-- ============================================================
-- SECTION H: EXACT TEST FLASH RESERVATIONS
--   FK: flash_reservations.flash_design_id → flash_designs.id
--       flash_designs.artist_id            → artists.id
-- ============================================================
SELECT
  'H' AS sec,
  fr.id              AS reservation_id,
  fr.flash_design_id,
  fd.artist_id,
  a.name             AS artist_name,
  fr.customer_user_id,
  fr.status,
  fr.created_at
FROM public.flash_reservations fr
JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
JOIN public.artists       a  ON a.id  = fd.artist_id
WHERE fd.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY fr.created_at;


-- ============================================================
-- SECTION I: EXACT TEST PORTFOLIO ARTWORKS
-- ============================================================
SELECT
  'I' AS sec,
  pa.id        AS artwork_id,
  pa.artist_id,
  a.name       AS artist_name,
  pa.created_at
FROM public.portfolio_artworks pa
JOIN public.artists a ON a.id = pa.artist_id
WHERE pa.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY pa.created_at;


-- ============================================================
-- SECTION J: TEST BOOKING PAYMENTS
--   (payments whose booking links to a test artist)
-- ============================================================
SELECT
  'J' AS sec,
  bp.id          AS payment_id,
  bp.booking_id,
  b.artist_id,
  a.name         AS artist_name,
  bp.status,
  bp.amount,
  bp.payment_type,
  bp.created_at
FROM public.booking_payments bp
JOIN public.bookings b ON b.id = bp.booking_id
JOIN public.artists  a ON a.id = b.artist_id
WHERE b.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY bp.created_at;


-- ============================================================
-- SECTION K: TEST BOOKING PAYMENT SUBMISSIONS
-- ============================================================
SELECT
  'K' AS sec,
  bps.id           AS submission_id,
  bps.payment_id,
  bp.booking_id,
  b.artist_id,
  a.name           AS artist_name,
  bps.status,
  bps.created_at
FROM public.booking_payment_submissions bps
JOIN public.booking_payments            bp ON bp.id = bps.payment_id
JOIN public.bookings                    b  ON b.id  = bp.booking_id
JOIN public.artists                     a  ON a.id  = b.artist_id
WHERE b.artist_id NOT IN (
  '9aee0ce8-2c11-4b22-a52d-296807070d12',
  'd5af5064-d973-4bbb-b205-1ab6b2929abb'
)
ORDER BY bps.created_at;


-- ============================================================
-- SECTION L: CANDIDATE TEST CUSTOMERS
--   Only users whose bookings/estimates EXCLUSIVELY reference
--   test artists — anyone with a real-artist booking is protected
-- ============================================================
WITH test_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL

  UNION

  SELECT DISTINCT customer_user_id
  FROM public.estimate_requests
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
real_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
test_only AS (
  SELECT uid FROM test_uids
  EXCEPT
  SELECT uid FROM real_uids
)
SELECT
  'L' AS sec,
  c.id         AS customer_id,
  c.user_id,
  c.email,
  c.created_at
FROM public.customers c
WHERE c.user_id IN (SELECT uid FROM test_only)
  AND c.email NOT IN ('admin@157tattoo.com', 'artist1@157tattoo.com')
ORDER BY c.created_at;


-- ============================================================
-- SECTION M: CANDIDATE TEST PROFILES + AUTH USERS
-- ============================================================
WITH test_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL

  UNION

  SELECT DISTINCT customer_user_id
  FROM public.estimate_requests
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
real_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
test_only AS (
  SELECT uid FROM test_uids
  EXCEPT
  SELECT uid FROM real_uids
)
-- profiles
SELECT
  'M_PROFILE' AS sec,
  pr.id        AS profile_id,
  pr.user_id,
  pr.email,
  pr.role,
  pr.display_name,
  pr.created_at,
  CASE
    WHEN pr.email IN ('admin@157tattoo.com','artist1@157tattoo.com')
      THEN 'PROTECTED — DO NOT DELETE'
    WHEN pr.role IN ('admin','artist')
      THEN 'PROTECTED — STAFF ROLE'
    ELSE 'CANDIDATE TEST CUSTOMER'
  END AS classification
FROM public.profiles pr
WHERE pr.user_id IN (SELECT uid FROM test_only)
ORDER BY pr.created_at

UNION ALL

-- auth.users
SELECT
  'M_AUTH'    AS sec,
  au.id        AS profile_id,
  au.id        AS user_id,
  au.email,
  'auth_user'  AS role,
  ''           AS display_name,
  au.created_at,
  CASE
    WHEN au.email IN ('admin@157tattoo.com','artist1@157tattoo.com')
      THEN 'PROTECTED — DO NOT DELETE'
    ELSE 'CANDIDATE TEST'
  END AS classification
FROM auth.users au
WHERE au.id IN (SELECT uid FROM test_only)
  AND au.email NOT IN ('admin@157tattoo.com','artist1@157tattoo.com')
ORDER BY sec, created_at;


-- ============================================================
-- SECTION N: CANDIDATE TEST STORAGE OBJECTS
-- ============================================================
WITH test_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
  UNION
  SELECT DISTINCT customer_user_id
  FROM public.estimate_requests
  WHERE artist_id NOT IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
real_uids AS (
  SELECT DISTINCT customer_user_id AS uid
  FROM public.bookings
  WHERE artist_id IN (
      '9aee0ce8-2c11-4b22-a52d-296807070d12',
      'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    )
    AND customer_user_id IS NOT NULL
),
test_only AS (
  SELECT uid FROM test_uids
  EXCEPT
  SELECT uid FROM real_uids
)
SELECT
  'N' AS sec,
  so.id,
  so.bucket_id,
  so.name,
  so.owner,
  so.created_at
FROM storage.objects so
WHERE so.owner IN (SELECT uid::text FROM test_only)
ORDER BY so.created_at;


-- ============================================================
-- SECTION O: GLOBAL COUNTS + REAL BASELINE
-- ============================================================
SELECT 'O' AS sec, metric, value FROM (

  SELECT 1 AS ord, 'artists_total'                AS metric, COUNT(*)::text AS value FROM public.artists
  UNION ALL SELECT 2, 'artists_active',            COUNT(*)::text FROM public.artists WHERE is_active = true
  UNION ALL SELECT 3, 'artists_test_count',        COUNT(*)::text FROM public.artists
    WHERE id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 10, '── bookings ──',           '──────────'
  UNION ALL SELECT 11, 'bookings_total',            COUNT(*)::text FROM public.bookings
  UNION ALL SELECT 12, 'bookings_bom',              COUNT(*)::text FROM public.bookings WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
  UNION ALL SELECT 13, 'bookings_bas',              COUNT(*)::text FROM public.bookings WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
  UNION ALL SELECT 14, 'bookings_test',             COUNT(*)::text FROM public.bookings
    WHERE artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 20, '── sessions ──',            '──────────'
  UNION ALL SELECT 21, 'sessions_total',            COUNT(*)::text FROM public.booking_sessions
  UNION ALL SELECT 22, 'sessions_bom',              COUNT(*)::text FROM public.booking_sessions WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
  UNION ALL SELECT 23, 'sessions_bas',              COUNT(*)::text FROM public.booking_sessions WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
  UNION ALL SELECT 24, 'sessions_test',             COUNT(*)::text FROM public.booking_sessions
    WHERE artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 30, '── estimates ──',           '──────────'
  UNION ALL SELECT 31, 'estimates_total',           COUNT(*)::text FROM public.estimate_requests
  UNION ALL SELECT 32, 'estimates_bom',             COUNT(*)::text FROM public.estimate_requests WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
  UNION ALL SELECT 33, 'estimates_bas',             COUNT(*)::text FROM public.estimate_requests WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
  UNION ALL SELECT 34, 'estimates_test',            COUNT(*)::text FROM public.estimate_requests
    WHERE artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 40, '── payments ──',            '──────────'
  UNION ALL SELECT 41, 'payments_total',            COUNT(*)::text FROM public.booking_payments
  UNION ALL SELECT 42, 'payments_test',             COUNT(*)::text
    FROM public.booking_payments bp
    JOIN public.bookings b ON b.id = bp.booking_id
    WHERE b.artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')
  UNION ALL SELECT 43, 'submissions_total',         COUNT(*)::text FROM public.booking_payment_submissions
  UNION ALL SELECT 44, 'submissions_test',          COUNT(*)::text
    FROM public.booking_payment_submissions bps
    JOIN public.booking_payments bp ON bp.id = bps.payment_id
    JOIN public.bookings b ON b.id = bp.booking_id
    WHERE b.artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 50, '── flash ──',               '──────────'
  UNION ALL SELECT 51, 'flash_designs_total',       COUNT(*)::text FROM public.flash_designs
  UNION ALL SELECT 52, 'flash_designs_test',        COUNT(*)::text FROM public.flash_designs
    WHERE artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')
  UNION ALL SELECT 53, 'flash_reservations_total',  COUNT(*)::text FROM public.flash_reservations
  UNION ALL SELECT 54, 'flash_reservations_test',   COUNT(*)::text
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fd.artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 60, '── portfolio ──',           '──────────'
  UNION ALL SELECT 61, 'portfolio_artworks_total',  COUNT(*)::text FROM public.portfolio_artworks
  UNION ALL SELECT 62, 'portfolio_artworks_test',   COUNT(*)::text FROM public.portfolio_artworks
    WHERE artist_id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')

  UNION ALL SELECT 70, '── customers ──',           '──────────'
  UNION ALL SELECT 71, 'customers_total',           COUNT(*)::text FROM public.customers
  UNION ALL SELECT 72, 'profiles_total',            COUNT(*)::text FROM public.profiles

  UNION ALL SELECT 80, '── post-purge baseline ──', '──────────'
  UNION ALL SELECT 81, 'expected_bookings_after_purge', (
    (SELECT COUNT(*) FROM public.bookings WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12') +
    (SELECT COUNT(*) FROM public.bookings WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')
  )::text
  UNION ALL SELECT 82, 'expected_sessions_after_purge', (
    (SELECT COUNT(*) FROM public.booking_sessions WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12') +
    (SELECT COUNT(*) FROM public.booking_sessions WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb')
  )::text

) sub
ORDER BY ord;


-- ============================================================
-- SECTION P: SAFETY ASSERTIONS (all must = PASS ✓)
-- ============================================================
SELECT
  'P' AS sec,
  assertion,
  result
FROM (

  SELECT 1 AS ord,
    'Chang Bom NOT in test set'                   AS assertion,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.artists
      WHERE id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
        AND id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END            AS result

  UNION ALL SELECT 2,
    'Chang Bas NOT in test set',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.artists
      WHERE id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
        AND id NOT IN ('9aee0ce8-2c11-4b22-a52d-296807070d12','d5af5064-d973-4bbb-b205-1ab6b2929abb')
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END

  UNION ALL SELECT 3,
    'admin@ has role=admin',
    CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE email = 'admin@157tattoo.com' AND role = 'admin'
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END

  UNION ALL SELECT 4,
    'artist1@ has role=artist',
    CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE email = 'artist1@157tattoo.com' AND role = 'artist'
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END

  UNION ALL SELECT 5,
    'Bom bookings = 36',
    CASE WHEN (
      SELECT COUNT(*) FROM public.bookings
      WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
    ) = 36 THEN 'PASS ✓'
    ELSE 'WARN — actual: ' || (
      SELECT COUNT(*)::text FROM public.bookings
      WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
    ) END

  UNION ALL SELECT 6,
    'Bom sessions = 42',
    CASE WHEN (
      SELECT COUNT(*) FROM public.booking_sessions
      WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
    ) = 42 THEN 'PASS ✓'
    ELSE 'WARN — actual: ' || (
      SELECT COUNT(*)::text FROM public.booking_sessions
      WHERE artist_id = '9aee0ce8-2c11-4b22-a52d-296807070d12'
    ) END

  UNION ALL SELECT 7,
    'Bas bookings = 0',
    CASE WHEN (
      SELECT COUNT(*) FROM public.bookings
      WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    ) = 0 THEN 'PASS ✓'
    ELSE 'WARN — actual: ' || (
      SELECT COUNT(*)::text FROM public.bookings
      WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    ) END

  UNION ALL SELECT 8,
    'Bas sessions = 0',
    CASE WHEN (
      SELECT COUNT(*) FROM public.booking_sessions
      WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    ) = 0 THEN 'PASS ✓'
    ELSE 'WARN — actual: ' || (
      SELECT COUNT(*)::text FROM public.booking_sessions
      WHERE artist_id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'
    ) END

  UNION ALL SELECT 9,
    'admin@ NOT in candidate delete set',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.email = 'admin@157tattoo.com'
        AND pr.user_id NOT IN (
          SELECT user_id FROM public.profiles WHERE role IN ('admin','artist')
        )
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END

  UNION ALL SELECT 10,
    'artist1@ NOT in candidate delete set',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.email = 'artist1@157tattoo.com'
        AND pr.user_id NOT IN (
          SELECT user_id FROM public.profiles WHERE role IN ('admin','artist')
        )
    ) THEN 'PASS ✓' ELSE 'FAIL ⚠' END

) checks
ORDER BY ord;
