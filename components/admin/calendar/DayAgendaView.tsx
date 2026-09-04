'use client';

import React, { useMemo } from 'react';
import { CalendarSessionEvent } from './types';
import {
  formatDateBangkok,
  formatTimeBangkok,
  calculateDurationText,
  getSessionStatusConfig,
  getBookingStatusConfig,
} from './calendarUtils';
import {
  Clock,
  User,
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface DayAgendaViewProps {
  selectedDateStr: string; // YYYY-MM-DD
  events: CalendarSessionEvent[];
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: CalendarSessionEvent) => void;
  todayStr: string;
}

export default function DayAgendaView({
  selectedDateStr,
  events,
  onSelectDate,
  onSelectEvent,
  todayStr,
}: DayAgendaViewProps) {
  // Compute horizontal 14-day strip around selected date for mobile date picking
  const dateStrip = useMemo(() => {
    const d = new Date(selectedDateStr);
    const strip = [];
    const thaiShortDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    for (let offset = -3; offset <= 3; offset++) {
      const cur = new Date(d);
      cur.setDate(d.getDate() + offset);
      const iso = cur.toISOString().split('T')[0];
      strip.push({
        dateStr: iso,
        dayNumber: cur.getDate(),
        dayShort: thaiShortDays[cur.getDay()],
        isToday: iso === todayStr,
        isSelected: iso === selectedDateStr,
      });
    }
    return strip;
  }, [selectedDateStr, todayStr]);

  // Sort events by start time
  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [events]);

  return (
    <div className="space-y-4">
      {/* 1. Mobile Date Selector Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:hidden">
        {dateStrip.map((item) => (
          <button
            key={item.dateStr}
            type="button"
            onClick={() => onSelectDate(item.dateStr)}
            className={`flex flex-col items-center justify-center min-w-[48px] py-2 rounded-xl border text-center transition-all shrink-0 ${
              item.isSelected
                ? 'bg-[#9C2F2F] text-white border-[#9C2F2F] shadow-md shadow-[#9C2F2F]/20'
                : item.isToday
                ? 'bg-[#171512] text-[#ECE4D3] border-[#9C2F2F]/60'
                : 'bg-[#171512] text-[#A89F91] border-[#4A443A]/40 hover:border-[#A89F91]'
            }`}
          >
            <span className="text-[10px] font-medium">{item.dayShort}</span>
            <span className="text-sm font-bold mt-0.5">{item.dayNumber}</span>
          </button>
        ))}
      </div>

      {/* 2. Timeline Agenda List */}
      <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl overflow-hidden shadow-xl p-3 sm:p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#4A443A]/40 mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-[#9C2F2F]" />
            <h3 className="text-sm sm:text-base font-bold text-[#ECE4D3]">
              {formatDateBangkok(selectedDateStr, true)}
            </h3>
          </div>
          <span className="text-xs font-semibold text-[#A89F91]">
            ทั้งหมด {sortedEvents.length} คิว
          </span>
        </div>

        {/* Empty State */}
        {sortedEvents.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#171512] border border-[#4A443A]/40 flex items-center justify-center text-[#7A7265] mx-auto">
              <CalendarIcon size={20} />
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#A89F91]">
              ยังไม่มีคิวงานในวันที่เลือก
            </p>
            <p className="text-[11px] text-[#7A7265]">
              เมื่อมีการนัดหมายรอบสัก คิวจะแสดงตามลำดับเวลาในส่วนนี้
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((ev) => {
              const sessionStatusCfg = getSessionStatusConfig(ev.status);
              const bookingStatusCfg = ev.booking
                ? getBookingStatusConfig(ev.booking.status)
                : null;
              const durationText = calculateDurationText(ev.start_at, ev.end_at);
              const isWaitingDeposit = ev.booking?.status === 'WAITING_DEPOSIT';

              return (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvent(ev)}
                  className={`p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${sessionStatusCfg.bg} ${sessionStatusCfg.border} hover:scale-[1.005] hover:shadow-lg`}
                >
                  {/* Left: Time & Session Main Info */}
                  <div className="flex items-start gap-3.5">
                    {/* Time Box */}
                    <div className="bg-[#0E0D0C] border border-[#4A443A]/60 rounded-xl p-2 text-center min-w-[75px] shrink-0">
                      <span className="text-xs font-bold text-[#ECE4D3] block">
                        {formatTimeBangkok(ev.start_at)}
                      </span>
                      <span className="text-[10px] text-[#7A7265] block">ถึง</span>
                      <span className="text-xs font-bold text-[#A89F91] block">
                        {formatTimeBangkok(ev.end_at)}
                      </span>
                    </div>

                    {/* Customer & Artist & Duration */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#ECE4D3]">
                          {ev.customer?.display_name || 'ลูกค้า'}
                        </span>
                        <span className="text-xs text-[#7A7265] font-light">
                          (รอบ #{ev.session_number})
                        </span>
                        <span className="text-[10px] text-[#A89F91] bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/40">
                          {durationText}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-[#A89F91]">
                        <User size={12} className="text-[#7A7265]" />
                        <span>
                          ช่าง{ev.artist?.name}{' '}
                          {ev.artist?.nickname ? `(${ev.artist.nickname})` : ''}
                        </span>
                      </div>

                      {ev.note && (
                        <p className="text-[11px] text-[#7A7265] italic font-light pt-0.5">
                          &ldquo;{ev.note}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Badges & Indicator */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#4A443A]/30">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Session Status */}
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${sessionStatusCfg.badgeBg} ${sessionStatusCfg.badgeText} border-white/10`}
                      >
                        {ev.status === 'IN_PROGRESS' && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1" />
                        )}
                        {sessionStatusCfg.label}
                      </span>

                      {/* Parent Booking Status */}
                      {bookingStatusCfg && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${bookingStatusCfg.bg} ${bookingStatusCfg.text} ${bookingStatusCfg.border}`}
                        >
                          {bookingStatusCfg.label}
                        </span>
                      )}

                      {/* WAITING_DEPOSIT Warning */}
                      {isWaitingDeposit && (
                        <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                          <AlertCircle size={11} />
                          <span>รอมัดจำ</span>
                        </span>
                      )}
                    </div>

                    <ChevronRight size={16} className="text-[#7A7265] hidden sm:block" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
