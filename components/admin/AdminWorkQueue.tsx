'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import AdminHeader from './AdminHeader';
import AdminMobileBottomNav from './AdminMobileBottomNav';
import BookingDetailPanel from './requests/BookingDetailPanel';
import { fetchWorkQueueBookings } from './requests/bookingHydration';
import { BookingItem } from './requests/types';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import {
  CalendarCheck,
  Search,
  RefreshCw,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Play,
  Layers,
  Sparkles,
  ChevronRight,
  Calendar,
} from 'lucide-react';

interface AdminWorkQueueProps {
  embedded?: boolean;
}

export default function AdminWorkQueue({ embedded = false }: AdminWorkQueueProps = {}) {
  const { staffRole } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [workQueueBookings, setWorkQueueBookings] = useState<BookingItem[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [blockedDates, setBlockedDates] = useState<any[]>([]);

  // 4 Primary Sub-Tabs: 'ALL' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);

  // Load Work Queue Data
  const loadWorkQueueData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWorkQueueBookings(supabase);
      setWorkQueueBookings(res.workQueueBookings || []);
      setArtists(res.artists || []);
      setBlockedDates(res.blockedDates || []);

      if (selectedBooking) {
        const updated = (res.workQueueBookings || []).find((b) => b.id === selectedBooking.id);
        if (updated) {
          setSelectedBooking(updated);
        }
      }
    } catch (err) {
      console.error('[AdminWorkQueue] Error loading work queue bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedBooking]);

  useEffect(() => {
    let isMounted = true;
    loadWorkQueueData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute exact status counts
  // 'confirmed' includes both CONFIRMED and IN_PROGRESS
  const statusCounts = useMemo(() => {
    let confirmedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    workQueueBookings.forEach((b) => {
      if (b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS') {
        confirmedCount++;
      } else if (b.status === 'COMPLETED') {
        completedCount++;
      } else if (b.status === 'CANCELLED' || b.status === 'REJECTED') {
        cancelledCount++;
      }
    });

    return {
      all: workQueueBookings.length,
      confirmed: confirmedCount,
      completed: completedCount,
      cancelled: cancelledCount,
    };
  }, [workQueueBookings]);

  // Filter pills matching exact Requests page design
  const filterPills = [
    { id: 'ALL', label: `ทั้งหมด (${statusCounts.all})` },
    { id: 'CONFIRMED', label: `นัดหมายแล้ว (${statusCounts.confirmed})` },
    { id: 'COMPLETED', label: `งานเสร็จสิ้น (${statusCounts.completed})` },
    { id: 'CANCELLED', label: `ยกเลิก (${statusCounts.cancelled})` },
  ];

  // Filter Bookings by active tab and search query
  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return workQueueBookings.filter((b) => {
      // 1. Tab Filter
      if (statusFilter === 'CONFIRMED') {
        if (b.status !== 'CONFIRMED' && b.status !== 'IN_PROGRESS') return false;
      } else if (statusFilter === 'COMPLETED') {
        if (b.status !== 'COMPLETED') return false;
      } else if (statusFilter === 'CANCELLED') {
        if (b.status !== 'CANCELLED' && b.status !== 'REJECTED') return false;
      }

      // 2. Search Box Filter
      if (!query) return true;

      const matchesId = (b.id || '').toLowerCase().includes(query);
      const matchesCustomer = (b.customer_name || '').toLowerCase().includes(query) || (b.customer_phone || '').includes(query);
      const matchesArtist = (b.artist_name || '').toLowerCase().includes(query) || (b.artist_nickname || '').toLowerCase().includes(query);
      const matchesTitle = (b.artwork_title || '').toLowerCase().includes(query) || (b.placement || '').toLowerCase().includes(query);

      return matchesId || matchesCustomer || matchesArtist || matchesTitle;
    });
  }, [workQueueBookings, statusFilter, searchQuery]);

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>กำลังสัก</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-400" />
            <span>งานเสร็จสิ้น</span>
          </span>
        );
      case 'CANCELLED':
      case 'REJECTED':
        return (
          <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2 py-0.5 rounded text-[10px] font-semibold">
            {status === 'REJECTED' ? 'ปฏิเสธ' : 'ยกเลิก'}
          </span>
        );
      case 'CONFIRMED':
      default:
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            นัดหมายแล้ว
          </span>
        );
    }
  };

  const queueContent = (
    <div className="space-y-4 font-prompt">
      {/* Single Rounded Container for Tabs & Search (Matching EstimateRequestList.tsx) */}
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
          {/* Top Bar: Status Filter Pills (Left) & Search Bar (Right) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {filterPills.map((pill) => {
                const isSelected = statusFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow'
                        : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <div className="relative min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหารหัสคิว, ชื่อลูกค้า, หรือช่าง..."
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#A89F91] hover:text-white"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>

          {/* Content List: Compact Table / Mobile Cards */}
          {loading ? (
            <div className="py-12 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40 space-y-2">
              <RefreshCw size={24} className="animate-spin text-[#9C2F2F] mx-auto" />
              <p className="text-xs text-[#A89F91]">กำลังโหลดข้อมูลคิวงาน...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40 space-y-2">
              <CalendarCheck size={28} className="text-[#7A7265] mx-auto opacity-60" />
              <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3]">ไม่พบรายการคิวงาน</h4>
              <p className="text-[11px] text-[#7A7265] max-w-sm mx-auto">
                {searchQuery
                  ? 'ลองค้นหาด้วยคำอื่น หรือกดล้างช่องค้นหา'
                  : 'ไม่มีคิวงานในสถานะที่เลือกในขณะนี้'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Compact Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs text-[#ECE4D3]">
                  <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                    <tr>
                      <th className="py-3 px-3">รหัสคิว</th>
                      <th className="py-3 px-3">วัน / เวลานัดหมาย</th>
                      <th className="py-3 px-3">ลูกค้า</th>
                      <th className="py-3 px-3">ช่างสัก</th>
                      <th className="py-3 px-3">ลายสัก / ตำแหน่ง / ขนาด</th>
                      <th className="py-3 px-3">สถานะ</th>
                      <th className="py-3 px-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4A443A]/50">
                    {filteredBookings.map((b) => {
                      const isSelected = selectedBooking?.id === b.id;
                      const isInactive = b.status === 'CANCELLED' || b.status === 'REJECTED';
                      const dateDisplay = b.requested_date ? formatDateBangkok(b.requested_date, true) : 'ไม่ระบุวัน';
                      const timeDisplay = b.requested_start_time ? formatTimeBangkok(b.requested_start_time) : '';

                      return (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedBooking(b)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#1F1D1A]'
                              : isInactive
                              ? 'bg-zinc-950/40 text-zinc-400 opacity-80 hover:bg-zinc-900/50'
                              : 'hover:bg-[#0E0D0C]/70'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-[#9C2F2F]">
                            #{b.id.slice(0, 8)}
                          </td>
                          <td className={`py-3 px-3 ${isInactive ? 'text-zinc-500' : 'text-[#ECE4D3]'}`}>
                            <span className="block font-medium">{dateDisplay}</span>
                            {timeDisplay && (
                              <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                                {timeDisplay}
                              </span>
                            )}
                          </td>
                          <td className={`py-3 px-3 font-medium ${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'}`}>
                            <span className="block font-medium">{b.customer_name}</span>
                            {b.customer_phone && (
                              <span className={`text-[10px] font-mono ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                                {b.customer_phone}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'} block font-medium`}>
                              {b.artist_name}
                            </span>
                            {b.sessions && b.sessions.length > 1 && (
                              <span className="text-[10px] text-amber-400 block font-medium">
                                {b.sessions.length} รอบสัก
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'}>
                              {b.artwork_title || 'งานสัก Custom'}
                            </span>
                            <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                              {b.placement || 'ไม่ระบุตำแหน่ง'}
                              {formatTattooSize(b.width_cm, b.height_cm) !== 'ไม่ระบุ' &&
                                ` • ${formatTattooSize(b.width_cm, b.height_cm)}`}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {renderStatusBadge(b.status)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(b);
                              }}
                              className={
                                isInactive
                                  ? 'px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded border border-zinc-800 transition-colors inline-flex items-center gap-1 cursor-pointer'
                                  : 'px-2.5 py-1 bg-[#0E0D0C] hover:bg-[#1F1D1A] text-[#ECE4D3] text-xs font-medium rounded border border-[#4A443A] hover:border-[#7A7265] transition-colors inline-flex items-center gap-1 cursor-pointer'
                              }
                            >
                              <span>รายละเอียด</span>
                              <ChevronRight size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Compact Card List */}
              <div className="md:hidden space-y-3">
                {filteredBookings.map((b) => {
                  const isInactive = b.status === 'CANCELLED' || b.status === 'REJECTED';
                  const dateDisplay = b.requested_date ? formatDateBangkok(b.requested_date, true) : 'ไม่ระบุวัน';
                  const timeDisplay = b.requested_start_time ? formatTimeBangkok(b.requested_start_time) : '';

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBooking(b)}
                      className={
                        isInactive
                          ? 'bg-zinc-950/40 border border-zinc-800/70 rounded-xl p-3.5 space-y-2.5 shadow opacity-85 cursor-pointer'
                          : 'bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-3.5 space-y-2.5 shadow cursor-pointer active:scale-[0.99] transition-all'
                      }
                    >
                      {/* Top Header: ID & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#9C2F2F]">
                          #{b.id.slice(0, 8)}
                        </span>
                        {renderStatusBadge(b.status)}
                      </div>

                      {/* Info Row: Date & Customer */}
                      <div className="flex items-center justify-between text-xs border-y border-[#4A443A]/40 py-2 my-1">
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">วัน/เวลานัดหมาย</span>
                          <span className="font-semibold text-[#ECE4D3]">{dateDisplay} {timeDisplay}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-[#7A7265] block">ลูกค้า</span>
                          <span className="font-semibold text-[#ECE4D3]">{b.customer_name}</span>
                        </div>
                      </div>

                      {/* Bottom Row: Artist & Artwork */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-[#7A7265] block">ช่างสัก / งานสัก</span>
                          <p className="font-medium text-[#ECE4D3] truncate">
                            {b.artist_name} • {b.artwork_title || 'งานสัก Custom'}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-[#7A7265] shrink-0 ml-2" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      {/* Selected Booking Detail Panel */}
      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          artists={artists}
          blockedDates={blockedDates}
          onClose={() => setSelectedBooking(null)}
          onRefresh={loadWorkQueueData}
        />
      )}
    </div>
  );

  if (embedded) {
    return queueContent;
  }

  return (
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt pb-24 md:pb-12">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header (Aligned with Requests Page) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#4A443A]/60 pb-4">
          <div>
            <span className="text-[10px] text-[#A89F91] uppercase tracking-wider font-semibold block">
              WORK QUEUE MANAGEMENT • จัดการคิวงาน
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#ECE4D3] flex items-center gap-2.5 mt-0.5">
              <CalendarCheck className="text-[#9C2F2F]" size={26} />
              <span>จัดการคิวงาน</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#A89F91] mt-1">
              ติดตาม ค้นหา และจัดการคิวนัดหมายที่ยืนยันแล้วของร้าน
            </p>
          </div>

          <button
            type="button"
            onClick={loadWorkQueueData}
            disabled={loading}
            className="self-start sm:self-auto px-3.5 py-2 bg-[#171512] hover:bg-[#221F1A] border border-[#4A443A] text-xs font-semibold text-[#ECE4D3] rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#9C2F2F]' : ''} />
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>

        {queueContent}
      </main>

      {/* Mobile Bottom Nav */}
      <AdminMobileBottomNav />
    </div>
  );
}
