import React from 'react';
import { ClipboardCheck, Clock, XCircle, CreditCard } from 'lucide-react';
import { RequestSummaryCounts } from './types';

interface RequestSummaryCardsProps {
  counts: RequestSummaryCounts;
  activeTab: 'estimates' | 'bookings';
  onTabChange: (tab: 'estimates' | 'bookings', filter?: string) => void;
}

export default function RequestSummaryCards({
  counts,
  activeTab,
  onTabChange,
}: RequestSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 font-prompt">
      {/* CARD 1: คำขอใหม่ */}
      <div
        onClick={() => onTabChange('estimates', 'PENDING')}
        className={`bg-[#171512] border rounded-xl p-3.5 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'estimates'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-blue-300/90 font-medium tracking-wide">
            คำขอใหม่
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400">
            <ClipboardCheck size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-blue-400 tracking-tight">
            {counts.pendingEvaluationCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            รอช่างตรวจสอบรายละเอียดงาน
          </p>
        </div>
      </div>

      {/* CARD 2: รอมัดจำ (ฝั่งคำขอจากลูกค้า) */}
      <div
        onClick={() => onTabChange('estimates', 'WAITING_DEPOSIT')}
        className={`bg-[#171512] border rounded-xl p-3.5 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'estimates'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-purple-300/90 font-medium tracking-wide">
            รอมัดจำ
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400">
            <CreditCard size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-purple-400 tracking-tight">
            {counts.waitingDepositCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            ผ่านการตรวจสอบแล้ว รอลูกค้าชำระมัดจำ
          </p>
        </div>
      </div>

      {/* CARD 3: สลิปรอตรวจ (ฝั่งคำขอจากลูกค้า) */}
      <div
        onClick={() => onTabChange('estimates', 'WAITING_SLIP')}
        className={`bg-[#171512] border rounded-xl p-3.5 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'estimates'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-amber-300/90 font-medium tracking-wide">
            สลิปรอตรวจ
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400">
            <Clock size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-amber-400 tracking-tight">
            {counts.pendingSlipsCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            สลิปโอนมัดจำที่รอการตรวจสอบ
          </p>
        </div>
      </div>

      {/* CARD 4: คำขอสิ้นสุดแล้ว */}
      <div
        onClick={() => onTabChange('estimates', 'TERMINATED')}
        className={`bg-[#171512] border rounded-xl p-3.5 sm:p-5 shadow-lg relative overflow-hidden cursor-pointer transition-all duration-200 ${
          activeTab === 'estimates'
            ? 'border-[#ECE4D3] shadow-md shadow-white/5'
            : 'border-[#4A443A] hover:border-[#7A7265]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-red-300/90 font-medium tracking-wide">
            คำขอสิ้นสุดแล้ว
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400">
            <XCircle size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-red-400 tracking-tight">
            {counts.confirmedCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1">
            ปฏิเสธ / ยกเลิก / หมดอายุ
          </p>
        </div>
      </div>
    </div>
  );
}
