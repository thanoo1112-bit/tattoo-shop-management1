require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: shop } = await supabase.from('shops').select('id').limit(1).single();
  const shopId = shop.id;

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const { data: appointments, error: appError } = await supabase
    .from('appointments')
    .select(`
      id,
      start_at,
      end_at,
      status,
      artist:profiles!appointments_artist_id_fkey(full_name, email),
      customer:customers!appointments_shop_id_customer_id_fkey(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(name, tattoo_style, body_placement)
    `)
    .eq('shop_id', shopId)
    .gte('start_at', startOfDay.toISOString())
    .lte('start_at', endOfDay.toISOString())
    .order('start_at', { ascending: true });

  console.log('appointments:', JSON.stringify(appointments, null, 2));
  if (appError) console.error('appError:', appError);

  const { data: reqs, error: reqError } = await supabase
    .from('booking_requests')
    .select(`
      id,
      requested_start_at,
      status,
      submitted_full_name,
      artist:profiles!booking_requests_artist_id_fkey(full_name, email),
      project:tattoo_projects!booking_requests_shop_id_project_id_fkey(tattoo_style)
    `)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('booking_requests:', JSON.stringify(reqs, null, 2));
  if (reqError) console.error('reqError:', reqError);
}

run();
