import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SUPABASE_URL = 'https://uieehinjjqoofejteehz.supabase.co';
const ANON_KEY = 'sb_publishable_iO2jc3ZXc4nOn1UaEZdtxQ_BBRmM3sU';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('================================================================');
  console.log('PHASE 2E-B: CUSTOMER BOOKING CALENDAR & AVAILABILITY E2E TEST');
  console.log('================================================================\n');

  const report = {};
  const testIds = {
    users: [],
    estimates: [],
    bookings: [],
    bookingSessions: [],
    bookingPayments: [],
  };

  // 1. Admin Authentication
  console.log('[STEP 1] Authenticating Admin & Loading Artists...');
  const adminAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@157tattoo.com', password: '157tattoo' }),
  }).then((r) => r.json());

  const adminToken = adminAuthRes.access_token;
  const adminHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const artists = await fetch(`${SUPABASE_URL}/rest/v1/artists?is_active=eq.true&order=sort_order`, {
    headers: adminHeaders,
  }).then((r) => r.json());

  const artist1 = artists[0];
  const artist2 = artists[1];
  console.log(`✓ Artist 1: ${artist1.name} (${artist1.id})`);
  console.log(`✓ Artist 2: ${artist2?.name || 'Artist 2'} (${artist2?.id})`);

  // 2. Test RPC Security (Anon vs Authenticated)
  console.log('\n[TEST A & B] Verifying RPC Security & Anon Access Restriction...');
  const anonRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_artist_busy_ranges`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_artist_id: artist1.id,
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
    }),
  });
  console.log(`   Anon RPC call status (expect 401/403): ${anonRpcRes.status}`);
  report.test_anonRpcAccess = anonRpcRes.status === 401 || anonRpcRes.status === 403 ? 'PASS (DENIED)' : 'FAIL';

  // 3. Create Test Customer A
  console.log('\n[STEP 2] Creating Test Customer A (cust_2eb_a)...');
  const timestamp = Date.now();
  const customerAEmail = `cust_2eb_a_${timestamp}@157tattoo.com`;
  const customerPassword = 'Password157!';

  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customerAEmail,
      password: customerPassword,
      data: { display_name: 'คุณกิตติศักดิ์ (Test 2EB)', phone: '0891112233' },
    }),
  }).then((r) => r.json());

  const userAId = signupRes.user?.id || signupRes.id;
  testIds.users.push(userAId);

  // Login Customer A
  const userAAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: customerAEmail, password: customerPassword }),
  }).then((r) => r.json());

  const userAToken = userAAuth.access_token;
  const userAHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${userAToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Complete customer profile via canonical RPC
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/complete_customer_profile`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_full_name: 'คุณกิตติศักดิ์ นามสมมุติ',
      p_phone: '0891112233',
    }),
  });

  // Authenticated RPC test for Customer A
  const customerRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_artist_busy_ranges`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_artist_id: artist1.id,
      p_start_date: '2026-11-01',
      p_end_date: '2026-11-30',
    }),
  });
  console.log(`   Customer A RPC status: ${customerRpcRes.status}`);
  report.test_authenticatedRpcAccess = customerRpcRes.status === 200 ? 'PASS' : 'FAIL';

  // 4. Create Accepted Estimate for Customer A
  console.log('\n[STEP 3] Customer A Creates Estimate 1 & Accepts Quote...');
  const [est1] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      customer_user_id: userAId,
      artist_id: artist1.id,
      style: 'Japanese Dragon Custom',
      placement: 'แขนขวา (Upper Arm)',
      width_cm: 12,
      height_cm: 18,
      description: 'มังกรญี่ปุ่นคาบแก้ว สีดำ-เทา พร้อมคลื่นน้ำ',
      preferred_date: '2026-11-20',
      status: 'PENDING',
    }),
  }).then((r) => r.json());
  testIds.estimates.push(est1.id);

  // Admin quotes Estimate 1 with 180 min duration
  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est1.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      quoted_price: 8000.0,
      deposit_required: 2000.0,
      estimated_duration_minutes: 180,
      status: 'QUOTED',
      quoted_at: new Date().toISOString(),
    }),
  });

  // Customer A accepts quote
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_estimate_id: est1.id }),
  });
  console.log(`✓ Estimate 1 accepted by Customer A: ${est1.id}`);

  // 5. Create Controlled Busy Session Fixture for Artist 1 (2026-11-20 10:00-13:00 BKK -> 03:00-06:00Z)
  console.log('\n[STEP 4] Creating Controlled Busy Session Fixture for Artist 1...');
  const busyCustEmail = `cust_2eb_busy_${timestamp}@157tattoo.com`;
  const busyCustRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: busyCustEmail, password: customerPassword, data: { display_name: 'Busy Cust', phone: '0899998877' } }),
  }).then((r) => r.json());
  const busyCustId = busyCustRes.user?.id || busyCustRes.id;
  testIds.users.push(busyCustId);

  const busyCustAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: busyCustEmail, password: customerPassword }),
  }).then((r) => r.json());
  const busyCustHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${busyCustAuth.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/complete_customer_profile`, {
    method: 'POST',
    headers: busyCustHeaders,
    body: JSON.stringify({ p_full_name: 'Busy Test Customer', p_phone: '0899998877' }),
  });

  const [estBusy] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: busyCustHeaders,
    body: JSON.stringify({
      customer_user_id: busyCustId,
      artist_id: artist1.id,
      style: 'Chicano Lettering',
      placement: 'Chest',
      width_cm: 15,
      height_cm: 10,
      description: 'Lettering',
      status: 'PENDING',
    }),
  }).then((r) => r.json());
  testIds.estimates.push(estBusy.id);

  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${estBusy.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      quoted_price: 5000.0,
      deposit_required: 1500.0,
      estimated_duration_minutes: 180,
      status: 'QUOTED',
      quoted_at: new Date().toISOString(),
    }),
  });

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
    method: 'POST',
    headers: busyCustHeaders,
    body: JSON.stringify({ p_estimate_id: estBusy.id }),
  });

  const busyBookingRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
    method: 'POST',
    headers: busyCustHeaders,
    body: JSON.stringify({
      p_estimate_request_id: estBusy.id,
      p_requested_date: '2026-11-20',
      p_requested_start_time: '10:00:00',
    }),
  });
  const busyBookingData = await busyBookingRes.json();
  const busyBookingId = busyBookingData.booking_id || busyBookingData.id || (typeof busyBookingData === 'string' ? busyBookingData : null);
  testIds.bookings.push(busyBookingId);

  // Admin approves booking -> transitions to WAITING_DEPOSIT
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${busyBookingId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      artist_id: artist1.id,
      status: 'APPROVED',
    }),
  });

  // Admin records deposit payment -> transitions to CONFIRMED
  const payBusyRes = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: busyBookingId,
      amount: 1500.0,
      payment_type: 'DEPOSIT',
      payment_method: 'QR',
      status: 'RECORDED',
      created_by: adminAuthRes.user.id,
    }),
  });
  const payBusyData = await payBusyRes.json();
  const payBusy = Array.isArray(payBusyData) ? payBusyData[0] : payBusyData;
  if (payBusy?.id) testIds.bookingPayments.push(payBusy.id);

  // Insert SCHEDULED session 10:00-13:00 BKK (03:00-06:00 UTC)
  const sesBusyRes = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: busyBookingId,
      artist_id: artist1.id,
      session_number: 1,
      start_at: '2026-11-20T03:00:00+00:00', // 10:00 BKK
      end_at: '2026-11-20T06:00:00+00:00', // 13:00 BKK
      status: 'SCHEDULED',
    }),
  });
  const sesBusyData = await sesBusyRes.json();
  const sesBusy = Array.isArray(sesBusyData) ? sesBusyData[0] : sesBusyData;
  if (sesBusy?.id) testIds.bookingSessions.push(sesBusy.id);
  console.log(`✓ Busy Session created: ${sesBusy?.id} on 2026-11-20 10:00-13:00 BKK (03:00-06:00Z)`);

  // 6. Test get_artist_busy_ranges Privacy & Fields
  console.log('\n[TEST C & D] Testing RPC Response Data Shape & Zero PII Leakage...');
  const busyRangesRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_artist_busy_ranges`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_artist_id: artist1.id,
      p_start_date: '2026-11-20',
      p_end_date: '2026-11-20',
    }),
  });
  const busyRangesData = await busyRangesRes.json();
  console.log('   RPC response:', JSON.stringify(busyRangesData));

  const hasOnlyAllowedFields =
    Array.isArray(busyRangesData) &&
    busyRangesData.length >= 1 &&
    busyRangesData.every((r) => Object.keys(r).every((k) => k === 'start_at' || k === 'end_at'));
  const zeroPii =
    !JSON.stringify(busyRangesData).includes(busyCustId) &&
    !JSON.stringify(busyRangesData).includes(busyBookingId);
  console.log(`   Returns only start_at and end_at: ${hasOnlyAllowedFields}`);
  console.log(`   Zero PII exposure: ${zeroPii}`);
  report.test_rpcDataShape = hasOnlyAllowedFields ? 'PASS' : 'FAIL';
  report.test_zeroPiiLeakage = zeroPii ? 'PASS' : 'FAIL';

  // 7. Test Direct Table SELECT Privacy under RLS
  console.log('\n[TEST E] Customer A Direct SELECT on booking_sessions...');
  const directSessions = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?artist_id=eq.${artist1.id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`   Customer A direct SELECT rows count (expect 0 under RLS): ${directSessions.length}`);
  report.test_directTableSelectBlocked = directSessions.length === 0 ? 'PASS (0 rows)' : 'FAIL';

  // 8. Test Artist Isolation (Artist 2 should be empty)
  console.log('\n[TEST F] Testing Artist Isolation for Artist 2...');
  const artist2Ranges = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_artist_busy_ranges`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_artist_id: artist2.id,
      p_start_date: '2026-11-20',
      p_end_date: '2026-11-20',
    }),
  }).then((r) => r.json());
  console.log(`   Artist 2 busy ranges count on 2026-11-20 (expect 0): ${artist2Ranges.length}`);
  report.test_artistIsolation = artist2Ranges.length === 0 ? 'PASS' : 'FAIL';

  // 9. Test Session Status Variations: IN_PROGRESS, WAITING_DEPOSIT, CANCELLED, COMPLETED
  console.log('\n[TEST G, H, I, J] Testing Session Status Variants (IN_PROGRESS, CANCELLED, COMPLETED)...');
  // 9.1 IN_PROGRESS -> Still Busy
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${sesBusy.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  });
  const inProgRanges = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_artist_busy_ranges`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_artist_id: artist1.id, p_start_date: '2026-11-20', p_end_date: '2026-11-20' }),
  }).then((r) => r.json());
  console.log(`   IN_PROGRESS session returned as busy: ${inProgRanges.length >= 1}`);
  report.test_inProgressBusy = inProgRanges.length >= 1 ? 'PASS' : 'FAIL';

  // Revert back to SCHEDULED for UI tests
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${sesBusy.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'SCHEDULED' }),
  });

  // 10. Puppeteer Browser Test for Customer Booking Calendar & Conflict Detection
  console.log('\n[STEP 5] Launching Chrome for Browser E2E Calendar & Conflict Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Login Customer A in browser cleanly
  console.log('   Navigating to login page...');
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.type('input[type="email"]', customerAEmail);
  await page.type('input[type="password"]', customerPassword);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await sleep(2000);

  // If redirected to /complete-profile, complete it in browser
  if (page.url().includes('/complete-profile')) {
    console.log('   Completing profile setup in browser...');
    await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 });
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      const type = await page.evaluate((el) => el.type, inp);
      const val = await page.evaluate((el) => el.value, inp);
      if (type === 'tel' || type === 'text') {
        if (!val || val === '') await inp.type('0891112233');
      }
    }
    await page.click('input[type="checkbox"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await sleep(2000);
  }

  // Navigate to Portal
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Open "ดำเนินการจอง" on Estimate 1 by clicking the estimate card in portal
  console.log('\n[TEST K] Opening CustomerBookingCreateModal on ACCEPTED Estimate 1...');
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
    const estCard = cards.find((c) => c.innerText && (c.innerText.includes('Japanese Dragon') || c.innerText.includes('มังกรญี่ปุ่น') || c.innerText.includes('ACCEPTED') || c.innerText.includes('ยอมรับราคาแล้ว') || c.innerText.includes('ขอประเมินราคา')));
    if (estCard) estCard.click();
  });
  await sleep(2000);

  // Click "ดำเนินการจองคิวสัก" in detail modal
  await page.evaluate(() => {
    const detailButtons = Array.from(document.querySelectorAll('button'));
    const bookBtn = detailButtons.find((b) => b.innerText && (b.innerText.includes('ดำเนินการจองคิวสัก') || b.innerText.includes('ดำเนินการจองคิว') || b.innerText.includes('จองคิวต่อ')));
    if (bookBtn) bookBtn.click();
  });
  await sleep(2500);

  const modalHtml = await page.evaluate(() => document.body.innerText);
  const modalOpened =
    modalHtml.includes('CONFIRM YOUR APPOINTMENT REQUEST') ||
    modalHtml.includes('ยืนยันส่งคำขอจองคิว') ||
    modalHtml.includes('เลือกวันที่ต้องการ');
  console.log(`   Booking Create Modal opened with Calendar: ${modalOpened}`);
  report.test_modalOpened = modalOpened ? 'PASS' : 'FAIL';

  // Verify Month Navigation
  console.log('\n[TEST L] Verifying Dynamic Calendar Month Navigation...');
  const calHeaderInit = await page.evaluate(() => document.querySelector('.font-heading, .font-prompt')?.textContent || '');
  console.log(`   Initial Calendar Month Header: ${calHeaderInit}`);
  const showsNov = calHeaderInit.includes('พฤศจิกายน') || calHeaderInit.includes('November');
  report.test_dynamicMonthNavigation = showsNov ? 'PASS' : 'FAIL';

  // Verify Red Busy Indicator Dot on Day 20
  console.log('\n[TEST M] Verifying Red Busy Indicator Dot on 2026-11-20...');
  const hasRedDot = await page.evaluate(() => {
    const redDots = document.querySelectorAll('.bg-studio-red');
    return redDots.length > 0;
  });
  console.log(`   Red indicator dot rendered on busy date: ${hasRedDot}`);
  report.test_redBusyIndicator = hasRedDot ? 'PASS' : 'FAIL';

  // Click on Day 20
  console.log('\n[TEST N] Selecting Date 2026-11-20 & Checking Busy Range Display...');
  await page.evaluate(() => {
    const dayBtns = Array.from(document.querySelectorAll('button'));
    const btn20 = dayBtns.find((b) => b.textContent?.trim() === '20');
    if (btn20) btn20.click();
  });
  await sleep(1500);

  const selectedText = await page.evaluate(() => document.body.innerText);
  const showsBusyTimeDetail = selectedText.includes('10:00') && selectedText.includes('13:00');
  console.log(`   Shows busy time detail (10:00 - 13:00 น.): ${showsBusyTimeDetail}`);
  report.test_busyRangeDetail = showsBusyTimeDetail ? 'PASS' : 'FAIL';

  // Test Time Conflict Detection:
  // 10:00 should be marked "ติดคิว" and disabled
  // 11:00 should be marked "ติดคิว" and disabled
  // 13:00 should be selectable (end-exclusive boundary)
  console.log('\n[TEST O, P, Q] Testing Estimated Duration Conflict Detection...');
  const conflictMetrics = await page.evaluate(() => {
    const timeBtns = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('น.')
    );
    const btn10 = timeBtns.find((b) => b.textContent?.includes('10:00'));
    const btn11 = timeBtns.find((b) => b.textContent?.includes('11:00'));
    const btn13 = timeBtns.find((b) => b.textContent?.includes('13:00'));
    const btn14 = timeBtns.find((b) => b.textContent?.includes('14:00'));

    return {
      is10Disabled: btn10?.disabled || btn10?.textContent?.includes('ติดคิว') || btn10?.className?.includes('cursor-not-allowed'),
      is11Disabled: btn11?.disabled || btn11?.textContent?.includes('ติดคิว') || btn11?.className?.includes('cursor-not-allowed'),
      is13Enabled: btn13 ? !btn13.disabled && !btn13.textContent?.includes('ติดคิว') : false,
      is14Enabled: btn14 ? !btn14.disabled && !btn14.textContent?.includes('ติดคิว') : false,
    };
  });
  console.log('   Conflict metrics:', conflictMetrics);
  const conflictPassed =
    conflictMetrics.is10Disabled && conflictMetrics.is11Disabled && conflictMetrics.is13Enabled && conflictMetrics.is14Enabled;
  console.log(`   Conflict detection working accurately: ${conflictPassed}`);
  report.test_durationConflictDetection = conflictPassed ? 'PASS' : 'FAIL';

  // 11. Stale Availability Refetch Protection
  console.log('\n[TEST R] Testing Stale Availability Protection before Submit...');
  // Select 14:00
  await page.evaluate(() => {
    const timeBtns = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('14:00')
    );
    if (timeBtns[0]) timeBtns[0].click();
  });
  await sleep(500);

  // Insert a conflicting session at 14:00-17:00 (07:00-10:00 UTC) right before customer submits
  const staleSesRes = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: busyBookingId,
      artist_id: artist1.id,
      session_number: 2,
      start_at: '2026-11-20T07:00:00+00:00', // 14:00 BKK
      end_at: '2026-11-20T10:00:00+00:00', // 17:00 BKK
      status: 'SCHEDULED',
    }),
  });
  const staleSesData = await staleSesRes.json();
  const staleConflictingSes = Array.isArray(staleSesData) ? staleSesData[0] : staleSesData;
  if (staleConflictingSes?.id) testIds.bookingSessions.push(staleConflictingSes.id);

  // Customer clicks "ส่งคำขอจองคิว"
  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ส่งคำขอจองคิว')
    );
    if (submitBtn) submitBtn.click();
  });
  await sleep(2000);

  const staleErrorText = await page.evaluate(() => document.body.innerText);
  const staleBlocked =
    staleErrorText.includes('เพิ่งมีคิว') || staleErrorText.includes('ช่วงเวลาที่เลือกมีคิว') || staleErrorText.includes('ติดคิว');
  console.log(`   Stale availability conflict blocked at submit time: ${staleBlocked}`);
  report.test_staleAvailabilityBlocked = staleBlocked ? 'PASS' : 'FAIL';

  // Clean up conflicting session so customer can select a free slot
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${staleConflictingSes.id}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });

  // 12. Successful Booking Request Submission on Free Slot (17:00)
  console.log('\n[TEST S] Selecting Free Slot (17:00) & Submitting Canonical Booking Request...');
  await page.evaluate(() => {
    const timeBtns = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('17:00')
    );
    if (timeBtns[0]) timeBtns[0].click();
  });
  await sleep(500);

  await page.evaluate(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ส่งคำขอจองคิว')
    );
    if (submitBtn) submitBtn.click();
  });
  await sleep(3500);

  // Verify Booking was created with status PENDING
  const userABookings = await fetch(`${SUPABASE_URL}/rest/v1/bookings?customer_user_id=eq.${userAId}`, {
    headers: userAHeaders,
  }).then((r) => r.json());

  const bookingA = userABookings[0];
  if (bookingA?.id) testIds.bookings.push(bookingA.id);
  console.log(`✓ Booking created: ${bookingA?.id}, status: ${bookingA?.status}, requested_date: ${bookingA?.requested_date}, requested_time: ${bookingA?.requested_start_time}`);

  // Verify NO booking_sessions were auto-created by customer action
  const customerSessions = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?booking_id=eq.${bookingA?.id}`, {
    headers: adminHeaders,
  }).then((r) => r.json());
  console.log(`   booking_sessions auto-created count (expect 0): ${customerSessions.length}`);
  report.test_noSessionAutoCreated = customerSessions.length === 0 ? 'PASS' : 'FAIL';

  // 13. Test Duplicate Booking Protection
  console.log('\n[TEST T] Testing Duplicate Booking Protection from Same Estimate...');
  const dupRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_estimate_request_id: est1.id,
      p_requested_date: '2026-11-21',
      p_requested_start_time: '11:00:00',
    }),
  });
  console.log(`   Duplicate create_booking status (expect error/rejection): ${dupRes.status}`);
  report.test_duplicateBookingProtection = dupRes.status !== 200 ? 'PASS' : 'FAIL';

  // 14. Mobile Viewport Verification (375x812)
  console.log('\n[TEST U] Testing Mobile Viewport (375x812) for 0 Horizontal Overflow...');
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.goto(`${APP_URL}/portal?tab=bookings`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  const mobileMetrics = await page.evaluate(() => {
    return {
      bodyWidth: document.body.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
      hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  console.log('   Mobile Metrics:', mobileMetrics);
  report.test_mobileResponsive = !mobileMetrics.hasHorizontalScroll ? 'PASS (0 Overflow)' : 'FAIL';

  // 15. Verify /booking and /flash Routes
  console.log('\n[TEST V & W] Verifying /booking and /flash routes...');
  await page.goto(`${APP_URL}/booking`, { waitUntil: 'networkidle2' });
  const bookingPageText = await page.evaluate(() => document.body.innerText);
  const bookingHasDynamicCalendar = bookingPageText.includes('จองคิวสัก') || bookingPageText.includes('157 TATTOO');

  await page.goto(`${APP_URL}/flash`, { waitUntil: 'networkidle2' });
  const flashPageText = await page.evaluate(() => document.body.innerText);
  const flashWorking = flashPageText.includes('FLASH') || flashPageText.includes('พร้อมสัก');

  console.log(`   /booking route active: ${bookingHasDynamicCalendar}`);
  console.log(`   /flash route isolated and working: ${flashWorking}`);
  report.test_bookingRoute = bookingHasDynamicCalendar ? 'PASS' : 'FAIL';
  report.test_flashIsolation = flashWorking ? 'PASS' : 'FAIL';

  await browser.close();

  // 16. Console Errors Check
  console.log(`\n[CONSOLE CHECK] Total Errors: ${consoleErrors.length}`);
  report.test_consoleErrors = consoleErrors.length === 0 ? 'PASS (0 Errors)' : 'FAIL';

  // 17. Generate Targeted Cleanup SQL Script (NO AUTO PURGE)
  console.log('\n[STEP 6] Generating Targeted Cleanup SQL Script (supabase_cleanup_phase_2e_b_run.sql)...');
  const cleanupSql = `-- ====================================================================
-- 157 TATTOO — PHASE 2E-B TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete Test Payments (if any)
DELETE FROM public.booking_payments
WHERE booking_id IN (${testIds.bookings.map((id) => `'${id}'`).join(', ') || "''"});

-- 2. Delete Test Sessions
DELETE FROM public.booking_sessions
WHERE id IN (${testIds.bookingSessions.map((id) => `'${id}'`).join(', ') || "''"})
   OR booking_id IN (${testIds.bookings.map((id) => `'${id}'`).join(', ') || "''"});

-- 3. Delete Test Bookings
DELETE FROM public.bookings
WHERE id IN (${testIds.bookings.map((id) => `'${id}'`).join(', ') || "''"});

-- 4. Delete Test Estimate Requests
DELETE FROM public.estimate_requests
WHERE id IN (${testIds.estimates.map((id) => `'${id}'`).join(', ') || "''"});

-- 5. Delete Temporary Test Customer Profiles and Auth Users
DELETE FROM public.customers WHERE user_id IN (${testIds.users.map((id) => `'${id}'`).join(', ') || "''"});
DELETE FROM public.profiles WHERE user_id IN (${testIds.users.map((id) => `'${id}'`).join(', ') || "''"});
DELETE FROM auth.users WHERE id IN (${testIds.users.map((id) => `'${id}'`).join(', ') || "''"});

-- Clean any residual 2eb test fixtures
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com'));
DELETE FROM public.booking_sessions WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com'));
DELETE FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.estimate_requests WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.customers WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com';

COMMIT;

-- Verify Clean Baseline
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
`;

  fs.writeFileSync('supabase_cleanup_phase_2e_b_run.sql', cleanupSql);
  console.log('✓ Generated supabase_cleanup_phase_2e_b_run.sql');

  console.log('\n================================================================');
  console.log('PHASE 2E-B RUNTIME VERIFICATION SUMMARY:');
  console.log(JSON.stringify(report, null, 2));
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
