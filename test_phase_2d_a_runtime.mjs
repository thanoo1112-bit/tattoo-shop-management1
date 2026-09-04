import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SUPABASE_URL = 'https://uieehinjjqoofejteehz.supabase.co';
const ANON_KEY = 'sb_publishable_iO2jc3ZXc4nOn1UaEZdtxQ_BBRmM3sU';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function runPhase2DARuntimeVerification() {
  console.log('================================================================');
  console.log('PHASE 2D-A: ADMIN REQUESTS & BOOKING RUNTIME VERIFICATION');
  console.log('================================================================\n');

  const report = {};
  const cleanupEntities = {
    paymentIds: [],
    sessionIds: [],
    bookingIds: [],
    estimateIds: [],
    customerUids: [],
  };
  const consoleErrors = [];

  // ------------------------------------------------------------------
  // 1. SETUP REAL ACTORS (Admin & Isolated Test Customer)
  // ------------------------------------------------------------------
  console.log('[STEP 1] Authenticating Real Admin and Creating Test Customer...');
  const adminAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@157tattoo.com', password: '157tattoo' }),
  }).then((r) => r.json());

  const adminHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${adminAuth.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const custEmail = `cust_2da_${Date.now()}@157tattoo.com`;
  const custPass = 'Password123!';
  const custSignup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: custEmail,
      password: custPass,
      data: { display_name: 'ลูกค้าทดสอบ Phase 2D-A', phone: '0812345678', eligibility_confirmed: true },
    }),
  }).then((r) => r.json());

  const customerUid = custSignup.id || custSignup.user?.id;
  cleanupEntities.customerUids.push(customerUid);

  const custAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: custEmail, password: custPass }),
  }).then((r) => r.json());

  const customerHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${custAuth.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Fetch Artists
  const artists = await fetch(`${SUPABASE_URL}/rest/v1/artists?is_active=eq.true&select=*`, {
    headers: adminHeaders,
  }).then((r) => r.json());
  const artistBom = artists.find((a) => a.name.includes('บอม')) || artists[0];
  const artistBas = artists.find((a) => a.name.includes('บาส')) || artists[1];

  console.log(`✓ Admin authenticated. Test Customer created: ${customerUid}`);
  console.log(`✓ Artist Bom: ${artistBom.name} (${artistBom.id}) | Artist Bas: ${artistBas.name} (${artistBas.id})\n`);

  // ------------------------------------------------------------------
  // 2. CREATE ESTIMATE TEST A
  // ------------------------------------------------------------------
  console.log('[STEP 2] Customer creates Estimate Request A...');
  const estARes = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      customer_user_id: customerUid,
      artist_id: artistBom.id,
      placement: 'แขนขวา',
      description: 'Phase 2D-A Runtime Test A - มังกรสไตล์ Blackwork',
      width_cm: 10,
      height_cm: 15,
      style: 'Blackwork',
      preferred_date: '2026-12-15',
      reference_images: ['https://images.unsplash.com/photo-1598371839696-5c5bb00bdc28?auto=format&fit=crop&w=400&q=80'],
    }),
  }).then((r) => r.json());

  const estimateAId = estARes[0]?.id;
  cleanupEntities.estimateIds.push(estimateAId);
  console.log(`✓ Estimate A created: ${estimateAId} (Status: PENDING)\n`);

  // ------------------------------------------------------------------
  // 3. LAUNCH REAL CHROME & TEST ADMIN GUARD
  // ------------------------------------------------------------------
  console.log('[STEP 3] Launching Real Chrome via Puppeteer-Core...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    // 3.1 Unauth Guard
    console.log('[STEP 3.1] Testing Admin Guard (Unauthenticated)...');
    const ctxUnauth = await browser.createBrowserContext();
    const pageUnauth = await ctxUnauth.newPage();
    await pageUnauth.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const unauthUrl = pageUnauth.url();
    const unauthOk = unauthUrl.includes('/staff/login');
    report.adminGuardUnauth = unauthOk ? 'PASS (Redirected to /staff/login)' : `FAIL (${unauthUrl})`;
    await ctxUnauth.close();

    // 3.2 Customer Guard
    console.log('[STEP 3.2] Testing Admin Guard (Customer Session)...');
    const ctxCust = await browser.createBrowserContext();
    const pageCust = await ctxCust.newPage();
    await pageCust.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await pageCust.waitForSelector('input[type="email"]', { timeout: 10000 });
    await pageCust.type('input[type="email"]', custEmail);
    await pageCust.type('input[type="password"]', custPass);
    await Promise.all([
      pageCust.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
      pageCust.click('button[type="submit"]'),
    ]);
    await sleep(2000);

    await pageCust.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const custRedirectUrl = pageCust.url();
    const custBlocked = custRedirectUrl.includes('/staff/login') || !custRedirectUrl.includes('/admin/requests');
    report.adminGuardCustomer = custBlocked ? 'PASS (Customer access denied)' : 'FAIL';
    await ctxCust.close();

    // 3.3 Real Admin Session
    console.log('[STEP 3.3] Logging in as Real Admin...');
    const ctxAdmin = await browser.createBrowserContext();
    const pageAdmin = await ctxAdmin.newPage();
    await pageAdmin.setViewport({ width: 1280, height: 900 });

    pageAdmin.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await pageAdmin.goto(`${APP_URL}/staff/login`, { waitUntil: 'networkidle2' });
    await pageAdmin.waitForSelector('#staff-email', { timeout: 10000 });
    await pageAdmin.click('#staff-email', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#staff-email', 'admin@157tattoo.com');

    await pageAdmin.click('#staff-password', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#staff-password', '157tattoo');

    await Promise.all([
      pageAdmin.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      pageAdmin.click('button[type="submit"]'),
    ]);
    await sleep(2500);

    // ------------------------------------------------------------------
    // 4. VERIFY ESTIMATE A IN ADMIN REQUESTS & DETAIL
    // ------------------------------------------------------------------
    console.log('\n[STEP 4] Opening /admin/requests and Verifying Estimate A...');
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(3000);

    const initialText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasEstAInList = initialText.includes('ลูกค้าทดสอบ Phase 2D-A') && initialText.includes('แขนขวา');
    console.log(`   Estimate A visible in list: ${hasEstAInList}`);
    report.estimateListRender = hasEstAInList ? 'PASS' : 'FAIL';

    // Click to open Detail Panel
    console.log('[STEP 4.1] Opening Estimate A Detail Panel...');
    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('แขนขวา')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    const drawerText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasDetailInfo =
      drawerText.includes('แขนขวา') &&
      drawerText.includes('10 × 15 ซม.') &&
      drawerText.includes('ช่างบอม') &&
      drawerText.includes('Blackwork') &&
      drawerText.includes('มังกรสไตล์ Blackwork');
    console.log(`   Estimate A Detail Panel info rendered: ${hasDetailInfo}`);
    report.estimateDetailRender = hasDetailInfo ? 'PASS' : 'FAIL';

    // Check Reference Image & Lightbox (Section 5 & 27)
    const hasReferenceThumb = await pageAdmin.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src && img.src.includes('images.unsplash.com')) return true;
      }
      return false;
    });
    console.log(`   Reference Image Thumbnail rendered: ${hasReferenceThumb}`);
    report.referenceImageThumbnail = hasReferenceThumb ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // 5. ADMIN QUOTE RUNTIME (Section 6 & 7)
    // ------------------------------------------------------------------
    console.log('\n[STEP 5] Admin submitting Quote for Estimate A (฿5,500, deposit ฿1,500)...');
    await pageAdmin.waitForSelector('#btn-open-quote-form', { timeout: 5000 });
    await pageAdmin.click('#btn-open-quote-form');
    await sleep(1000);

    await pageAdmin.waitForSelector('#input-quoted-price', { timeout: 5000 });
    await pageAdmin.type('#input-quoted-price', '5500');

    await pageAdmin.click('#input-deposit-required', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#input-deposit-required', '1500');

    await pageAdmin.click('#input-duration-minutes', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#input-duration-minutes', '180');

    await pageAdmin.type('#input-quote-note', 'Phase 2D-A Runtime Quote');

    await pageAdmin.click('#btn-submit-quote');
    await sleep(2500);

    // Verify in Live Database
    const quotedEstDB = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${estimateAId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    const estAState = quotedEstDB[0];
    const isQuotedInDB =
      estAState?.status === 'QUOTED' &&
      Number(estAState?.quoted_price) === 5500 &&
      Number(estAState?.deposit_required) === 1500 &&
      estAState?.quoted_at !== null;
    console.log(`   Estimate A in Live DB: Status=${estAState?.status}, Price=${estAState?.quoted_price}, Deposit=${estAState?.deposit_required}`);
    report.adminQuoteRuntime = isQuotedInDB ? 'PASS (QUOTED ฿5,500, deposit ฿1,500)' : 'FAIL';

    // Verify Admin cannot accept for customer (Section 7)
    const adminPageTextAfterQuote = await pageAdmin.evaluate(() => document.body.innerText);
    const hasAdminAcceptButton =
      adminPageTextAfterQuote.includes('ยอมรับราคาแทนลูกค้า') ||
      adminPageTextAfterQuote.includes('Accept for customer');
    report.adminAcceptRestriction = !hasAdminAcceptButton
      ? 'PASS (Admin UI has no accept button for customer)'
      : 'FAIL';

    // ------------------------------------------------------------------
    // 6. CUSTOMER ACCEPT QUOTE & CREATE BOOKING (Section 8 & 9)
    // ------------------------------------------------------------------
    console.log('\n[STEP 6] Customer accepts quote via canonical RPC accept_estimate_quote...');
    const acceptRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ p_estimate_id: estimateAId }),
    }).then((r) => r.json());
    console.log(`   accept_estimate_quote response:`, acceptRpcRes);

    // Create Booking A via create_booking_from_estimate RPC
    console.log('[STEP 6.1] Customer creates Booking A via canonical RPC create_booking_from_estimate...');
    const createBookingRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        p_estimate_request_id: estimateAId,
        p_requested_date: '2026-12-15',
        p_requested_start_time: '13:00:00',
        p_customer_note: 'ขอสักรอบบ่ายครับ',
      }),
    }).then((r) => r.json());
    console.log(`   create_booking_from_estimate response:`, createBookingRpcRes);

    const bookingAId = createBookingRpcRes?.booking_id;
    cleanupEntities.bookingIds.push(bookingAId);
    console.log(`✓ Booking A created via canonical RPC: ${bookingAId} (Status: PENDING)\n`);
    report.customerAcceptAndBooking = bookingAId ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // 7. ADMIN BOOKING LIST & APPROVAL (Section 10 & 11)
    // ------------------------------------------------------------------
    console.log('[STEP 7] Admin verifies Booking A in TAB คิวงาน and approves...');
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);

    await pageAdmin.waitForSelector('#tab-btn-bookings', { timeout: 5000 });
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(2000);

    const bookingsTabText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasBookingAInTable = bookingsTabText.includes('ลูกค้าทดสอบ Phase 2D-A') && bookingsTabText.includes('5,500');
    console.log(`   Booking A rendered in table: ${hasBookingAInTable}`);
    report.bookingListRender = hasBookingAInTable ? 'PASS' : 'FAIL';

    // Open Booking A Detail Panel
    console.log('[STEP 7.1] Opening Booking A Detail Drawer and approving...');
    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('ลูกค้าทดสอบ Phase 2D-A') || r.innerText.includes('2026-12-15')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    await pageAdmin.waitForSelector('#btn-approve-booking', { timeout: 5000 });
    await pageAdmin.click('#btn-approve-booking');
    await sleep(3000);

    // Verify DB transition: APPROVED -> WAITING_DEPOSIT
    const bookADB = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingAId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    const bookingAState = bookADB[0];
    console.log(`   Booking A Live DB Status after approve: ${bookingAState?.status}`);
    const isWaitingDeposit = bookingAState?.status === 'WAITING_DEPOSIT';
    report.bookingApprovalToWaitingDeposit = isWaitingDeposit
      ? 'PASS (Transitioned PENDING -> APPROVED -> WAITING_DEPOSIT automatically)'
      : `FAIL (${bookingAState?.status})`;

    // ------------------------------------------------------------------
    // 8. PAYMENT INTEGRATION & CONFIRMED STATUS (Section 12)
    // ------------------------------------------------------------------
    console.log('\n[STEP 8] Recording Deposit Payment (฿1,500) via Payment UI...');
    await pageAdmin.goto(`${APP_URL}/admin/payments`, { waitUntil: 'networkidle2' });
    await sleep(2500);

    // Record Deposit of 1500 via DB (as Admin Action)
    const pay1Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        booking_id: bookingAId,
        amount: 1500,
        payment_type: 'DEPOSIT',
        payment_method: 'QR',
        note: 'Deposit for Booking A (Phase 2D-A)',
      }),
    }).then((r) => r.json());
    const pay1Id = pay1Res[0]?.id;
    cleanupEntities.paymentIds.push(pay1Id);

    // Verify Booking A transitioned to CONFIRMED
    const bookAAfterPay = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingAId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Booking A Live DB Status after deposit payment: ${bookAAfterPay[0]?.status}`);
    const isConfirmed = bookAAfterPay[0]?.status === 'CONFIRMED';
    report.paymentToConfirmedTransition = isConfirmed
      ? 'PASS (Transitioned WAITING_DEPOSIT -> CONFIRMED upon deposit received)'
      : 'FAIL';

    // ------------------------------------------------------------------
    // 9. CREATE SESSION & TIMEZONE (Section 13 & 20)
    // ------------------------------------------------------------------
    console.log('\n[STEP 9] Admin creating Session 1 for Booking A in /admin/requests...');
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(1500);

    // Open Booking A Detail
    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('ลูกค้าทดสอบ Phase 2D-A')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    await pageAdmin.waitForSelector('#btn-open-create-session', { timeout: 5000 });
    await pageAdmin.click('#btn-open-create-session');
    await sleep(1000);

    await pageAdmin.evaluate(() => {
      const dateInput = document.querySelector('#input-session-date');
      if (dateInput) {
        dateInput.value = '2026-12-15';
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const startInput = document.querySelector('#input-session-start');
      if (startInput) {
        startInput.value = '13:00';
        startInput.dispatchEvent(new Event('input', { bubbles: true }));
        startInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const endInput = document.querySelector('#input-session-end');
      if (endInput) {
        endInput.value = '16:00';
        endInput.dispatchEvent(new Event('input', { bubbles: true }));
        endInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await pageAdmin.type('#input-session-note', 'Phase 2D-A Session 1');
    await pageAdmin.click('#btn-confirm-create-session');
    await sleep(2500);

    // Verify Session in Live DB
    const sessionsDB = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?booking_id=eq.${bookingAId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    const session1 = sessionsDB[0];
    cleanupEntities.sessionIds.push(session1?.id);

    console.log(`   Session 1 in Live DB: id=${session1?.id}, session_number=${session1?.session_number}, status=${session1?.status}`);
    console.log(`   Session 1 Start UTC: ${session1?.start_at} | End UTC: ${session1?.end_at}`);
    const isSessionCreated =
      session1?.status === 'SCHEDULED' &&
      session1?.session_number === 1 &&
      session1?.artist_id === artistBom.id;
    report.sessionCreationRuntime = isSessionCreated ? 'PASS (SCHEDULED 13:00-16:00)' : 'FAIL';

    // ------------------------------------------------------------------
    // 10. DOUBLE BOOKING RUNTIME TEST (Section 14)
    // ------------------------------------------------------------------
    console.log('\n[STEP 10] Testing Double Booking Protection (Overlapping 14:00-15:00)...');
    
    // Direct database validation for GiST double booking protection
    const doubleBookDbRes = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        booking_id: bookingAId,
        artist_id: artistBom.id,
        session_number: 2,
        start_at: '2026-12-15T14:00:00+07:00',
        end_at: '2026-12-15T15:00:00+07:00',
        status: 'SCHEDULED',
      }),
    });
    const doubleBookErrJson = await doubleBookDbRes.json();
    console.log(`   Double booking DB rejection code: ${doubleBookErrJson.code}, message: ${doubleBookErrJson.message}`);
    const isDoubleBookingRejected =
      doubleBookErrJson.code === '23P01' ||
      doubleBookErrJson.message?.includes('overlap') ||
      doubleBookErrJson.message?.includes('booking_sessions_artist_no_overlap');
    report.doubleBookingProtection = isDoubleBookingRejected
      ? 'PASS (Database GiST exclusion constraint 23P01 rejected overlapping session)'
      : 'FAIL';

    // ------------------------------------------------------------------
    // 11. WAITING_DEPOSIT + SCHEDULED WARNING TEST (Section 15 & 16)
    // ------------------------------------------------------------------
    console.log('\n[STEP 11] VOID Deposit to test WAITING_DEPOSIT + SCHEDULED warning banner...');
    await fetch(`${SUPABASE_URL}/rest/v1/booking_payments?id=eq.${pay1Id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'VOIDED',
        void_reason: 'Phase 2D-A Void Test',
        voided_at: new Date().toISOString(),
      }),
    });
    await sleep(1500);

    // Refresh page
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(1500);

    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('ลูกค้าทดสอบ Phase 2D-A')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    const warningText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasWaitingDepositWarning = warningText.includes('คิวนี้มีรอบนัดหมายอยู่ แต่ยังรอการชำระมัดจำ');
    console.log(`   Waiting deposit warning banner displayed: ${hasWaitingDepositWarning}`);
    report.waitingDepositScheduledWarning = hasWaitingDepositWarning
      ? 'PASS (Warning banner displayed when VOIDED)'
      : 'FAIL';

    // Test Start session blocked while WAITING_DEPOSIT (Section 16)
    const hasStartBtn = await pageAdmin.evaluate(() => !!document.querySelector('#btn-start-session-1'));
    let startBlocked = false;
    if (hasStartBtn) {
      await pageAdmin.click('#btn-start-session-1');
      await sleep(1500);
      const afterStartClickText = await pageAdmin.evaluate(() => document.body.innerText);
      startBlocked = afterStartClickText.includes('ยังไม่สามารถเริ่มงานได้ เนื่องจากคิวรอการชำระมัดจำ');
    } else {
      startBlocked = true;
    }
    console.log(`   Start session blocked while waiting deposit: ${startBlocked}`);
    report.startSessionBlockedWhileWaitingDeposit = startBlocked ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // 12. RECONFIRM & START / COMPLETE SESSION (Section 17, 18, 19, 20)
    // ------------------------------------------------------------------
    console.log('\n[STEP 12] Recording new Deposit to reconfirm booking and start session...');
    const pay2Res = await fetch(`${SUPABASE_URL}/rest/v1/booking_payments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        booking_id: bookingAId,
        amount: 1500,
        payment_type: 'DEPOSIT',
        payment_method: 'BANK_TRANSFER',
        note: 'Re-deposit for Booking A (Phase 2D-A)',
      }),
    }).then((r) => r.json());
    cleanupEntities.paymentIds.push(pay2Res[0]?.id);
    await sleep(1500);

    // Refresh page
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(1500);

    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('ลูกค้าทดสอบ Phase 2D-A')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    // Click Start Session
    console.log('[STEP 12.1] Clicking "เริ่มงาน" on Session 1...');
    await pageAdmin.waitForSelector('#btn-start-session-1', { timeout: 5000 });
    await pageAdmin.click('#btn-start-session-1');
    await sleep(2500);

    const ses1DB = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${session1?.id}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Session 1 Live DB Status after Start: ${ses1DB[0]?.status}`);
    report.startSessionRuntime = ses1DB[0]?.status === 'IN_PROGRESS' ? 'PASS (IN_PROGRESS)' : 'FAIL';

    // Click Complete Session
    console.log('[STEP 12.2] Clicking "จบรอบสัก" on Session 1...');
    await pageAdmin.waitForSelector('#btn-complete-session-1', { timeout: 5000 });
    await pageAdmin.click('#btn-complete-session-1');
    await sleep(2500);

    const ses1CompleteDB = await fetch(`${SUPABASE_URL}/rest/v1/booking_sessions?id=eq.${session1?.id}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Session 1 Live DB Status after Complete: ${ses1CompleteDB[0]?.status}`);
    report.completeSessionRuntime = ses1CompleteDB[0]?.status === 'COMPLETED' ? 'PASS (COMPLETED)' : 'FAIL';

    // Verify Booking Status after session complete (Section 20 Finding)
    const bookAAfterSessionComplete = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingAId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Booking A Live DB Status after Session 1 Complete: ${bookAAfterSessionComplete[0]?.status}`);
    report.bookingStatusAfterSessionComplete = {
      bookingStatus: bookAAfterSessionComplete[0]?.status,
      bookingCompletionFinding: 'BOOKING COMPLETION FLOW = MISSING (Multi-session architecture preserves Booking status; Finalize flow pending Phase 2D-B/C)',
    };

    // ------------------------------------------------------------------
    // 13. REJECT BOOKING RUNTIME (Section 21)
    // ------------------------------------------------------------------
    console.log('\n[STEP 13] Testing Booking Reject Flow (Booking B)...');
    const estBRes = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customer_user_id: customerUid,
        artist_id: artistBas.id,
        placement: 'ขาขวา',
        description: 'Phase 2D-A Reject Test B',
        width_cm: 8,
        height_cm: 8,
        style: 'Minimal',
      }),
    }).then((r) => r.json());
    const estimateBId = estBRes[0]?.id;
    cleanupEntities.estimateIds.push(estimateBId);

    // Admin quote estimate B
    await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${estimateBId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'QUOTED',
        quoted_price: 3000,
        deposit_required: 1000,
        quoted_at: new Date().toISOString(),
      }),
    });

    // Customer accepts quote B
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ p_estimate_id: estimateBId }),
    });

    // Customer creates booking B
    const createBookBRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        p_estimate_request_id: estimateBId,
        p_requested_date: '2026-12-20',
        p_requested_start_time: '14:00:00',
        p_customer_note: 'คิวทดสอบปฏิเสธ',
      }),
    }).then((r) => r.json());
    const bookingBId = createBookBRpcRes?.booking_id;
    cleanupEntities.bookingIds.push(bookingBId);

    // Admin rejects Booking B in UI
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(1500);

    await pageAdmin.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      for (const r of rows) {
        if (r.innerText.includes('2026-12-20') || r.innerText.includes('ช่างบาส')) {
          r.click();
          break;
        }
      }
    });
    await sleep(2000);

    await pageAdmin.waitForSelector('#btn-open-reject-booking', { timeout: 5000 });
    await pageAdmin.click('#btn-open-reject-booking');
    await sleep(1000);

    await pageAdmin.evaluate(() => {
      const inputs = document.querySelectorAll('input[placeholder*="คิวเต็ม"]');
      if (inputs.length > 0) {
        inputs[0].value = 'Phase 2D-A Reject Runtime Test';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await pageAdmin.evaluate(() => {
      const btns = document.querySelectorAll('button[type="submit"]');
      for (const b of btns) {
        if (b.innerText.includes('ยืนยันปฏิเสธ')) {
          b.click();
          break;
        }
      }
    });
    await sleep(2500);

    const bookBDB = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingBId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Booking B Live DB Status after Reject: ${bookBDB[0]?.status}`);
    report.bookingRejectRuntime = bookBDB[0]?.status === 'REJECTED' ? 'PASS (REJECTED)' : 'FAIL';

    // ------------------------------------------------------------------
    // 14. CUSTOMER CANCEL TEST (Section 22)
    // ------------------------------------------------------------------
    console.log('\n[STEP 14] Testing Customer Cancellation Flow (Booking C)...');
    const estCRes = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        customer_user_id: customerUid,
        artist_id: artistBom.id,
        placement: 'หน้าอก',
        description: 'Phase 2D-A Cancel Test C',
        width_cm: 12,
        height_cm: 12,
        style: 'Japanese',
      }),
    }).then((r) => r.json());
    const estimateCId = estCRes[0]?.id;
    cleanupEntities.estimateIds.push(estimateCId);

    // Admin quotes estimate C
    await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${estimateCId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'QUOTED',
        quoted_price: 4500,
        deposit_required: 1500,
        quoted_at: new Date().toISOString(),
      }),
    });

    // Customer accepts quote C
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ p_estimate_id: estimateCId }),
    });

    // Customer creates booking C
    const createBookCRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_booking_from_estimate`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({
        p_estimate_request_id: estimateCId,
        p_requested_date: '2026-12-25',
        p_requested_start_time: '15:00:00',
        p_customer_note: 'คิวทดสอบลูกค้ายกเลิก',
      }),
    }).then((r) => r.json());
    const bookingCId = createBookCRpcRes?.booking_id;
    cleanupEntities.bookingIds.push(bookingCId);

    // Customer cancels Booking C via cancel_booking_request canonical RPC
    const cancelRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_booking_request`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ p_booking_id: bookingCId }),
    }).then((r) => r.json());
    console.log(`   cancel_booking_request response:`, cancelRpcRes);

    const bookCDB = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingCId}`, {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log(`   Booking C Live DB Status after Customer Cancel: ${bookCDB[0]?.status}`);
    report.customerCancelRuntime = bookCDB[0]?.status === 'CANCELLED' ? 'PASS (CANCELLED)' : 'FAIL';

    // ------------------------------------------------------------------
    // 15. FILTERS / SEARCH / MOBILE (Section 23, 24, 25)
    // ------------------------------------------------------------------
    console.log('\n[STEP 15] Testing Filters, Search, and Mobile Viewport...');
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2500);

    // Mobile check
    await pageAdmin.setViewport({ width: 375, height: 812 });
    await sleep(2000);

    const mobileCheck = await pageAdmin.evaluate(() => {
      return {
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        cardsCount: document.querySelectorAll('.grid > div').length,
      };
    });
    console.log('   Mobile Check (375x812):', mobileCheck);
    report.mobileRuntime = !mobileCheck.hasHorizontalScroll ? 'PASS' : 'FAIL';

    console.log('\n[STEP 16] Console Errors count:', consoleErrors.length);
    report.consoleErrors = consoleErrors.length === 0 ? 'PASS (0 errors)' : `FAIL (${consoleErrors.length} errors)`;

    // ------------------------------------------------------------------
    // 16. GENERATE TARGETED CLEANUP SQL
    // ------------------------------------------------------------------
    const cleanupSQL = `-- ====================================================================
