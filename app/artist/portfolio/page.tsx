'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useApp } from '@/components/AppContext';
import ArtistHeader from '@/components/artist/ArtistHeader';
import ArtistMobileNav from '@/components/artist/ArtistMobileNav';
import ArtistPortfolioManagement from '@/components/artist/ArtistPortfolioManagement';
import { Loader2 } from 'lucide-react';

function ArtistPortfolioContent() {
  const { isStaffLoggedIn, staffRole, staffArtistId, authLoading } = useApp();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && staffArtistId))
  );

  // Authentication timeout guard (10s)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        setAuthTimedOut(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Route Protection
  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isAuthorized, authLoading]);

  if (authTimedOut && authLoading) {
    return (
      <div className="min-h-screen bg-studio-main flex flex-col items-center justify-center font-prompt space-y-4 p-6 text-studio-primary">
        <span className="text-xs text-red-400">
          ไม่สามารถตรวจสอบสิทธิ์การเข้าใช้งานได้ (Auth Resolution Timeout 10s)
        </span>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/staff/login';
          }}
          className="px-4 py-2 bg-studio-sec border border-studio-border hover:border-studio-red/50 text-xs text-studio-primary rounded transition-colors"
        >
          กลับสู่หน้าเข้าสู่ระบบพนักงาน
        </button>
      </div>
    );
  }

  if (authLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-studio-main flex flex-col items-center justify-center font-prompt space-y-2">
        <Loader2 className="w-6 h-6 text-studio-red animate-spin" />
        <span className="text-xs text-studio-secondary animate-pulse">
          กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col pb-20 md:pb-10 animate-fadeIn">
      <ArtistHeader />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        <ArtistPortfolioManagement />
      </main>

      <ArtistMobileNav />
    </div>
  );
}

export default function ArtistPortfolioPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-studio-main flex flex-col items-center justify-center font-prompt space-y-2">
          <Loader2 className="w-6 h-6 text-studio-red animate-spin" />
          <span className="text-xs text-studio-secondary animate-pulse">กำลังโหลด...</span>
        </div>
      }
    >
      <ArtistPortfolioContent />
    </Suspense>
  );
}
