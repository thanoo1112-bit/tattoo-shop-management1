-- Initial Schema for 157 TATTOO

CREATE SCHEMA IF NOT EXISTS private;

-- Grant schema usage
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- shops table
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  phone TEXT,
  address TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- shop_members table
CREATE TABLE public.shop_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'artist')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

-- shop_invites table
CREATE TABLE public.shop_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('artist')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shop_members_user_id ON public.shop_members(user_id);
CREATE INDEX idx_shop_invites_shop_id ON public.shop_invites(shop_id);
CREATE INDEX idx_shop_invites_status ON public.shop_invites(status);
CREATE INDEX idx_shop_invites_expires_at ON public.shop_invites(expires_at);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION private.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();
CREATE TRIGGER set_updated_at_shops BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();
CREATE TRIGGER set_updated_at_shop_members BEFORE UPDATE ON public.shop_members FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();
CREATE TRIGGER set_updated_at_shop_invites BEFORE UPDATE ON public.shop_invites FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

-- Auth Trigger for Profiles
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown User'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- Helper Functions (SECURITY DEFINER, private schema)
CREATE OR REPLACE FUNCTION private.is_shop_member(p_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id AND user_id = auth.uid() AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION private.is_shop_owner(p_shop_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id AND user_id = auth.uid() AND role = 'owner' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- profiles
CREATE POLICY "Users can view members of their shops"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.shop_members sm1
      JOIN public.shop_members sm2 ON sm1.shop_id = sm2.shop_id
      WHERE sm1.user_id = auth.uid() AND sm2.user_id = public.profiles.id AND sm1.status = 'active' AND sm2.status = 'active'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- shops
CREATE POLICY "Shop members can view their shops"
  ON public.shops FOR SELECT
  TO authenticated
  USING (private.is_shop_member(id));

CREATE POLICY "Shop owners can update their shops"
  ON public.shops FOR UPDATE
  TO authenticated
  USING (private.is_shop_owner(id))
  WITH CHECK (private.is_shop_owner(id));

-- shop_members
CREATE POLICY "Shop members can view members"
  ON public.shop_members FOR SELECT
  TO authenticated
  USING (private.is_shop_member(shop_id));

-- shop_invites
CREATE POLICY "Shop owners can view invites"
  ON public.shop_invites FOR SELECT
  TO authenticated
  USING (private.is_shop_owner(shop_id));

-- RPC Functions
-- 1. create_shop_with_owner
CREATE OR REPLACE FUNCTION public.create_shop_with_owner(
  p_shop_name TEXT,
  p_shop_slug TEXT,
  p_phone TEXT,
  p_address TEXT
) RETURNS UUID AS $$
DECLARE
  v_shop_id UUID;
  v_base_slug TEXT;
  v_final_slug TEXT;
  v_counter INT := 1;
  v_user_id UUID := auth.uid();
  v_lock_key BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Normalize slug
  v_base_slug := REGEXP_REPLACE(LOWER(TRIM(p_shop_slug)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := TRIM(BOTH '-' FROM v_base_slug);
  v_base_slug := REGEXP_REPLACE(v_base_slug, '-+', '-', 'g');
  
  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    RAISE EXCEPTION 'INVALID_SLUG';
  END IF;

  v_final_slug := v_base_slug;

  -- Acquire advisory lock based on user ID to prevent double submit
  v_lock_key := ('x' || SUBSTR(MD5(v_user_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check if user already has an active owner membership
  IF EXISTS (SELECT 1 FROM public.shop_members WHERE user_id = v_user_id AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'OWNER_SHOP_ALREADY_EXISTS';
  END IF;

  -- Verify profile exists (should be created by trigger)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- Handle slug collisions safely using subtransaction (EXCEPTION WHEN unique_violation)
  LOOP
    BEGIN
      INSERT INTO public.shops (name, slug, phone, address, created_by)
      VALUES (p_shop_name, v_final_slug, p_phone, p_address, v_user_id)
      RETURNING id INTO v_shop_id;
      
      EXIT; -- Success, exit loop
    EXCEPTION WHEN unique_violation THEN
      v_counter := v_counter + 1;
      v_final_slug := v_base_slug || '-' || v_counter;
    END;
  END LOOP;

  -- Insert Owner Membership
  INSERT INTO public.shop_members (shop_id, user_id, role, status)
  VALUES (v_shop_id, v_user_id, 'owner', 'active');

  RETURN v_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. accept_artist_invite
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

-- 3. create_artist_invite
CREATE OR REPLACE FUNCTION public.create_artist_invite()
RETURNS TABLE (token UUID, expires_at TIMESTAMPTZ) AS $$
DECLARE
  v_token UUID;
  v_expires_at TIMESTAMPTZ;
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
  VALUES (v_shop_id, 'artist', 'pending', v_user_id, NOW() + INTERVAL '7 days')
  RETURNING public.shop_invites.token, public.shop_invites.expires_at INTO v_token, v_expires_at;
  
  RETURN QUERY SELECT v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. revoke_artist_invite
CREATE OR REPLACE FUNCTION public.revoke_artist_invite(p_token UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Use FOR UPDATE to lock the row and prevent race conditions with accept_artist_invite
  SELECT * INTO v_invite 
  FROM public.shop_invites 
  WHERE token = p_token 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  IF NOT private.is_shop_owner(v_invite.shop_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  
  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING';
  END IF;

  UPDATE public.shop_invites SET status = 'revoked' WHERE id = v_invite.id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. get_public_shop_by_slug
CREATE OR REPLACE FUNCTION public.get_public_shop_by_slug(p_slug TEXT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, logo_url TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name, s.slug, s.logo_url
  FROM public.shops s
  WHERE s.slug = p_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. get_invite_preview
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


-- GRANTS AND REVOKES

-- Revoke all table access from anon, authenticated, public
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shops FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shop_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shop_invites FROM PUBLIC, anon, authenticated;

-- Grant specific Table privileges to authenticated (Least Privilege)
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.profiles TO authenticated;

GRANT SELECT ON TABLE public.shops TO authenticated;
GRANT UPDATE (name, logo_url, phone, address) ON public.shops TO authenticated;

GRANT SELECT ON TABLE public.shop_members TO authenticated;
GRANT SELECT ON TABLE public.shop_invites TO authenticated;

-- Helper and Trigger Functions: Revoke execution from everywhere
REVOKE EXECUTE ON FUNCTION private.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_shop_member(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_shop_owner(UUID) FROM PUBLIC, anon, authenticated;

-- Grant execution of Helpers only to authenticated
GRANT EXECUTE ON FUNCTION private.is_shop_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_shop_owner(UUID) TO authenticated;

-- Public-safe RPCs: Revoke then grant to anon, authenticated
REVOKE EXECUTE ON FUNCTION public.get_public_shop_by_slug(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invite_preview(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_shop_by_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_preview(UUID) TO anon, authenticated;

-- Authenticated RPCs: Revoke then grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.create_shop_with_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_artist_invite(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_artist_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_artist_invite(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_shop_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_artist_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_artist_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_artist_invite(UUID) TO authenticated;
