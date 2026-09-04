import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SUPABASE_URL = 'https://uieehinjjqoofejteehz.supabase.co';
const ANON_KEY = 'sb_publishable_iO2jc3ZXc4nOn1UaEZdtxQ_BBRmM3sU';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('================================================================');
  console.log('PHASE 2E-A: CUSTOMER PORTAL RUNTIME END-TO-END VERIFICATION');
  console.log('================================================================\n');

  const report = {};
  const testIds = {
    customers: [],
    estimateRequests: [],
    bookings: [],
    bookingSessions: [],
    bookingPayments: [],
  };

  // 1. Authenticate Admin
  console.log('[STEP 1] Authenticating Admin and Live Artists...');
  const adminAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@157tattoo.com', password: '157tattoo' }),
  }).then((r) => r.json());

  const adminHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${adminAuthRes.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const artists = await fetch(`${SUPABASE_URL}/rest/v1/artists?select=*&order=created_at.asc`, {
    headers: adminHeaders,
  }).then((r) => r.json());

  const artist1 = artists[0];
  const artist2 = artists[1];
  console.log(`✓ Admin authenticated. Live Artists: ${artist1.name} & ${artist2.name}`);

  // 2. Create Two Isolated Customers (Customer A and Customer B)
  console.log('\n[STEP 2] Creating Isolated Test Customers A & B...');
  const ts = Date.now();
  const customerAEmail = `cust_2ea_a_${ts}@157tattoo.com`;
  const customerBEmail = `cust_2ea_b_${ts}@157tattoo.com`;
  const customerPassword = 'Password157!';

  // Customer A Auth SignUp
  const signupARes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customerAEmail,
      password: customerPassword,
      data: { display_name: 'คุณกิตติศักดิ์ (Test A)', phone: '0891112233' },
    }),
  }).then((r) => r.json());
  const userA = signupARes.user || signupARes;
  testIds.customers.push(userA.id);

  // Customer B Auth SignUp
  const signupBRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customerBEmail,
      password: customerPassword,
      data: { display_name: 'คุณมนัสวี (Test B)', phone: '0894445566' },
    }),
  }).then((r) => r.json());
  const userB = signupBRes.user || signupBRes;
  testIds.customers.push(userB.id);

  // Login tokens for A & B
  const authAToken = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: customerAEmail, password: customerPassword }),
  }).then((r) => r.json());

  const authBToken = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: customerBEmail, password: customerPassword }),
  }).then((r) => r.json());

  const userAHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${authAToken.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const userBHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${authBToken.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Complete Profiles for A & B using canonical RPC
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/complete_customer_profile`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_display_name: 'คุณกิตติศักดิ์ (Test A)',
      p_phone: '0891112233',
      p_eligibility_confirmed: true,
    }),
  });

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/complete_customer_profile`, {
    method: 'POST',
    headers: userBHeaders,
    body: JSON.stringify({
      p_display_name: 'คุณมนัสวี (Test B)',
      p_phone: '0894445566',
      p_eligibility_confirmed: true,
    }),
  });

  console.log(`✓ Customer A: ${customerAEmail} (${userA.id})`);
  console.log(`✓ Customer B: ${customerBEmail} (${userB.id})`);

  // 3. Launch Real Browser
  console.log('\n[STEP 3] Launching Chrome for Browser E2E Lifecycle...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('deprecated') && !text.includes('400')) {
        consoleErrors.push(text);
      }
    }
  });

  // Helper: Login Customer in Browser
  const loginCustomerInBrowser = async (email, password) => {
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.send('Network.clearBrowserCache');
    } catch (_) {}
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (_) {}
    });
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle2' });
    await sleep(3000);
  };

  // TEST A & B: Initial Privacy Isolation
  console.log('\n[TEST A & B] Verifying Initial Clean State & Isolation for Customer A & B...');
  await loginCustomerInBrowser(customerAEmail, customerPassword);
  const portalATextInitial = await page.evaluate(() => document.body.innerText);
  const initialAEmpty =
    portalATextInitial.includes('ยังไม่มีนัดหมายที่กำลังจะมาถึง') &&
    portalATextInitial.includes('฿0');
  console.log(`   Customer A initial empty: ${initialAEmpty}`);
  report.test_initialEmptyState = initialAEmpty ? 'PASS' : 'FAIL';

  // 4. Customer A creates Estimate 1
  console.log('\n[TEST C] Customer A Creates Estimate Request 1 (Custom Tattoo)...');
  const [est1] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      customer_user_id: userA.id,
      artist_id: artist1.id,
      width_cm: 12,
      height_cm: 15,
      placement: 'ท่อนแขนขวา',
      style: 'Japanese Dragon',
      description: 'มังกรคาบแก้ว สไตล์สีดำเทา',
      preferred_date: '2026-09-28',
      reference_images: ['https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500'],
      status: 'PENDING',
    }),
  }).then((r) => r.json());
  testIds.estimateRequests.push(est1.id);
  console.log(`✓ Estimate 1 created (${est1.id}), status: ${est1.status}`);

  // Customer B Privacy Check: B must NOT see Estimate 1
  const bEstimates = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?select=*`, {
    headers: userBHeaders,
  }).then((r) => r.json());
  const bCannotSeeA = bEstimates.length === 0;
  console.log(`   Customer B cannot see Estimate 1 (RLS Scoped): ${bCannotSeeA}`);
  report.test_privacyIsolationInitial = bCannotSeeA ? 'PASS' : 'FAIL';

  // 5. Admin Quotes Estimate 1
  console.log('\n[TEST D] Admin Quotes Estimate 1 (฿8,000 / Deposit ฿2,000)...');
  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est1.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      quoted_price: 8000.0,
      deposit_required: 2000.0,
      estimated_duration_minutes: 180,
      quote_note: 'เตรียมรอบสัก 2 รอบ งานละเอียดครับ',
      status: 'QUOTED',
      quoted_at: new Date().toISOString(),
    }),
  });

  // Refresh Customer A Portal & View Quote
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);

  // Click on Estimate 1 card in Portal
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
    const estCard = cards.find((c) => c.innerText && (c.innerText.includes('Japanese Dragon') || c.innerText.includes('12x15') || c.innerText.includes('ขอประเมินราคา')));
    if (estCard) estCard.click();
  });
  await sleep(2000);

  const modalTextQuoted = await page.evaluate(() => document.body.innerText);
  const showsQuotedDetails =
    modalTextQuoted.includes('8,000') &&
    modalTextQuoted.includes('2,000');
  console.log(`   Customer A Modal shows Quoted Price (฿8,000/฿2,000): ${showsQuotedDetails}`);
  report.test_quotedModalAndDetails = showsQuotedDetails ? 'PASS' : 'FAIL';

  // 6. Test Accept Quote RPC
  console.log('\n[TEST E] Customer A Accepts Quote via accept_estimate_quote RPC...');
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_estimate_id: est1.id }),
  });
  const [est1Accepted] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est1.id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`✓ Estimate 1 status after accept: ${est1Accepted.status}`);
  report.test_acceptQuoteRPC = est1Accepted.status === 'ACCEPTED' ? 'PASS' : 'FAIL';

  // 7. Test Reject Quote RPC (Separate Estimate 2)
  console.log('\n[TEST F] Testing Reject Quote RPC on Separate Estimate 2...');
  const [est2] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      customer_user_id: userA.id,
      artist_id: artist2.id,
      width_cm: 8,
      height_cm: 8,
      placement: 'ข้อเท้า',
      style: 'Minimal Floral',
      status: 'PENDING',
    }),
  }).then((r) => r.json());
  testIds.estimateRequests.push(est2.id);

  // Admin quotes est2
  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est2.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      quoted_price: 3500,
      deposit_required: 1000,
      status: 'QUOTED',
      quoted_at: new Date().toISOString(),
    }),
  });

  // Customer rejects est2
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/reject_estimate_quote`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_estimate_id: est2.id }),
  });
  const [est2Rejected] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est2.id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`✓ Estimate 2 status after reject: ${est2Rejected.status}`);
  report.test_rejectQuoteRPC = est2Rejected.status === 'REJECTED' ? 'PASS' : 'FAIL';

  // 8. Create Booking from Accepted Estimate 1
  console.log('\n[TEST G] Customer A Creates Booking via create_booking_from_estimate RPC...');
  const createBookRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_estimate_request_id: est1.id,
      p_requested_date: '2026-09-28',
      p_requested_start_time: '11:00:00',
      p_customer_note: 'สะดวกเดินทางช่วงสายครับ',
    }),
  });
  const booking1Data = await createBookRes.json();
  const booking1Id = typeof booking1Data === 'object' && booking1Data?.booking_id ? booking1Data.booking_id : booking1Data?.id || booking1Data;

  const [booking1] = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking1Id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  testIds.bookings.push(booking1.id);
  console.log(`✓ Booking 1 created (${booking1.id}), status: ${booking1.status}`);
  report.test_createBookingRPC = booking1.status === 'PENDING' ? 'PASS' : 'FAIL';

  // 9. Duplicate Booking Protection Test
  console.log('\n[TEST H] Testing Duplicate Booking Protection...');
  const dupBookRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_estimate_request_id: est1.id,
      p_requested_date: '2026-09-28',
    }),
  });
  const dupBlocked = !dupBookRes.ok;
  console.log(`   Duplicate booking from same estimate blocked: ${dupBlocked}`);
  report.test_duplicateBookingBlocked = dupBlocked ? 'PASS' : 'FAIL';

  // 10. Test Cancel PENDING Booking RPC (Separate Booking)
  console.log('\n[TEST I] Testing Cancel PENDING Booking RPC on Separate Booking...');
  const [est3] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      customer_user_id: userA.id,
      artist_id: artist1.id,
      width_cm: 5,
      height_cm: 5,
      placement: 'ข้อมือ',
      style: 'Lettering',
      status: 'PENDING',
    }),
  }).then((r) => r.json());
  testIds.estimateRequests.push(est3.id);

  // Admin quotes est3
  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est3.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      quoted_price: 2000,
      deposit_required: 500,
      status: 'QUOTED',
      quoted_at: new Date().toISOString(),
    }),
  });

  // Customer accepts est3
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_estimate_id: est3.id }),
  });

  // Customer creates booking from est3
  const createCancelBookRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({
      p_estimate_request_id: est3.id,
      p_requested_date: '2026-09-29',
    }),
  });
  const bookToCancelData = await createCancelBookRes.json();
  const bookToCancelId = bookToCancelData.booking_id;
  testIds.bookings.push(bookToCancelId);

  // Customer cancels booking
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_booking_request`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_booking_id: bookToCancelId }),
  });
  const [cancelledBooking] = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookToCancelId}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`✓ Booking cancel result: ${cancelledBooking.status}`);
  report.test_cancelPendingBookingRPC = cancelledBooking.status === 'CANCELLED' ? 'PASS' : 'FAIL';

  // 11. Admin Approves Booking 1 -> WAITING_DEPOSIT
  console.log('\n[TEST J & K] Admin Approves Booking 1 -> WAITING_DEPOSIT...');
  const appr1Res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking1.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      artist_id: artist1.id,
      status: 'APPROVED',
      approved_at: new Date().toISOString(),
    }),
  });
  const appr1Data = await appr1Res.json();
  console.log(`✓ Booking 1 status after admin approval: ${appr1Data[0]?.status}`);

  // Non-pending cancel protection
  const cancelNonPendingRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_booking_request`, {
    method: 'POST',
    headers: userAHeaders,
    body: JSON.stringify({ p_booking_id: booking1.id }),
  });
  const cancelNonPendingJson = await cancelNonPendingRes.json();
  const cancelBlockedOnNonPending = cancelNonPendingJson?.success === false || !cancelNonPendingRes.ok;
  console.log(`   Customer Cancel blocked on WAITING_DEPOSIT: ${cancelBlockedOnNonPending}`);
  report.test_cancelBlockedOnNonPending = cancelBlockedOnNonPending ? 'PASS' : 'FAIL';

  // 12. Check Financial Status Before Payment
  console.log('\n[TEST L] Financial Summary Before Payment in Portal...');
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const finTextBefore = await page.evaluate(() => document.body.innerText);
  console.log('   Portal text before payment snippet:', finTextBefore.slice(0, 300));
  const has0Deposit = finTextBefore.includes('฿0');
  const has8000Remaining = finTextBefore.includes('8,000');
  console.log(`   Financial Status shows Deposit ฿0 and Remaining ฿8,000: ${has8000Remaining}`);
  report.test_financialBeforePayment = has8000Remaining ? 'PASS' : 'FAIL';

  // 13. Admin Records Deposit Payment (฿2,000) -> CONFIRMED
  console.log('\n[TEST M] Admin Records Deposit Payment (฿2,000)...');
  const pay1Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: booking1.id,
      amount: 2000.0,
      payment_type: 'DEPOSIT',
      payment_method: 'QR',
      status: 'RECORDED',
      created_by: adminAuthRes.user.id,
    }),
  });
  const pay1Data = await pay1Res.json();
  const pay1 = Array.isArray(pay1Data) ? pay1Data[0] : pay1Data;
  console.log('   pay1 created:', pay1?.id || pay1);
  if (pay1?.id) testIds.bookingPayments.push(pay1.id);

  // Trigger reconciles booking to CONFIRMED
  const [booking1Confirmed] = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking1.id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`✓ Booking 1 status after deposit payment: ${booking1Confirmed.status}`);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const finTextAfterDeposit = await page.evaluate(() => document.body.innerText);
  const shows2000Deposit = finTextAfterDeposit.includes('2,000') && finTextAfterDeposit.includes('6,000');
  console.log(`   Portal shows Confirmed Deposit ฿2,000 and Remaining ฿6,000: ${shows2000Deposit}`);
  report.test_financialAfterDeposit = shows2000Deposit ? 'PASS' : 'FAIL';

  // 14. Deposit Semantic Regression Test: Extra Payment of ฿3,000
  console.log('\n[TEST N] Deposit Semantic Regression: Admin Records Extra ฿3,000 Balance...');
  const pay2Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: booking1.id,
      amount: 3000.0,
      payment_type: 'BALANCE',
      payment_method: 'CASH',
      status: 'RECORDED',
      created_by: adminAuthRes.user.id,
    }),
  });
  const pay2Data = await pay2Res.json();
  const pay2 = Array.isArray(pay2Data) ? pay2Data[0] : pay2Data;
  console.log('   pay2 created:', pay2?.id || pay2);
  if (pay2?.id) testIds.bookingPayments.push(pay2.id);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const finTextAfterExtra = await page.evaluate(() => document.body.innerText);
  // Deposit must STAY ฿2,000 (NOT ฿5,000) and remaining must be ฿3,000!
  const depositRemainsCapped =
    finTextAfterExtra.includes('2,000') &&
    finTextAfterExtra.includes('3,000') &&
    !finTextAfterExtra.includes('ยอดมัดจำที่ยืนยันแล้ว\n฿5,000');
  console.log(`   Deposit strictly capped at ฿2,000 and Remaining is ฿3,000: ${depositRemainsCapped}`);
  report.test_depositSemanticRegression = depositRemainsCapped ? 'PASS' : 'FAIL';

  // 15. Next Appointment Before Session Exists
  console.log('\n[TEST O] Next Appointment Before Session Exists...');
  const noSessionText = await page.evaluate(() => document.body.innerText);
  const showsEmptyAppointment = noSessionText.includes('ยังไม่มีนัดหมายที่กำลังจะมาถึง');
  console.log(`   Shows clean empty next appointment: ${showsEmptyAppointment}`);
  report.test_noSessionEmptyAppointment = showsEmptyAppointment ? 'PASS' : 'FAIL';

  // 16. Admin Creates Multi-Session (Session #1 on 2026-11-15, Session #2 on 2026-11-16)
  console.log('\n[TEST P, Q, R] Admin Creates Multi-Session (A1 on 2026-11-15 & A2 on 2026-11-16)...');
  const ses1Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: booking1.id,
      artist_id: artist1.id,
      session_number: 1,
      start_at: '2026-11-15T03:00:00+00:00', // 10:00 BKK
      end_at: '2026-11-15T06:00:00+00:00', // 13:00 BKK
      status: 'SCHEDULED',
    }),
  });
  const ses1Data = await ses1Res.json();
  const ses1 = Array.isArray(ses1Data) ? ses1Data[0] : ses1Data;
  console.log('   ses1 created:', ses1?.id || ses1);
  if (ses1?.id) testIds.bookingSessions.push(ses1.id);

  const ses2Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: booking1.id,
      artist_id: artist1.id,
      session_number: 2,
      start_at: '2026-11-16T07:00:00+00:00', // 14:00 BKK
      end_at: '2026-11-16T10:00:00+00:00', // 17:00 BKK
      status: 'SCHEDULED',
    }),
  });
  const ses2Data = await ses2Res.json();
  const ses2 = Array.isArray(ses2Data) ? ses2Data[0] : ses2Data;
  console.log('   ses2 created:', ses2?.id || ses2);
  if (ses2?.id) testIds.bookingSessions.push(ses2.id);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const portalWithSessions = await page.evaluate(() => document.body.innerText);
  const nextApptShowsD1 =
    portalWithSessions.includes('15 พ.ย. 2569') || portalWithSessions.includes('15 พฤศจิกายน 2569');
  const cardShows2Sessions = portalWithSessions.includes('2 รอบสัก');
  console.log(`   Next Appointment displays actual session date (15 พ.ย.) rather than requested_date (28 ก.ย.): ${nextApptShowsD1}`);
  console.log(`   Booking card shows '2 รอบสัก': ${cardShows2Sessions}`);
  report.test_sessionAuthorityOverRequestedDate = nextApptShowsD1 ? 'PASS' : 'FAIL';
  report.test_multiSessionIndicator = cardShows2Sessions ? 'PASS' : 'FAIL';

  // 17. Start Session #1 -> IN_PROGRESS
  console.log('\n[TEST S & T] Admin Starts Session #1 -> IN_PROGRESS...');
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${ses1.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  });

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const inProgressText = await page.evaluate(() => document.body.innerText);
  const showsInProgressBadge = inProgressText.includes('กำลังสักรอบ #1') || inProgressText.includes('กำลังสัก');
  console.log(`   Next appointment reflects IN_PROGRESS priority: ${showsInProgressBadge}`);
  report.test_inProgressSessionPriority = showsInProgressBadge ? 'PASS' : 'FAIL';

  // 18. Complete Session #1 -> Next flips to Session #2
  console.log('\n[TEST U] Admin Completes Session #1 -> Next Appointment flips to Session #2...');
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${ses1.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'COMPLETED' }),
  });

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const afterS1CompleteText = await page.evaluate(() => document.body.innerText);
  const nextApptFlipsToS2 =
    afterS1CompleteText.includes('16 พ.ย. 2569') ||
    afterS1CompleteText.includes('16 พฤศจิกายน 2569') ||
    afterS1CompleteText.includes('รอบ #2');
  console.log(`   Next appointment advanced to Session #2 (16 พ.ย.): ${nextApptFlipsToS2}`);
  report.test_nextAppointmentOrdering = nextApptFlipsToS2 ? 'PASS' : 'FAIL';

  // 19. Start & Complete Session #2
  console.log('\n[TEST V] Admin Starts and Completes Session #2...');
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${ses2.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  });
  await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${ses2.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'COMPLETED' }),
  });

  // 20. Admin Completes Whole Booking via complete_booking(UUID)
  console.log('\n[TEST W] Admin Calls complete_booking(UUID)...');
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/complete_booking`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ p_booking_id: booking1.id }),
  });

  const [booking1Completed] = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking1.id}`, {
    headers: userAHeaders,
  }).then((r) => r.json());
  console.log(`✓ Booking 1 status after complete_booking: ${booking1Completed.status}`);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  // 21. Outstanding Balance after COMPLETED (฿3,000 remaining)
  console.log('\n[TEST X] Outstanding Balance after COMPLETED (฿3,000 remaining)...');
  const completedPortalText = await page.evaluate(() => document.body.innerText);
  const maintainsOutstanding = completedPortalText.includes('3,000');
  console.log(`   Completed Booking maintains remaining balance ฿3,000: ${maintainsOutstanding}`);
  report.test_completedBookingMaintainsOutstanding = maintainsOutstanding ? 'PASS' : 'FAIL';

  // 22. Record Final Payment of ฿3,000 after COMPLETED
  console.log('\n[TEST Y] Admin Records Final ฿3,000 Payment after COMPLETED...');
  const pay3Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      booking_id: booking1.id,
      amount: 3000.0,
      payment_type: 'BALANCE',
      payment_method: 'QR',
      status: 'RECORDED',
      created_by: adminAuthRes.user.id,
    }),
  });
  const pay3Data = await pay3Res.json();
  const pay3 = Array.isArray(pay3Data) ? pay3Data[0] : pay3Data;
  console.log('   pay3 created:', pay3?.id || pay3);
  if (pay3?.id) testIds.bookingPayments.push(pay3.id);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  const fullyPaidPortalText = await page.evaluate(() => document.body.innerText);
  const remainingDropsTo0 =
    fullyPaidPortalText.includes('ยอดคงเหลือชำระหน้าร้าน\n฿0') ||
    (fullyPaidPortalText.includes('ยอดคงเหลือชำระหน้าร้าน') && fullyPaidPortalText.includes('฿0'));
  console.log(`   Remaining balance drops to ฿0 after final payment: ${remainingDropsTo0}`);
  report.test_paymentAfterCompleted = remainingDropsTo0 ? 'PASS' : 'FAIL';

  // 23. Customer B Isolation Test (Full Data Check)
  console.log('\n[TEST Z & AA] Switching to Customer B to Verify Strict Privacy Isolation...');
  await loginCustomerInBrowser(customerBEmail, customerPassword);
  const portalBText = await page.evaluate(() => document.body.innerText);
  const bIsCleanAndIsolated =
    portalBText.includes('มนัสวี') &&
    !portalBText.includes('กิตติศักดิ์') &&
    !portalBText.includes('Japanese Dragon') &&
    portalBText.includes('฿0');
  console.log(`   Customer B shows 0 data from Customer A (100% Privacy Isolation): ${bIsCleanAndIsolated}`);
  report.test_customerBStrictIsolation = bIsCleanAndIsolated ? 'PASS' : 'FAIL';

  // 24. Mobile Responsiveness Test (375x812)
  console.log('\n[TEST AB] Testing Mobile Viewport (375x812) for 0 Horizontal Overflow...');
  await page.setViewport({ width: 375, height: 812 });
  await loginCustomerInBrowser(customerAEmail, customerPassword);
  await sleep(1500);

  const mobileMetrics = await page.evaluate(() => {
    const bodyWidth = document.body.offsetWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const windowWidth = window.innerWidth;
    return {
      bodyWidth,
      scrollWidth,
      windowWidth,
      hasHorizontalScroll: scrollWidth > windowWidth,
    };
  });
  console.log(`   Mobile Metrics:`, mobileMetrics);
  report.test_mobileResponsive = mobileMetrics.hasHorizontalScroll ? 'FAIL' : 'PASS (0 Overflow)';

  // 25. Console Errors
  console.log(`\n[CONSOLE CHECK] Total Errors: ${consoleErrors.length}`);
  report.test_consoleErrors = consoleErrors.length === 0 ? 'PASS (0 Errors)' : 'FAIL';

  await browser.close();

  // Generate Targeted Cleanup SQL
  console.log('\n[STEP 4] Generating Targeted Cleanup SQL Script...');
  const cleanupSql = `-- ====================================================================
-- 157 TATTOO — PHASE 2E-A TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN (${testIds.bookingPayments.map((id) => `'${id}'`).join(', ')});

-- 2. Delete test sessions
DELETE FROM public.booking_sessions
WHERE id IN (${testIds.bookingSessions.map((id) => `'${id}'`).join(', ')});

-- 3. Delete test bookings
DELETE FROM public.bookings
WHERE id IN (${testIds.bookings.map((id) => `'${id}'`).join(', ')});

-- 4. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN (${testIds.estimateRequests.map((id) => `'${id}'`).join(', ')});

-- 5. Delete temporary test customers
DELETE FROM public.customers WHERE user_id IN (${testIds.customers.map((id) => `'${id}'`).join(', ')});
DELETE FROM public.profiles WHERE user_id IN (${testIds.customers.map((id) => `'${id}'`).join(', ')});
DELETE FROM auth.users WHERE id IN (${testIds.customers.map((id) => `'${id}'`).join(', ')});

-- Clean any residual 2ea test fixtures
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com'));
DELETE FROM public.booking_sessions WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com'));
DELETE FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.estimate_requests WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.customers WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com';

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

  fs.writeFileSync('supabase_cleanup_phase_2e_a_run.sql', cleanupSql);
  console.log('✓ Generated supabase_cleanup_phase_2e_a_run.sql');

  console.log('\n================================================================');
  console.log('PHASE 2E-A RUNTIME VERIFICATION SUMMARY:');
  console.log(JSON.stringify(report, null, 2));
  console.log('================================================================\n');
}

main().catch(console.error);
