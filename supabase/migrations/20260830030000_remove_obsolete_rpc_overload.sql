-- Migration: Remove obsolete overload of create_public_booking_upload_session to resolve ambiguity
-- File: supabase/migrations/20260830030000_remove_obsolete_rpc_overload.sql

-- Drop the old version defined in 20260826220000_remove_promotion_system.sql
-- Signature types: (text, uuid, text, text, uuid, uuid, uuid)
DROP FUNCTION IF EXISTS public.create_public_booking_upload_session(
    text,
    uuid,
    text,
    text,
    uuid,
    uuid,
    uuid
);
