'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import { createClient } from '@/lib/supabase/client';
import {
  readAll,
  subscribeRescheduleRequests,
  isRescheduleRequestUiEnabled,
} from '@/lib/reschedule/rescheduleRequestStore';
import {
  ShieldCheck,
  LogOut,
  Bell,
  User,
  Calendar,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  Users,
  CreditCard,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';

export default function AdminHeader() {
  const pathname = usePathname();
  const { staffRole, logoutStaff, estimateRequests, flashReservations } = useApp();

  // Category 2: Pending deposit slips from booking_payment_submissions
  const [pendingSlipCount, setPendingSlipCount] = useState<number>(0);

  // Category 3: Pending reschedule requests
  const [pendingRescheduleCount, setPendingRescheduleCount] = useState<number>(0);

  // 1. Group 1: New Requests (Custom requests + Flash reservations with status = 'PENDING')
  const newCustomRequestCount = (estimateRequests || []).filter(
    (e) => e.status === 'PENDING' && e.request_type !== 'DIRECT_BOOKING'
  ).length;

  const newFlashRequestCount = (flashReservations || []).filter(
    (r: any) => r.status === 'PENDING'
  ).length;

  const newRequestCount = newCustomRequestCount + newFlashRequestCount;

  // 2. Group 2: New Deposit Slips (booking_payment_submissions with status = 'PENDING')
  const fetchPendingSlipCount = useCallback(async () => {
    try {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('booking_payment_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (!error && typeof count === 'number') {
        setPendingSlipCount(count);
      }
    } catch (err) {
      console.error('Failed to fetch pending slip count in AdminHeader:', err);
    }
  }, []);

  useEffect(() => {
    fetchPendingSlipCount();

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.table === 'booking_payment_submissions') {
        fetchPendingSlipCount();
      }
    };

    const handleFocus = () => {
      fetchPendingSlipCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('admin:realtime', handleRealtime);
      window.addEventListener('focus', handleFocus);
      return () => {
        window.removeEventListener('admin:realtime', handleRealtime);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [fetchPendingSlipCount]);

  // 3. Group 3: New Reschedule Requests (rescheduleRequestStore with status = 'PENDING')
  useEffect(() => {
    const updateRescheduleCount = () => {
      if (!isRescheduleRequestUiEnabled()) {
        setPendingRescheduleCount(0);
        return;
      }
      try {
        const all = readAll();
        const pending = all.filter((r) => r.status === 'PENDING').length;
        setPendingRescheduleCount(pending);
      } catch (_) {
        setPendingRescheduleCount(0);
      }
    };

    updateRescheduleCount();
    const unsubscribe = subscribeRescheduleRequests(updateRescheduleCount);
    return () => unsubscribe();
  }, []);

  // Total unified notification count: Group 1 + Group 2 + Group 3
  const totalNotificationCount = newRequestCount + pendingSlipCount + pendingRescheduleCount;

  const navItems = [
    { name: 'ภาพรวม', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'คำขอ', href: '/admin/requests', icon: FileText },
    { name: 'ปฏิทิน', href: '/admin/calendar', icon: Calendar },
    { name: 'ลูกค้า', href: '/admin/customers', icon: Users },
    { name: 'ช่างสัก', href: '/admin/artists', icon: User },
    { name: 'ผลงาน', href: '/admin/portfolio', icon: ImageIcon },
    { name: 'ลาย Flash', href: '/admin/flash', icon: Sparkles },
    { name: 'การเงิน', href: '/admin/payments', icon: CreditCard },
  ];

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.href === '/admin/dashboard') {
      return pathname === '/admin/dashboard' || pathname === '/admin';
    }
    if (item.name === 'การเงิน') {
      return pathname.startsWith('/admin/payments') || pathname.startsWith('/admin/revenue');
    }
    return pathname.startsWith(item.href);
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP FIXED LEFT SIDEBAR (>=768px) */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-60 h-screen z-40 bg-[#0E0D0C] border-r border-[#4A443A]/60 flex-col justify-between font-prompt select-none">
        {/* Top: Brand Header & Notification */}
        <div className="p-5 border-b border-[#4A443A]/60 flex items-center justify-between shrink-0">
          <Link href="/admin/dashboard" className="flex items-center space-x-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/157-tattoo-logo.png" alt="157 TATTOO logo" className="h-8 w-auto object-contain shrink-0" />
            <span className="text-xl font-heading tracking-[0.1em] text-[#ECE4D3]">157</span>
            <span className="text-xl font-heading tracking-[0.1em] text-[#C12D2D]">TATTOO</span>
          </Link>
          <Link
            href="/admin/requests"
            className="relative text-[#A89F91] hover:text-studio-red-bright p-1.5 transition-colors"
            title="การแจ้งเตือน"
          >
            <Bell size={18} className={totalNotificationCount > 0 ? 'text-studio-red-bright' : 'text-[#A89F91]'} />
            {totalNotificationCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-[#C12D2D] text-[#ECE4D3] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#0E0D0C] animate-pulse">
                {totalNotificationCount}
              </span>
            )}
          </Link>
        </div>

        {/* Middle: Navigation Items */}
        <nav className="py-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 text-xs xl:text-sm transition-colors ${
                  active
                    ? 'border-l-4 border-studio-red-base text-[#ECE4D3] bg-[#171512] font-semibold'
                    : 'border-l-4 border-transparent text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/60 font-medium'
                }`}
              >
                <Icon size={18} className={active ? 'text-studio-red-bright' : 'text-[#ECE4D3]'} />
                <span>{item.name}</span>
                {item.name === 'คำขอ' && totalNotificationCount > 0 && (
                  <span className="ml-auto bg-[#C12D2D] text-[#ECE4D3] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {totalNotificationCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Admin Profile & Logout */}
        <div className="border-t border-[#4A443A]/60 p-4 space-y-3 shrink-0 bg-[#0E0D0C]">
          {/* Admin Profile Info */}
          <div className="flex items-center space-x-2.5 py-1 px-2">
            <div className="w-8 h-8 rounded-full bg-[#C12D2D]/15 border border-[#C12D2D]/30 flex items-center justify-center text-studio-red-bright shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#ECE4D3] truncate">
                {staffRole === 'ADMIN' ? 'เจ้าของร้าน (Admin)' : 'ช่างสักประจำร้าน'}
              </p>
              <p className="text-[10px] text-[#ECE4D3]">ผู้ดูแลระบบ</p>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={logoutStaff}
            className="w-full flex items-center space-x-2.5 text-xs text-[#ECE4D3] hover:text-studio-red-bright py-2 px-2 rounded hover:bg-[#C12D2D]/10 transition-colors font-medium text-left"
            title="ออกจากระบบ"
          >
            <LogOut size={16} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MOBILE TOP HEADER BAR (<768px) */}
      {/* ========================================================================= */}
      <header className="md:hidden sticky top-0 z-40 bg-[#171512]/95 backdrop-blur-md border-b border-[#4A443A] h-14 px-4 flex items-center justify-between font-prompt">
        <Link href="/admin/dashboard" className="flex items-center space-x-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/157-tattoo-logo.png" alt="157 TATTOO logo" className="h-7 w-auto object-contain shrink-0" />
          <span className="text-lg font-heading tracking-[0.1em] text-[#ECE4D3]">157</span>
          <span className="text-lg font-heading tracking-[0.1em] text-[#C12D2D]">TATTOO</span>
          <span className="text-[9px] bg-[#C12D2D]/15 text-studio-red-bright border border-[#C12D2D]/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">
            {staffRole || 'ADMIN'}
          </span>
        </Link>

        <div className="flex items-center space-x-3">
          <Link
            href="/admin/requests"
            className="relative text-[#A89F91] hover:text-studio-red-bright p-1.5"
            title="การแจ้งเตือน"
          >
            <Bell size={18} className={totalNotificationCount > 0 ? 'text-studio-red-bright' : 'text-[#A89F91]'} />
            {totalNotificationCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-[#C12D2D] text-[#ECE4D3] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#171512] animate-pulse">
                {totalNotificationCount}
              </span>
            )}
          </Link>

          <div className="flex items-center space-x-2 border-l border-[#4A443A] pl-3">
            <button
              onClick={logoutStaff}
              className="text-[#A89F91] hover:text-studio-red-bright p-1.5 flex items-center space-x-1"
              title="ออกจากระบบ"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
