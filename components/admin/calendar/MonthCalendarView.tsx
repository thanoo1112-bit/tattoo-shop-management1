'use client';

import React, { useMemo } from 'react';
import { CalendarSessionEvent } from './types';
import {
  getDateStrBangkok,
  THAI_DAYS_FULL,
  THAI_DAYS_SHORT,
  formatTimeBangkok,
  getSessionStatusConfig,
} from './calendarUtils';
import CalendarSessionEventComponent from './CalendarSessionEvent';
import { Calendar as CalendarIcon } from 'lucide-react';

interface MonthCalendarViewProps {
  currentDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent) => void;
  todayStr: string;
}

export default function MonthCalendarView({
  currentDateStr,
  events,
  onSelectDate,
  onSelectEvent,
  todayStr,
}: MonthCalendarViewProps) {
  // Parse year and month
  const { year, month } = useMemo(() => {
    const [y, m] = currentDateStr.split('-').map(Number);
    return { year: y || 2026, month: m || 9 };
  }, [currentDateStr]);

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarSessionEvent[]>();
    events.forEach((ev) => {
      const d = getDateStrBangkok(ev.start_at);
      const list = map.get(d) || [];
      list.push(ev);
      map.set(d, list);
    });
    return map;
  }, [events]);

  // Build 35 or 42 grid cells
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sun
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const cells: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarSessionEvent[];
    }> = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 2, dayNum);
      const iso = prevDate.toISOString().split('T')[0];
      cells.push({
        dateStr: iso,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: iso === todayStr,
        isSelected: iso === currentDateStr,
        events: eventsByDate.get(iso) || [],
      });
    }

    // Current month days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const curDate = new Date(year, month - 1, day);
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const iso = `${year}-${mStr}-${dStr}`;
      cells.push({
        dateStr: iso,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: iso === todayStr,
        isSelected: iso === currentDateStr,
        events: eventsByDate.get(iso) || [],
      });
    }

    // Next month padding to fill complete weeks (up to multiple of 7)
    const remainingCells = 7 - (cells.length % 7);
    if (remainingCells < 7) {
      for (let day = 1; day <= remainingCells; day++) {
        const nextDate = new Date(year, month, day);
        const iso = nextDate.toISOString().split('T')[0];
        cells.push({
          dateStr: iso,
          dayNumber: day,
          isCurrentMonth: false,
          isToday: iso === todayStr,
          isSelected: iso === currentDateStr,
          events: eventsByDate.get(iso) || [],
        });
      }
    }

    return cells;
  }, [year, month, todayStr, currentDateStr, eventsByDate]);

  return (
    <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl">
      {/* Weekday Header Row */}
      <div className="grid grid-cols-7 border-b border-[#4A443A]/40 bg-[#171512] text-center">
        {THAI_DAYS_FULL.map((dName, idx) => (
          <div
            key={dName}
            className="py-2.5 text-xs font-semibold text-[#A89F91] border-r border-[#4A443A]/20 last:border-r-0"
          >
            <span className="hidden sm:inline">{dName}</span>
            <span className="sm:hidden">{THAI_DAYS_SHORT[idx]}</span>
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr bg-[#0E0D0C] gap-[1px]">
        {calendarCells.map((cell) => {
          const hasEvents = cell.events.length > 0;
          const maxVisible = 2;
          const overflowCount = cell.events.length - maxVisible;

          return (
            <div
              key={cell.dateStr}
              onClick={() => onSelectDate(cell.dateStr)}
              className={`min-h-[90px] sm:min-h-[120px] p-1.5 sm:p-2 border-b border-r border-[#4A443A]/20 transition-colors flex flex-col justify-between cursor-pointer ${
                cell.isCurrentMonth
                  ? 'bg-[#12100E] hover:bg-[#1A1815]'
                  : 'bg-[#0E0D0C]/80 text-zinc-600'
              } ${cell.isSelected ? 'ring-1 ring-inset ring-[#9C2F2F]' : ''}`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    cell.isToday
                      ? 'bg-[#9C2F2F] text-white'
                      : cell.isCurrentMonth
                      ? 'text-[#ECE4D3]'
                      : 'text-[#4A443A]'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {hasEvents && (
                  <span className="text-[10px] text-[#7A7265] hidden sm:inline">
                    {cell.events.length} คิว
                  </span>
                )}
              </div>

              {/* Events List in Day Cell */}
              <div className="space-y-1 flex-1 overflow-hidden">
                {cell.events.slice(0, maxVisible).map((ev) => (
                  <CalendarSessionEventComponent
                    key={ev.id}
                    event={ev}
                    onClick={onSelectEvent}
                    compact
                  />
                ))}

                {overflowCount > 0 && (
                  <div className="text-[10px] font-bold text-[#A89F91] text-center bg-[#171512] rounded py-0.5 border border-[#4A443A]/30">
                    +{overflowCount} คิว
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
