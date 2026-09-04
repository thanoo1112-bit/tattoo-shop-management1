'use client';

import React from 'react';
import { DollarSign, CalendarCheck, ShieldCheck, AlertCircle, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency, RevenueKpiData } from './types';

interface RevenueKpiCardsProps {
  kpiData: RevenueKpiData;
}

export default function RevenueKpiCards({ kpiData }: RevenueKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-prompt">
      {/* CARD 1: รายได้วันนี้ */}
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-[#7A7265] transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-[#A89F91] font-medium tracking-wide">
            รายได้วันนี้
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
            <TrendingUp size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-emerald-400 tracking-tight">
            {formatCurrency(kpiData.todayRevenue)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1 flex items-center gap-1">
            <span>{kpiData.todayTransactionCount} รายการรับเงินจริงวันนี้</span>
          </p>
        </div>
      </div>

      {/* CARD 2: รายได้เดือนนี้ */}
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-[#7A7265] transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-[#A89F91] font-medium tracking-wide">
            รายได้เดือนนี้
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#ECE4D3]">
            <DollarSign size={15} className="text-[#9C2F2F]" />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-[#ECE4D3] tracking-tight">
            {formatCurrency(kpiData.monthRevenue)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1 flex items-center gap-1">
            <span>{kpiData.monthTransactionCount} รายการรับเงินในเดือน</span>
          </p>
        </div>
      </div>

      {/* CARD 3: เงินมัดจำเดือนนี้ */}
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-[#7A7265] transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs text-blue-300/90 font-medium tracking-wide">
            เงินมัดจำเดือนนี้
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400">
            <ShieldCheck size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-blue-400 tracking-tight">
            {formatCurrency(kpiData.monthDepositRevenue)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-[#7A7265] mt-1 flex items-center gap-1">
            <span>มัดจำจริงเฉพาะเดือนนี้ (DEPOSIT)</span>
          </p>
        </div>
      </div>

      {/* CARD 4: ยอดค้างชำระ (Section 8: OUTSTANDING IS NOT REVENUE) */}
      <div className="bg-[#171512] border border-red-950/80 rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden group hover:border-red-900/60 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] sm:text-xs text-red-400/90 font-medium tracking-wide">
              ยอดค้างชำระ
            </span>
          </div>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-950/40 border border-red-900/50 flex items-center justify-center text-red-400">
            <AlertCircle size={15} />
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-xl sm:text-2xl lg:text-3xl font-heading font-semibold text-red-400 tracking-tight">
            {formatCurrency(kpiData.currentOutstanding)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-red-400/70 mt-1 flex items-center gap-1">
            <span>ยอดค้างรวมปัจจุบัน (ไม่ใช่รายได้)</span>
          </p>
        </div>
      </div>
    </div>
  );
}
