/**
 * 157 TATTOO - Configuration File
 * 
 * หากต้องการเชื่อมต่อกับฐานข้อมูล Supabase:
 * 1. ใส่ค่า SUPABASE_URL และ SUPABASE_ANON_KEY ที่ได้รับจาก Dashboard ของ Supabase
 * 2. หากยังไม่มีระบบจะบันทึกข้อมูลและดึงข้อมูลผ่าน LocalStorage โดยอัตโนมัติ (ช่วยให้ทดสอบหน้าร้านได้ทันที!)
 */

const SUPABASE_URL = ""; // ป้อน Supabase Project URL ที่นี่ เช่น "https://xxxx.supabase.co"
const SUPABASE_ANON_KEY = ""; // ป้อน Supabase Anon API Key ที่นี่
const GEMINI_API_KEY = ""; // ป้อน Google AI Studio API Key ที่นี่ (สำหรับใช้ระบบวิเคราะห์ลายสักและดูแลแผลสักด้วย AI)


// เริ่มต้นใช้งาน Supabase Client (หากกำหนดค่าไว้ครบถ้วน)
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize Supabase:", error);
  }
} else {
  console.log("Supabase credentials not set. Running in Local Storage Mode (Offline/Sandbox).");
}
