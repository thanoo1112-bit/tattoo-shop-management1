import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function runBrowserVerification() {
  console.log('--- PHASE 2D-A BROWSER UI VERIFICATION ---');

  const consoleErrors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    // 1. Test Admin Guard (Unauth)
    console.log('[1] Testing Admin Guard (Unauthenticated)...');
    const ctxUnauth = await browser.createBrowserContext();
    const pageUnauth = await ctxUnauth.newPage();
    await pageUnauth.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const unauthUrl = pageUnauth.url();
    console.log('   Unauth redirected to:', unauthUrl);
    const unauthOk = unauthUrl.includes('/staff/login');
    console.log('   Admin Guard Unauth:', unauthOk ? 'PASS' : 'FAIL');
    await ctxUnauth.close();

    // 2. Real Admin Login
    console.log('\n[2] Logging in as Real Admin...');
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

    // 3. Open /admin/requests
    console.log('\n[3] Opening /admin/requests...');
    await pageAdmin.goto(`${APP_URL}/admin/requests`, { waitUntil: 'networkidle2' });
    await sleep(3500);

    const pageText = await pageAdmin.evaluate(() => document.body.innerText);

    // Check Header & KPI cards
    const hasHeader = pageText.includes('จัดการคิวงาน');
    const hasCard1 = pageText.includes('คำขอประเมินใหม่');
    const hasCard2 = pageText.includes('รอมัดจำ');
    const hasCard3 = pageText.includes('ยืนยันคิวแล้ว');
    const hasCard4 = pageText.includes('กำลังดำเนินงาน');

    // Check Tab 1 Empty state
    const hasEstimatesTab = pageText.includes('คำขอประเมินราคา');
    const hasEmptyEstimates = pageText.includes('ยังไม่มีคำขอจากลูกค้า');

    console.log('   Page Header Rendered:', hasHeader);
    console.log('   KPI Cards Rendered:', hasCard1 && hasCard2 && hasCard3 && hasCard4);
    console.log('   Tab 1 Empty State (Clean Baseline):', hasEmptyEstimates);

    // 4. Switch to Tab 2 (Bookings)
    console.log('\n[4] Switching to Tab 2 (คิวงานทั้งหมด)...');
    await pageAdmin.click('#tab-btn-bookings');
    await sleep(1500);

    const tab2Text = await pageAdmin.evaluate(() => document.body.innerText);
    const hasEmptyBookings = tab2Text.includes('ยังไม่มีคิวงาน');
    console.log('   Tab 2 Empty State (Clean Baseline):', hasEmptyBookings);

    // 5. Mobile Viewport (375x812)
    console.log('\n[5] Testing Mobile Viewport (375x812)...');
    await pageAdmin.setViewport({ width: 375, height: 812 });
    await sleep(2000);

    const mobileCheck = await pageAdmin.evaluate(() => {
      return {
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        cardsCount: document.querySelectorAll('.grid > div').length,
      };
    });
    console.log('   Mobile Check:', mobileCheck);

    console.log('\n[6] Console Errors count:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('   Errors:', consoleErrors);
    }

    console.log('\n========================================');
    console.log('BROWSER VERIFICATION SUMMARY:');
    console.log({
      adminGuardUnauth: unauthOk ? 'PASS' : 'FAIL',
      desktopPageRender: hasHeader && hasCard1 && hasCard2 && hasCard3 && hasCard4 ? 'PASS' : 'FAIL',
      tab1EmptyState: hasEmptyEstimates ? 'PASS' : 'FAIL',
      tab2EmptyState: hasEmptyBookings ? 'PASS' : 'FAIL',
      mobileLayout: !mobileCheck.hasHorizontalScroll ? 'PASS' : 'FAIL',
      consoleErrors: consoleErrors.length === 0 ? 'PASS (0 errors)' : `FAIL (${consoleErrors.length} errors)`,
    });
    console.log('========================================');
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
