-- =================================================================
-- PHASE 11: ADD PREFERRED TIME TO ESTIMATE REQUESTS
-- Record preferred_time column schema state in Git repository
-- =================================================================

ALTER TABLE public.estimate_requests
ADD COLUMN IF NOT EXISTS preferred_time TIME WITHOUT TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.estimate_requests.preferred_time
IS 'เวลาที่ลูกค้าสะดวกเข้ารับบริการ';
