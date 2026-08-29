const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split(/\r?\n/).forEach(line => {
  const [key, ...value] = line.split("=");
  if (key && value.length > 0) {
    env[key.trim()] = value.join("=").trim().replace(/['"]/g, "");
  }
});

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseKey = env["SUPABASE_SERVICE_ROLE_KEY"];
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: heldFlashes, error: fetchErr } = await supabase
    .from("flash_designs")
    .select("id, flash_code, status, held_by_session_id, held_expires_at, booking_request_id")
    .eq("status", "held");

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }

  console.log("Held Flashes Found:", heldFlashes.length);
  for (const flash of heldFlashes) {
    console.log(`Checking flash: ${flash.flash_code} (${flash.id})`);
    
    const { data: bookings, error: bErr } = await supabase
      .from("booking_requests")
      .select("id, status")
      .eq("flash_design_id", flash.id);

    const { data: projects, error: pErr } = await supabase
      .from("tattoo_projects")
      .select("id, status")
      .eq("flash_design_id", flash.id);

    const hasBooking = (bookings && bookings.length > 0);
    const hasProject = (projects && projects.length > 0);

    if (!hasBooking && !hasProject) {
      console.log(`-> Resetting flash ${flash.flash_code} to OPEN (no booking or project history)`);
      const { error: updateErr } = await supabase
        .from("flash_designs")
        .update({
          status: "open",
          held_by_session_id: null,
          held_expires_at: null
        })
        .eq("id", flash.id);

      if (updateErr) {
        console.error(`Error updating flash ${flash.flash_code}:`, updateErr);
      } else {
        console.log(`-> Flash ${flash.flash_code} successfully reset to OPEN.`);
      }
    } else {
      console.log(`-> Flash ${flash.flash_code} has associated booking or project. NOT resetting.`);
    }
  }
}

run();
