const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach(line => {
  const [key, ...value] = line.split("=");
  if (key && value.length > 0) {
    env[key.trim()] = value.join("=").trim().replace(/['"]/g, "");
  }
});

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseKey = env["SUPABASE_SERVICE_ROLE_KEY"];

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from("payments")
    .select(`
      status,
      amount,
      booking_request_id,
      booking_requests (
        submitted_full_name,
        status,
        confirmed_start_at,
        confirmed_end_at,
        artists ( email, full_name )
      )
    `)
    .eq("payment_type", "deposit")
    .eq("status", "verification_pending")
    .not("proof_storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
    
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
