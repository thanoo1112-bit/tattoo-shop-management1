-- =============================================================================
-- 157 TATTOO - MIGRATION: CUSTOMER HEALTH DISCLOSURE FOR TATTOO REQUESTS
-- =============================================================================

ALTER TABLE public.estimate_requests
ADD COLUMN IF NOT EXISTS has_medical_condition BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS medical_condition_note TEXT NULL,
ADD COLUMN IF NOT EXISTS has_allergy BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allergy_note TEXT NULL;

COMMENT ON COLUMN public.estimate_requests.has_medical_condition IS 'ลูกค้ามีโรคประจำตัวหรือไม่';
COMMENT ON COLUMN public.estimate_requests.medical_condition_note IS 'รายละเอียดโรคประจำตัวที่แจ้ง';
COMMENT ON COLUMN public.estimate_requests.has_allergy IS 'ลูกค้ามีประวัติแพ้อาหาร/ยา/สิ่งต่างๆ หรือไม่';
COMMENT ON COLUMN public.estimate_requests.allergy_note IS 'รายละเอียดประวัติแพ้ที่แจ้ง';
