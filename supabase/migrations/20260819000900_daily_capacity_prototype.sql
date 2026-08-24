-- Migration: Daily Capacity Prototype V1
-- Description: Adds schema for daily capacity, requested_date, and capacity hold logic.

-- 1. ADD SHOP DEFAULT CAPACITY
ALTER TABLE public.shop_booking_settings 
ADD COLUMN default_daily_capacity integer NOT NULL DEFAULT 1 CHECK (default_daily_capacity > 0);

-- 2. CREATE ARTIST BOOKING SETTINGS
CREATE TABLE public.artist_booking_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    daily_capacity integer NOT NULL CHECK (daily_capacity > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, artist_id)
);

ALTER TABLE public.artist_booking_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_booking_settings FROM PUBLIC, anon, authenticated;

-- 3. CREATE DAILY OVERRIDES
CREATE TABLE public.artist_daily_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    override_date date NOT NULL,
    capacity integer NOT NULL CHECK (capacity >= 0),
    is_closed boolean NOT NULL DEFAULT false,
    reason text,
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, artist_id, override_date)
);

ALTER TABLE public.artist_daily_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_daily_overrides FROM PUBLIC, anon, authenticated;

-- 4. UPDATE BOOKING REQUESTS
ALTER TABLE public.booking_requests
ADD COLUMN requested_date date,
ADD COLUMN hold_expires_at timestamptz;

