'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';
import KPICard from '@/components/admin/KPICard';
import ArtistTimeline from '@/components/admin/ArtistTimeline';
import UnifiedActionQueue from '@/components/admin/UnifiedActionQueue';
import { Calendar, User, Clock, Inbox, ClipboardCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Helper for Bangkok Date ISO Boundaries
function getBangkokTodayISO() {
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
  const todayStr = `${year}-${month}-${day}`;

  const startTodayISO = new Date(`${todayStr}T00:00:00+07:00`).toISOString();
  const endTodayISO = new Date(`${todayStr}T23:59:59.999+07:00`).toISOString();

  return { startTodayISO, endTodayISO };
}

export default function AdminDashboardPage() {
  const { isStaffLoggedIn, staffRole, authLoading } = useApp();

  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Live 4 Operational Dashboard KPI State
  const [todaySessionsCount, setTodaySessionsCount] = useState<number>(0);
  const [upcomingSessionsCount, setUpcomingSessionsCount] = useState<number>(0);
  const [awaitingEvaluationCount, setAwaitingEvaluationCount] = useState<number>(0);
  const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState<number>(0);
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
      const { startTodayISO, endTodayISO } = getBangkokTodayISO();

      // 1. KPI: คิววันนี้ (booking_sessions with start_at today in Bangkok, excluding CANCELLED)
      const { count: todayQueue } = await supabase
        .from('booking_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('start_at', startTodayISO)
        .lte('start_at', endTodayISO)
        .neq('status', 'CANCELLED');
      setTodaySessionsCount(todayQueue || 0);

      // 2. KPI: คิวที่จะมาถึง (booking_sessions with start_at in future after today in Bangkok, excluding COMPLETED, CANCELLED)
      const { count: upcomingQueue } = await supabase
        .from('booking_sessions')
        .select('*', { count: 'exact', head: true })
        .gt('start_at', endTodayISO)
        .not('status', 'in', '("COMPLETED","CANCELLED")');
      setUpcomingSessionsCount(upcomingQueue || 0);

      // 3. KPI: รอช่างประเมิน (estimate_requests with status = 'PENDING' and request_type = 'ESTIMATE')
      const { count: awaitEval } = await supabase
        .from('estimate_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING')
        .neq('request_type', 'DIRECT_BOOKING');
      setAwaitingEvaluationCount(awaitEval || 0);

      // 4. KPI: สลิปรอตรวจ (booking_payment_submissions with status = 'PENDING')
      const { count: slipCount } = await supabase
        .from('booking_payment_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      setPendingSubmissionsCount(slipCount || 0);

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

        {/* 1. TOP: 4 Primary Operational Dashboard KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            title="คิววันนี้"
            value={`${isMetricsLoading ? '...' : todaySessionsCount} คิว`}
            icon={Calendar}
            change="คิวงานสักที่มีในวันนี้"
            changeType="neutral"
          />
          <KPICard
            title="คิวที่จะมาถึง"
            value={`${isMetricsLoading ? '...' : upcomingSessionsCount} คิว`}
            icon={Clock}
            change="คิวงานในอนาคตที่รอดำเนินการ"
            changeType="neutral"
          />
          <KPICard
            title="รอช่างประเมิน"
            value={`${isMetricsLoading ? '...' : awaitingEvaluationCount} รายการ`}
            icon={ClipboardCheck}
            change="คำขอที่รอช่างกำหนดราคา/รายละเอียด"
            changeType={awaitingEvaluationCount > 0 ? 'positive' : 'neutral'}
          />
          <KPICard
            title="สลิปรอตรวจ"
            value={`${isMetricsLoading ? '...' : pendingSubmissionsCount} รายการ`}
            icon={ShieldCheck}
            change="หลักฐานการชำระที่รอตรวจสอบ"
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
