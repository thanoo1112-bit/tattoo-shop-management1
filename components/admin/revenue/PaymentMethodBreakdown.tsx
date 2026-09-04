'use client';

import React from 'react';
import { CreditCard, Banknote, QrCode, Building2, MoreHorizontal } from 'lucide-react';
import { PaymentMethodSummary, formatCurrency } from './types';

interface PaymentMethodBreakdownProps {
  methodsSummary: PaymentMethodSummary[];
  totalRevenue: number;
}

export default function PaymentMethodBreakdown({
  methodsSummary,
  totalRevenue,
}: PaymentMethodBreakdownProps) {
  const hasData = methodsSummary.some((m) => m.amount > 0);

  const getIcon = (method: string) => {
    switch (method) {
      case 'CASH':
        return <Banknote size={14} className="text-emerald-400" />;
      case 'BANK_TRANSFER':
        return <Building2 size={14} className="text-blue-400" />;
      case 'QR':
        return <QrCode size={14} className="text-purple-400" />;
      default:
        return <MoreHorizontal size={14} className="text-[#A89F91]" />;
    }
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-3.5 font-prompt">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
            <CreditCard size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              ช่องทางการชำระเงิน
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              เงินสด, โอนธนาคาร, และสแกน QR Code
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasData ? (
        <div className="py-6 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          ยังไม่มีข้อมูลช่องทางการรับเงินในช่วงนี้
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {methodsSummary.map((item) => (
            <div
              key={item.method}
              className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 space-y-1.5 hover:border-[#7A7265] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#ECE4D3] flex items-center gap-1.5">
                  {getIcon(item.method)}
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
