-- Allow authenticated and anon to resolve explicitly permitted objects in private schema.
GRANT USAGE ON SCHEMA private TO anon, authenticated;

-- Hardening the helper function.
REVOKE EXECUTE ON FUNCTION private.can_upload_public_booking_reference(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_upload_public_booking_reference(text, text) TO anon, authenticated;

-- Storage Policy Update
DROP POLICY IF EXISTS "Anon can upload to valid temporary session path" ON storage.objects;
DROP POLICY IF EXISTS "Public booking session can upload temporary references" ON storage.objects;

CREATE POLICY "Public booking session can upload temporary references"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'tattoo-references'
  AND private.can_upload_public_booking_reference(bucket_id, name)
);

-- RPC Hardening and Grants to both anon and authenticated
REVOKE EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) TO anon, authenticated;
