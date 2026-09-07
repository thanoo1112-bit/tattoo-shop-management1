'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { CalendarSessionEvent } from './types';
import {
  getDateStrBangkok,
  formatTimeBangkok,
  getSessionStatusConfig,
  THAI_DAYS_SHORT,
  TIMEZONE,
} from './calendarUtils';
import { User, AlertCircle } from 'lucide-react';

interface WeekCalendarViewProps {
  selectedDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent) => void;
  todayStr: string;
}

const DEFAULT_START_HOUR = 9; // 09:00
const DEFAULT_END_HOUR = 20; // 20:00
const HOUR_HEIGHT = 64; // Pixels per hour row

interface EventLayoutItem {
  event: CalendarSessionEvent;
  sMin: number;
  eMin: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  totalCols: number;
}

/**
 * Returns total minutes of day in Bangkok timezone (0 to 1439).
 */
function getBangkokMinutesOfDay(iso: string): number {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(d);

    let hour = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'hour') {
        hour = parseInt(part.value, 10);
        if (hour === 24) hour = 0;
      } else if (part.type === 'minute') {
        minute = parseInt(part.value, 10);
      }
    }
    return hour * 60 + minute;
  } catch {
    return 0;
  }
}

/**
 * Calculates positioning and side-by-side overlap columns for events in a single day.
 */
