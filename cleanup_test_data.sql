BEGIN;

  -- 1. Clear references in flash_designs (reset held/reserved test designs to open)
  UPDATE public.flash_designs 
  SET booking_request_id = NULL, 
      held_by_session_id = NULL, 
      held_expires_at = NULL,
      status = 'open'
  WHERE status IN ('held', 'reserved');

  -- 2. Clear expired session info for other flash items
  UPDATE public.flash_designs
  SET held_by_session_id = NULL,
      held_expires_at = NULL
  WHERE held_by_session_id IS NOT NULL;

  -- 3. Delete from dependent upload session tables
  DELETE FROM private.public_payment_upload_sessions;
  DELETE FROM private.balance_payment_upload_sessions;
  DELETE FROM private.public_booking_upload_sessions;

  -- 4. Delete holds, references, payments, appointments, requests, projects, and customers
  DELETE FROM public.booking_schedule_holds;
  DELETE FROM public.tattoo_project_references;
  DELETE FROM public.payments;
  DELETE FROM public.appointments;
  DELETE FROM public.booking_requests;
  DELETE FROM public.tattoo_projects;
  DELETE FROM public.customers;

COMMIT;
