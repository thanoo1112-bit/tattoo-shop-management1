'use client';

import React from 'react';
import { Calendar, PlayCircle, AlertCircle, Users } from 'lucide-react';
import { CalendarSummaryMetrics } from './types';

interface CalendarSummaryStripProps {
  metrics: CalendarSummaryMetrics;
}

export default function CalendarSummaryStrip({ metrics }: CalendarSummaryStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mb-5">
      {/* 1. Today Sessions */}
      <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3 sm:p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-950/50 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
          <Calendar size={16} />
        </div>
        <div>
          <span className="text-[10px] text-[#A89F91] block uppercase tracking-wider">คิวงานวันนี้</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-[#ECE4D3] font-bebas">
              {metrics.todaySessionsCount}
            </span>
            <span className="text-[10px] text-[#7A7265]">คิว</span>
          </div>
        </div>
      </div>

      {/* 2. In-Progress Sessions */}
      <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3 sm:p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#9C2F2F]/20 border border-[#9C2F2F]/40 flex items-center justify-center text-[#9C2F2F] shrink-0">
          <PlayCircle size={16} />
        </div>
        <div>
          <span className="text-[10px] text-[#A89F91] block uppercase tracking-wider">กำลังสัก</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-[#9C2F2F] font-bebas">
              {metrics.inProgressCount}
            </span>
            <span className="text-[10px] text-[#7A7265]">คิว</span>
          </div>
        </div>
      </div>

      {/* 3. Waiting Deposit */}
      <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3 sm:p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
          <AlertCircle size={16} />
        </div>
        <div>
          <span className="text-[10px] text-[#A89F91] block uppercase tracking-wider">รอมัดจำ</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-amber-400 font-bebas">
              {metrics.waitingDepositCount}
            </span>
            <span className="text-[10px] text-[#7A7265]">คิว</span>
          </div>
        </div>
      </div>

      {/* 4. Active Artists Today */}
      <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3 sm:p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
          <Users size={16} />
        </div>
        <div>
          <span className="text-[10px] text-[#A89F91] block uppercase tracking-wider">ช่างมีงานวันนี้</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-emerald-400 font-bebas">
              {metrics.activeArtistsCount}
            </span>
            <span className="text-[10px] text-[#7A7265]">ท่าน</span>
          </div>
        </div>
      </div>
    </div>
  );
}