function calculateDayLayout(
  dayEvents: CalendarSessionEvent[],
  gridStartMin: number,
  hourHeight: number
): EventLayoutItem[] {
  if (!dayEvents || dayEvents.length === 0) return [];

  const items: EventLayoutItem[] = dayEvents.map((event) => {
    const sMin = getBangkokMinutesOfDay(event.start_at);
    let eMin = getBangkokMinutesOfDay(event.end_at);

    // If end time is midnight or before start time (e.g. overnight session), cap to 1440 min
    if (eMin <= sMin) {
      eMin = 1440;
    }

    const topPx = (sMin - gridStartMin) * (hourHeight / 60);
    const durationMin = Math.max(eMin - sMin, 15);
    const heightPx = Math.max(durationMin * (hourHeight / 60), 44);

    return {
      event,
      sMin,
      eMin,
      topPx,
      heightPx,
      colIndex: 0,
      totalCols: 1,
    };
  });

  // Sort by start time ascending, then end time descending
  items.sort((a, b) => a.sMin - b.sMin || b.eMin - a.eMin);

  // Group into overlapping clusters (connected components)
  const clusters: EventLayoutItem[][] = [];
  let currentCluster: EventLayoutItem[] = [];
  let clusterEnd = -1;

  for (const item of items) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.eMin;
    } else if (item.sMin < clusterEnd) {
      currentCluster.push(item);
      if (item.eMin > clusterEnd) {
        clusterEnd = item.eMin;
      }
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.eMin;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // Within each cluster, assign column indices side-by-side
  for (const cluster of clusters) {
    const columns: EventLayoutItem[][] = [];

    for (const item of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (item.sMin >= lastInCol.eMin) {
          columns[c].push(item);
          item.colIndex = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.colIndex = columns.length;
        columns.push([item]);
      }
    }

    const totalCols = columns.length;
    for (const item of cluster) {
      item.totalCols = totalCols;
    }
  }

  return items;
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

  // Dynamically determine grid start & end hours so late sessions (e.g. 23:00) are never clipped
  const { gridStartHour, gridEndHour } = useMemo(() => {
    let startH = DEFAULT_START_HOUR;
    let endH = DEFAULT_END_HOUR;

    events.forEach((ev) => {
      const sMin = getBangkokMinutesOfDay(ev.start_at);
      let eMin = getBangkokMinutesOfDay(ev.end_at);
      if (eMin <= sMin) eMin = 1440;

      const evStartH = Math.floor(sMin / 60);
      const evEndH = Math.ceil(eMin / 60);

      if (evStartH < startH) {
        startH = Math.max(0, evStartH);
      }
      if (evEndH > endH) {
        endH = Math.min(24, evEndH);
      }
    });

    return { gridStartHour: startH, gridEndHour: endH };
  }, [events]);

  const hours = useMemo(() => {
    const list = [];
    for (let h = gridStartHour; h < gridEndHour; h++) {
      list.push(h);
    }
    return list;
  }, [gridStartHour, gridEndHour]);

  const gridStartMin = gridStartHour * 60;
  const gridEndMin = gridEndHour * 60;
  const totalGridHeight = (gridEndHour - gridStartHour) * HOUR_HEIGHT;

  // Compute layout per day column
  const dayLayoutMap = useMemo(() => {
    const map = new Map<string, EventLayoutItem[]>();
    weekDays.forEach((day) => {
      const dayEvs = eventsByDate.get(day.dateStr) || [];
      const layout = calculateDayLayout(dayEvs, gridStartMin, HOUR_HEIGHT);
      map.set(day.dateStr, layout);
    });
    return map;
  }, [weekDays, eventsByDate, gridStartMin]);

  // Track real-time Bangkok current time for the red time line
  const [currentBangkokMin, setCurrentBangkokMin] = useState<number>(() =>
    getBangkokMinutesOfDay(new Date().toISOString())
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBangkokMin(getBangkokMinutesOfDay(new Date().toISOString()));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const isCurrentTimeVisible =
    currentBangkokMin >= gridStartMin && currentBangkokMin <= gridEndMin;
  const currentTimeTopPx = (currentBangkokMin - gridStartMin) * (HOUR_HEIGHT / 60);

  const totalWeekEvents = events.length;

  return (
    <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Scrollable Container for Grid (desktop full width, mobile/tablet horizontal scroll min-w-[750px]) */}
      <div className="overflow-x-auto">
        <div className="min-w-[750px] flex flex-col">
          {/* 7-Day Header with Time column gap */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#4A443A]/40 bg-[#171512] sticky top-0 z-20">
            <div className="p-2 sm:p-3 text-center border-r border-[#4A443A]/20 flex items-center justify-center">
              <span className="text-[10px] text-[#A89F91] font-mono uppercase tracking-wider">
                เวลา
              </span>
            </div>
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

          {/* Grid Body: Time Labels Column + 7 Day Columns */}
          <div className="relative grid grid-cols-[60px_repeat(7,1fr)] bg-[#0E0D0C]">
            {/* Time Labels Column */}
            <div className="border-r border-[#4A443A]/20 bg-[#12100E] select-none">
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="border-b border-[#4A443A]/10 px-1 text-[11px] font-mono text-[#A89F91] flex items-start justify-end pt-1 pr-2"
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* 7 Day Columns */}
            {weekDays.map((day) => {
              const dayLayouts = dayLayoutMap.get(day.dateStr) || [];

              return (
                <div
                  key={day.dateStr}
                  className={`relative border-r border-[#4A443A]/20 last:border-r-0 ${
                    day.isSelected ? 'bg-[#12100E]/80' : 'bg-[#0E0D0C]'
                  }`}
                  style={{ height: `${totalGridHeight}px` }}
                >
                  {/* Hourly horizontal grid background lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-[#4A443A]/15 pointer-events-none"
                    />
                  ))}

                  {/* Current Time Indicator Line (TODAY ONLY) */}
                  {day.isToday && isCurrentTimeVisible && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${currentTimeTopPx}px` }}
                    >
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-[#9C2F2F] shadow-sm shadow-red-900/50" />
                      <div className="h-[2px] bg-[#9C2F2F] w-full opacity-90 shadow-sm" />
                    </div>
                  )}

                  {/* Event Blocks */}
                  {dayLayouts.map((item) => {
                    const ev = item.event;
                    const statusCfg = getSessionStatusConfig(ev.status);
                    const isWaitingDeposit = ev.booking?.status === 'WAITING_DEPOSIT';
                    const timeText = `${formatTimeBangkok(ev.start_at)} - ${formatTimeBangkok(
                      ev.end_at
                    )}`;

                    return (
                      <div
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        style={{
                          top: `${item.topPx}px`,
                          height: `${item.heightPx}px`,
                          left: `calc(${(item.colIndex / item.totalCols) * 100}% + 2px)`,
                          width: `calc(${(1 / item.totalCols) * 100}% - 4px)`,
                        }}
                        className={`absolute z-10 p-1.5 sm:p-2 rounded-lg border transition-all flex flex-col justify-between overflow-hidden cursor-pointer shadow-md ${statusCfg.bg} ${statusCfg.border} hover:z-30 hover:scale-[1.01] hover:brightness-110 hover:border-white/40`}
                      >
                        {/* Header: Customer name + Session Badge */}
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-[#ECE4D3] truncate">
                              {ev.customer?.display_name || 'ลูกค้า'}
                            </span>
                            <span
                              className={`px-1 py-0.2 rounded text-[9px] font-semibold border shrink-0 ${statusCfg.badgeBg} ${statusCfg.badgeText} border-white/10`}
                            >
                              {statusCfg.label}
                            </span>
                          </div>

                          <div className="text-[10px] text-[#A89F91] flex items-center gap-1 truncate">
                            <User size={10} className="text-[#7A7265] shrink-0" />
                            <span className="truncate">
                              {ev.artist?.nickname || ev.artist?.name || 'ช่างสัก'}
                            </span>
                            <span className="text-[9px] text-[#7A7265] ml-auto shrink-0 font-medium">
                              รอบ #{ev.session_number}
                            </span>
                          </div>
                        </div>

                        {/* Footer: Time string & Waiting deposit warning */}
                        <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between gap-1 text-[10px] font-mono text-[#ECE4D3]/90">
                          <span className="truncate">{timeText}</span>
                          {isWaitingDeposit && (
                            <span className="text-amber-400 font-bold flex items-center gap-0.5 text-[9px] shrink-0">
                              <AlertCircle size={9} />
                              รอมัดจำ
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Empty State Overlay if zero events in whole week */}
          {totalWeekEvents === 0 && (
            <div className="p-8 text-center border-t border-[#4A443A]/30 bg-[#171512]/60">
              <p className="text-xs font-semibold text-[#ECE4D3]">ไม่มีคิวนัดหมายในช่วงเวลานี้</p>
              <p className="text-[11px] text-[#A89F91] mt-1">
                เมื่อมีการกำหนดรอบสัก คิวงานจะแสดงตามช่วงเวลาจริงในปฏิทินนี้
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

