'use client';

import React from 'react';
import { Clock3, Wallet, AlertCircle, ShieldCheck } from 'lucide-react';

interface PaymentSummaryCardsProps {
  waitingDepositCount: number;
  waitingDepositAmount: number;
  totalPaid: number;
  depositPaidCount: number;
  totalBookings: number;
}

export default function PaymentSummaryCards({
  waitingDepositCount,
  waitingDepositAmount,
  totalPaid,
  depositPaidCount,
  totalBookings,
}: PaymentSummaryCardsProps) {
  const cards = [
    {
      title: 'รอรับมัดจำ',
      subtitle: `${waitingDepositCount} คิวงาน`,
      value: `฿${waitingDepositAmount.toLocaleString('th-TH')}`,
      hint: 'ยอดมัดจำที่รอชำระเพื่อยืนยันสิทธิ์',
      icon: Clock3,
      borderColor: 'border-amber-900/40',
      iconBg: 'bg-amber-950/40 text-amber-400 border border-amber-800/40',
      accentColor: 'text-amber-400',
    },
    {
      title: 'รับเงินจริงรวม',
      subtitle: `จาก ${totalBookings} คิวงาน`,
      value: `฿${totalPaid.toLocaleString('th-TH')}`,
      hint: 'ยอดเงินจริงที่ร้านได้รับทั้งหมด',
      icon: Wallet,
      borderColor: 'border-emerald-900/40',
      iconBg: 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40',
      accentColor: 'text-emerald-400',
    },
    {
      title: 'รับมัดจำครบแล้ว',
      subtitle: `${depositPaidCount} จาก ${totalBookings} คิว`,
      value: `${depositPaidCount} คิว`,
      hint: 'คิวงานที่ได้รับมัดจำครบตามกำหนด',
      icon: ShieldCheck,
      borderColor: 'border-cyan-900/40',
      iconBg: 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40',
      accentColor: 'text-cyan-400',
    },
    {
      title: 'คิวงานทั้งหมด',
      subtitle: 'สถานะในระบบ',
      value: `${totalBookings} คิว`,
      hint: 'จำนวนรายการคิวทั้งหมดในระบบ',
      icon: AlertCircle,
      borderColor: 'border-[#4A443A]',
      iconBg: 'bg-[#1F1D1A] text-[#ECE4D3] border border-[#4A443A]',
      accentColor: 'text-[#ECE4D3]',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-[#171512] border ${card.borderColor} rounded-lg p-3.5 sm:p-4 transition-all duration-200 hover:border-[#7A7265] flex flex-col justify-between`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] sm:text-xs text-[#A89F91] font-medium tracking-wide">
                  {card.title}
                </p>
                <p className="text-[10px] text-[#7A7265] font-light mt-0.5">
                  {card.subtitle}
                </p>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon size={16} />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className={`text-lg sm:text-2xl font-heading font-semibold tracking-tight ${card.accentColor}`}>
                {card.value}
              </div>
              <p className="text-[10px] text-[#7A7265] mt-1 font-light truncate">
                {card.hint}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
