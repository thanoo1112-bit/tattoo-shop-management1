'use client';

import React from 'react';
import { Layers, Clock3, CheckCircle2 } from 'lucide-react';

interface PaymentSummaryCardsProps {
  totalRecordedRevenue?: number;
  totalActiveBookingsCount: number;
  bookedFlashCount: number;
  completedBookingsCount: number;
}

export default function PaymentSummaryCards({
  totalActiveBookingsCount,
  bookedFlashCount,
  completedBookingsCount,
}: PaymentSummaryCardsProps) {
  const cards = [
    {
      title: 'งานที่ยืนยัน',
      value: `${totalActiveBookingsCount} คิว`,
      hint: '',
      icon: Layers,
      borderColor: 'border-cyan-900/40',
      iconBg: 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40',
      accentColor: 'text-cyan-400',
    },
    {
      title: 'ผลงานที่จอง',
      value: `${bookedFlashCount} ลาย`,
      hint: '',
      icon: Clock3,
      borderColor: 'border-amber-900/40',
      iconBg: 'bg-amber-950/40 text-amber-400 border border-amber-800/40',
      accentColor: 'text-amber-400',
    },
    {
      title: 'งานเสร็จแล้ว',
      value: `${completedBookingsCount} งาน`,
      hint: '',
      icon: CheckCircle2,
      borderColor: 'border-teal-900/40',
      iconBg: 'bg-teal-950/40 text-teal-400 border border-teal-800/40',
      accentColor: 'text-teal-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 font-prompt">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-[#171512] border ${card.borderColor} rounded-lg p-3.5 sm:p-4 transition-all duration-200 hover:border-[#7A7265] flex flex-col justify-between`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] sm:text-xs text-[#ECE4D3] font-medium tracking-wide">
                  {card.title}
                </p>
                <div className={`text-lg sm:text-2xl font-heading font-semibold tracking-tight mt-1 sm:mt-1.5 ${card.accentColor}`}>
                  {card.value}
                </div>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon size={16} />
              </div>
            </div>

            {card.hint ? (
              <div className="mt-2.5 sm:mt-3">
                <p className="text-[10px] text-[#ECE4D3] mt-1 font-light truncate">
                  {card.hint}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
