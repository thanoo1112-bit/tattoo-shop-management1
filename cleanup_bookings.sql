
BEGIN;

  -- 1. References
  DELETE FROM public.tattoo_project_references WHERE id IN ('0d102996-eb13-497a-8c07-15fb138b9105', '8dacddb2-5eda-41ed-968f-3514f6a685fe');

  -- 2. Payments
  DELETE FROM public.payments WHERE id IN ('24573cbf-dbb7-4ca1-9372-17bc84ad2e3c', '1d67c063-b0a1-46a1-9318-2a428e286b75', 'c49808ec-ca29-4562-bf7d-5bfc8aeb006f', '190d3d46-a756-4916-88e2-372cd19f8b76');

  -- 3. Upload sessions
  DELETE FROM private.public_booking_upload_sessions WHERE id IN ('d3ded066-7afc-40fb-a5b8-22eed0889673', '45c3e7c8-ed97-4f19-9bd3-a0d5fc1506b7', 'fcb90882-e5b2-4455-adf1-ec19eeaf9db5', 'ceca61a6-3c79-42bf-af8f-49f51fc53a89');

  -- 4. Booking requests
  DELETE FROM public.booking_requests WHERE id IN ('83cf6f56-1a5a-4593-b701-832c050c6905', 'b963e57a-1b3e-4e48-83ea-08bb219eeda6', '1d069ef6-a2f0-49ac-866b-aa4b02f6eacc', 'd092a2b6-d0b6-4e10-943f-d33404827b33', '043b8d5b-134d-4ce0-be3a-570a7724957c', 'c3275b7d-809f-49bd-b58d-d41022d35333');

  -- 5. Projects
  DELETE FROM public.tattoo_projects WHERE id IN ('64acd312-7ff9-49f6-b7ba-228a59d3542f', '43f42f3a-e173-47fc-ac83-31461a50390d', '09768bd4-ec51-4e83-9f5c-ef83fd0cb5db', '87558cce-35b3-40b0-b4e9-565358e869c9', '583c9095-de0f-45c0-9fe3-6fd4c3f581f2', 'ead55a65-c25d-460f-ae67-32b7843245a2');

  -- 6. Customer 3f4895a5-1c11-4c73-9222-0210eb8850fb (since all its bookings are deleted)
  DELETE FROM public.customers WHERE id = '3f4895a5-1c11-4c73-9222-0210eb8850fb';

COMMIT;

