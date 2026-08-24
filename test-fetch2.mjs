
const baseUrl = "https://sftkthsgldvyorydznyz.supabase.co/rest/v1";
const headers = {
  "apikey": "sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9",
  "Content-Type": "application/json"
};

async function run() {
  const shopData = await fetch(baseUrl + "/rpc/get_public_shop_by_slug", { method: "POST", headers, body: JSON.stringify({ p_slug: "157-tattoo" }) }).then(r=>r.json());
  const shopId = shopData[0].id;

  const artistId = "465f46dc-bdec-4102-9b91-267f5edf864b";
  const styleId = "b45d9f73-1f9f-4474-9e7e-a6e7bc05ce86";

  const session = await fetch(baseUrl + "/rpc/create_public_booking_upload_session", { method: "POST", headers, body: JSON.stringify({
    p_shop_slug: "157-tattoo",
    p_artist_id: artistId,
    p_style_id: styleId,
    p_color_mode: "black_grey",
    p_work_type: "new_work"
  })}).then(r=>r.json());
  
  if(session.code) {
    console.error("Session Error:", session);
    return;
  }
  
  const sessionId = session[0].session_id;
  console.log("Session ID:", sessionId);

  // Upload a dummy image
  const fileContent = "dummy webp data fake bytes";
  const filePath = `temp/${sessionId}/test.webp`;
  const uploadRes = await fetch(`https://sftkthsgldvyorydznyz.supabase.co/storage/v1/object/tattoo-references/${filePath}`, {
    method: "POST",
    headers: {
      "apikey": "sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9",
      "Authorization": "Bearer sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9",
      "Content-Type": "image/webp"
    },
    body: fileContent
  });
  console.log("Upload Status:", uploadRes.status);
  
  const finalizeRes = await fetch(baseUrl + "/rpc/finalize_public_booking", { method: "POST", headers, body: JSON.stringify({
    p_session_id: sessionId,
    p_width_cm: 10,
    p_height_cm: 10,
    p_placement: "test",
    p_description: "TEST BOOKING FROM AGENT AFTER FIX",
    p_full_name: "test user",
    p_phone: "0812345678",
    p_email: null,
    p_health_note: null,
    p_requested_date: "2027-01-01",
    p_requested_time: "14:00",
    p_real_area_paths: [],
    p_design_ref_paths: [filePath],
    p_terms_accepted: true,
    p_is_first_tattoo: false,
    p_safety_notice_acknowledged: true
  })});
  const text = await finalizeRes.text();
  console.log("Finalize Status:", finalizeRes.status);
  console.log("Finalize Result:", text);
}
run();

