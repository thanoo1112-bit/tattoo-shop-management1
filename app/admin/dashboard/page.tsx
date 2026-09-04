'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/components/AppContext';
import AdminHeader from '@/components/admin/AdminHeader';
import KPICard from '@/components/admin/KPICard';
import ArtistTimeline from '@/components/admin/ArtistTimeline';
import EstimateRequestQueue from '@/components/admin/EstimateRequestQueue';
import BookingRequestQueue from '@/components/admin/BookingRequestQueue';
import DepositVerificationQueue from '@/components/admin/DepositVerificationQueue';
import { Calendar, User, Clock, ClipboardList, DollarSign, ShieldCheck, Sparkles } from 'lucide-react';

export default function AdminDashboardPage() {
  const { isStaffLoggedIn, staffRole, authLoading, bookings, estimateRequests, bookingPayments, artists } = useApp();

  const [authTimedOut, setAuthTimedOut] = React.useState(false);

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

  console.log('[ADMIN-AUTH 12] Admin guard rendered dashboard');

  // Calculate Metrics
  const activeStudioArtists = artists.filter(a => a.is_active === true);
  const confirmedToday = bookings.filter(b => b.status === 'CONFIRMED').length;
  const pendingRequests = bookings.filter(b => b.status === 'PENDING').length + estimateRequests.filter(e => e.status === 'PENDING').length;
  const pendingDeposits = bookingPayments.filter(p => p.paymentType === 'DEPOSIT' && p.status === 'SUBMITTED').length;
  const tattooingCount = activeStudioArtists.filter(a => a.status === 'Tattooing' || a.status === 'TATTOOING').length;

  const verifiedDepositTotal = bookingPayments
    .filter(p => p.paymentType === 'DEPOSIT' && p.status === 'VERIFIED')
    .reduce((sum, p) => sum + p.amount, 0);

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

        {/* 1. TOP: 5 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <KPICard
            title="คิวคอนเฟิร์มวันนี้"
            value={`${confirmedToday} คิว`}
            icon={Calendar}
            change="นัดหมายวันนี้"
            changeType="neutral"
          />
          <KPICard
            title="คำขอรอดำเนินการ"
            value={`${pendingRequests} คำขอ`}
            icon={ClipboardList}
            change="คำขอประเมิน + จองใหม่"
            changeType={pendingRequests > 0 ? 'positive' : 'neutral'}
          />
          <KPICard
            title="รอตรวจสอบมัดจำ"
            value={`${pendingDeposits} รายการ`}
            icon={ShieldCheck}
            change="สลิปโอนเงินรอตรวจ"
            changeType={pendingDeposits > 0 ? 'positive' : 'neutral'}
          />
          <KPICard
            title="ช่างกำลังทำงาน"
            value={`${tattooingCount} คน`}
            icon={Clock}
            change={`จากช่างทั้งหมด ${activeStudioArtists.length} คน`}
            changeType="neutral"
          />
          <div className="col-span-2 sm:col-span-1">
            <KPICard
              title="มัดจำสะสมที่ตรวจแล้ว"
              value={`฿${verifiedDepositTotal.toLocaleString()}`}
              icon={DollarSign}
              change="เข้าบัญชีร้านแล้ว"
              changeType="positive"
            />
          </div>
        </div>

        {/* 2. MIDDLE: Master Artist Gantt Timeline */}
        <div className="space-y-3">
          <ArtistTimeline />
        </div>

        {/* 3. BOTTOM: Management Queues */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Slip Verification Queue */}
          <div className="lg:col-span-5 space-y-4">
            <DepositVerificationQueue />
          </div>

          {/* Booking & Estimate Requests Split */}
          <div className="lg:col-span-7 space-y-6">
            <BookingRequestQueue />
            <EstimateRequestQueue />
          </div>
        </div>

      </main>
    </div>
  );
}
