'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminMobileBottomNav from '@/components/admin/AdminMobileBottomNav';
import KPICard from '@/components/admin/KPICard';
import ArtistTimeline from '@/components/admin/ArtistTimeline';
import UnifiedActionQueue from '@/components/admin/UnifiedActionQueue';
import { Calendar, User, DollarSign, FileText, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import Link from 'next/link';

// Helper for Bangkok Timezone Date Conversion (Asia/Bangkok = UTC+07:00)
function toBangkokDate(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getBangkokToday(): string {
  return toBangkokDate(new Date());
}

function getBangkokCurrentMonth(): string {
  return getBangkokToday().slice(0, 7);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminDashboardPage() {
  const { isStaffLoggedIn, staffRole, authLoading } = useApp();

  const [authTimedOut, setAuthTimedOut] = useState(false);

  // 4 Primary Operational Dashboard KPI State
  const [monthRevenue, setMonthRevenue] = useState<number>(0);
  const [monthTransactionCount, setMonthTransactionCount] = useState<number>(0);
  const [todaySessionsCount, setTodaySessionsCount] = useState<number>(0);
  const [workingArtistsCount, setWorkingArtistsCount] = useState<number>(0);
  const [totalArtistsCount, setTotalArtistsCount] = useState<number>(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
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
      const todayBangkok = getBangkokToday();
      const currentMonthBangkok = getBangkokCurrentMonth();

      // 1. Card 1: รายรับเดือนนี้ (booking_payments with status = 'RECORDED' in current month Bangkok time)
      const { data: paymentsData, error: payErr } = await supabase
        .from('booking_payments')
        .select('id, amount, paid_at, created_at, status')
        .eq('status', 'RECORDED');

      if (payErr) console.warn('[Dashboard] Revenue fetch error:', payErr);

      let monthRevenueSum = 0;
      let monthTxCount = 0;

      (paymentsData || []).forEach((p: any) => {
        const pDate = p.paid_at || p.created_at;
        const bkkDate = toBangkokDate(pDate);
        if (bkkDate && bkkDate.startsWith(currentMonthBangkok)) {
          monthRevenueSum += Number(p.amount) || 0;
          monthTxCount += 1;
        }
      });

      setMonthRevenue(monthRevenueSum);
      setMonthTransactionCount(monthTxCount);

      // 2. Card 2 & Card 3: คิวนัดหมายวันนี้ & ช่างสักปฏิบัติงาน
      // Fetch booking_sessions for today in Bangkok, excluding status = CANCELLED
      const { data: sessionsData, error: sessErr } = await supabase
        .from('booking_sessions')
        .select(`
          id,
          booking_id,
          start_at,
          status,
          bookings (
            id,
            artist_id,
            status
          )
        `)
        .neq('status', 'CANCELLED');

      if (sessErr) console.warn('[Dashboard] Sessions fetch error:', sessErr);

      // Filter sessions that occur today in Bangkok time and associated booking is not CANCELLED
      const todaySessions = (sessionsData || []).filter((s: any) => {
        if (!s.start_at) return false;
        const sBkkDate = toBangkokDate(s.start_at);
        if (sBkkDate !== todayBangkok) return false;

        // Exclude if associated booking is CANCELLED
        const bookingStatus = String(s.bookings?.status || '').toUpperCase();
        if (bookingStatus === 'CANCELLED') return false;

        return true;
      });

      setTodaySessionsCount(todaySessions.length);

      // Count unique assigned artists for today's active sessions
      const uniqueArtistIds = new Set<string>();
      todaySessions.forEach((s: any) => {
        const artistId = s.bookings?.artist_id;
        if (artistId) {
          uniqueArtistIds.add(artistId);
        }
      });

      setWorkingArtistsCount(uniqueArtistIds.size);

      // Fetch total artists in studio
      const { data: artistsData, error: artErr } = await supabase
        .from('artists')
        .select('id, is_active');

      if (artErr) console.warn('[Dashboard] Artists fetch error:', artErr);

      const activeArtists = (artistsData || []).filter((a: any) => a.is_active !== false);
      setTotalArtistsCount(activeArtists.length || (artistsData || []).length || 0);

      // 3. Card 4: คำขอที่รอดำเนินการ (estimate_requests and flash_reservations with status = 'PENDING')
      const { data: estData, error: estErr } = await supabase
        .from('estimate_requests')
        .select('id, status, request_type')
        .eq('status', 'PENDING');

      if (estErr) console.warn('[Dashboard] Pending estimate requests fetch error:', estErr);

      const { data: flashData, error: flashErr } = await supabase
        .from('flash_reservations')
        .select('id, status')
        .eq('status', 'PENDING');

      if (flashErr) console.warn('[Dashboard] Pending flash reservations fetch error:', flashErr);

      const customPending = (estData || []).filter((e: any) => e.request_type !== 'DIRECT_BOOKING').length;
      const flashPending = (flashData || []).length;

      setPendingRequestsCount(customPending + flashPending);

    } catch (err) {
      console.error('[Dashboard] Error fetching dashboard live metrics:', err);
    } finally {
      setIsMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStaffLoggedIn && staffRole === 'ADMIN') {
      fetchDashboardMetrics();
    }

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['booking_payments', 'booking_sessions', 'bookings', 'estimate_requests', 'flash_reservations'].includes(detail?.table)) {
        fetchDashboardMetrics();
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
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
          <Link href="/admin/requests?filter=PENDING" className="block transition-transform hover:scale-[1.01]">
            <KPICard
              title="คำขอที่รอดำเนินการ"
              value={isMetricsLoading ? '...' : `${pendingRequestsCount} คำขอ`}
              icon={FileText}
              change={isMetricsLoading ? 'กำลังโหลด...' : 'รอตรวจสอบจากร้าน'}
              changeType={pendingRequestsCount > 0 ? 'positive' : 'neutral'}
            />
          </Link>
          <KPICard
            title="คิวนัดหมายวันนี้"
            value={isMetricsLoading ? '...' : `${todaySessionsCount} คิว`}
            icon={Calendar}
            change={isMetricsLoading ? 'กำลังโหลด...' : 'รอบนัดหมายวันนี้'}
            changeType="neutral"
          />
          <KPICard
            title="ช่างสักปฏิบัติงาน"
            value={isMetricsLoading ? '...' : `${workingArtistsCount}/${totalArtistsCount} คน`}
            icon={User}
            change={isMetricsLoading ? 'กำลังโหลด...' : 'ช่างที่มีคิววันนี้ / ช่างทั้งหมด'}
            changeType={workingArtistsCount > 0 ? 'positive' : 'neutral'}
          />
          <KPICard
            title="รายรับเดือนนี้"
            value={isMetricsLoading ? '...' : formatCurrency(monthRevenue)}
            icon={DollarSign}
            change={isMetricsLoading ? 'กำลังโหลด...' : `${monthTransactionCount} รายการรับเงินจริง`}
            changeType={monthRevenue > 0 ? 'positive' : 'neutral'}
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
