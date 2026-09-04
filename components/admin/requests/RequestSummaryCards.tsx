'use client';

import React from 'react';
import { FileText, Clock, CheckCircle2, PlayCircle } from 'lucide-react';
import { RequestSummaryCounts } from './types';

interface RequestSummaryCardsProps {
  counts: RequestSummaryCounts;
  activeTab: 'estimates' | 'bookings';
  onTabChange: (tab: 'estimates' | 'bookings') => void;
}

export default function RequestSummaryCards({
  counts,
  activeTab,
  onTabChange,
}: RequestSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-prompt">
      {/* CARD 1: คำขอใหม่ */}
      <div
        onClick={() => onTabChange('estimates')}
        className={`bg-[#171512] border rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'estimates'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-[#A89F91] font-medium tracking-wide">
            คำขอประเมินใหม่
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400">
            <FileText size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-blue-400 tracking-tight">
            {counts.newEstimatesCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            คำขอที่รอการประเมินราคา
          </p>
        </div>
      </div>

      {/* CARD 2: รอมัดจำ */}
      <div
        onClick={() => onTabChange('bookings')}
        className={`bg-[#171512] border rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'bookings'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-amber-300/90 font-medium tracking-wide">
            รอมัดจำ
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400">
            <Clock size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-amber-400 tracking-tight">
            {counts.waitingDepositCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            คิวงานที่รอชำระเงินมัดจำ
          </p>
        </div>
      </div>

      {/* CARD 3: ยืนยันแล้ว */}
      <div
        onClick={() => onTabChange('bookings')}
        className={`bg-[#171512] border rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'bookings'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-emerald-300/90 font-medium tracking-wide">
            ยืนยันคิวแล้ว
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-emerald-400 tracking-tight">
            {counts.confirmedCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            พร้อมนัดหมายรอบสัก
          </p>
        </div>
      </div>

      {/* CARD 4: กำลังดำเนินงาน */}
      <div
        onClick={() => onTabChange('bookings')}
        className={`bg-[#171512] border rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'bookings'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-purple-300/90 font-medium tracking-wide">
            กำลังดำเนินงาน
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400">
            <PlayCircle size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-purple-400 tracking-tight">
            {counts.inProgressCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            คิวงานที่เริ่มรอบสักแล้ว
          </p>
        </div>
      </div>
    </div>
  );
}
