'use client';

import React, { useMemo } from 'react';
import { CalendarSessionEvent, CalendarArtist } from './types';
import {
  getDateStrBangkok,
  formatTimeBangkok,
  formatDateBangkok,
  getSessionStatusConfig,
  getBookingStatusConfig,
} from './calendarUtils';
import {
  User,
  Calendar as CalendarIcon,
  Clock,
  Palette,
  Users,
  ChevronRight,
} from 'lucide-react';

export interface BlockedDateItem {
  id?: string;
  scope?: 'STUDIO' | 'ARTIST';
  artist_id?: string | null;
  blocked_date: string;
  reason?: string | null;
}

interface MonthCalendarViewProps {
  currentDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  artists?: CalendarArtist[];
  blockedDates?: BlockedDateItem[];
  selectedEvent?: CalendarSessionEvent | null;
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent | null) => void;
  todayStr: string;
}

const THAI_DAYS_MON_FIRST_FULL = [
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
  'อาทิตย์',
];
const THAI_DAYS_MON_FIRST_SHORT = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

// Helper for exact status mapping per prompt requirements
export function getResolvedStatus(ev: CalendarSessionEvent): {
  key: 'CONFIRMED' | 'COMPLETED' | 'IN_PROGRESS' | 'WAITING_DEPOSIT' | 'CANCELLED' | 'OTHER';
  label: string;
  colorClass: string;
  dotClass: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
} {
  // 1. Check CANCELLED
  if (ev.status === 'CANCELLED' || ev.booking?.status === 'CANCELLED') {
    return {
      key: 'CANCELLED',
      label: 'ยกเลิก',
      colorClass: 'text-zinc-500',
      dotClass: 'bg-zinc-500',
      badgeBg: 'bg-zinc-900/60',
      badgeText: 'text-zinc-400',
      badgeBorder: 'border-zinc-700/50',
    };
  }

  // 2. Check COMPLETED
  if (ev.status === 'COMPLETED' || ev.booking?.status === 'COMPLETED') {
    return {
      key: 'COMPLETED',
      label: 'เสร็จสิ้น',
      colorClass: 'text-emerald-400',
      dotClass: 'bg-emerald-400',
      badgeBg: 'bg-emerald-950/60',
      badgeText: 'text-emerald-400',
      badgeBorder: 'border-emerald-800/50',
    };
  }

  // 3. Check IN_PROGRESS
  if (ev.status === 'IN_PROGRESS' || ev.booking?.status === 'IN_PROGRESS') {
    return {
      key: 'IN_PROGRESS',
      label: 'กำลังสัก',
      colorClass: 'text-rose-400',
      dotClass: 'bg-rose-400',
      badgeBg: 'bg-rose-950/60',
      badgeText: 'text-rose-400',
      badgeBorder: 'border-rose-800/50',
    };
  }

  // 4. Check WAITING_DEPOSIT
  if (ev.booking?.status === 'WAITING_DEPOSIT') {
    return {
      key: 'WAITING_DEPOSIT',
      label: 'รอมัดจำ',
      colorClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
      badgeBg: 'bg-amber-950/60',
      badgeText: 'text-amber-400',
      badgeBorder: 'border-amber-800/50',
    };
  }

  // 5. Check CONFIRMED
  if (
    ev.status === 'SCHEDULED' ||
    ev.booking?.status === 'CONFIRMED' ||
    ev.booking?.status === 'APPROVED'
  ) {
    return {
      key: 'CONFIRMED',
      label: 'ยืนยันแล้ว',
      colorClass: 'text-emerald-400',
      dotClass: 'bg-emerald-400',
      badgeBg: 'bg-emerald-950/60',
      badgeText: 'text-emerald-400',
      badgeBorder: 'border-emerald-800/50',
    };
  }

  // 6. PENDING or OTHER: NOT mapped to 'รอมัดจำ'
  return {
    key: 'OTHER',
    label: ev.booking?.status === 'PENDING' ? 'รอประเมิน' : ev.booking?.status || 'รอดำเนินการ',
    colorClass: 'text-zinc-400',
    dotClass: 'bg-zinc-400',
    badgeBg: 'bg-zinc-900/60',
    badgeText: 'text-zinc-400',
    badgeBorder: 'border-zinc-700/50',
  };
}

