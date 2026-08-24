-- Allow anon to resolve explicitly permitted objects in private schema.
GRANT USAGE ON SCHEMA private TO anon;

-- Current-function hardening.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM anon;

-- Future-function hardening for functions created by this migration role.
ALTER DEFAULT PRIVILEGES IN SCHEMA private
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Re-grant only the helper required by storage.objects INSERT RLS.
GRANT EXECUTE ON FUNCTION
private.can_upload_public_booking_reference(text, text)
TO anon;
