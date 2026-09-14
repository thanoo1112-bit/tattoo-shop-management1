'use client';

import React, { useMemo, useEffect, useState } from 'react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { CalendarSessionEvent, CalendarArtist } from './types';
import {
  getDateStrBangkok,
  formatTimeBangkok,
  formatDateBangkok,
  calculateDurationText,
  getSessionStatusConfig,
  getBookingStatusConfig,
  THAI_DAYS_SHORT,
  THAI_MONTHS_SHORT,
  TIMEZONE,
} from './calendarUtils';
import {
  User,
  X,
  Phone,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  AlertCircle,
  BadgeDollarSign,
  MapPin,
  Maximize2,
  Palette,
  Users,
  CalendarDays,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

interface WeekCalendarViewProps {
  selectedDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  artists?: CalendarArtist[];
  selectedEvent?: CalendarSessionEvent | null;
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent | null) => void;
  todayStr: string;
}

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]; // 10:00 to 22:00 (ends at 23:00)
const HOUR_HEIGHT = 44; // Compact 44px per hour
const START_MINUTES = 600; // 10:00 AM (10 * 60)

function getBangkokMinutes(iso: string): number {
  try {
    const d = new Date(iso);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let hour = 0;
    let minute = 0;
    parts.forEach((p) => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    if (hour === 24) hour = 0;
    return hour * 60 + minute;
  } catch {
    return 600;
  }
}

function getCurrentBangkokMinutes(): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    let hour = 0;
    let minute = 0;
    parts.forEach((p) => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    if (hour === 24) hour = 0;
    return hour * 60 + minute;
  } catch {
    return -1;
  }
}

interface PositionedEvent {
  event: CalendarSessionEvent;
  top: number;
  height: number;
  hasArtistConflict: boolean;
}

const COMPACT_CARD_HEIGHT = 70; // Compact fixed height in px for Week View Event Cards

function calculateDayLayout(dayEvents: CalendarSessionEvent[]): PositionedEvent[] {
  if (dayEvents.length === 0) return [];

  // Sort by start_at ASC, then end_at ASC, then created_at/id ASC
  const items = dayEvents
    .map((event) => {
      const startMins = getBangkokMinutes(event.start_at);
      const endMins = getBangkokMinutes(event.end_at);
      const naturalTop = Math.max(0, (startMins - START_MINUTES) * (HOUR_HEIGHT / 60));
      const createdAtTime = event.created_at ? new Date(event.created_at).getTime() : 0;
      return { event, startMins, endMins, naturalTop, createdAtTime };
    })
    .sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      if (a.endMins !== b.endMins) return a.endMins - b.endMins;
      return a.createdAtTime - b.createdAtTime;
    });

  // Check for artist time conflicts in the day
  const artistConflictSet = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (
        a.event.artist_id &&
        a.event.artist_id === b.event.artist_id &&
        a.event.status !== 'CANCELLED' &&
        b.event.status !== 'CANCELLED' &&
        a.event.booking?.status !== 'CANCELLED' &&
        b.event.booking?.status !== 'CANCELLED'
      ) {
        if (a.startMins < b.endMins && b.startMins < a.endMins) {
          artistConflictSet.add(a.event.id);
          artistConflictSet.add(b.event.id);
        }
      }
    }
  }

  // Calculate stacked vertical positions with COMPACT height
  const result: PositionedEvent[] = [];

  items.forEach((item, idx) => {
    let top = item.naturalTop;
    const height = COMPACT_CARD_HEIGHT;

    if (idx > 0) {
      const prev = result[idx - 1];
      const prevBottom = prev.top + prev.height;
      if (top < prevBottom) {
        top = prevBottom + 4; // Minimal 4px offset to place right below previous compact card
      }
    }

    result.push({
      event: item.event,
      top,
      height,
      hasArtistConflict: artistConflictSet.has(item.event.id),
    });
  });

  return result;
}

