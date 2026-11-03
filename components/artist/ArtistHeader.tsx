'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { createClient } from '@/lib/supabase/client';
import {
  readAll,
  subscribeRescheduleRequests,
  isRescheduleRequestUiEnabled,
  normalizeBookingUuid,
} from '@/lib/reschedule/rescheduleRequestStore';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  DollarSign, 
  LogOut, 
  User as UserIcon, 
  Sparkles, 
  Image as ImageIcon,
  ChevronRight,
  Store,
  Inbox,
  Clock,
  Bell
} from 'lucide-react';

export default function ArtistHeader() {
  const pathname = usePathname();
  const { staffArtistId, staffArtistRecord, profile, logoutStaff } = useApp();

  const [newRequestCount, setNewRequestCount] = useState<number>(0);
  const [newDepositSlipCount, setNewDepositSlipCount] = useState<number>(0);
  const [newRescheduleRequestCount, setNewRescheduleRequestCount] = useState<number>(0);

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';
  const artistNickname = staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : '';

  // Fetch all 3 notification counts scoped strictly to the logged-in staffArtistId
  const fetchCounts = useCallback(async () => {
    if (!staffArtistId) {
      setNewRequestCount(0);
      setNewDepositSlipCount(0);
      setNewRescheduleRequestCount(0);
      return;
    }

    const supabase = createClient();

    try {
      // 1. Group 1: New Custom Requests for this artist
      const { count: customCount } = await supabase
        .from('estimate_requests')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', staffArtistId)
        .eq('status', 'PENDING')
        .neq('request_type', 'DIRECT_BOOKING');

      // 1b. Group 1: New Flash Requests for this artist
      let flashCount = 0;
      try {
        const { data: flashData, error: fErr } = await supabase
          .rpc('artist_get_flash_reservations', { p_artist_id: staffArtistId });
        if (!fErr && flashData) {
          flashCount = flashData.filter((r: any) => r.status === 'PENDING').length;
        }
      } catch (_) {}

      setNewRequestCount((customCount || 0) + flashCount);

      // 2. Group 2: New Deposit Slips for bookings belonging to this artist
      const { data: bData } = await supabase
        .from('bookings')
        .select('id')
        .eq('artist_id', staffArtistId);

      const bIds = (bData || []).map((b: any) => b.id);
      const bIdsSet = new Set(bIds.map((id: string) => normalizeBookingUuid(id)));

      if (bIds.length > 0) {
        const { count: slipCount } = await supabase
          .from('booking_payment_submissions')
          .select('id', { count: 'exact', head: true })
          .in('booking_id', bIds)
          .eq('status', 'PENDING');
        setNewDepositSlipCount(slipCount || 0);
      } else {
        setNewDepositSlipCount(0);
      }

      // 3. Group 3: New Reschedule Requests for bookings belonging to this artist
      if (!isRescheduleRequestUiEnabled()) {
        setNewRescheduleRequestCount(0);
      } else {
        const all = readAll();
        const pendingReschedule = all.filter(
          (r) =>
            r.status === 'PENDING' &&
            (r.artist_id === staffArtistId || (r.booking_id && bIdsSet.has(normalizeBookingUuid(r.booking_id))))
        ).length;
        setNewRescheduleRequestCount(pendingReschedule);
      }
    } catch (err) {
      console.error('[ArtistHeader] Error fetching notification counts:', err);
    }
  }, [staffArtistId]);

  useEffect(() => {
    fetchCounts();

    const handleRealtime = () => {
      fetchCounts();
    };

    const handleFocus = () => {
      fetchCounts();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('artist:realtime', handleRealtime);
      window.addEventListener('focus', handleFocus);
      const unsubscribeReschedule = subscribeRescheduleRequests(fetchCounts);

      return () => {
        window.removeEventListener('artist:realtime', handleRealtime);
        window.removeEventListener('focus', handleFocus);
        unsubscribeReschedule();
      };
    }
  }, [fetchCounts]);

  const totalNotificationCount = newRequestCount + newDepositSlipCount + newRescheduleRequestCount;

  const navGroups = [
    {
      title: 'งานของฉัน',
      items: [
        { href: '/artist/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
        { href: '/artist/requests', label: 'คำขอ', icon: Inbox },
        { href: '/artist/calendar', label: 'คิวงานและปฏิทิน', icon: Calendar },
        { href: '/artist/customers', label: 'ลูกค้าของฉัน', icon: Users },
      ],
    },
    {
      title: 'จัดการผลงาน',
      items: [
        { href: '/artist/portfolio', label: 'ผลงาน', icon: ImageIcon },
        { href: '/artist/flash', label: 'ลาย Flash', icon: Sparkles },
      ],
    },
    {
      title: 'รายงาน',
      items: [
        { href: '/artist/revenue', label: 'รายได้', icon: DollarSign },
      ],
    },
  ];

  return (
    <>
      {/* ========================================================================= */}
      {/* DESKTOP SIDEBAR (md:flex fixed inset-y-0 left-0 w-64) */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 z-40 bg-studio-card/95 border-r border-studio-border backdrop-blur-md font-prompt p-3.5 select-none">
        {/* TOP BRANDING SECTION */}
        <div className="pb-2.5 border-b border-studio-border/40 mb-2 px-1 flex items-center justify-between">
          <Link href="/artist/dashboard" className="flex items-center gap-2 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/157-tattoo-logo.png" alt="157 TATTOO logo" className="h-8 w-auto object-contain shrink-0" />
            <span className="font-heading text-lg tracking-[0.1em] text-studio-primary font-bold group-hover:text-studio-red-bright transition-colors">
              157 <span className="text-studio-red">TATTOO</span>
            </span>
          </Link>
          <Link
            href="/artist/requests"
            className="relative text-[#A89F91] hover:text-studio-red-bright p-1.5 transition-colors"
            title="การแจ้งเตือน"
          >
            <Bell size={18} className={totalNotificationCount > 0 ? 'text-studio-red-bright' : 'text-[#A89F91]'} />
            {totalNotificationCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-[#C12D2D] text-[#ECE4D3] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-studio-card animate-pulse">
                {totalNotificationCount}
              </span>
            )}
          </Link>
        </div>

        {/* MIDDLE NAVIGATION MENU */}
        <nav className="flex-1 space-y-3.5 overflow-y-auto pr-1 my-1">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <span className="text-[10px] font-bold text-[#ECE4D3] uppercase tracking-wider block px-2.5 mb-1">
                {group.title}
              </span>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href === '/artist/calendar' && pathname === '/artist/queue');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-studio-sec text-studio-red-bright border border-studio-border shadow-sm font-semibold'
                        : 'text-[#ECE4D3] hover:text-white hover:bg-studio-sec/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon size={16} className={isActive ? 'text-studio-red-bright' : 'text-[#A89F91]'} />
                      <span>{item.label}</span>
                    </div>
                    {item.href === '/artist/requests' && (newRequestCount + newRescheduleRequestCount) > 0 ? (
                      <span className="bg-[#C12D2D] text-[#ECE4D3] text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                        {newRequestCount + newRescheduleRequestCount}
                      </span>
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-studio-red-bright shadow-sm" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* BOTTOM USER & LOGOUT SECTION */}
        <div className="shrink-0 pt-2.5 border-t border-studio-border/40 mt-auto space-y-2">
          {/* Admin Switch Link (if Owner/Admin) */}
          {profile?.role === 'admin' && (
            <Link
              href="/admin/dashboard"
              className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-amber-300 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/40 rounded-lg transition-colors"
              title="สลับไปยังหน้าผู้ดูแลร้าน"
            >
              <div className="flex items-center space-x-1.5">
                <Store size={13} className="text-amber-400" />
                <span className="font-medium">หน้าร้าน (Admin)</span>
              </div>
              <ChevronRight size={12} className="text-amber-500" />
            </Link>
          )}

          {/* Unified Profile & Logout Row */}
          <div className="flex items-center justify-between p-2 bg-studio-sec/80 border border-studio-border rounded-xl space-x-2">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full bg-studio-red/20 border border-studio-red/40 flex items-center justify-center text-studio-red-bright shrink-0">
                <UserIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1 truncate leading-tight">
                  <span className="text-xs text-studio-primary font-bold truncate">
                    {artistName}
                  </span>
                  {artistNickname && (
                    <span className="text-[10px] text-[#ECE4D3] truncate">
                      {artistNickname}
                    </span>
                  )}
                </div>
                <span className={`inline-block text-[8px] font-mono px-1.5 py-0.2 rounded border mt-0.5 ${
                  profile?.role === 'admin'
                    ? 'text-amber-400 bg-amber-950/60 border-amber-800/40'
                    : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'
                }`}>
                  {profile?.role === 'admin' ? 'OWNER / ARTIST' : 'ARTIST'}
                </span>
              </div>
            </div>

            {/* Logout Icon Button */}
            <button
              onClick={() => logoutStaff()}
              className="p-1.5 text-studio-secondary hover:text-studio-red-bright hover:bg-studio-red/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-studio-red/30 shrink-0"
              title="ออกจากระบบ"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MOBILE TOP BAR (md:hidden) */}
      {/* ========================================================================= */}
      <header className="md:hidden border-b border-studio-border bg-studio-card/90 backdrop-blur-md sticky top-0 z-40 font-prompt">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link href="/artist/dashboard" className="flex items-center space-x-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/157-tattoo-logo.png" alt="157 TATTOO logo" className="h-7 w-auto object-contain shrink-0" />
            <span className="font-heading text-base tracking-[0.1em] text-studio-primary font-bold">
              157 <span className="text-studio-red">TATTOO</span>
            </span>
            <span className="text-[9px] bg-studio-red/15 text-studio-red-bright border border-studio-red/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              ARTIST
            </span>
          </Link>

          <div className="flex items-center space-x-2">
            <Link
              href="/artist/requests"
              className="relative text-[#A89F91] hover:text-studio-red-bright p-1.5"
              title="การแจ้งเตือน"
            >
              <Bell size={18} className={totalNotificationCount > 0 ? 'text-studio-red-bright' : 'text-[#A89F91]'} />
              {totalNotificationCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-[#C12D2D] text-[#ECE4D3] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-studio-card animate-pulse">
                  {totalNotificationCount}
                </span>
              )}
            </Link>

            {profile?.role === 'admin' && (
              <Link
                href="/admin/dashboard"
                className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-1 rounded-lg"
              >
                Admin
              </Link>
            )}

            <button
              onClick={() => logoutStaff()}
              className="p-1.5 text-studio-secondary hover:text-studio-red-bright transition-colors border border-studio-border rounded-lg bg-studio-sec"
              title="ออกจากระบบ"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
