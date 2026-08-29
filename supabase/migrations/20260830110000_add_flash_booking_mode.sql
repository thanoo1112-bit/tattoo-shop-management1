-- Migration: Add flash_booking_mode and support two-mode Flash bookings
-- File: supabase/migrations/20260830110000_add_flash_booking_mode.sql

-- 1. Alter tables to add flash_booking_mode
ALTER TABLE public.booking_requests
ADD COLUMN IF NOT EXISTS flash_booking_mode text CHECK (flash_booking_mode IN ('fixed_price', 'price_review_required'));

ALTER TABLE public.tattoo_projects
ADD COLUMN IF NOT EXISTS flash_booking_mode text CHECK (flash_booking_mode IN ('fixed_price', 'price_review_required'));

ALTER TABLE private.public_booking_upload_sessions
ADD COLUMN IF NOT EXISTS flash_booking_mode text CHECK (flash_booking_mode IN ('fixed_price', 'price_review_required'));
