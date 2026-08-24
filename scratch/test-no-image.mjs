import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://sftkthsgldvyorydznyz.supabase.co";
const supabaseKey = "sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function testBookingNoImage() {
  const shopSlug = "157-tattoo";
  const { data: artists } = await supabase.rpc("get_public_artists_by_shop_slug", { p_slug: shopSlug });
  const artistId = artists[0].artist_id;

  const { data: styles } = await supabase.rpc("get_public_artist_tattoo_styles", {
    p_shop_slug: shopSlug,
    p_artist_id: artistId
  });
  const styleId = styles[0]?.style_id || styles[0]?.id || null;

  const { data: sessionData, error: sessionError } = await supabase.rpc("create_public_booking_upload_session", {
    p_shop_slug: shopSlug,
    p_artist_id: artistId,
    p_style_id: styleId,
    p_color_mode: "black_grey",
    p_work_type: "new_work"
  });

  if (sessionError) throw sessionError;
  const sessionId = sessionData[0].session_id;

  // Finalize booking without design references
  const { data: publicToken, error: finalError } = await supabase.rpc("finalize_public_booking", {
    p_session_id: sessionId,
    p_width_cm: 10,
    p_height_cm: 10,
    p_placement: "TEST PLACEMENT NO IMAGE",
    p_description: "TEST BOOKING FROM AGENT NO IMAGE",
    p_full_name: "TEST USER NO IMAGE",
    p_phone: "0812345678",
    p_email: "test_no_image@example.com",
    p_health_note: "No allergies",
    p_requested_date: "2027-01-01",
    p_requested_time: "14:00",
    p_real_area_paths: [],
    p_design_ref_paths: [],
    p_terms_accepted: true,
    p_is_first_tattoo: true,
    p_safety_notice_acknowledged: true
  });

  if (finalError) {
     console.error("FINAL ERROR LOG:", JSON.stringify(finalError, null, 2));
  } else {
     console.log("Booking without image Finalized! Public Token:", publicToken);
  }
}

testBookingNoImage().catch(console.error);