export default function MonthCalendarView({
  currentDateStr,
  events,
  artists = [],
  blockedDates = [],
  selectedEvent = null,
  onSelectDate,
  onSelectEvent,
  todayStr,
}: MonthCalendarViewProps) {
  // 1. Parse Year & Month from currentDateStr
  const { year, month } = useMemo(() => {
    const [y, m] = currentDateStr.split('-').map(Number);
    return { year: y || 2026, month: m || 9 };
  }, [currentDateStr]);

  // 2. Active Artists List
  const activeArtists = useMemo(() => {
    if (artists && artists.length > 0) {
      return artists.filter((a) => a.is_active);
    }
    const map = new Map<string, CalendarArtist>();
    events.forEach((ev) => {
      if (ev.artist) {
        map.set(ev.artist.id, ev.artist);
      }
    });
    return Array.from(map.values());
  }, [artists, events]);

  // 3. Group Active Events by Date String (YYYY-MM-DD)
  // Excludes CANCELLED sessions and CANCELLED bookings
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarSessionEvent[]>();
    events.forEach((ev) => {
      const resolved = getResolvedStatus(ev);
      if (resolved.key === 'CANCELLED') {
        return;
      }
      const dateStr = getDateStrBangkok(ev.start_at);
      const list = map.get(dateStr) || [];
      list.push(ev);
      map.set(dateStr, list);
    });
    return map;
  }, [events]);

  // 4. Build 7-Column Monday-First Month Calendar Grid
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    // Convert JS getDay() (0=Sun, 1=Mon... 6=Sat) to Monday-first offset (0=Mon, ..., 6=Sun)
    const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const totalDaysInMonth = lastDayOfMonth.getDate();

    // Total cells required to complete full 7-day week rows
    const totalCells = Math.ceil((startDayOffset + totalDaysInMonth) / 7) * 7;

    const cells: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarSessionEvent[];
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      // Calculate date immutably relative to (1 - startDayOffset)
      const d = new Date(year, month - 1, 1 - startDayOffset + i);
      const cYear = d.getFullYear();
      const cMonth = d.getMonth() + 1;
      const cDay = d.getDate();

      const iso = `${cYear}-${String(cMonth).padStart(2, '0')}-${String(cDay).padStart(2, '0')}`;
      const isCurrentMonth = cMonth === month && cYear === year;

      cells.push({
        dateStr: iso,
        dayNumber: cDay,
        isCurrentMonth,
        isToday: iso === todayStr,
        isSelected: iso === currentDateStr,
        events: eventsByDate.get(iso) || [],
      });
    }

    return cells;
  }, [year, month, todayStr, currentDateStr, eventsByDate]);

  // Selected Date Events sorted by start_at ASC
  const selectedDateEvents = useMemo(() => {
    const list = (eventsByDate.get(currentDateStr) || []).slice();
    return list.sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [eventsByDate, currentDateStr]);

  // Selected Date Metrics Calculation with deduplicated Availability Logic
  const selectedDateMetrics = useMemo(() => {
    const total = selectedDateEvents.length;

    let confirmed = 0;
    let completed = 0;
    let inProgress = 0;
    let waitingDeposit = 0;

    selectedDateEvents.forEach((e) => {
      const st = getResolvedStatus(e);
      if (st.key === 'CONFIRMED') confirmed++;
      else if (st.key === 'COMPLETED') completed++;
      else if (st.key === 'IN_PROGRESS') inProgress++;
      else if (st.key === 'WAITING_DEPOSIT') waitingDeposit++;
    });

    // Deduplicated Busy Artist IDs for currentDateStr
    const busyArtistIds = new Set<string>();

    // 1. Artists with active sessions on currentDateStr
    selectedDateEvents.forEach((e) => {
      if (e.artist_id) {
        busyArtistIds.add(e.artist_id);
      }
    });

    // 2. Artists blocked on currentDateStr
    if (blockedDates && blockedDates.length > 0) {
      blockedDates.forEach((b) => {
        if (b.blocked_date === currentDateStr && b.artist_id) {
          busyArtistIds.add(b.artist_id);
        }
      });
    }

    const availableArtists = Math.max(0, activeArtists.length - busyArtistIds.size);

    return { total, confirmed, completed, inProgress, waitingDeposit, availableArtists };
  }, [selectedDateEvents, blockedDates, activeArtists, currentDateStr]);

  const getEventSpecs = (ev: CalendarSessionEvent) => {
    let style = 'งานสัก';
    if (ev.estimate?.style && ev.estimate.style !== 'Custom' && ev.estimate.style !== 'CUSTOM') {
      style = ev.estimate.style;
    }

    let size = 'ไม่ระบุขนาด';
    if (ev.estimate?.width_cm && ev.estimate?.height_cm) {
      size = `${ev.estimate.width_cm}×${ev.estimate.height_cm} ซม.`;
    }

    const placement = ev.estimate?.placement || 'ไม่ระบุตำแหน่ง';
    const timeText = `${formatTimeBangkok(ev.start_at)}–${formatTimeBangkok(ev.end_at)}`;

    return { style, size, placement, timeText };
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start font-prompt">
      {/* ========================================================================= */}
      {/* LEFT: MONTHLY CALENDAR GRID (7 COLUMNS: MON-SUN) */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 w-full bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl">
        {/* Weekday Header Row (Mon-Sun) */}
        <div className="grid grid-cols-7 border-b border-[#4A443A]/40 bg-[#171512] text-center">
          {THAI_DAYS_MON_FIRST_FULL.map((dName, idx) => (
            <div
              key={dName}
              className="py-2.5 text-xs font-bold text-[#A89F91] uppercase tracking-wider border-r border-[#4A443A]/20 last:border-r-0"
            >
              <span className="hidden sm:inline">{dName}</span>
              <span className="sm:hidden">{THAI_DAYS_MON_FIRST_SHORT[idx]}</span>
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 auto-rows-fr bg-[#0E0D0C] divide-x divide-y divide-[#4A443A]/20">
          {calendarCells.map((cell) => {
            const activeEvents = cell.events;
            const totalCount = activeEvents.length;

            let confirmedCount = 0;
            let completedCount = 0;
            let inProgressCount = 0;
            let waitingDepositCount = 0;

            activeEvents.forEach((ev) => {
              const st = getResolvedStatus(ev);
              if (st.key === 'CONFIRMED') confirmedCount++;
              else if (st.key === 'COMPLETED') completedCount++;
              else if (st.key === 'IN_PROGRESS') inProgressCount++;
              else if (st.key === 'WAITING_DEPOSIT') waitingDepositCount++;
            });

            const cellBlocks = blockedDates.filter((b) => b.blocked_date === cell.dateStr);
            const studioBlock = cellBlocks.find((b) => b.scope === 'STUDIO' || (!b.scope && !b.artist_id));
            const artistBlocks = cellBlocks.filter((b) => b.scope === 'ARTIST' || b.artist_id);

            return (
              <div
                key={cell.dateStr}
                onClick={() => onSelectDate(cell.dateStr)}
                className={`min-h-[85px] sm:min-h-[110px] p-1.5 sm:p-2.5 transition-all cursor-pointer flex flex-col justify-between relative group ${
                  cell.isCurrentMonth
                    ? 'bg-[#12100E] hover:bg-[#1A1815]'
                    : 'bg-[#0E0D0C]/80 text-[#7A7265]'
                } ${
                  cell.isSelected
                    ? 'bg-[#1A1815] ring-2 ring-inset ring-[#9C2F2F] z-10'
                    : ''
                }`}
              >
                {/* Cell Header: Date Number */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      cell.isToday
                        ? 'ring-2 ring-[#9C2F2F] text-[#ECE4D3]'
                        : cell.isCurrentMonth
                        ? 'text-[#ECE4D3]'
                        : 'text-[#4A443A]'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                </div>

                {/* Closed Day Badges */}
                {studioBlock && (
                  <div className="mt-1 px-1.5 py-0.5 bg-red-950/80 border border-red-800/80 rounded text-[10px] font-semibold text-red-300 truncate">
                    🔒 ปิดทั้งร้าน
                  </div>
                )}
                {!studioBlock && artistBlocks.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {artistBlocks.map((ab) => {
                      const artName = artists.find((a) => a.id === ab.artist_id)?.name || 'ช่าง';
                      return (
                        <div
                          key={ab.id || ab.artist_id}
                          className="px-1 py-0.5 bg-amber-950/60 border border-amber-800/60 rounded text-[9px] font-medium text-amber-300 truncate"
                        >
                          🔒 ช่าง{artName} ปิด
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Cell Content: Status Summary Breakdown */}
                <div className="mt-1 space-y-0.5">
                  {totalCount === 0 && !studioBlock && artistBlocks.length === 0 && (
                    <span className="text-[11px] text-[#7A7265] font-light italic block mt-1">
                      ว่าง
                    </span>
                  )}
                  {totalCount > 0 && (
                    <>
                      <span className="text-[11px] font-bold text-[#ECE4D3] block mb-0.5">
                        {totalCount} คิว
                      </span>

                      {/* Desktop Status Counts */}
                      <div className="space-y-0.5 hidden sm:block text-[10px]">
                        {confirmedCount > 0 && (
                          <div className="text-emerald-400 truncate flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            <span className="truncate">ยืนยันแล้ว {confirmedCount}</span>
                          </div>
                        )}
                        {inProgressCount > 0 && (
                          <div className="text-rose-400 truncate flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                            <span className="truncate">กำลังสัก {inProgressCount}</span>
                          </div>
                        )}
                        {completedCount > 0 && (
                          <div className="text-emerald-300 truncate flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shrink-0" />
                            <span className="truncate">เสร็จสิ้น {completedCount}</span>
                          </div>
                        )}
                        {waitingDepositCount > 0 && (
                          <div className="text-amber-400 truncate flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span className="truncate">รอมัดจำ {waitingDepositCount}</span>
                          </div>
                        )}
                      </div>

                      {/* Mobile Status Dots */}
                      <div className="flex sm:hidden items-center gap-1 mt-1">
                        {confirmedCount > 0 && (
                          <span className="text-[9px] text-emerald-400 font-bold">
                            ● {confirmedCount}
                          </span>
                        )}
                        {inProgressCount > 0 && (
                          <span className="text-[9px] text-rose-400 font-bold">
                            ● {inProgressCount}
                          </span>
                        )}
                        {waitingDepositCount > 0 && (
                          <span className="text-[9px] text-amber-400 font-bold">
                            ● {waitingDepositCount}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT: SELECTED DAY DETAIL PANEL (DESKTOP ~30% / MOBILE BELOW) */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[320px] shrink-0 bg-[#12100E] border border-[#4A443A]/60 rounded-xl overflow-hidden shadow-2xl sticky top-4 animate-fadeIn">
        {/* Panel Header */}
        <div className="p-3.5 border-b border-[#4A443A]/40 bg-[#171512] flex items-center justify-between">
          <div>
            <span className="text-[9px] text-[#A89F91] uppercase tracking-wider block">
              ตารางคิวนัดหมายรายวัน
            </span>
            <h3 className="text-xs font-bold text-[#ECE4D3] flex items-center gap-1.5 mt-0.5">
              <CalendarIcon size={14} className="text-[#9C2F2F]" />
              <span>{formatDateBangkok(currentDateStr, true)}</span>
            </h3>
          </div>
        </div>

        {/* Panel Body Content */}
        <div className="p-3.5 space-y-4 max-h-[calc(100vh-210px)] overflow-y-auto">
          {/* Day Metrics Overview */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2">
              <span className="text-[9px] text-[#A89F91] block">ทั้งหมด</span>
              <span className="text-base font-bold text-[#ECE4D3] mt-0.5 block">
                {selectedDateMetrics.total} <span className="text-[10px] font-normal text-[#7A7265]">คิว</span>
              </span>
            </div>
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2">
              <span className="text-[9px] text-[#A89F91] block">ยืนยันแล้ว</span>
              <span className="text-base font-bold text-emerald-400 mt-0.5 block">
                {selectedDateMetrics.confirmed} <span className="text-[10px] font-normal text-[#7A7265]">คิว</span>
              </span>
            </div>
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2">
              <span className="text-[9px] text-[#A89F91] block">รอมัดจำ</span>
              <span className="text-base font-bold text-amber-400 mt-0.5 block">
                {selectedDateMetrics.waitingDeposit} <span className="text-[10px] font-normal text-[#7A7265]">คิว</span>
              </span>
            </div>
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2">
              <span className="text-[9px] text-[#A89F91] block">ช่างว่าง</span>
              <span className="text-base font-bold text-sky-400 mt-0.5 block">
                {selectedDateMetrics.availableArtists}{' '}
                <span className="text-[10px] font-normal text-[#7A7265]">/ {activeArtists.length} คน</span>
              </span>
            </div>
          </div>

          {/* Appointments List for Selected Day */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-[#A89F91] uppercase tracking-wider block">
              รายการคิวนัดหมาย ({selectedDateEvents.length})
            </span>

            {selectedDateEvents.length === 0 ? (
              <div className="p-4 text-center bg-[#171512] rounded-lg border border-[#4A443A]/30">
                <span className="text-xs text-[#7A7265] italic">ไม่มีคิวนัดหมายในวันนี้</span>
              </div>
            ) : (
              selectedDateEvents.map((ev) => {
                const { style, size, timeText } = getEventSpecs(ev);
                const st = getResolvedStatus(ev);
                const isSelected = selectedEvent?.id === ev.id;

                return (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className={`p-2.5 bg-[#171512] hover:bg-[#1A1815] border rounded-lg transition-all cursor-pointer space-y-1.5 group ${
                      isSelected
                        ? 'border-[#9C2F2F] ring-1 ring-[#9C2F2F] bg-[#1A1815]'
                        : 'border-[#4A443A]/40 hover:border-[#ECE4D3]/50'
                    }`}
                  >
                    {/* Line 1: Time Start-End & Status Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#ECE4D3] font-mono flex items-center gap-1">
                        <Clock size={11} className="text-[#9C2F2F]" />
                        <span>{timeText}</span>
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}
                      >
                        {st.label}
                      </span>
                    </div>

                    {/* Line 2: Customer Name */}
                    <div className="text-xs font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                      <User size={11} className="text-[#A89F91] shrink-0" />
                      <span className="truncate">
                        {ev.customer?.display_name || 'ลูกค้า'}
                      </span>
                    </div>

                    {/* Line 3: Style & Size */}
                    <div className="text-[11px] text-[#A89F91] flex items-center gap-1 font-mono">
                      <Palette size={11} className="text-[#7A7265] shrink-0" />
                      <span className="truncate">{style}</span>
                      {size !== 'ไม่ระบุขนาด' && (
                        <>
                          <span>•</span>
                          <span className="truncate">{size}</span>
                        </>
                      )}
                    </div>

                    {/* Line 4: Artist Name */}
                    <div className="text-[10px] text-[#ECE4D3]/80 flex items-center gap-1 pt-1 border-t border-[#4A443A]/30">
                      <Users size={10} className="text-[#7A7265] shrink-0" />
                      <span className="truncate font-medium">
                        ช่าง: {ev.artist?.name}{' '}
                        {ev.artist?.nickname ? `(${ev.artist.nickname})` : ''}
                      </span>
                      <ChevronRight
                        size={13}
                        className="text-[#7A7265] group-hover:text-[#ECE4D3] ml-auto transition-colors shrink-0"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel Footer */}
        <div className="p-3 border-t border-[#4A443A]/40 bg-[#171512] text-center">
          <span className="text-[10px] text-[#7A7265]">
            คลิกรายการคิวเพื่อเปิดดูรายละเอียดเชิงลึก
          </span>
        </div>
      </div>
    </div>
  );
}
