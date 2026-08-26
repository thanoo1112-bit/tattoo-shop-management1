import Link from 'next/link';

export default function ShopNotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 animate-in fade-in">
      <h2 className="text-2xl font-bold text-[#F5F5F5] mb-3">ไม่พบร้านนี้</h2>
      <p className="text-[#A3A3A3] max-w-sm leading-relaxed mb-8">
        ลิงก์จองอาจไม่ถูกต้อง<br />
        หรือร้านอาจปิดรับการจองชั่วคราว
      </p>
      <Link 
        href="/shop/157-tattoo"
        className="px-6 py-3 rounded-xl bg-[#121212] border border-[#262626] hover:bg-[#262626] text-[#F5F5F5] text-sm font-medium transition-colors active:scale-95"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
