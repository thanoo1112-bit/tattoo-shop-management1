
BEGIN;
  -- References
  DELETE FROM public.tattoo_project_references WHERE project_id IN ('3026f723-1acb-47da-90b6-304850f96abb', '25d9491a-2457-45d2-9756-b95206470a2e', 'e6053cf8-09f6-47d6-b7bf-6e626e4d1386', '1db4b943-0b49-487c-add4-92f485356c14');
  
  -- Payments
  DELETE FROM public.payments WHERE booking_request_id IN ('2c61d03e-afce-46a4-98fa-c7c51aa40da3', 'e45124b0-45c3-4cf6-adc9-3ac0075c03b6', '398782cd-85f6-47f0-8712-e9981adffbb3', 'e9e5644b-b793-4da2-b9fc-57bd6d17c6f1');
  
  -- Booking requests
  DELETE FROM public.booking_requests WHERE id IN ('2c61d03e-afce-46a4-98fa-c7c51aa40da3', 'e45124b0-45c3-4cf6-adc9-3ac0075c03b6', '398782cd-85f6-47f0-8712-e9981adffbb3', 'e9e5644b-b793-4da2-b9fc-57bd6d17c6f1');
  
  -- Projects
  DELETE FROM public.tattoo_projects WHERE id IN ('3026f723-1acb-47da-90b6-304850f96abb', '25d9491a-2457-45d2-9756-b95206470a2e', 'e6053cf8-09f6-47d6-b7bf-6e626e4d1386', '1db4b943-0b49-487c-add4-92f485356c14');
  
  -- Upload sessions
  DELETE FROM private.public_booking_upload_sessions WHERE id IN ('e3a62b0d-4928-40de-8c6a-a721e01ec753', '9bb941ab-6161-4182-976e-30266969d7ff', '2aa4d016-f4b4-459d-b3ee-f9c8d337bf4a') OR status != 'consumed' OR booking_request_id IS NULL;
  
  -- Customers
  DELETE FROM public.customers WHERE id = 'ae587360-7bbe-455a-a18b-3adfc31bc356';
  
COMMIT;

