"use client";

import { useRouter } from 'next/navigation';

export function BookingErrorState() {
  const router = useRouter();
  
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-[#121212] flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#A3A3A3]">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-[#F5F5F5] mb-2">ไม่สามารถโหลดข้อมูลการจองได้</h2>
      <p className="text-[#737373] max-w-sm mb-8">กรุณาลองใหม่อีกครั้ง</p>
      
      <button 
        onClick={() => router.refresh()}
        className="px-6 py-3 rounded-xl bg-[#F5F5F5] hover:bg-white text-neutral-950 text-sm font-medium transition-colors active:scale-95"
      >
        ลองใหม่
      </button>
    </div>
  );
}