function getDenseStatusStyle(ev: CalendarSessionEvent): {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  label: string;
} {
  const status = ev.status;
  const bookingStatus = ev.booking?.status;

  if (status === 'CANCELLED' || bookingStatus === 'CANCELLED') {
    return {
      bg: 'bg-[#18181b]/80',
      border: 'border-zinc-800/60',
      text: 'text-zinc-500 line-through',
      badgeBg: 'bg-zinc-900',
      badgeText: 'text-zinc-500',
      label: 'ยกเลิก',
    };
  }

  if (bookingStatus === 'REJECTED') {
    return {
      bg: 'bg-red-950/30',
      border: 'border-red-900/60',
      text: 'text-red-400',
      badgeBg: 'bg-red-950',
      badgeText: 'text-red-400',
      label: 'ปฏิเสธ',
    };
  }

  if (status === 'COMPLETED' || bookingStatus === 'COMPLETED') {
    return {
      bg: 'bg-emerald-950/20',
      border: 'border-emerald-900/40',
      text: 'text-zinc-400',
      badgeBg: 'bg-zinc-800/80',
      badgeText: 'text-zinc-300',
      label: 'เสร็จสิ้น',
    };
  }

  if (status === 'IN_PROGRESS' || bookingStatus === 'IN_PROGRESS') {
    return {
      bg: 'bg-[#9c2f2f]/16',
      border: 'border-[#9c2f2f]/85',
      text: 'text-rose-300',
      badgeBg: 'bg-rose-950/80',
      badgeText: 'text-rose-400',
      label: 'กำลังสัก',
    };
  }

  if (bookingStatus === 'WAITING_DEPOSIT') {
    return {
      bg: 'bg-[#d9a441]/12',
      border: 'border-[#d9a441]/70',
      text: 'text-amber-300',
      badgeBg: 'bg-amber-950/80',
      badgeText: 'text-amber-400',
      label: 'รอมัดจำ',
    };
  }

  // CONFIRMED / SCHEDULED
  return {
    bg: 'bg-[#2ea064]/12',
    border: 'border-[#2ea064]/70',
    text: 'text-emerald-300',
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-400',
    label: 'ยืนยันแล้ว',
  };
}

