import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import ws from 'ws';
global.WebSocket = ws;

const envFilePath = path.resolve('.env.local');
const envFile = fs.readFileSync(envFilePath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length > 0) {
    env[key.trim()] = value.join('=').trim().replace(/['"]/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBooking() {
  console.log('--- TESTING BOOKING FLOW ---');
  
  const shopSlug = '157-tattoo';
  const { data: shopData } = await supabase.rpc('get_public_shop_by_slug', { p_slug: shopSlug });
  const shopId = shopData[0].id;
  console.log('Shop ID:', shopId);

  const { data: artists } = await supabase.rpc('get_public_artists_by_shop_slug', { p_slug: shopSlug });
  console.log('Artists response:', artists);
  
  let artistId = null;
  let styleId = null;
  let artistName = '';

  for (const art of artists) {
    const { data: artistStyles } = await supabase.rpc('get_public_artist_tattoo_styles', {
      p_shop_slug: shopSlug,
      p_artist_id: art.artist_id
    });
    if (artistStyles && artistStyles.length > 0) {
      artistId = art.artist_id;
      styleId = artistStyles[0].style_id;
      artistName = art.display_name;
      break;
    }
  }

  if (!artistId) {
    throw new Error('No artist with registered styles found');
  }

  console.log('Selected Artist:', artistName);
  console.log('Selected Style ID:', styleId);

  // 1. Create upload session
  const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_booking_upload_session', {
    p_shop_slug: shopSlug,
    p_artist_id: artistId,
    p_style_id: styleId,
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
  
  // Check pending booking request using public status RPC
  const { data: statusData, error: statusError } = await supabase.rpc('get_public_booking_status', {
    p_shop_slug: shopSlug,
    p_public_token: publicToken
  });
  
  if (statusError) throw statusError;
  
  if (statusData && statusData.length > 0) {
    console.log('FOUND TEST BOOKING REQUEST VIA RPC:');
    console.log('- Status:', statusData[0].booking_status);
    console.log('- Shop Name:', statusData[0].shop_name);
    console.log('- Artist Name:', statusData[0].artist_name);
    console.log('- Customer Name:', statusData[0].submitted_full_name);
    console.log('- Style:', statusData[0].tattoo_style);
    console.log('- Placement:', statusData[0].body_placement);
    console.log('- Description:', statusData[0].description);
    console.log('- Agreed Price:', statusData[0].agreed_price);
  } else {
    console.log('NO TEST BOOKING REQUEST FOUND!');
  }
}

testBooking().catch(console.error);
