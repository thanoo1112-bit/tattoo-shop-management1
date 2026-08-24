-- Migration: Harden Short Tracking Code Generator
-- Description: Updates private.generate_secure_tracking_code() to use empty search_path,
-- schema-qualify gen_random_bytes, and revokes public/anon/authenticated execution.

-- Recreate the generator function with hardened settings
CREATE OR REPLACE FUNCTION private.generate_secure_tracking_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i integer;
  val integer;
BEGIN
  -- Generate 10 cryptographically random bytes (unbiased selection from 32 chars)
  bytes := extensions.gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    val := pg_catalog.get_byte(bytes, i);
    result := result || pg_catalog.substr(chars, (val % 32) + 1, 1);
  END LOOP;
  
  -- Format as XXXX-XXXX-XX
  RETURN pg_catalog.substr(result, 1, 4) || '-' || pg_catalog.substr(result, 5, 4) || '-' || pg_catalog.substr(result, 9, 2);
END;
$$;

-- Revoke all permissions from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION private.generate_secure_tracking_code() FROM PUBLIC, anon, authenticated;
