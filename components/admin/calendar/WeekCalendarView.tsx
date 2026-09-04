'use client';

import React, { useMemo } from 'react';
import { CalendarSessionEvent } from './types';
import {
  getDateStrBangkok,
  formatTimeBangkok,
  THAI_DAYS_SHORT,
  WORKING_HOURS_START,
  WORKING_HOURS_END,
} from './calendarUtils';
import CalendarSessionEventComponent from './CalendarSessionEvent';

interface WeekCalendarViewProps {
  selectedDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent) => void;
  todayStr: string;
}

export default function WeekCalendarView({
  selectedDateStr,
  events,
  onSelectDate,
  onSelectEvent,
  todayStr,
}: WeekCalendarViewProps) {
  // Compute 7 days of the week (Monday to Sunday)
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
      days.push({
        dateStr: iso,
        dayNumber: cur.getDate(),
        dayName: dayNames[i],
        shortDay: THAI_DAYS_SHORT[(i + 1) % 7],
        isToday: iso === todayStr,
        isSelected: iso === selectedDateStr,
      });
    }
    return days;
  }, [selectedDateStr, todayStr]);

  // Group events by date string
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

  const totalWeekEvents = events.length;

  return (
    <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl">
      {/* 7-Day Header */}
      <div className="grid grid-cols-7 border-b border-[#4A443A]/40 bg-[#171512]">
        {weekDays.map((day) => (
          <div
            key={day.dateStr}
            onClick={() => onSelectDate(day.dateStr)}
            className={`p-2 sm:p-3 text-center border-r border-[#4A443A]/20 last:border-r-0 cursor-pointer transition-colors ${
              day.isSelected ? 'bg-[#1A1815]' : 'hover:bg-[#1A1815]/60'
            }`}
          >
            <span className="text-[10px] text-[#A89F91] block uppercase tracking-wider">
              {day.dayName}
            </span>
            <span
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs sm:text-sm font-bold mt-1 ${
                day.isToday
                  ? 'bg-[#9C2F2F] text-white shadow-sm'
                  : day.isSelected
                  ? 'text-[#ECE4D3] ring-1 ring-[#9C2F2F]'
                  : 'text-[#ECE4D3]'
              }`}
            >
              {day.dayNumber}
            </span>
          </div>
        ))}
      </div>

      {/* 7-Day Columns Body */}
      <div className="grid grid-cols-7 min-h-[450px] sm:min-h-[550px] divide-x divide-[#4A443A]/20 bg-[#0E0D0C]">
        {weekDays.map((day) => {
          const dayEvents = (eventsByDate.get(day.dateStr) || []).sort(
            (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
          );

          return (
            <div
              key={day.dateStr}
              className={`p-1.5 sm:p-2.5 space-y-2 flex flex-col ${
                day.isSelected ? 'bg-[#12100E]' : 'bg-[#0E0D0C]'
              }`}
            >
              {dayEvents.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-8 text-center text-[11px] text-[#4A443A] font-light">
                  -
                </div>
              ) : (
                dayEvents.map((ev) => (
                  <CalendarSessionEventComponent
                    key={ev.id}
                    event={ev}
                    onClick={onSelectEvent}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State Banner if no events across whole week */}
      {totalWeekEvents === 0 && (
        <div className="p-6 text-center border-t border-[#4A443A]/30 bg-[#171512]/40">
          <p className="text-xs text-[#A89F91]">ยังไม่มีคิวงานในช่วงสัปดาห์นี้</p>
          <p className="text-[11px] text-[#7A7265] mt-0.5">
            เมื่อมีการกำหนดรอบสัก คิวงานจะแสดงในปฏิทินนี้โดยอัตโนมัติ
          </p>
        </div>
      )}
    </div>
  );
}
