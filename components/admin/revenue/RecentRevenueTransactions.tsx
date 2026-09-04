'use client';

import React from 'react';
import Link from 'next/link';
import { History, ArrowRight, User, Calendar, ExternalLink } from 'lucide-react';
import { RevenueRecord, formatCurrency } from './types';

interface RecentRevenueTransactionsProps {
  transactions: RevenueRecord[];
}

export default function RecentRevenueTransactions({
  transactions,
}: RecentRevenueTransactionsProps) {
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return (
          <span className="bg-blue-950/50 text-blue-400 border border-blue-800/50 px-2 py-0.5 rounded text-[10px] font-medium">
            เงินมัดจำ
          </span>
        );
      case 'BALANCE':
        return (
          <span className="bg-amber-950/50 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded text-[10px] font-medium">
            ยอดคงเหลือ
          </span>
        );
      case 'FULL_PAYMENT':
        return (
          <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px] font-medium">
            ชำระเต็ม
          </span>
        );
      default:
        return (
          <span className="bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium">
            อื่น ๆ
          </span>
        );
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'CASH':
        return 'เงินสด';
      case 'BANK_TRANSFER':
        return 'โอนธนาคาร';
      case 'QR':
        return 'QR Code';
      default:
        return 'อื่น ๆ';
    }
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
            <History size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              รายการรับเงินล่าสุด
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              เฉพาะรายการรับเงินจริงที่ยืนยันแล้ว (10 รายการล่าสุด)
            </p>
          </div>
        </div>

        {/* Section 16: Link to Payment Management */}
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ECE4D3] hover:text-[#9C2F2F] transition-colors py-1 px-2 rounded bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265]"
        >
          <span>ดูรายการการเงินทั้งหมด</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Content */}
      {transactions.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          ยังไม่มีรายการรับเงินจริงในระบบ
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#ECE4D3]">
              <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                <tr>
                  <th className="py-2.5 px-3">วันที่ / เวลา</th>
                  <th className="py-2.5 px-3">ลูกค้า</th>
                  <th className="py-2.5 px-3">ช่างสัก</th>
                  <th className="py-2.5 px-3">ประเภท</th>
                  <th className="py-2.5 px-3">ช่องทาง</th>
                  <th className="py-2.5 px-3 text-right">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {transactions.slice(0, 10).map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#1F1D1A]/60 transition-colors">
                    <td className="py-2.5 px-3 text-[#A89F91]">
                      {new Date(tx.paid_at).toLocaleString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#ECE4D3]">
                      {tx.customer_name}
                    </td>
                    <td className="py-2.5 px-3 text-[#A89F91]">
                      {tx.artist_name}
                    </td>
                    <td className="py-2.5 px-3">
                      {getTypeBadge(tx.payment_type)}
                    </td>
                    <td className="py-2.5 px-3 text-[#A89F91]">
                      {getMethodBadge(tx.payment_method)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                      {formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Section 18: No horizontal table scrolling) */}
          <div className="md:hidden space-y-2.5">
            {transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#ECE4D3]">{tx.customer_name}</p>
                    <p className="text-[10px] text-[#7A7265] mt-0.5">
                      ช่างสัก: <span className="text-[#A89F91]">{tx.artist_name}</span>
                    </p>
                  </div>
                  <span className="text-sm font-heading font-bold text-emerald-400">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#4A443A]/40 text-[#7A7265]">
                  <div className="flex items-center gap-1.5">
                    {getTypeBadge(tx.payment_type)}
                    <span className="text-[10px] bg-[#171512] px-1.5 py-0.5 rounded border border-[#4A443A]/40 text-[#A89F91]">
                      {getMethodBadge(tx.payment_method)}
                    </span>
                  </div>
                  <span className="text-[10px]">
                    {new Date(tx.paid_at).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
