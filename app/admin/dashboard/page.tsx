'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';
import KPICard from '@/components/admin/KPICard';
import ArtistTimeline from '@/components/admin/ArtistTimeline';
import UnifiedActionQueue from '@/components/admin/UnifiedActionQueue';
import { Calendar, User, Clock, ClipboardList, DollarSign, ShieldCheck, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Helper for Bangkok Date YYYY-MM-DD
function getBangkokTodayDateString() {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export default function AdminDashboardPage() {
  const { isStaffLoggedIn, staffRole, authLoading } = useApp();

  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Live Metrics State
  const [confirmedTodayCount, setConfirmedTodayCount] = useState<number>(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState<number>(0);
  const [tattooingCount, setTattooingCount] = useState<number>(0);
  const [totalActiveArtistsCount, setTotalActiveArtistsCount] = useState<number>(0);
  const [verifiedDepositTotal, setVerifiedDepositTotal] = useState<number>(0);
  const [isMetricsLoading, setIsMetricsLoading] = useState<boolean>(true);

  // Authentication timeout safety guard (10s)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        setAuthTimedOut(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Authentication check
  useEffect(() => {
    if (!authLoading && (!isStaffLoggedIn || staffRole !== 'ADMIN')) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isStaffLoggedIn, staffRole, authLoading]);

  // Live Dashboard Metrics Fetcher
  const fetchDashboardMetrics = useCallback(async () => {
    setIsMetricsLoading(true);
    try {
      const supabase = createClient();
      const bangkokTodayStr = getBangkokTodayDateString();

      // 1. KPI: คิวคอนเฟิร์มวันนี้ (Today's actual appointment sessions in Asia/Bangkok)
      const { data: rawSessions } = await supabase
        .from('booking_sessions')
        .select('id, start_at, status, booking_id, bookings(id, status)')
        .neq('status', 'CANCELLED');

      let todaySessionsCount = 0;
      (rawSessions || []).forEach((ses: any) => {
        const b = Array.isArray(ses.bookings) ? ses.bookings[0] : ses.bookings;
        if (b && !['CANCELLED', 'REJECTED'].includes(b.status) && ses.start_at) {
          try {
            const sesBangkokDate = new Date(ses.start_at).toLocaleDateString('en-CA', {
              timeZone: 'Asia/Bangkok',
            });
            if (sesBangkokDate === bangkokTodayStr) {
              todaySessionsCount += 1;
            }
          } catch (_) {}
        }
      });
      setConfirmedTodayCount(todaySessionsCount);

      // 2. KPI: คำขอรอดำเนินการ (Live estimate_requests with status = 'PENDING')
      const { count: reqCount } = await supabase
        .from('estimate_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      setPendingRequestsCount(reqCount || 0);

      // 3. KPI: รอตรวจสอบมัดจำ / สลิปรอตรวจ (Live booking_payment_submissions with status = 'PENDING')
      const { count: slipCount } = await supabase
        .from('booking_payment_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      setPendingSubmissionsCount(slipCount || 0);

      // 4. KPI: ช่างกำลังทำงาน (Distinct artists with an active IN_PROGRESS session)
      const { data: artistList } = await supabase
        .from('artists')
        .select('id, is_active');
      
      const activeArtists = (artistList || []).filter((a: any) => a.is_active === true);
      setTotalActiveArtistsCount(activeArtists.length);

      // Fetch live booking_sessions with status IN_PROGRESS joined with bookings
      const { data: inProgressSessions } = await supabase
        .from('booking_sessions')
        .select('id, artist_id, booking_id, bookings(id, artist_id, status)')
        .eq('status', 'IN_PROGRESS');

      const workingArtistIds = new Set<string>();

      (inProgressSessions || []).forEach((ses: any) => {
        const b = Array.isArray(ses.bookings) ? ses.bookings[0] : ses.bookings;
        if (b && !['CANCELLED', 'REJECTED'].includes(b.status)) {
          const resolvedArtistId = ses.artist_id || b.artist_id;
          if (resolvedArtistId) {
            workingArtistIds.add(resolvedArtistId);
          }
        }
      });

      setTattooingCount(workingArtistIds.size);

      // 5. KPI: มัดจำสะสมที่ตรวจแล้ว (Sum of approved DEPOSIT payments in booking_payments)
      const { data: depositPayments } = await supabase
        .from('booking_payments')
        .select('amount')
        .eq('payment_type', 'DEPOSIT')
        .eq('status', 'RECORDED');
      
      const depositTotal = (depositPayments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      setVerifiedDepositTotal(depositTotal);

    } catch (err) {
      console.error('Error fetching dashboard live metrics:', err);
    } finally {
      setIsMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStaffLoggedIn && staffRole === 'ADMIN') {
      fetchDashboardMetrics();
    }
  }, [isStaffLoggedIn, staffRole, fetchDashboardMetrics]);

  if (authTimedOut && authLoading) {
    return (
      <div className="min-h-screen bg-studio-main flex flex-col items-center justify-center font-prompt space-y-4 p-6">
        <span className="text-sm text-red-400">ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้ (Auth Resolution Timeout 10s)</span>
        <button
          onClick={() => { if (typeof window !== 'undefined') window.location.href = '/staff/login'; }}
          className="px-4 py-2 bg-studio-card border border-studio-border hover:border-studio-red text-xs text-studio-primary rounded transition-colors"
        >
          กลับสู่หน้าเข้าสู่ระบบพนักงาน
        </button>
      </div>
    );
  }

  if (authLoading || !isStaffLoggedIn || staffRole !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt">
        <span className="text-sm text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-studio-main pb-16 text-studio-primary animate-fadeIn font-prompt">
      {/* Admin Top Header Navigation */}
      <AdminHeader />

      {/* Main Container */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        
        {/* Title */}
        <div className="border-b border-studio-border pb-4 flex justify-between items-end">
          <div>
            <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-2.5 py-0.5 sm:px-3 sm:py-1 rounded text-studio-paper text-[10px] uppercase font-heading tracking-widest mb-1">
              <Sparkles size={12} className="text-studio-red" />
              <span>Studio Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-studio-primary">
              157 TATTOO ADMIN DASHBOARD
            </h1>
            <p className="text-xs text-studio-secondary mt-1 font-light">
              ภาพรวมสตูดิโอ คิวงาน ช่างสัก และการตรวจสอบธุรกรรมเงินมัดจำ
            </p>
          </div>
          <span className="text-xs text-studio-muted hidden sm:inline font-heading tracking-wider">
            157 TATTOO STUDIO • BANGKOK
          </span>
        </div>

        {/* 1. TOP: 3 Primary Operational KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <KPICard
            title="คิววันนี้"
            value={`${isMetricsLoading ? '...' : confirmedTodayCount} คิว`}
            icon={Calendar}
            change="นัดหมายวันนี้"
            changeType="neutral"
          />
          <KPICard
            title="คำขอรอดำเนินการ"
            value={`${isMetricsLoading ? '...' : pendingRequestsCount} คำขอ`}
            icon={ClipboardList}
            change="คำขอจองใหม่"
            changeType={pendingRequestsCount > 0 ? 'positive' : 'neutral'}
          />
          <KPICard
            title="สลิปรอตรวจ"
            value={`${isMetricsLoading ? '...' : pendingSubmissionsCount} รายการ`}
            icon={ShieldCheck}
            change="สลิปโอนเงินรอตรวจ"
            changeType={pendingSubmissionsCount > 0 ? 'positive' : 'neutral'}
          />
        </div>

        {/* 2. MIDDLE: Master Artist Gantt Timeline */}
        <div className="space-y-3">
          <ArtistTimeline />
        </div>

        {/* 3. BOTTOM: Unified Action Queue */}
        <div className="w-full">
          <UnifiedActionQueue />
        </div>

      </main>

      {/* Mobile Bottom Navigation Bar */}
      <AdminMobileBottomNav />
    </div>
  );
}
