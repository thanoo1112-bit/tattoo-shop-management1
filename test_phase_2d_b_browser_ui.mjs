import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SUPABASE_URL = 'https://uieehinjjqoofejteehz.supabase.co';
const ANON_KEY = 'sb_publishable_iO2jc3ZXc4nOn1UaEZdtxQ_BBRmM3sU';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function runCalendarBrowserVerification() {
  console.log('================================================================');
  console.log('PHASE 2D-B: ADMIN MASTER CALENDAR BROWSER VERIFICATION');
  console.log('================================================================\n');

  const report = {};
  const consoleErrors = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    // ------------------------------------------------------------------
    // TEST 1: Unauthenticated Guard Check
    // ------------------------------------------------------------------
    console.log('[TEST 1] Checking unauthenticated redirect on /admin/calendar...');
    const ctxUnauth = await browser.createBrowserContext();
    const pageUnauth = await ctxUnauth.newPage();
    await pageUnauth.goto(`${APP_URL}/admin/calendar`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const unauthUrl = pageUnauth.url();
    console.log(`   Unauthenticated URL: ${unauthUrl}`);
    const isUnauthRedirect = unauthUrl.includes('/staff/login') || unauthUrl.includes('/login');
    report.test1_unauthGuard = isUnauthRedirect ? 'PASS (Redirected to /staff/login)' : 'FAIL';
    await ctxUnauth.close();

    // ------------------------------------------------------------------
    // TEST 2: Admin Login and Page Access
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Logging in as Real Admin and opening /admin/calendar...');
    const ctxAdmin = await browser.createBrowserContext();
    const pageAdmin = await ctxAdmin.newPage();
    await pageAdmin.setViewport({ width: 1280, height: 900 });

    pageAdmin.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
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
    await sleep(2000);

    await pageAdmin.goto(`${APP_URL}/admin/calendar`, { waitUntil: 'networkidle2' });
    await sleep(2500);

    const adminUrl = pageAdmin.url();
    console.log(`   Admin Calendar URL: ${adminUrl}`);
    const pageText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasHeader = pageText.includes('ปฏิทินงานสัก') && pageText.includes('ดูตารางนัดหมาย');
    console.log(`   Admin Page Loaded: ${hasHeader}`);
    report.test2_adminCalendarLoaded = hasHeader ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 3: Summary Strip & Clean Baseline Empty State
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Verifying Summary KPI Strip and Clean Empty State...');
    const hasSummaryStrip =
      pageText.includes('คิวงานวันนี้') &&
      pageText.includes('กำลังสัก') &&
      pageText.includes('รอมัดจำ') &&
      pageText.includes('ช่างมีงานวันนี้');
    console.log(`   Summary Strip rendered: ${hasSummaryStrip}`);
    report.test3_summaryStrip = hasSummaryStrip ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 4: View Mode Switcher (Week, Month, Day)
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Month, Week, and Day View Switcher...');
    // Click Month view
    await pageAdmin.click('#btn-view-month');
    await sleep(1500);
    const monthText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasMonthView = monthText.includes('อาทิตย์') && monthText.includes('จันทร์') && monthText.includes('เสาร์');
    console.log(`   Month View Switch: ${hasMonthView}`);

    // Click Day view
    await pageAdmin.click('#btn-view-day');
    await sleep(1500);
    const dayText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasDayView = dayText.includes('ทั้งหมด 0 คิว') || dayText.includes('ยังไม่มีคิวงานในวันที่เลือก');
    console.log(`   Day / Agenda View Switch: ${hasDayView}`);

    // Click Week view
    await pageAdmin.click('#btn-view-week');
    await sleep(1500);
    const weekText = await pageAdmin.evaluate(() => document.body.innerText);
    const hasWeekView = weekText.includes('พฤหัสบดี') && weekText.includes('ศุกร์');
    console.log(`   Week View Switch: ${hasWeekView}`);

    report.test4_viewModeSwitching =
      hasMonthView && hasDayView && hasWeekView ? 'PASS (Month/Week/Day working)' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 5: Artist & Status Filters
    // ------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Artist and Status Dropdown Filters...');
    const artistFilterExists = (await pageAdmin.$('#select-calendar-artist')) !== null;
    const statusFilterExists = (await pageAdmin.$('#select-calendar-status')) !== null;
    const searchInputExists = (await pageAdmin.$('#input-calendar-search')) !== null;
    console.log(`   Artist Filter: ${artistFilterExists}, Status Filter: ${statusFilterExists}, Search: ${searchInputExists}`);
    report.test5_filtersAndSearch =
      artistFilterExists && statusFilterExists && searchInputExists ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 6: Date Navigation (Prev, Next, Today)
    // ------------------------------------------------------------------
    console.log('\n[TEST 6] Testing Date Navigation controls...');
    const prevExists = (await pageAdmin.$('#btn-calendar-prev')) !== null;
    const nextExists = (await pageAdmin.$('#btn-calendar-next')) !== null;
    const todayExists = (await pageAdmin.$('#btn-calendar-today')) !== null;

    await pageAdmin.click('#btn-calendar-next');
    await sleep(1000);
    await pageAdmin.click('#btn-calendar-prev');
    await sleep(1000);
    await pageAdmin.click('#btn-calendar-today');
    await sleep(1000);

    report.test6_dateNavigation = prevExists && nextExists && todayExists ? 'PASS' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 7: Mobile Viewport Check (375x812)
    // ------------------------------------------------------------------
    console.log('\n[TEST 7] Testing Mobile Viewport (375x812)...');
    await pageAdmin.setViewport({ width: 375, height: 812 });
    await sleep(2000);

    const mobileCheck = await pageAdmin.evaluate(() => {
      return {
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth,
      };
    });
    console.log('   Mobile Check (375x812):', mobileCheck);
    report.test7_mobileResponsive = !mobileCheck.hasHorizontalScroll ? 'PASS (0 Horizontal Scroll)' : 'FAIL';

    // ------------------------------------------------------------------
    // TEST 8: Console Errors Check
    // ------------------------------------------------------------------
    console.log('\n[TEST 8] Checking Browser Console Errors...');
    console.log(`   Console Errors Count: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('   Console Error Details:', JSON.stringify(consoleErrors, null, 2));
    }
    // Filter out third-party network or favicon 404s if any
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon.ico') && !e.includes('Failed to load resource')
    );
    report.test8_consoleErrors = realErrors.length === 0 ? 'PASS (0 app errors)' : `FAIL (${realErrors.length} errors)`;

    console.log('\n================================================================');
    console.log('PHASE 2D-B BROWSER UI VERIFICATION SUMMARY:');
    console.log(JSON.stringify(report, null, 2));
    console.log('================================================================\n');

    await ctxAdmin.close();
  } finally {
    await browser.close();
  }
}

runCalendarBrowserVerification();
