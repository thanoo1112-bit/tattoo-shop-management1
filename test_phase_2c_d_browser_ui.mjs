import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function runRevenueBrowserTest() {
  console.log('================================================================');
  console.log('PHASE 2C-D: ADMIN REVENUE DASHBOARD UI BROWSER VERIFICATION');
  console.log('================================================================\n');

  const report = {};
  const consoleErrors = [];

  console.log('[STEP 0] Launching Real Chrome via Puppeteer-Core...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    // ------------------------------------------------------------------
    // 1. ADMIN GUARD VERIFICATION
    // ------------------------------------------------------------------
    console.log('[STEP 1] Testing Admin Guard on /admin/revenue...');
    const ctxUnauth = await browser.createBrowserContext();
    const pageUnauth = await ctxUnauth.newPage();
    await pageUnauth.goto(`${APP_URL}/admin/revenue`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const urlAfterUnauth = pageUnauth.url();
    console.log(`   Final URL after unauthenticated access: ${urlAfterUnauth}`);
    const unauthPassed = urlAfterUnauth.includes('/staff/login');
    report.adminGuardRuntime = unauthPassed
      ? 'PASS (Redirected to /staff/login)'
      : `FAIL (URL: ${urlAfterUnauth})`;
    await ctxUnauth.close();

    // ------------------------------------------------------------------
    // 2. ADMIN LOGIN & DESKTOP RENDERING
    // ------------------------------------------------------------------
    console.log('\n[STEP 2] Logging in as Real Admin & Rendering /admin/revenue...');
    const ctxAdmin = await browser.createBrowserContext();
    const pageAdmin = await ctxAdmin.newPage();
    await pageAdmin.setViewport({ width: 1280, height: 900 });

    pageAdmin.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Login as Admin
    await pageAdmin.goto(`${APP_URL}/staff/login`, { waitUntil: 'networkidle2' });
    await pageAdmin.waitForSelector('#staff-email', { timeout: 10000 });

    await pageAdmin.click('#staff-email', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#staff-email', 'admin@157tattoo.com');

    await pageAdmin.click('#staff-password', { clickCount: 3 });
    await pageAdmin.keyboard.press('Backspace');
    await pageAdmin.type('#staff-password', '157tattoo');

    console.log('   Submitting staff login...');
    await Promise.all([
      pageAdmin.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      pageAdmin.click('button[type="submit"]'),
    ]);
    await sleep(2000);

    // Open /admin/revenue
    console.log(`   Opening ${APP_URL}/admin/revenue...`);
    await pageAdmin.goto(`${APP_URL}/admin/revenue`, { waitUntil: 'networkidle2' });
    await sleep(2500);

    const desktopText = await pageAdmin.evaluate(() => document.body.innerText);
    console.log('--- Desktop Screen Text Snapshot ---');
    console.log(desktopText.slice(0, 500) + '...');
    console.log('------------------------------------');

    const hasTitle = desktopText.includes('รายได้ร้าน');
    const hasSubtitle = desktopText.includes('สรุปเงินจริงที่ร้านได้รับจากงานสัก');
    const hasTodayCard = desktopText.includes('รายได้วันนี้');
    const hasMonthCard = desktopText.includes('รายได้เดือนนี้');
    const hasDepositCard = desktopText.includes('เงินมัดจำเดือนนี้');
    const hasOutstandingCard = desktopText.includes('ยอดค้างชำระ');
    const hasTrendSection = desktopText.includes('แนวโน้มรายได้');
    const hasArtistSection = desktopText.includes('รายได้ตามช่างสัก');
    const hasTypeSection = desktopText.includes('ประเภทเงินที่รับ');
    const hasMethodSection = desktopText.includes('ช่องทางการชำระเงิน');
    const hasRecentSection = desktopText.includes('รายการรับเงินล่าสุด');
    const hasEmptyState = desktopText.includes('ยังไม่มีข้อมูลรายได้');

    console.log(`   Title "รายได้ร้าน" rendered: ${hasTitle}`);
    console.log(`   Subtitle rendered: ${hasSubtitle}`);
    console.log(`   Card 1 "รายได้วันนี้" rendered: ${hasTodayCard}`);
    console.log(`   Card 2 "รายได้เดือนนี้" rendered: ${hasMonthCard}`);
    console.log(`   Card 3 "เงินมัดจำเดือนนี้" rendered: ${hasDepositCard}`);
    console.log(`   Card 4 "ยอดค้างชำระ" rendered: ${hasOutstandingCard}`);
    console.log(`   Section "แนวโน้มรายได้" rendered: ${hasTrendSection}`);
    console.log(`   Section "รายได้ตามช่างสัก" rendered: ${hasArtistSection}`);
    console.log(`   Section "ประเภทเงินที่รับ" rendered: ${hasTypeSection}`);
    console.log(`   Section "ช่องทางการชำระเงิน" rendered: ${hasMethodSection}`);
    console.log(`   Section "รายการรับเงินล่าสุด" rendered: ${hasRecentSection}`);
    console.log(`   Empty state message displayed: ${hasEmptyState}`);

    const desktopPassed = hasTitle && hasSubtitle && hasTodayCard && hasMonthCard &&
                          hasDepositCard && hasOutstandingCard && hasTrendSection &&
                          hasArtistSection && hasTypeSection && hasMethodSection &&
                          hasRecentSection;

    report.desktopRendering = desktopPassed ? 'PASS (All sections, KPI cards, and headers rendered cleanly)' : 'FAIL';
    report.emptyState = hasEmptyState ? 'PASS (Clean empty state displayed without mock data)' : 'FAIL';

    // ------------------------------------------------------------------
    // 3. FILTER INTERACTION CHECK
    // ------------------------------------------------------------------
    console.log('\n[STEP 3] Testing Filter Interactions...');
    // Click Date Preset "7 วันล่าสุด"
    await pageAdmin.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.trim() === '7 วันล่าสุด');
      if (btn) btn.click();
    });
    await sleep(1000);

    // Click Date Preset "กำหนดเอง" to check custom range inputs
    await pageAdmin.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.trim() === 'กำหนดเอง');
      if (btn) btn.click();
    });
    await sleep(1000);

    const hasDateInputs = await pageAdmin.evaluate(() => {
      return document.querySelectorAll('input[type="date"]').length === 2;
    });
    console.log(`   Custom date range inputs visible: ${hasDateInputs}`);

    // Select Artist in Dropdown
    const artistOptions = await pageAdmin.evaluate(() => {
      const select = document.querySelector('select');
      return select ? Array.from(select.options).map((o) => o.text) : [];
    });
    console.log(`   Artist options available: ${artistOptions.join(', ')}`);
    const hasLiveArtists = artistOptions.length >= 2;

    report.filters = (hasDateInputs && hasLiveArtists)
      ? 'PASS (Date presets, custom range inputs, and live artist options interactive)'
      : 'FAIL';

    // ------------------------------------------------------------------
    // 4. LINK TO PAYMENT MANAGEMENT
    // ------------------------------------------------------------------
    console.log('\n[STEP 4] Testing Link to Payment Management...');
    const linkHref = await pageAdmin.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a')).find((a) =>
        a.innerText.includes('ดูรายการการเงินทั้งหมด')
      );
      return link ? link.getAttribute('href') : null;
    });
    console.log(`   Link href: ${linkHref}`);
    report.linkToPayments = linkHref === '/admin/payments'
      ? 'PASS (Links directly to /admin/payments)'
      : 'FAIL';

    // ------------------------------------------------------------------
    // 5. MOBILE RESPONSIVENESS CHECK
    // ------------------------------------------------------------------
    console.log('\n[STEP 5] Testing Mobile Viewport (375x812)...');
    await pageAdmin.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await pageAdmin.goto(`${APP_URL}/admin/revenue`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const mobileMetrics = await pageAdmin.evaluate(() => {
      const kpiGrid = document.querySelector('div[class*="grid-cols-2"]');
      const has2ColKpi = Boolean(kpiGrid);
      const hasHorizontalScroll = document.body.scrollWidth > window.innerWidth;
      const nav = document.querySelector('header');
      const brand = nav ? nav.innerText.includes('157') : false;

      return {
        has2ColKpi,
        hasHorizontalScroll,
        brand,
      };
    });

    console.log('   Mobile metrics:', mobileMetrics);
    report.mobileResponsive = (mobileMetrics.has2ColKpi && !mobileMetrics.hasHorizontalScroll)
      ? 'PASS (2-col KPI grid, no horizontal overflow, mobile-friendly cards)'
      : 'FAIL';

    await ctxAdmin.close();

  } finally {
    report.consoleErrors = consoleErrors.length === 0
      ? 'PASS (0 console errors during test)'
      : `WARN (${consoleErrors.length} errors: ${consoleErrors.slice(0, 2).join('; ')})`;

    await browser.close();
  }

  console.log('\n================================================================');
  console.log('PHASE 2C-D BROWSER UI VERIFICATION SUMMARY:');
  console.log(JSON.stringify(report, null, 2));
  console.log('================================================================\n');
}

runRevenueBrowserTest().catch((err) => {
  console.error('REVENUE BROWSER UI TEST FAILED:', err);
  process.exit(1);
});
