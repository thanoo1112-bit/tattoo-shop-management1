'use client';

import React from 'react';
import { Layers, ShieldCheck, CheckCircle2, CircleDollarSign } from 'lucide-react';
import { PaymentTypeSummary, formatCurrency } from './types';

interface PaymentTypeBreakdownProps {
  typesSummary: PaymentTypeSummary[];
  totalRevenue: number;
}

export default function PaymentTypeBreakdown({
  typesSummary,
  totalRevenue,
}: PaymentTypeBreakdownProps) {
  const hasData = typesSummary.some((t) => t.amount > 0);

  const getIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return <ShieldCheck size={14} className="text-blue-400" />;
      case 'BALANCE':
        return <CheckCircle2 size={14} className="text-amber-400" />;
      case 'FULL_PAYMENT':
        return <CircleDollarSign size={14} className="text-emerald-400" />;
      default:
        return <Layers size={14} className="text-[#A89F91]" />;
    }
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-3.5 font-prompt">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
            <Layers size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              ประเภทเงินที่รับ
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              สัดส่วนเงินมัดจำ, ยอดคงเหลือ และชำระเต็ม
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasData ? (
        <div className="py-6 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          ยังไม่มีรายการรับเงินในช่วงนี้
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {typesSummary.map((item) => (
            <div
              key={item.type}
              className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 space-y-1.5 hover:border-[#7A7265] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#ECE4D3] flex items-center gap-1.5">
                  {getIcon(item.type)}
                  {item.label}
                </span>
                <span className="text-[11px] text-[#A89F91] font-semibold">
                  {item.percentage}%
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-sm font-heading font-semibold text-emerald-400">
                  {formatCurrency(item.amount)}
                </span>
                <span className="text-[10px] text-[#7A7265]">
                  {item.count} รายการ
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