export default function WeekCalendarView({
  selectedDateStr,
  events,
  artists = [],
  selectedEvent = null,
  onSelectDate,
  onSelectEvent,
  todayStr,
}: WeekCalendarViewProps) {
  // Live current time in Bangkok minutes
  const [currentBangkokMins, setCurrentBangkokMins] = useState<number>(() => getCurrentBangkokMinutes());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBangkokMins(getCurrentBangkokMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 1. Calculate the 7 Days of the Week (Monday to Sunday)
  const weekDays = useMemo(() => {
    const d = new Date(selectedDateStr);
    const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);

    const days = [];
    const dayNames = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const iso = cur.toISOString().split('T')[0];
      const monthIdx = cur.getMonth();
      days.push({
        dateStr: iso,
        dayNumber: cur.getDate(),
        dayName: dayNames[i],
        shortDay: THAI_DAYS_SHORT[(i + 1) % 7],
        shortMonth: THAI_MONTHS_SHORT[monthIdx],
        isToday: iso === todayStr,
        isSelected: iso === selectedDateStr,
      });
    }
    return days;
  }, [selectedDateStr, todayStr]);

  // 2. Map Events by Date String (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarSessionEvent[]>();
    events.forEach((ev) => {
      const dateStr = getDateStrBangkok(ev.start_at);
      const list = map.get(dateStr) || [];
      list.push(ev);
      map.set(dateStr, list);
    });
    return map;
  }, [events]);

  // 3. Dynamic Column Container Height based on max stacked cards
  const maxColumnHeight = useMemo(() => {
    let maxH = HOURS.length * HOUR_HEIGHT; // default 572px
    weekDays.forEach((day) => {
      const dayEvs = eventsByDate.get(day.dateStr) || [];
      const posEvs = calculateDayLayout(dayEvs);
      posEvs.forEach((pe) => {
        const b = pe.top + pe.height + 16;
        if (b > maxH) maxH = b;
      });
    });
    return maxH;
  }, [weekDays, eventsByDate]);

  // 4. Active Artists List for Summary Breakdown
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

  // 5. Keyboard Listener for ESC Key to Close Side Panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedEvent) {
        onSelectEvent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent, onSelectEvent]);

  // Helpers
  const formatCurrency = (val: number | undefined | null) =>
    Number(val ?? 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

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
    const referenceImage = ev.estimate?.reference_images?.[0] || null;
    const timeText = `${formatTimeBangkok(ev.start_at)}–${formatTimeBangkok(ev.end_at)}`;

    return { style, size, placement, referenceImage, timeText };
  };

  const selectedSpecs = selectedEvent ? getEventSpecs(selectedEvent) : null;
  const selectedSessionCfg = selectedEvent ? getSessionStatusConfig(selectedEvent.status) : null;
  const selectedBookingCfg = selectedEvent?.booking
    ? getBookingStatusConfig(selectedEvent.booking.status)
    : null;

  // Selected Date Events for Summary Panel
  const selectedDateEvents = useMemo(() => {
    return eventsByDate.get(selectedDateStr) || [];
  }, [eventsByDate, selectedDateStr]);

  // Weekly Metrics Breakdown
  const metrics = useMemo(() => {
    const total = events.length;
    const confirmed = events.filter((e) => e.status === 'SCHEDULED' || e.status === 'COMPLETED').length;
    const waitingDeposit = events.filter((e) => e.booking?.status === 'WAITING_DEPOSIT').length;
    const inProgress = events.filter((e) => e.status === 'IN_PROGRESS').length;
    const completed = events.filter((e) => e.status === 'COMPLETED').length;
    return { total, confirmed, waitingDeposit, inProgress, completed };
  }, [events]);

  const currentLineTop =
    currentBangkokMins >= START_MINUTES && currentBangkokMins <= 1380
      ? (currentBangkokMins - START_MINUTES) * (HOUR_HEIGHT / 60)
      : -1;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start font-prompt">
      {/* ========================================================================= */}
      {/* CENTER: DENSE WEEKLY TIME GRID CALENDAR (VERTICAL STACKED EVENTS) */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 w-full bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl">
        {/* Mobile 7-Day Selector Strip */}
        <div className="flex sm:hidden overflow-x-auto divide-x divide-[#4A443A]/20 bg-[#171512] border-b border-[#4A443A]/40 p-1">
          {weekDays.map((day) => (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => onSelectDate(day.dateStr)}
              className={`flex-1 min-w-[54px] py-1.5 px-1 text-center rounded transition-colors ${
                day.isSelected
                  ? 'bg-[#9C2F2F] text-white font-bold'
                  : 'text-[#A89F91] hover:bg-[#1A1815]'
              }`}
            >
              <span className="text-[9px] block uppercase">{day.shortDay}</span>
              <span className="text-xs font-bold">{day.dayNumber}</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-170px)] overflow-y-auto relative">
          <div className="min-w-[800px] flex flex-col">
            {/* Header Row: Time Label Column + 7 Days of the Week */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#4A443A]/40 bg-[#171512] sticky top-0 z-30 shadow-md">
              {/* Intersection Header Cell (Top-Left) */}
              <div className="p-2 border-r border-[#4A443A]/30 flex flex-col items-center justify-center bg-[#171512] sticky left-0 z-40">
                <span className="text-[9px] font-bold text-[#A89F91] uppercase">เวลา</span>
              </div>

              {/* 7 Day Header Columns */}
              {weekDays.map((day) => (
                <div
                  key={day.dateStr}
                  onClick={() => onSelectDate(day.dateStr)}
                  className={`p-2 text-center border-r border-[#4A443A]/20 last:border-r-0 cursor-pointer transition-colors ${
                    day.isToday
                      ? 'border-b-2 border-[#9C2F2F] bg-[#1A1815]'
                      : day.isSelected
                      ? 'bg-[#1A1815]'
                      : 'hover:bg-[#1A1815]/60'
                  }`}
                >
                  <span
                    className={`text-[10px] block uppercase tracking-wider font-semibold ${
                      day.isToday ? 'text-[#9C2F2F]' : 'text-[#A89F91]'
                    }`}
                  >
                    {day.dayName}
                  </span>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span
                      className={`text-xs font-bold ${
                        day.isToday
                          ? 'text-[#9C2F2F]'
                          : day.isSelected
                          ? 'text-[#ECE4D3]'
                          : 'text-[#ECE4D3]/90'
                      }`}
                    >
                      {day.dayNumber}
                    </span>
                    <span className="text-[9px] text-[#7A7265] font-mono">{day.shortMonth}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Time Grid Body (13 Hours x 7 Day Columns) */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-[#0E0D0C] relative">
              {/* Left Column: Hourly Time Labels */}
              <div className="border-r border-[#4A443A]/30 bg-[#12100E] sticky left-0 z-20 relative select-none">
                {HOURS.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 flex items-center justify-end pr-2 text-[10px] font-mono text-[#7A7265]"
                    style={{ top: i === 0 ? '2px' : `${i * HOUR_HEIGHT - 7}px` }}
                  >
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </div>
                ))}
                {/* Final 23:00 Boundary Label */}
                <div
                  className="absolute left-0 right-0 flex items-center justify-end pr-2 text-[10px] font-mono text-[#7A7265]"
                  style={{ top: `${HOURS.length * HOUR_HEIGHT - 12}px` }}
                >
                  23:00
                </div>
                {/* Total Grid Height Spacer */}
                <div style={{ height: `${maxColumnHeight}px` }} />
              </div>

              {/* 7 Day Columns Content */}
              {weekDays.map((day) => {
                const dayEvents = eventsByDate.get(day.dateStr) || [];
                const positionedEvents = calculateDayLayout(dayEvents);

                return (
                  <div
                    key={day.dateStr}
                    className={`border-r border-[#4A443A]/20 last:border-r-0 relative ${
                      day.isSelected ? 'bg-[#12100E]/50' : ''
                    }`}
                    style={{ height: `${maxColumnHeight}px` }}
                  >
                    {/* Horizontal Grid Hour Lines */}
                    {HOURS.map((hour, i) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 border-b border-[#4A443A]/15 pointer-events-none"
                        style={{ top: `${(i + 1) * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Current Time Red Line on Today Column */}
                    {day.isToday && currentLineTop >= 0 && currentLineTop <= maxColumnHeight && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-[#9C2F2F] z-30 pointer-events-none flex items-center"
                        style={{ top: `${currentLineTop}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-[#9C2F2F] -ml-1 shrink-0" />
                      </div>
                    )}

                    {/* Positioned Session Cards (FULL WIDTH VERTICAL STACKED WITH STATUS COLORING) */}
                    {positionedEvents.map(({ event, top, height, hasArtistConflict }) => {
                      const { style, size, timeText } = getEventSpecs(event);
                      const stCfg = getDenseStatusStyle(event);
                      const isSelected = selectedEvent?.id === event.id;

                      const customerName = event.customer?.display_name || 'ลูกค้า';
                      const artistName = event.artist?.nickname || event.artist?.name || 'ช่างสัก';

                      return (
                        <div
                          key={event.id}
                          onClick={() => onSelectEvent(event)}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: '2px',
                            width: 'calc(100% - 4px)',
                          }}
                          className={`absolute rounded-md p-1.5 sm:p-2 border transition-all cursor-pointer overflow-hidden group z-10 flex flex-col justify-between select-none ${
                            isSelected
                              ? `${stCfg.bg} ${stCfg.border} ring-2 ring-[#ECE4D3] shadow-2xl z-20`
                              : `${stCfg.bg} ${stCfg.border} hover:border-[#ECE4D3]/60 hover:brightness-110`
                          }`}
                        >
                          {/* Card Content */}
                          <div className="space-y-1 min-w-0 flex-1 flex flex-col justify-between">
                            {/* Line 1: Style & Status Badge / Conflict Icon */}
                            <div className="flex items-center justify-between gap-1 min-w-0">
                              <span className="text-[11px] font-bold text-[#ECE4D3] truncate leading-tight">
                                {style} {size !== 'ไม่ระบุขนาด' ? `• ${size}` : ''}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {hasArtistConflict && (
                                  <span
                                    title="ตารางเวลาซ้อนช่างเดียวกัน"
                                    className="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-950 text-amber-400 border border-amber-800/60 flex items-center gap-0.5"
                                  >
                                    <AlertCircle size={9} />
                                    <span className="hidden xl:inline">เวลาซ้อน</span>
                                  </span>
                                )}
                                <span
                                  className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase border ${stCfg.badgeBg} ${stCfg.badgeText} border-white/10`}
                                >
                                  {stCfg.label}
                                </span>
                              </div>
                            </div>

                            {/* Line 2: Time Start-End */}
                            <div className="text-[10px] font-mono font-bold text-[#ECE4D3]/90 truncate leading-tight">
                              {timeText}
                            </div>

                            {/* Line 3: Customer & Artist */}
                            <div className="text-[10px] text-[#A89F91] truncate flex items-center gap-1 leading-tight border-t border-white/10 pt-1 mt-0.5">
                              <User size={10} className="text-[#9C2F2F] shrink-0" />
                              <span className="truncate text-[#ECE4D3]/90 font-medium">
                                {customerName} • {artistName}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT SIDE PANEL: WEEKLY SUMMARY OR EVENT DETAIL */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[320px] shrink-0 bg-[#12100E] border border-[#4A443A]/60 rounded-xl overflow-hidden shadow-2xl sticky top-4">
        {selectedEvent && selectedSpecs && selectedSessionCfg ? (
          /* EVENT DETAIL PANEL */
          <div className="space-y-0 animate-fadeIn">
            {/* Header Bar */}
            <div className="p-3.5 border-b border-[#4A443A]/40 flex items-center justify-between bg-[#171512]">
              <div>
                <span className="text-[9px] text-[#A89F91] uppercase tracking-wider block">
                  รายละเอียดคิวนัดหมาย (EVENT DETAIL)
                </span>
                <h3 className="text-xs font-bold text-[#ECE4D3] flex items-center gap-2 mt-0.5">
                  <span>รอบสัก #{selectedEvent.session_number}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${selectedSessionCfg.badgeBg} ${selectedSessionCfg.badgeText} border-white/10`}
                  >
                    {selectedSessionCfg.label}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectEvent(null)}
                className="p-1 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#0E0D0C] rounded-lg border border-[#4A443A]/40 transition-colors"
                title="ปิด (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body Content */}
            <div className="p-3.5 space-y-3 max-h-[calc(100vh-210px)] overflow-y-auto">
              {/* Reference Image Section */}
              <div className="w-full rounded-lg border border-[#4A443A]/40 overflow-hidden bg-[#0E0D0C] relative group">
                {selectedEvent.estimate?.reference_images && selectedEvent.estimate.reference_images.length > 0 ? (
                  selectedEvent.estimate.reference_images.length === 1 ? (
                    <div className="w-full h-44 relative">
                      <CustomerReferenceImage
                        src={selectedEvent.estimate.reference_images[0]}
                        alt="Reference"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-2 left-2 bg-black/80 text-[9px] text-[#ECE4D3] font-mono px-2 py-0.5 rounded border border-white/10 z-10">
                        รูปอ้างอิง
                      </span>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1.5">
                      <span className="text-[9px] text-[#A89F91] uppercase tracking-wider block font-semibold">
                        รูปอ้างอิง ({selectedEvent.estimate.reference_images.length} รูป)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {selectedEvent.estimate.reference_images.slice(0, 5).map((imgUrl, idx) => (
                          <div key={idx} className="h-28 rounded border border-[#4A443A]/30 overflow-hidden relative">
                            <CustomerReferenceImage
                              src={imgUrl}
                              alt={`Reference ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="p-3 text-center text-xs text-[#7A7265]">
                    <span>ไม่มีรูปอ้างอิง</span>
                  </div>
                )}
              </div>

              {/* Core Specs Box */}
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                    <Palette size={12} className="text-[#9C2F2F]" /> สไตล์งาน
                  </span>
                  <span className="font-bold text-[#ECE4D3] text-[11px]">{selectedSpecs.style}</span>
                </div>

                <div className="flex justify-between items-center pt-1.5 border-t border-[#4A443A]/30">
                  <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                    <Maximize2 size={12} className="text-[#9C2F2F]" /> ขนาดรอยสัก
                  </span>
                  <span className="font-bold text-[#ECE4D3] text-[11px]">{selectedSpecs.size}</span>
                </div>

                <div className="flex justify-between items-center pt-1.5 border-t border-[#4A443A]/30">
                  <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                    <MapPin size={12} className="text-[#9C2F2F]" /> ตำแหน่งที่สัก
                  </span>
                  <span className="font-bold text-[#ECE4D3] text-[11px]">{selectedSpecs.placement}</span>
                </div>
              </div>

              {/* Date & Time Box */}
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-[#ECE4D3] font-bold text-[11px]">
                  <CalendarIcon size={13} className="text-[#9C2F2F]" />
                  <span>{formatDateBangkok(selectedEvent.start_at, true)}</span>
                </div>
                <div className="flex items-center justify-between text-[#A89F91] pt-1.5 border-t border-[#4A443A]/30">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <Clock size={12} className="text-[#7A7265]" />
                    <span>{selectedSpecs.timeText} น.</span>
                  </div>
                  <span className="text-[9px] text-[#ECE4D3] bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/40">
                    {calculateDurationText(selectedEvent.start_at, selectedEvent.end_at)}
                  </span>
                </div>
              </div>

              {/* Customer & Artist Box */}
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5 space-y-2 text-xs">
                <div>
                  <span className="text-[9px] text-[#7A7265] uppercase tracking-wider block mb-1">
                    ลูกค้า (Customer)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ECE4D3] text-[11px]">
                      {selectedEvent.customer?.display_name || 'ลูกค้า'}
                    </span>
                    {selectedEvent.customer?.phone && (
                      <a
                        href={`tel:${selectedEvent.customer.phone}`}
                        className="text-[10px] text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/40"
                      >
                        <Phone size={10} className="text-emerald-400" />
                        <span>{selectedEvent.customer.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#4A443A]/30">
                  <span className="text-[9px] text-[#7A7265] uppercase tracking-wider block mb-1">
                    ช่างสักผู้รับผิดชอบ (Artist)
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[9px] font-bold text-[#ECE4D3]">
                      {selectedEvent.artist?.nickname?.[0] || selectedEvent.artist?.name?.[0] || 'A'}
                    </div>
                    <span className="text-[11px] font-semibold text-[#ECE4D3]">
                      {selectedEvent.artist?.name}{' '}
                      {selectedEvent.artist?.nickname ? `(${selectedEvent.artist.nickname})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Booking Status & Note */}
              {selectedEvent.booking && selectedBookingCfg && (
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                  <span className="text-[9px] text-[#7A7265] uppercase tracking-wider block">
                    สถานะคำขอ/การจอง
                  </span>
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${selectedBookingCfg.bg} ${selectedBookingCfg.text} ${selectedBookingCfg.border}`}
                    >
                      {selectedBookingCfg.label}
                    </span>
                    {selectedEvent.booking.status === 'WAITING_DEPOSIT' && (
                      <span className="text-[9px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertCircle size={10} />
                        <span>รอมัดจำ</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Financial Summary */}
              {selectedEvent.financial && (
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5 space-y-2 text-xs">
                  <span className="text-[9px] text-[#7A7265] uppercase tracking-wider flex items-center gap-1">
                    <BadgeDollarSign size={11} />
                    <span>สรุปการเงิน</span>
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-[#0E0D0C] p-1.5 rounded border border-[#4A443A]/30">
                      <span className="text-[9px] text-[#7A7265] block">ราคาประเมิน</span>
                      <span className="font-bold text-[#ECE4D3]">
                        ฿{formatCurrency(selectedEvent.financial.quoted_price)}
                      </span>
                    </div>
                    <div className="bg-[#0E0D0C] p-1.5 rounded border border-[#4A443A]/30">
                      <span className="text-[9px] text-[#7A7265] block">มัดจำที่ต้องชำระ</span>
                      <span className="font-bold text-[#ECE4D3]">
                        ฿{formatCurrency(selectedEvent.financial.deposit_required)}
                      </span>
                    </div>
                    <div className="bg-[#0E0D0C] p-1.5 rounded border border-[#4A443A]/30">
                      <span className="text-[9px] text-[#7A7265] block">ชำระแล้ว</span>
                      <span className="font-bold text-emerald-400">
                        ฿{formatCurrency(selectedEvent.financial.paid_total)}
                      </span>
                    </div>
                    <div className="bg-[#0E0D0C] p-1.5 rounded border border-[#4A443A]/30">
                      <span className="text-[9px] text-[#7A7265] block">คงเหลือ</span>
                      <span
                        className={`font-bold ${
                          selectedEvent.financial.remaining_balance > 0
                            ? 'text-amber-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        ฿{formatCurrency(selectedEvent.financial.remaining_balance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Action */}
            <div className="p-3 border-t border-[#4A443A]/40 bg-[#171512]">
              <a
                href="/admin/requests"
                className="w-full py-2 bg-[#9C2F2F] hover:bg-[#852525] text-xs font-bold text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
              >
                <ExternalLink size={12} />
                <span>ดูรายละเอียดและจัดการคิวงาน</span>
              </a>
            </div>
          </div>
        ) : (
          /* WEEKLY SUMMARY PANEL (DEFAULT WHEN NO EVENT SELECTED) */
          <div className="space-y-0 animate-fadeIn">
            {/* Header Bar */}
            <div className="p-3.5 border-b border-[#4A443A]/40 bg-[#171512] flex items-center justify-between">
              <div>
                <span className="text-[9px] text-[#A89F91] uppercase tracking-wider block">
                  ตารางงานประจำสัปดาห์
                </span>
                <h3 className="text-xs font-bold text-[#ECE4D3] flex items-center gap-1.5 mt-0.5">
                  <TrendingUp size={14} className="text-[#9C2F2F]" />
                  <span>สรุปภาพรวม (WEEKLY SUMMARY)</span>
                </h3>
              </div>
            </div>

            {/* Body Content */}
            <div className="p-3.5 space-y-4 max-h-[calc(100vh-210px)] overflow-y-auto">
              {/* Weekly KPI Cards Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5">
                  <span className="text-[9px] text-[#A89F91] block">คิวงานสัปดาห์นี้</span>
                  <span className="text-lg font-bold text-[#ECE4D3] mt-0.5 block">
                    {metrics.total} <span className="text-[10px] text-[#7A7265] font-normal">งาน</span>
                  </span>
                </div>
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5">
                  <span className="text-[9px] text-[#A89F91] block">ยืนยันเรียบร้อย</span>
                  <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                    {metrics.confirmed} <span className="text-[10px] text-[#7A7265] font-normal">งาน</span>
                  </span>
                </div>
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5">
                  <span className="text-[9px] text-[#A89F91] block">รอมัดจำ</span>
                  <span className="text-lg font-bold text-amber-400 mt-0.5 block">
                    {metrics.waitingDeposit} <span className="text-[10px] text-[#7A7265] font-normal">งาน</span>
                  </span>
                </div>
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-2.5">
                  <span className="text-[9px] text-[#A89F91] block">กำลังดำเนินการ</span>
                  <span className="text-lg font-bold text-sky-400 mt-0.5 block">
                    {metrics.inProgress} <span className="text-[10px] text-[#7A7265] font-normal">งาน</span>
                  </span>
                </div>
              </div>

              {/* Selected Date Appointments List */}
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#ECE4D3] flex items-center gap-1.5">
                    <CalendarDays size={13} className="text-[#9C2F2F]" />
                    <span>คิวงานวันที่ {formatDateBangkok(selectedDateStr, false)}</span>
                  </span>
                  <span className="text-[9px] text-[#A89F91] font-mono">
                    {selectedDateEvents.length} คิว
                  </span>
                </div>

                <div className="space-y-1.5">
                  {selectedDateEvents.length === 0 ? (
                    <div className="p-3 text-center bg-[#0E0D0C] rounded border border-[#4A443A]/20">
                      <span className="text-[11px] text-[#7A7265] italic">ไม่มีคิวนัดหมายในวันนี้</span>
                    </div>
                  ) : (
                    selectedDateEvents.map((ev) => {
                      const { style, timeText } = getEventSpecs(ev);
                      const statusCfg = getSessionStatusConfig(ev.status);

                      return (
                        <div
                          key={ev.id}
                          onClick={() => onSelectEvent(ev)}
                          className="p-2 bg-[#0E0D0C] hover:bg-[#1A1815] border border-[#4A443A]/30 hover:border-[#9C2F2F]/60 rounded-md transition-all cursor-pointer flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-[#ECE4D3] truncate">
                                {style}
                              </span>
                              <span
                                className={`px-1 py-0 rounded text-[8px] font-semibold border ${statusCfg.badgeBg} ${statusCfg.badgeText} border-white/10`}
                              >
                                {statusCfg.label}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#A89F91] flex items-center gap-2 mt-0.5">
                              <span className="font-mono">{timeText}</span>
                              <span>•</span>
                              <span className="truncate">
                                {ev.artist?.nickname || ev.artist?.name || 'ช่างสัก'}
                              </span>
                            </div>
                          </div>
                          <ChevronRight
                            size={14}
                            className="text-[#7A7265] group-hover:text-[#ECE4D3] transition-colors shrink-0"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Active Artists Workload */}
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#ECE4D3] flex items-center gap-1.5">
                    <Users size={13} className="text-[#9C2F2F]" />
                    <span>ภาระงานช่างสัก (Artist Workload)</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {activeArtists.length === 0 ? (
                    <span className="text-[11px] text-[#7A7265] italic block text-center">
                      ไม่มีช่างสักในระบบ
                    </span>
                  ) : (
                    activeArtists.map((artist) => {
                      const artistSessionCount = events.filter((e) => e.artist_id === artist.id).length;
                      const maxCount = Math.max(1, metrics.total);
                      const percent = Math.round((artistSessionCount / maxCount) * 100);

                      return (
                        <div key={artist.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-medium text-[#ECE4D3]">
                              {artist.name} {artist.nickname ? `(${artist.nickname})` : ''}
                            </span>
                            <span className="text-[#A89F91] font-mono">
                              {artistSessionCount} งาน
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-[#0E0D0C] rounded-full overflow-hidden border border-[#4A443A]/30">
                            <div
                              className="h-full bg-[#9C2F2F] rounded-full transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Info */}
            <div className="p-3 border-t border-[#4A443A]/40 bg-[#171512] text-center">
              <span className="text-[10px] text-[#7A7265]">
                คลิกที่การ์ดในตารางเพื่อดูรายละเอียดเชิงลึก
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