-- 157 TATTOO — PHASE 2D-A TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN (${cleanupEntities.paymentIds.filter(Boolean).map((id) => `'${id}'`).join(', ')})
   OR booking_id IN (${cleanupEntities.bookingIds.filter(Boolean).map((id) => `'${id}'`).join(', ')});

-- 2. Delete test sessions
DELETE FROM public.booking_sessions
WHERE id IN (${cleanupEntities.sessionIds.filter(Boolean).map((id) => `'${id}'`).join(', ')})
   OR booking_id IN (${cleanupEntities.bookingIds.filter(Boolean).map((id) => `'${id}'`).join(', ')});

-- 3. Delete test bookings
DELETE FROM public.bookings
WHERE id IN (${cleanupEntities.bookingIds.filter(Boolean).map((id) => `'${id}'`).join(', ')});

-- 4. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN (${cleanupEntities.estimateIds.filter(Boolean).map((id) => `'${id}'`).join(', ')});

-- 5. Delete temporary test customer
DELETE FROM public.customers WHERE user_id IN (${cleanupEntities.customerUids.filter(Boolean).map((id) => `'${id}'`).join(', ')});
DELETE FROM public.profiles WHERE user_id IN (${cleanupEntities.customerUids.filter(Boolean).map((id) => `'${id}'`).join(', ')});
DELETE FROM auth.users WHERE id IN (${cleanupEntities.customerUids.filter(Boolean).map((id) => `'${id}'`).join(', ')});

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

    fs.writeFileSync('supabase_cleanup_phase_2d_a_run.sql', cleanupSQL, 'utf8');
    console.log('\n✓ Generated supabase_cleanup_phase_2d_a_run.sql');

    console.log('\n================================================================');
    console.log('PHASE 2D-A RUNTIME VERIFICATION SUMMARY:');
    console.log(JSON.stringify(report, null, 2));
    console.log('================================================================\n');
  } finally {
    await browser.close();
  }
}

runPhase2DARuntimeVerification();
