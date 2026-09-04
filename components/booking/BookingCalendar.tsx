'use client';

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

export interface BusyRange {
  start_at: string;
  end_at: string;
}

interface BookingCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
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

const DAYS_OF_WEEK_THAI = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BookingCalendar({
  selectedDate,
  onDateSelect,
  artistWorkingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  busyRanges = [],
  loading = false,
  onMonthChange,
}: BookingCalendarProps) {
  // Get today's date in Asia/Bangkok
  const todayStr = useMemo(() => {
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }, []);

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
  const yearBE = year + 543;
  const monthNameThai = `${THAI_MONTHS_FULL[month]} ${yearBE}`;

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

  // Check if previous month is in the past
  const isPrevDisabled = useMemo(() => {
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return viewDate <= currentMonthStart;
  }, [viewDate]);

  // Set of dates with busy ranges (in Bangkok time YYYY-MM-DD)
  const busyDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const range of busyRanges) {
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
  }, [busyRanges]);

  // Calendar Grid Calculation
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 6 = Sat
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = useMemo(() => {
    const slots: Array<{
      day: number | null;
      dateStr: string;
      isPast: boolean;
      isWorkingDay: boolean;
      hasBusySession: boolean;
      isSelected: boolean;
    }> = [];

    // Leading empty slots
    for (let i = 0; i < firstDayOfWeek; i++) {
      slots.push({
        day: null,
        dateStr: '',
        isPast: true,
        isWorkingDay: false,
        hasBusySession: false,
        isSelected: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const padM = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
      const padD = d < 10 ? `0${d}` : `${d}`;
      const dateStr = `${year}-${padM}-${padD}`;

      const dayOfWeekIdx = new Date(year, month, d).getDay();
      const dayCode = DAY_CODES[dayOfWeekIdx];

      // Working days validation (if working_days is empty or undefined, do not block)
      const isWorkingDay =
        !artistWorkingDays || artistWorkingDays.length === 0
          ? true
          : artistWorkingDays.includes(dayCode);

      const isPast = dateStr < todayStr;
      const hasBusySession = busyDatesSet.has(dateStr);
      const isSelected = selectedDate === dateStr;

      slots.push({
        day: d,
        dateStr,
        isPast,
        isWorkingDay,
        hasBusySession,
        isSelected,
      });
    }

    return slots;
  }, [year, month, firstDayOfWeek, daysInMonth, artistWorkingDays, todayStr, busyDatesSet, selectedDate]);

  return (
    <div className="bg-studio-main border border-studio-border p-4 sm:p-5 rounded-[6px] w-full space-y-3 font-prompt">
      {/* Calendar Header with Navigation */}
      <div className="flex justify-between items-center pb-2.5 border-b border-studio-border/60">
        <div>
          <h4 className="text-xs uppercase tracking-wider text-studio-primary font-bold">
            {monthNameThai}
          </h4>
          <span className="text-[10px] text-studio-secondary">
            เลือกวันที่ต้องการส่งคำขอจองคิว
          </span>
        </div>
        <div className="flex space-x-1.5 text-studio-secondary">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isPrevDisabled || loading}
            aria-label="เดือนก่อนหน้า"
            className="p-1.5 hover:text-studio-red hover:bg-studio-card rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={loading}
            aria-label="เดือนถัดไป"
            className="p-1.5 hover:text-studio-red hover:bg-studio-card rounded transition-colors disabled:opacity-20"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 text-center text-[11px] uppercase tracking-wider text-studio-muted font-bold">
        {DAYS_OF_WEEK_THAI.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 relative min-h-[190px]">
        {loading && (
          <div className="absolute inset-0 bg-studio-main/70 backdrop-blur-[1px] flex items-center justify-center z-10 rounded">
            <span className="text-xs text-studio-secondary animate-pulse">กำลังโหลดตารางคิว...</span>
          </div>
        )}

        {calendarDays.map((slot, idx) => {
          if (slot.day === null) {
            return <div key={`empty-${idx}`} className="py-2.5 sm:py-3"></div>;
          }

          const canSelect = !slot.isPast && slot.isWorkingDay;

          return (
            <button
              key={`day-${slot.dateStr}`}
              type="button"
              disabled={!canSelect}
              onClick={() => canSelect && onDateSelect(slot.dateStr)}
              className={`relative py-2 sm:py-2.5 px-1 text-xs sm:text-sm font-semibold rounded-[4px] border transition-all duration-150 flex flex-col items-center justify-center min-h-[42px] ${
                slot.isSelected
                  ? 'bg-studio-red border-studio-red text-studio-paper font-bold shadow-sm ring-1 ring-studio-red'
                  : canSelect
                  ? 'bg-studio-card border-studio-border text-studio-primary hover:border-studio-red/70 hover:text-studio-red'
                  : 'bg-transparent border-transparent text-studio-muted/20 cursor-not-allowed'
              }`}
            >
              <span>{slot.day}</span>

              {/* Busy Indicator Red Dot */}
              {slot.hasBusySession && (
                <span
                  title="วันนี้มีช่วงเวลาติดคิวแล้ว"
                  className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    slot.isSelected ? 'bg-studio-paper' : 'bg-studio-red'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend & Availability Semantic */}
      <div className="pt-2.5 border-t border-studio-border/60 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-studio-secondary gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-studio-red shrink-0" />
            <span className="text-[10px] text-studio-muted">มีช่วงเวลาติดคิว</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-studio-card border border-studio-border shrink-0" />
            <span className="text-[10px] text-studio-muted">เลือกได้</span>
          </div>
        </div>

        {selectedDate && (
          <div className="text-[11px] text-studio-red font-semibold">
            วันที่เลือก: {selectedDate}
          </div>
        )}
      </div>
    </div>
  );
}
