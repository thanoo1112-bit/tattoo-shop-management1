'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminArtistManagement from '@/components/admin/AdminArtistManagement';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';

export default function AdminArtistsPage() {
  const { user, profile, authLoading } = useApp();

  const isVerifiedAdmin = user && profile?.role === 'admin' && profile?.is_active !== false;

  useEffect(() => {
    if (!authLoading && !isVerifiedAdmin) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [authLoading, isVerifiedAdmin]);

  if (authLoading || !isVerifiedAdmin) {
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

      {/* Main Artists Management Container */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8">
        <AdminArtistManagement />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <AdminMobileBottomNav />
    </div>
  );
}
