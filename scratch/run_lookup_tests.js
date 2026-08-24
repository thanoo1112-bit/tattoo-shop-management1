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
  const publicToken = "60dfb46c-f6bc-4e32-837a-5b7224143436";
  const expectedTrackingCode = "LLHF-3WCG-FF";

  console.log("Starting get_public_booking_tracking_code RPC tests using anon key...");

  try {
    // A. Correct shop + public_token
    const { data: resA, error: errA } = await supabase.rpc("get_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_public_token: publicToken
    });
    const testAPass = !errA && resA === expectedTrackingCode;
    console.log("TEST A (Correct Input) - Expected:", expectedTrackingCode, "Got:", resA, "Error:", errA, "Result:", testAPass ? "PASS" : "FAIL");

    // B. Nonexistent public_token
    const { data: resB, error: errB } = await supabase.rpc("get_public_booking_tracking_code", {
      p_shop_slug: shopSlug,
      p_public_token: "00000000-0000-0000-0000-000000000000"
    });
    const testBPass = !errB && resB === null;
    console.log("TEST B (Nonexistent Token) - Expected: null, Got:", resB, "Error:", errB, "Result:", testBPass ? "PASS" : "FAIL");

    // C. Wrong shop slug
    const { data: resC, error: errC } = await supabase.rpc("get_public_booking_tracking_code", {
      p_shop_slug: "nonexistent-shop-slug",
      p_public_token: publicToken
    });
    const testCPass = !errC && resC === null;
    console.log("TEST C (Wrong Shop) - Expected: null, Got:", resC, "Error:", errC, "Result:", testCPass ? "PASS" : "FAIL");

  } catch (e) {
    console.error("Test execution failed:", e);
  }
}

run();
