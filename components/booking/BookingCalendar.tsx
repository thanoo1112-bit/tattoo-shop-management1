'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getThailandTodayStr, getThailandTomorrowStr } from '../portal/portalUtils';

export interface BusyRange {
  start_at: string;
  end_at: string;
}

interface BookingCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
  artistId?: string;
  artistWorkingDays?: string[]; // e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  busyRanges?: BusyRange[];
  loading?: boolean;
  onMonthChange?: (year: number, month: number) => void; // month is 0-indexed (0 = Jan, 11 = Dec)
}

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

// Weekday header starting Monday (จ) to Sunday (อา)
const DAYS_OF_WEEK_THAI = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
// Mapping JS getDay() (0=Sun, 1=Mon...6=Sat) to Monday-first codes
const DAY_CODES_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function BookingCalendar({
  selectedDate,
  onDateSelect,
  artistId,
  artistWorkingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  busyRanges: busyRangesProp = [],
  loading = false,
  onMonthChange,
}: BookingCalendarProps) {
  // Earliest bookable date is TODAY in Asia/Bangkok time
  const minBookableDateStr = useMemo(() => getThailandTodayStr(), []);
  const todayStr = useMemo(() => getThailandTodayStr(), []);

  // Initialize display month from selectedDate or today
  const [viewDate, setViewDate] = useState(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      }
    }
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0 - 11
  const monthNameThai = `${THAI_MONTHS_FULL[month]} ${year}`;

  // Internal fetched busy ranges if artistId is provided
  const [fetchedBusyRanges, setFetchedBusyRanges] = useState<BusyRange[]>([]);
  const [fetchingBusy, setFetchingBusy] = useState(false);

  useEffect(() => {
    if (!artistId) {
      setFetchedBusyRanges([]);
      return;
    }

    let isMounted = true;
    setFetchingBusy(true);

    async function fetchAvailability() {
      try {
        const padMo = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const startDate = `${year}-${padMo}-01`;
        const endDate = `${year}-${padMo}-${lastDay < 10 ? `0${lastDay}` : lastDay}`;

        const supabase = createClient();
        const { data, error } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: artistId,
          p_start_date: startDate,
          p_end_date: endDate,
        });

        if (isMounted) {
          if (!error && Array.isArray(data)) {
            setFetchedBusyRanges(data);
          } else {
            const { data: sessData } = await supabase
              .from('booking_sessions')
              .select('start_at, end_at')
              .eq('artist_id', artistId)
              .in('status', ['SCHEDULED', 'IN_PROGRESS']);
            setFetchedBusyRanges((sessData || []) as BusyRange[]);
          }
        }
      } catch (err) {
        console.error('[BookingCalendar] Error fetching busy ranges:', err);
      } finally {
        if (isMounted) setFetchingBusy(false);
      }
    }

    fetchAvailability();

    return () => {
      isMounted = false;
    };
  }, [artistId, year, month]);

  const activeBusyRanges = useMemo(() => {
    if (busyRangesProp && busyRangesProp.length > 0) return busyRangesProp;
    return fetchedBusyRanges;
  }, [busyRangesProp, fetchedBusyRanges]);

  // Month navigation
  const handlePrevMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    setViewDate(newDate);
    if (onMonthChange) {
      onMonthChange(newDate.getFullYear(), newDate.getMonth());
    }
  };

  const handleNextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    setViewDate(newDate);
    if (onMonthChange) {
      onMonthChange(newDate.getFullYear(), newDate.getMonth());
    }
  };

  const isPrevDisabled = useMemo(() => {
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return viewDate <= currentMonthStart;
  }, [viewDate]);

  // Set of dates with busy ranges (in Bangkok time YYYY-MM-DD)
  const busyDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const range of activeBusyRanges) {
      try {
        const startD = new Date(range.start_at);
        const bkkDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(startD);
        set.add(bkkDateStr);
      } catch (_) {}
    }
    return set;
  }, [activeBusyRanges]);

  // 42-day Calendar Grid Calculation (6 rows x 7 cols, Monday-first)
  const calendarSlots = useMemo(() => {
    const slots: Array<{
      day: number;
      monthOffset: -1 | 0 | 1;
      dateStr: string;
      isPast: boolean;
      isWorkingDay: boolean;
      hasBusySession: boolean;
      canSelect: boolean;
      isSelected: boolean;
    }> = [];

    // JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const firstDayJS = new Date(year, month, 1).getDay();
    // Monday-based offset (0 = Mon, 1 = Tue, ..., 6 = Sun)
    const mondayBasedFirstDay = (firstDayJS + 6) % 7;

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();

    // 1. Previous month trailing days
    for (let i = mondayBasedFirstDay - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      const padM = prevDate.getMonth() + 1 < 10 ? `0${prevDate.getMonth() + 1}` : `${prevDate.getMonth() + 1}`;
      const padD = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${prevDate.getFullYear()}-${padM}-${padD}`;

      slots.push({
        day: d,
        monthOffset: -1,
        dateStr,
        isPast: true,
        isWorkingDay: false,
        hasBusySession: false,
        canSelect: false,
        isSelected: false,
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const padM = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
      const padD = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${year}-${padM}-${padD}`;

      const jsDay = new Date(year, month, d).getDay();
      const monFirstIdx = (jsDay + 6) % 7;
      const isPast = dateStr < minBookableDateStr;
      const hasBusySession = busyDatesSet.has(dateStr);
      const isSelected = selectedDate === dateStr;

      // Customer date picker rule: Future & Not Busy => Selectable
      const canSelect = !isPast && !hasBusySession;

      slots.push({
        day: d,
        monthOffset: 0,
        dateStr,
        isPast,
        isWorkingDay: true,
        hasBusySession,
        canSelect,
        isSelected,
      });
    }

    // 3. Next month leading days (to complete 42 slots = 6 rows x 7 cols)
    const remainingSlots = 42 - slots.length;
    for (let d = 1; d <= remainingSlots; d++) {
      const nextDate = new Date(year, month + 1, d);
      const padM = nextDate.getMonth() + 1 < 10 ? `0${nextDate.getMonth() + 1}` : `${nextDate.getMonth() + 1}`;
      const padD = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${nextDate.getFullYear()}-${padM}-${padD}`;

      slots.push({
        day: d,
        monthOffset: 1,
        dateStr,
        isPast: false,
        isWorkingDay: true,
        hasBusySession: false,
        canSelect: false,
        isSelected: false,
      });
    }

    return slots;
  }, [year, month, minBookableDateStr, busyDatesSet, selectedDate]);

  const isGridLoading = loading || fetchingBusy;

  // Handle "วันนี้" button click
  const handleTodayClick = () => {
    onDateSelect(todayStr);
  };

  return (
    <div className="bg-[#262422] border border-[#3D3935] p-3 rounded-lg w-full max-w-[280px] font-prompt select-none text-studio-primary shadow-2xl">
      {/* Calendar Header with Navigation */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#3D3935]/60">
        <div className="flex items-center gap-1 cursor-pointer">
          <span className="text-xs font-medium text-[#ECE4D3]">
            {monthNameThai}
          </span>
          <span className="text-[10px] text-[#A89F91]">▼</span>
        </div>
        <div className="flex items-center space-x-1 text-[#A89F91]">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isPrevDisabled || isGridLoading}
            aria-label="เดือนก่อนหน้า"
            className="p-1 hover:text-white hover:bg-[#33302B] rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isGridLoading}
            aria-label="เดือนถัดไป"
            className="p-1 hover:text-white hover:bg-[#33302B] rounded transition-colors disabled:opacity-20 cursor-pointer"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Week Days Header: จ  อ  พ  พฤ  ศ  ส  อา */}
      <div className="grid grid-cols-7 text-center text-[11px] font-normal text-[#A89F91] mb-1">
        {DAYS_OF_WEEK_THAI.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* 42-day Calendar Grid */}
      <div className="grid grid-cols-7 gap-0.5 relative min-h-[170px]">
        {isGridLoading && (
          <div className="absolute inset-0 bg-[#262422]/85 backdrop-blur-[1px] flex items-center justify-center z-10 rounded">
            <span className="text-[11px] text-amber-400 animate-pulse">กำลังตรวจสอบคิว...</span>
          </div>
        )}

        {calendarSlots.map((slot, idx) => {
          const isCurrentMonth = slot.monthOffset === 0;

          return (
            <button
              key={`slot-${idx}-${slot.dateStr}`}
              type="button"
              disabled={!slot.canSelect}
              onClick={() => {
                if (slot.canSelect) {
                  onDateSelect(slot.dateStr);
                } else if (slot.monthOffset === -1) {
                  handlePrevMonth();
                } else if (slot.monthOffset === 1) {
                  handleNextMonth();
                }
              }}
              tabIndex={slot.canSelect ? 0 : -1}
              aria-label={`${slot.day} ${slot.hasBusySession ? 'มีคิวจองแล้ว (ไม่ว่าง)' : slot.canSelect ? 'เลือกได้' : 'ไม่สามารถเลือกได้'}`}
              className={`relative py-1 text-xs transition-all flex items-center justify-center h-[28px] w-full rounded-[4px] font-medium ${
                slot.isSelected
                  ? 'bg-studio-red text-white font-bold shadow-md ring-1 ring-studio-red'
                  : !isCurrentMonth
                  ? 'text-[#555048] hover:text-[#777065] cursor-pointer'
                  : slot.canSelect
                  ? 'text-[#ECE4D3] hover:bg-[#38342E] hover:text-white cursor-pointer'
                  : 'text-[#5E584E]/50 cursor-not-allowed'
              }`}
            >
              <span>{slot.day}</span>
              {slot.hasBusySession && (
                <span
                  className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-studio-red shrink-0"
                  title="มีคิวจองแล้ว"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Bar: ล้าง & วันนี้ */}
      <div className="pt-2 mt-2 border-t border-[#3D3935]/60 flex items-center justify-between text-xs font-normal">
        <button
          type="button"
          onClick={() => onDateSelect('')}
          className="text-studio-red hover:underline cursor-pointer transition-colors"
        >
          ล้าง
        </button>
        <button
          type="button"
          onClick={handleTodayClick}
          className="text-studio-red hover:underline cursor-pointer transition-colors"
        >
          วันนี้
        </button>
      </div>
    </div>
  );
}