-- 5. FUNCTION TO RESOLVE EFFECTIVE CAPACITY
CREATE OR REPLACE FUNCTION public.get_effective_daily_capacity(
    p_shop_id uuid,
    p_artist_id uuid,
    p_date date
) RETURNS TABLE (
    effective_capacity integer,
    is_closed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_override_cap integer;
    v_override_closed boolean;
    v_artist_cap integer;
    v_shop_cap integer;
BEGIN
    -- 1. Check Daily Override
    SELECT capacity, is_closed INTO v_override_cap, v_override_closed
    FROM public.artist_daily_overrides
    WHERE shop_id = p_shop_id AND artist_id = p_artist_id AND override_date = p_date;

    IF FOUND THEN
        IF v_override_closed THEN
            RETURN QUERY SELECT 0, true;
        ELSE
            RETURN QUERY SELECT v_override_cap, false;
        END IF;
        RETURN;
    END IF;

    -- 2. Check Artist Default
    SELECT daily_capacity INTO v_artist_cap
    FROM public.artist_booking_settings
    WHERE shop_id = p_shop_id AND artist_id = p_artist_id;

    IF FOUND THEN
        RETURN QUERY SELECT v_artist_cap, false;
        RETURN;
    END IF;

    -- 3. Check Shop Default
    SELECT default_daily_capacity INTO v_shop_cap
    FROM public.shop_booking_settings
    WHERE shop_id = p_shop_id;

    RETURN QUERY SELECT COALESCE(v_shop_cap, 1), false;
END;
$$;
REVOKE ALL ON FUNCTION public.get_effective_daily_capacity FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_daily_capacity TO authenticated;

-- 6. FUNCTION TO COUNT OCCUPIED CAPACITY
CREATE OR REPLACE FUNCTION public.get_occupied_daily_capacity(
    p_shop_id uuid,
    p_artist_id uuid,
    p_date date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_appointments_count integer;
    v_holds_count integer;
BEGIN
    -- Count Active Appointments
    SELECT count(*) INTO v_appointments_count
    FROM public.appointments
    WHERE shop_id = p_shop_id 
      AND artist_id = p_artist_id 
      AND (start_at AT TIME ZONE 'Asia/Bangkok')::date = p_date
      AND status IN ('scheduled', 'in_progress', 'completed');

    -- Count Active Holds (Pending Payment with valid expiry OR has verification pending)
    SELECT count(*) INTO v_holds_count
    FROM public.booking_requests br
    WHERE br.shop_id = p_shop_id 
      AND br.artist_id = p_artist_id 
      AND br.requested_date = p_date
      AND br.status = 'pending_payment'
      AND (
          br.hold_expires_at > now()
          OR EXISTS (
              SELECT 1 FROM public.payments p 
              WHERE p.booking_request_id = br.id 
                AND p.status = 'verification_pending'
          )
      );

    RETURN v_appointments_count + v_holds_count;
END;
$$;
REVOKE ALL ON FUNCTION public.get_occupied_daily_capacity FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_occupied_daily_capacity TO authenticated;

-- 7. PRE-APPROVE ATOMIC RPC
CREATE OR REPLACE FUNCTION public.preapprove_booking_request(
    p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_request public.booking_requests%ROWTYPE;
    v_effective_cap integer;
    v_is_closed boolean;
    v_occupied integer;
    v_hold_minutes integer;
BEGIN
    -- Verify auth
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock request row
    SELECT * INTO v_request 
    FROM public.booking_requests 
    WHERE id = p_request_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_request.status != 'pending_review' THEN
        RAISE EXCEPTION 'Request is not in pending_review state';
    END IF;
    
    IF v_request.requested_date IS NULL THEN
        RAISE EXCEPTION 'Request does not have a requested_date';
    END IF;

    -- Basic access check (must be owner or the artist)
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_request.shop_id AND user_id = auth.uid() AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Fetch shop hold minutes setting
    SELECT hold_minutes INTO v_hold_minutes
    FROM public.shop_booking_settings
    WHERE shop_id = v_request.shop_id;

    IF v_hold_minutes IS NULL THEN
        v_hold_minutes := 30; -- Fallback just in case
    END IF;

    -- Lock the artist profile to prevent concurrent pre-approvals for the same artist
    PERFORM 1 FROM public.profiles WHERE id = v_request.artist_id FOR UPDATE;

    -- Check Capacity
    SELECT effective_capacity, is_closed INTO v_effective_cap, v_is_closed 
    FROM public.get_effective_daily_capacity(v_request.shop_id, v_request.artist_id, v_request.requested_date);

    IF v_is_closed THEN
        RAISE EXCEPTION 'Artist is closed on this date';
    END IF;

    SELECT public.get_occupied_daily_capacity(v_request.shop_id, v_request.artist_id, v_request.requested_date) INTO v_occupied;

    IF v_occupied >= v_effective_cap THEN
        RAISE EXCEPTION 'Capacity is full for this date';
    END IF;

    -- Approve and Hold
    UPDATE public.booking_requests
    SET status = 'pending_payment',
        hold_expires_at = now() + (v_hold_minutes || ' minutes')::interval,
        updated_at = now()
    WHERE id = p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.preapprove_booking_request FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preapprove_booking_request TO authenticated;

-- 8. PUBLIC DAILY AVAILABILITY RPC
CREATE OR REPLACE FUNCTION public.get_public_daily_availability(
    p_shop_id uuid,
    p_artist_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS TABLE (
    "date" date,
    status text,
    capacity integer,
    occupied integer,
    remaining integer,
    can_request boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_curr_date date;
    v_cap integer;
    v_closed boolean;
    v_occ integer;
    v_status text;
    v_rem integer;
BEGIN
    v_curr_date := p_start_date;
    
    WHILE v_curr_date <= p_end_date LOOP
        SELECT effective_capacity, is_closed INTO v_cap, v_closed 
        FROM public.get_effective_daily_capacity(p_shop_id, p_artist_id, v_curr_date);
        
        IF v_closed THEN
            "date" := v_curr_date;
            status := 'CLOSED';
            capacity := 0;
            occupied := 0;
            remaining := 0;
            can_request := false;
            RETURN NEXT;
        ELSE
            SELECT public.get_occupied_daily_capacity(p_shop_id, p_artist_id, v_curr_date) INTO v_occ;
            v_rem := GREATEST(0, v_cap - v_occ);
            
            IF v_occ >= v_cap THEN
                v_status := 'FULL';
            ELSIF v_occ > 0 THEN
                v_status := 'LIMITED';
            ELSE
                v_status := 'AVAILABLE';
            END IF;

            "date" := v_curr_date;
            status := v_status;
            capacity := v_cap;
            occupied := v_occ;
            remaining := v_rem;
            can_request := (v_rem > 0);
            RETURN NEXT;
        END IF;
        
        v_curr_date := v_curr_date + 1;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_daily_availability FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_daily_availability TO anon, authenticated;
