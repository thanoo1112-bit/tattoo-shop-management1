-- 157 TATTOO - Supabase Database Schema Script
-- ก๊อปปี้คำสั่ง SQL ด้านล่างไปวางรันใน Supabase SQL Editor เพื่อเตรียมฐานข้อมูล

-- 1. ตารางการจองคิว (Bookings)
CREATE TABLE bookings (
    id VARCHAR(50) PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    booking_date DATE NOT NULL,
    booking_time VARCHAR(20) NOT NULL,
    artist_name VARCHAR(100) NOT NULL,
    tattoo_style VARCHAR(255),
    reference_image TEXT,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'รอยืนยัน',
    price NUMERIC DEFAULT 0,
    deposit NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- เปิดการใช้งาน Row Level Security (RLS) เพื่อความปลอดภัย หรือปิดไว้ชั่วคราวในการพัฒนาเพื่อความสะดวก
-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- สร้าง Policy อนุญาตให้ลูกค้าทุกคนบันทึกและพนักงานอ่านเขียนได้
-- CREATE POLICY "Allow public insert" ON bookings FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow public select and modify" ON bookings FOR ALL USING (true);
