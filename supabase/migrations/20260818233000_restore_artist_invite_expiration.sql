-- Update existing pending invites that have NULL expires_at to expire 7 days after created_at
UPDATE public.shop_invites 
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL;

-- Restore NOT NULL constraint on expires_at
ALTER TABLE public.shop_invites ALTER COLUMN expires_at SET NOT NULL;

-- Update RPCs

-- 1. accept_artist_invite
CREATE OR REPLACE FUNCTION public.accept_artist_invite(p_token UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- Lock the row to prevent race conditions with another accept or revoke
  SELECT * INTO v_invite
  FROM public.shop_invites
  WHERE token = p_token
  FOR UPDATE;

  -- Validate
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING';
  END IF;

  IF v_invite.expires_at <= NOW() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_invite.shop_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  -- Insert member
  INSERT INTO public.shop_members (shop_id, user_id, role, status)
  VALUES (v_invite.shop_id, v_user_id, v_invite.role, 'active');

  -- Update invite
  UPDATE public.shop_invites
  SET status = 'accepted', accepted_by = v_user_id, accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 2. create_artist_invite
CREATE OR REPLACE FUNCTION public.create_artist_invite()
RETURNS TABLE (token UUID, expires_at TIMESTAMPTZ) AS $$
DECLARE
  v_token UUID;
  v_expires_at TIMESTAMPTZ := NOW() + interval '7 days';
  v_shop_id UUID;
  v_user_id UUID := auth.uid();
  v_shop_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COUNT(*) INTO v_shop_count
  FROM public.shop_members
  WHERE user_id = v_user_id AND role = 'owner' AND status = 'active';

  IF v_shop_count = 0 THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  ELSIF v_shop_count > 1 THEN
    RAISE EXCEPTION 'MULTIPLE_OWNER_SHOPS_NOT_SUPPORTED';
  END IF;

  SELECT shop_id INTO v_shop_id
  FROM public.shop_members
  WHERE user_id = v_user_id AND role = 'owner' AND status = 'active'
  LIMIT 1;
  
  INSERT INTO public.shop_invites (shop_id, role, status, created_by, expires_at)
  VALUES (v_shop_id, 'artist', 'pending', v_user_id, v_expires_at)
  RETURNING public.shop_invites.token INTO v_token;
  
  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 3. get_invite_preview
CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token UUID)
RETURNS TABLE (
  valid BOOLEAN,
  shop_name TEXT,
  shop_logo_url TEXT,
  role TEXT,
  expires_at TIMESTAMPTZ,
  reason TEXT
) AS $$
DECLARE
  v_invite RECORD;
  v_shop RECORD;
BEGIN
  SELECT * INTO v_invite FROM public.shop_invites WHERE token = p_token;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, 'invalid'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = v_invite.shop_id;

  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT FALSE, v_shop.name, v_shop.logo_url, v_invite.role, v_invite.expires_at, 'accepted'::TEXT;
  ELSIF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT FALSE, v_shop.name, v_shop.logo_url, v_invite.role, v_invite.expires_at, 'revoked'::TEXT;
  ELSIF v_invite.expires_at <= NOW() THEN
    RETURN QUERY SELECT FALSE, v_shop.name, v_shop.logo_url, v_invite.role, v_invite.expires_at, 'expired'::TEXT;
  ELSIF v_invite.status = 'pending' THEN
    RETURN QUERY SELECT TRUE, v_shop.name, v_shop.logo_url, v_invite.role, v_invite.expires_at, 'valid'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, v_shop.name, v_shop.logo_url, v_invite.role, v_invite.expires_at, 'invalid'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
