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

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

async function run() {
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl('f6a103ca-0fea-4c94-a57a-39ec85c14589/a704de0c-44b4-459e-8695-447db0aee505/d0ee9a25-1764-484a-ba7c-62343b87cb14.webp', 300);
  console.log("SIGNED URL DATA:", data ? "SET" : "NULL");
  console.log("ERROR CODE:", error?.code || "NULL");
  console.log("ERROR MESSAGE:", error?.message || "NULL");
  console.log("STATUS CODE:", error?.status || "NULL");
}
run();
