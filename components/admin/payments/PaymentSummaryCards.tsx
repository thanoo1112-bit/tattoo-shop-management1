'use client';

import React from 'react';
import { Clock3, Wallet, AlertCircle, ShieldCheck } from 'lucide-react';

interface PaymentSummaryCardsProps {
  waitingDepositCount: number;
  waitingDepositAmount: number;
  totalPaid: number;
  totalRemaining: number;
  fullyPaidCount: number;
  totalBookings: number;
}

export default function PaymentSummaryCards({
  waitingDepositCount,
  waitingDepositAmount,
  totalPaid,
  totalRemaining,
  fullyPaidCount,
  totalBookings,
}: PaymentSummaryCardsProps) {
  const cards = [
    {
      title: 'รอรับมัดจำ',
      subtitle: `${waitingDepositCount} รายการ`,
      value: `฿${waitingDepositAmount.toLocaleString('th-TH')}`,
      hint: 'ยอดมัดจำที่รอชำระเพื่อยืนยันคิว',
      icon: Clock3,
      borderColor: 'border-amber-900/40',
      iconBg: 'bg-amber-950/40 text-amber-400 border border-amber-800/40',
      accentColor: 'text-amber-400',
    },
    {
      title: 'รับเงินแล้ว',
      subtitle: `จาก ${totalBookings} คิวงาน`,
      value: `฿${totalPaid.toLocaleString('th-TH')}`,
      hint: 'ยอดเงินจริงที่ร้านได้รับทั้งหมด',
      icon: Wallet,
      borderColor: 'border-emerald-900/40',
      iconBg: 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40',
      accentColor: 'text-emerald-400',
    },
    {
      title: 'ยอดค้างชำระ',
      subtitle: 'ยอดคงเหลือที่ต้องเก็บ',
      value: `฿${totalRemaining.toLocaleString('th-TH')}`,
      hint: 'ยอดรวมส่วนที่เหลือหลังหักมัดจำ',
      icon: AlertCircle,
      borderColor: 'border-[#9C2F2F]/40',
      iconBg: 'bg-[#9C2F2F]/20 text-red-400 border border-[#9C2F2F]/40',
      accentColor: 'text-red-400',
    },
    {
      title: 'ชำระครบ',
      subtitle: `${fullyPaidCount} คิวงาน`,
      value: `${fullyPaidCount} คิว`,
      hint: 'งานที่ชำระค่าบริการครบ 100%',
      icon: ShieldCheck,
      borderColor: 'border-cyan-900/40',
      iconBg: 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40',
      accentColor: 'text-cyan-400',
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
