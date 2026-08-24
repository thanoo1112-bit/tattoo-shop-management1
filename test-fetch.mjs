
const url = "https://sftkthsgldvyorydznyz.supabase.co/rest/v1/rpc/finalize_public_booking";
const headers = {
  "apikey": "sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9",
  "Content-Type": "application/json"
};
const body = {
  "p_session_id": "00000000-0000-0000-0000-000000000000",
  "p_width_cm": 10,
  "p_height_cm": 10,
  "p_placement": "test",
  "p_description": "test",
  "p_full_name": "test",
  "p_phone": "0812345678",
  "p_email": null,
  "p_health_note": null,
  "p_requested_date": "2027-01-01",
  "p_requested_time": "14:00",
  "p_real_area_paths": [],
  "p_design_ref_paths": ["temp/00000000-0000-0000-0000-000000000000/dummy.webp"],
  "p_terms_accepted": true,
  "p_is_first_tattoo": false,
  "p_safety_notice_acknowledged": true
};
fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
  .then(res => res.json().then(data => console.log(res.status, data)))
  .catch(console.error);

