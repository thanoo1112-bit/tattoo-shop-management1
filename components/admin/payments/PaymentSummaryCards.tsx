'use client';

import React from 'react';
import { Wallet, Layers, Clock3, CheckCircle2 } from 'lucide-react';

interface PaymentSummaryCardsProps {
  totalRecordedRevenue: number;
  totalActiveBookingsCount: number;
  bookedFlashCount: number;
  completedBookingsCount: number;
}

export default function PaymentSummaryCards({
  totalRecordedRevenue,
  totalActiveBookingsCount,
  bookedFlashCount,
  completedBookingsCount,
}: PaymentSummaryCardsProps) {
  const cards = [
    {
      title: 'รายรับรวม',
      subtitle: 'ยอดเงินที่รับจริงทั้งหมด',
      value: `฿${totalRecordedRevenue.toLocaleString('th-TH')}`,
      hint: '',
      icon: Wallet,
      borderColor: 'border-emerald-900/40',
      iconBg: 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40',
      accentColor: 'text-emerald-400',
    },
    {
      title: 'งานที่ยืนยันแล้วทั้งหมด',
      subtitle: 'จำนวน booking ที่ยืนยันคิวแล้ว',
      value: `${totalActiveBookingsCount} คิว`,
      hint: '',
      icon: Layers,
      borderColor: 'border-cyan-900/40',
      iconBg: 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40',
      accentColor: 'text-cyan-400',
    },
    {
      title: 'ลาย Flash ที่ถูกจอง',
      subtitle: 'จำนวนลาย Flash ที่ลูกค้าจองแล้ว',
      value: `${bookedFlashCount} ลาย`,
      hint: '',
      icon: Clock3,
      borderColor: 'border-amber-900/40',
      iconBg: 'bg-amber-950/40 text-amber-400 border border-amber-800/40',
      accentColor: 'text-amber-400',
    },
    {
      title: 'งานเสร็จสิ้น',
      subtitle: 'ปิดงานและบันทึกยอดเรียบร้อย',
      value: `${completedBookingsCount} คิว`,
      hint: '',
      icon: CheckCircle2,
      borderColor: 'border-teal-900/40',
      iconBg: 'bg-teal-950/40 text-teal-400 border border-teal-800/40',
      accentColor: 'text-teal-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-prompt">
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
                {card.subtitle ? (
                  <p className="text-[10px] text-[#7A7265] font-light mt-0.5 truncate max-w-[120px] sm:max-w-none">
                    {card.subtitle}
                  </p>
                ) : null}
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon size={16} />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className={`text-lg sm:text-2xl font-heading font-semibold tracking-tight ${card.accentColor}`}>
                {card.value}
              </div>
              {card.hint ? (
                <p className="text-[10px] text-[#7A7265] mt-1 font-light truncate">
                  {card.hint}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
