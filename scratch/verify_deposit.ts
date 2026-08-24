import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`
};

async function run() {
  const bRes = await fetch(`${supabaseUrl}/rest/v1/booking_requests?status=eq.pending_payment&order=accepted_at.desc.nullslast&limit=1`, { headers });
  const bookings = await bRes.json();
  if (!bookings || bookings.length === 0) {
    console.error('No pending_payment bookings found');
    return;
  }
  const booking = bookings[0];
  console.log('=== BOOKING ===');
  console.log(JSON.stringify(booking, null, 2));

  const pRes = await fetch(`${supabaseUrl}/rest/v1/tattoo_projects?id=eq.${booking.project_id}&limit=1`, { headers });
  const projects = await pRes.json();
  console.log('=== PROJECT ===');
  console.log(JSON.stringify(projects[0], null, 2));

  const payRes = await fetch(`${supabaseUrl}/rest/v1/payments?booking_request_id=eq.${booking.id}`, { headers });
  const payments = await payRes.json();
  console.log('=== PAYMENTS ===');
  console.log(JSON.stringify(payments, null, 2));

  const hRes = await fetch(`${supabaseUrl}/rest/v1/booking_schedule_holds?booking_request_id=eq.${booking.id}`, { headers });
  const holds = await hRes.json();
  console.log('=== HOLDS ===');
  console.log(JSON.stringify(holds, null, 2));

  const aRes = await fetch(`${supabaseUrl}/rest/v1/appointments?booking_request_id=eq.${booking.id}`, { headers });
  const appointments = await aRes.json();
  console.log('=== APPOINTMENTS ===');
  console.log(JSON.stringify(appointments, null, 2));
}
run();
