'use client';

import React from 'react';
import { CalendarSessionEvent as EventType } from './types';
import { formatTimeBangkok, getSessionStatusConfig } from './calendarUtils';
import { AlertCircle, PlayCircle, CheckCircle2, User } from 'lucide-react';

interface CalendarSessionEventProps {
  event: EventType;
  onClick: (event: EventType) => void;
  compact?: boolean;
}

export default function CalendarSessionEvent({
  event,
  onClick,
  compact = false,
}: CalendarSessionEventProps) {
  const statusCfg = getSessionStatusConfig(event.status);
  const isWaitingDeposit = event.booking?.status === 'WAITING_DEPOSIT';
  const timeLabel = `${formatTimeBangkok(event.start_at)} - ${formatTimeBangkok(event.end_at)}`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onClick(event)}
        className={`w-full text-left p-1.5 rounded border transition-all text-[11px] leading-tight flex flex-col gap-0.5 ${statusCfg.bg} ${statusCfg.border} hover:scale-[1.01] hover:brightness-110 shadow-sm`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-[#ECE4D3] truncate">
            {formatTimeBangkok(event.start_at)}
          </span>
          <span className="text-[10px] text-[#A89F91] truncate font-medium">
            {event.artist?.nickname || event.artist?.name || 'ช่างสัก'}
          </span>
        </div>
        <div className="text-[10px] text-[#A89F91] truncate flex items-center justify-between">
          <span>{event.customer?.display_name || 'ลูกค้า'}</span>
          {isWaitingDeposit && (
            <span className="text-amber-400 text-[9px] font-bold">⚠</span>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={`w-full text-left p-2 sm:p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${statusCfg.bg} ${statusCfg.border} hover:scale-[1.01] hover:shadow-lg shadow-black/40`}
    >
      {/* Top: Time & Status Badge */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-bold text-[#ECE4D3] tracking-tight">
          {timeLabel}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusCfg.badgeBg} ${statusCfg.badgeText} border-white/10 shrink-0`}
        >
          {event.status === 'IN_PROGRESS' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1" />
          )}
          {statusCfg.label}
        </span>
      </div>

      {/* Middle: Customer & Artist */}
      <div className="space-y-0.5">
        <div className="text-xs font-semibold text-[#ECE4D3] truncate">
          {event.customer?.display_name || 'ลูกค้า'}
        </div>
        <div className="text-[11px] text-[#A89F91] flex items-center gap-1 truncate">
          <User size={11} className="text-[#7A7265]" />
          <span>
            {event.artist?.name} {event.artist?.nickname ? `(${event.artist.nickname})` : ''}
          </span>
          <span className="text-[10px] text-[#7A7265] ml-auto">
            รอบ #{event.session_number}
          </span>
        </div>
      </div>

      {/* Bottom: Warning if Parent Booking is WAITING_DEPOSIT */}
      {isWaitingDeposit && (
        <div className="bg-amber-950/60 border border-amber-800/60 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 flex items-center gap-1 mt-0.5">
          <AlertCircle size={10} className="shrink-0" />
          <span>รอมัดจำ</span>
        </div>
      )}
    </button>
  );
}
