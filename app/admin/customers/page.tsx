'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCustomerArchive from '@/components/admin/AdminCustomerArchive';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';

export default function AdminCustomersPage() {
  const { isStaffLoggedIn, staffRole, authLoading } = useApp();

  useEffect(() => {
    if (!authLoading && (!isStaffLoggedIn || staffRole !== 'ADMIN')) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isStaffLoggedIn, staffRole, authLoading]);

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
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt animate-fadeIn">
      {/* Top Admin Header Navigation */}
      <AdminHeader />

      {/* Main Customers Archive Container */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8">
        <AdminCustomerArchive />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <AdminMobileBottomNav />
    </div>
  );
}
