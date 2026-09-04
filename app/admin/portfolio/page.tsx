'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminPortfolioManagement from '@/components/admin/portfolio/AdminPortfolioManagement';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';

export default function AdminPortfolioRoute() {
  const { isStaffLoggedIn, staffRole, authLoading } = useApp();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Authentication timeout safety guard (10s)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        setAuthTimedOut(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Authentication check (Real Supabase Session + role=admin)
  useEffect(() => {
    if (!authLoading && (!isStaffLoggedIn || staffRole !== 'ADMIN')) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isStaffLoggedIn, staffRole, authLoading]);

  if (authTimedOut && authLoading) {
    return (
      <div className="min-h-screen bg-[#0E0D0C] flex flex-col items-center justify-center font-prompt space-y-4 p-6 text-[#ECE4D3]">
        <span className="text-sm text-red-400">
          ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้ (Auth Resolution Timeout 10s)
        </span>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/staff/login';
          }}
          className="px-4 py-2 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] text-xs text-[#ECE4D3] rounded transition-colors"
        >
          กลับสู่หน้าเข้าสู่ระบบพนักงาน
        </button>
      </div>
    );
  }

  if (authLoading || !isStaffLoggedIn || staffRole !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[#0E0D0C] flex items-center justify-center font-prompt">
        <span className="text-sm text-[#A89F91] animate-pulse">
          กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt animate-fadeIn pb-16 md:pb-8">
      <AdminHeader />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8">
        <AdminPortfolioManagement />
      </main>

      <AdminMobileBottomNav />
    </div>
  );
}
