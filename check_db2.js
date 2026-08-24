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

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]);

async function run() {
  const { data: payments } = await supabase
    .from("payments")
    .select("id, status, proof_storage_path, booking_request_id")
    .eq("payment_type", "deposit")
    .eq("status", "verification_pending")
    .not("proof_storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
    
  if (payments && payments.length > 0) {
    const payment = payments[0];
    console.log("PAYMENT ID:", payment.id ? "SET" : "NULL");
    console.log("PAYMENT STATUS:", payment.status);
    console.log("PROOF PATH:", payment.proof_storage_path ? "SET" : "NULL");
    
    // Check storage object
    const { data: objects, error: objError } = await supabase.storage.from("payment-proofs").list(payment.proof_storage_path.split('/')[0] + "/" + payment.proof_storage_path.split('/')[1]);
    
    // We will query the storage table directly for the full path
    const { data: objectRow } = await supabase
      .from("objects")
      .select("*")
      .eq("bucket_id", "payment-proofs")
      .eq("name", payment.proof_storage_path)
      .limit(1);
      
    // Because 'objects' is not in the public schema, we must query 'storage.objects' directly via postgres, but postgrest doesn't expose storage schema.
    // Instead we'll use a direct postgres query via rpc if possible or just use the list API.
  }
}
run();
