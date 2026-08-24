-- ============================================================
-- PROJECT COMPLETION V1
-- Adds: tattoo_projects.completed_at
-- Adds: public.complete_project(p_project_id uuid)
--
-- Guards:
--   1. Caller is authenticated
--   2. Caller is assigned artist (own project) OR active owner (same shop)
--   3. Project is currently active (not proposed/completed/cancelled)
--   4. No scheduled or in_progress appointments remain
--   5. At least one completed appointment exists
--   6. agreed_price IS NOT NULL (NULL = price unknown, not free)
--   7. No pending or verification_pending payments
--   8. No refund_pending payments
--   9. paid_total = agreed_price (no remaining balance)
--  10. paid_total does not exceed agreed_price (financial consistency)
--
-- Side effects:
--   tattoo_projects.status = 'completed'
--   tattoo_projects.completed_at = now()
--   tattoo_projects.updated_at = now()
--   No other tables mutated.
-- ============================================================

-- ── 1. Add completed_at column ──────────────────────────────

ALTER TABLE public.tattoo_projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Existing projects: completed_at remains NULL.
-- No historical backfill — updated_at is not an unambiguous proxy.

-- ── 2. Return type ──────────────────────────────────────────

CREATE TYPE public.complete_project_result AS (
  project_status text,
  completed_at   timestamptz
);

-- ── 3. RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_project(
  p_project_id uuid
)
RETURNS public.complete_project_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_member_role   text;
  v_proj          record;
  v_paid_total    numeric;
  v_result        public.complete_project_result;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Lock project row ─────────────────────────────────────
  SELECT *
    INTO v_proj
    FROM public.tattoo_projects
   WHERE id = p_project_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- ── Membership check ─────────────────────────────────────
  SELECT role
    INTO v_member_role
    FROM public.shop_members
   WHERE shop_id = v_proj.shop_id
     AND user_id  = v_user_id
     AND status   = 'active';

  IF v_member_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Artist may only complete their own project
  IF v_member_role = 'artist' AND v_proj.artist_id != v_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Only 'artist' and 'owner' roles are valid; guard against other roles
  IF v_member_role NOT IN ('artist', 'owner') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Project status guard ─────────────────────────────────
  IF v_proj.status != 'active' THEN
    RAISE EXCEPTION 'Project must be active to complete (current status: %)', v_proj.status;
  END IF;

  -- ── Active session guard ─────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM public.appointments
     WHERE project_id = p_project_id
       AND status IN ('scheduled', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'ไม่สามารถปิดโปรเจกต์ได้: ยังมีเซสชันที่ยังไม่เสร็จสิ้น (scheduled หรือ in_progress)';
  END IF;

  -- ── Completed session requirement ─────────────────────────
  IF NOT EXISTS (
    SELECT 1
      FROM public.appointments
     WHERE project_id = p_project_id
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'ไม่สามารถปิดโปรเจกต์ได้: ต้องมีเซสชันที่เสร็จสมบูรณ์อย่างน้อย 1 ครั้ง';
  END IF;

  -- ── Agreed price must be set ─────────────────────────────
  IF v_proj.agreed_price IS NULL THEN
    RAISE EXCEPTION 'กรุณากำหนดราคางานสักก่อนปิดโปรเจกต์';
  END IF;

  -- ── Unresolved payment guard ─────────────────────────────
  -- Block if any active-collection or unresolved payment exists
  IF EXISTS (
    SELECT 1
      FROM public.payments
     WHERE (
             project_id         = p_project_id
          OR booking_request_id IN (
               SELECT id FROM public.booking_requests
                WHERE project_id = p_project_id
             )
           )
       AND status IN ('pending', 'verification_pending', 'refund_pending')
  ) THEN
    RAISE EXCEPTION 'ไม่สามารถปิดโปรเจกต์ได้: ยังมีการชำระเงินที่ยังไม่ได้รับการแก้ไข (pending, verification_pending, หรือ refund_pending)';
  END IF;

  -- ── Calculate paid_total ─────────────────────────────────
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_total
    FROM public.payments
   WHERE (
           project_id         = p_project_id
        OR booking_request_id IN (
             SELECT id FROM public.booking_requests
              WHERE project_id = p_project_id
           )
         )
     AND status = 'paid';

  -- ── Financial overpayment guard ───────────────────────────
  IF v_paid_total > v_proj.agreed_price THEN
    RAISE EXCEPTION 'ไม่สามารถปิดโปรเจกต์ได้: ยอดชำระเกินกว่าราคาที่ตกลง กรุณาตรวจสอบข้อมูลการเงิน (paid_total=%, agreed_price=%)',
      v_paid_total, v_proj.agreed_price;
  END IF;

  -- ── Remaining balance guard ──────────────────────────────
  IF (v_proj.agreed_price - v_paid_total) > 0 THEN
    RAISE EXCEPTION 'ยังมียอดคงเหลือที่ต้องชำระก่อนปิดโปรเจกต์ (remaining=%, agreed_price=%, paid_total=%)',
      (v_proj.agreed_price - v_paid_total), v_proj.agreed_price, v_paid_total;
  END IF;

  -- ── All guards passed — update project ───────────────────
  UPDATE public.tattoo_projects
     SET status       = 'completed',
         completed_at = now(),
         updated_at   = now()
   WHERE id = p_project_id;

  -- ── Return result ────────────────────────────────────────
  v_result.project_status := 'completed';
  v_result.completed_at   := now();
  RETURN v_result;
END;
$$;

-- ── 4. Privileges ────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.complete_project(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_project(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_project(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_project(uuid) TO authenticated;
