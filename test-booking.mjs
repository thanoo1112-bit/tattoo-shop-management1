import { createClient } from '@supabase/supabase-js';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBooking() {
  console.log('--- TESTING BOOKING FLOW ---');
  
  const shopSlug = '157-tattoo';
  const { data: shopData } = await supabase.rpc('get_public_shop_by_slug', { p_slug: shopSlug });
  const shopId = shopData[0].id;
  console.log('Shop ID:', shopId);

  const { data: artists } = await supabase.rpc('get_public_artists_by_shop_slug', { p_slug: shopSlug });
  const artistId = artists[0].artist_id;
  console.log('Selected Artist:', artists[0].display_name);

  // 1. Create upload session
  const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_booking_upload_session', {
    p_shop_slug: shopSlug,
    p_artist_id: artistId,
    p_style_id: null,
    p_color_mode: 'black_grey',
    p_work_type: 'new_work'
  });

  if (sessionError) throw sessionError;
  const sessionId = sessionData[0].session_id;
  console.log('Upload Session Created:', sessionId);

  // 2. Finalize booking
  const { data: publicToken, error: finalError } = await supabase.rpc('finalize_public_booking', {
    p_session_id: sessionId,
    p_width_cm: 10,
    p_height_cm: 10,
    p_placement: 'TEST PLACEMENT',
    p_description: 'TEST BOOKING FROM AGENT',
    p_full_name: 'TEST USER',
    p_phone: '0812345678',
    p_email: 'test@example.com',
    p_health_note: 'No allergies',
    p_requested_date: '2027-01-01',
    p_requested_time: '14:00',
    p_real_area_paths: [],
    p_design_ref_paths: [],
    p_terms_accepted: true,
    p_is_first_tattoo: true,
    p_safety_notice_acknowledged: true
  });

  if (finalError) {
     console.error("FINAL ERROR LOG:", JSON.stringify(finalError, null, 2));
     throw finalError;
  }
  console.log('Booking Finalized! Public Token:', publicToken ? 'YES (hidden)' : 'NO');
  
  // 3. Backoffice regression check
  console.log('\n--- BACKOFFICE REGRESSION CHECK ---');
  
  // Check pending booking request
  const { data: reqs, error: reqError } = await supabase
    .from('booking_requests')
    .select('*, customer:customer_id(*)')
    .eq('shop_id', shopId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (reqError) throw reqError;
  
  if (reqs && reqs.length > 0) {
    console.log('FOUND TEST BOOKING REQUEST:');
    console.log('- Status:', reqs[0].status);
    console.log('- Customer Name:', reqs[0].customer?.full_name);
    console.log('- Customer Phone:', reqs[0].customer?.phone);
    console.log('- Width:', reqs[0].width_cm);
    console.log('- Placement:', reqs[0].placement);
    console.log('- Description:', reqs[0].description);
  } else {
    console.log('NO TEST BOOKING REQUEST FOUND!');
  }
}

testBooking().catch(console.error);
