import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://sftkthsgldvyorydznyz.supabase.co";
const supabaseKey = "sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function testPortfolioAnonUpload() {
  const filePath = "temp-shop-id/test-file.webp";
  const dummyBuffer = Buffer.from("dummy webp content");
  
  console.log("Trying to upload to portfolio-images bucket as anon...");
  const { data, error } = await supabase.storage
    .from("portfolio-images")
    .upload(filePath, dummyBuffer, {
      upsert: false,
      contentType: "image/webp"
    });
    
  if (error) {
    console.log("Expected error received:", error.message || error);
  } else {
    console.error("CRITICAL SECURITY VULNERABILITY: Anon was able to upload to portfolio-images!", data);
  }
}

testPortfolioAnonUpload().catch(console.error);
