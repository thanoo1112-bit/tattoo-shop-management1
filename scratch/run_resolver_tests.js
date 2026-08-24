global.WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envFilePath = path.resolve(__dirname, "../.env.local");
const envFile = fs.readFileSync(envFilePath, "utf8");
const env = {};
envFile.split("\n").forEach(line => {
  const [key, ...value] = line.split("=");
  if (key && value.length > 0) {
    env[key.trim()] = value.join("=").trim().replace(/['"]/g, "");
  }
});

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

async function run() {
  const shopSlug = "157-tattoo";
  const trackingCode = "LLHF-3WCG-FF";
  const publicToken = "60dfb46c-f6bc-4e32-837a-5b7224143436";

  console.log("Starting RPC tests using anon key and WebSocket support...");

  try {
    // A. Exact tracking code
    const { data: resA, error: errA } = await supabase.rpc("resolve_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_tracking_code: trackingCode
    });
    console.log("TEST A (Exact Code) - Expected:", publicToken, "Got:", resA, "Error:", errA);

    // B. Lowercase tracking code
    const { data: resB, error: errB } = await supabase.rpc("resolve_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_tracking_code: trackingCode.toLowerCase()
    });
    console.log("TEST B (Lowercase) - Expected:", publicToken, "Got:", resB, "Error:", errB);

    // C. Surrounding spaces
    const { data: resC, error: errC } = await supabase.rpc("resolve_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_tracking_code: `  ${trackingCode}  `
    });
    console.log("TEST C (Whitespace) - Expected:", publicToken, "Got:", resC, "Error:", errC);

    // D. Nonexistent valid-format code
    const { data: resD, error: errD } = await supabase.rpc("resolve_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_tracking_code: "AAAA-AAAA-AA"
    });
    console.log("TEST D (Nonexistent) - Expected: null, Got:", resD, "Error:", errD);

  } catch (e) {
    console.error("Test execution failed:", e);
  }
}

run();
