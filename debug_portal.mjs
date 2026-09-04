import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const SUPABASE_URL = 'https://uieehinjjqoofejteehz.supabase.co';
const ANON_KEY = 'sb_publishable_iO2jc3ZXc4nOn1UaEZdtxQ_BBRmM3sU';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Signup customer
  const timestamp = Date.now();
  const email = `cust_debug_${timestamp}@157tattoo.com`;
  const password = 'Password157!';
  const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { display_name: 'Debug Customer', phone: '0891112233' } }),
  }).then((r) => r.json());
  const uid = signup.user?.id || signup.id;

  const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const uHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

  const [artist1] = await fetch(`${SUPABASE_URL}/rest/v1/artists?is_active=eq.true&limit=1`, { headers: { apikey: ANON_KEY } }).then((r) => r.json());

  // Create estimate
  const [est] = await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests`, {
    method: 'POST',
    headers: uHeaders,
    body: JSON.stringify({
      customer_user_id: uid,
      artist_id: artist1.id,
      style: 'Japanese Dragon',
      placement: 'Arm',
      width_cm: 12,
      height_cm: 18,
      description: 'Dragon',
      preferred_date: '2026-11-20',
      status: 'PENDING',
    }),
  }).then((r) => r.json());

  // Admin quote
  const adminAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@157tattoo.com', password: '157tattoo' }),
  }).then((r) => r.json());
  const adminHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${adminAuth.access_token}`, 'Content-Type': 'application/json' };

  await fetch(`${SUPABASE_URL}/rest/v1/estimate_requests?id=eq.${est.id}`, {
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

  await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_estimate_quote`, {
    method: 'POST',
    headers: uHeaders,
    body: JSON.stringify({ p_estimate_id: est.id }),
  });

  // Browser login
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await new Promise((r) => setTimeout(r, 2000));

  // If redirected to /complete-profile, complete it
  if (page.url().includes('/complete-profile')) {
    console.log('On complete profile page. Submitting consent and phone...');
    await page.waitForSelector('input[type="checkbox"]');
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
    await new Promise((r) => setTimeout(r, 2000));
  }

  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3000));

  console.log('Final Page URL:', page.url());
  const innerText = await page.evaluate(() => document.body.innerText);
  console.log('Final Portal Snippet:\n', innerText.substring(0, 500));

  await browser.close();
}
test();
