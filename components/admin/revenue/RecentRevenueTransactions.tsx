'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { CompletedBookingRecord, formatCurrency } from './types';

interface RecentRevenueTransactionsProps {
  completedBookings: CompletedBookingRecord[];
}

export default function RecentRevenueTransactions({
  completedBookings,
}: RecentRevenueTransactionsProps) {
  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              งานที่เสร็จล่าสุด
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              คิวงานสักที่ปิดงานเสร็จสิ้นเรียบร้อยแล้ว (10 รายการล่าสุด)
            </p>
          </div>
        </div>

        {/* Link to Payment Management filtered by COMPLETED */}
        <Link
          href="/admin/payments?status=COMPLETED"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ECE4D3] hover:text-[#9C2F2F] transition-colors py-1 px-2 rounded bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265]"
        >
          <span>ดูงานเสร็จทั้งหมด</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Content */}
      {completedBookings.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          ยังไม่มีรายการงานที่เสร็จสิ้นในระบบ
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#ECE4D3]">
              <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                <tr>
                  <th className="py-2.5 px-3">วันที่ปิดงาน</th>
                  <th className="py-2.5 px-3">ลูกค้า</th>
                  <th className="py-2.5 px-3">ช่างสัก</th>
                  <th className="py-2.5 px-3 text-right">ราคางานที่ตกลง</th>
                  <th className="py-2.5 px-3 text-right">รับเงินจริงรวม</th>
                  <th className="py-2.5 px-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {completedBookings.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1F1D1A]/60 transition-colors">
                    <td className="py-2.5 px-3 text-[#A89F91]">
                      {new Date(item.completed_at).toLocaleString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#ECE4D3]">
                      {item.customer_name}
                    </td>
                    <td className="py-2.5 px-3 text-[#A89F91]">
                      {item.artist_name}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#A89F91]">
                      {formatCurrency(item.agreed_price)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                      {formatCurrency(item.actual_total_received)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px] font-medium">
                        เสร็จสิ้น
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-2.5">
            {completedBookings.map((item) => (
              <div
                key={item.id}
                className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#ECE4D3]">{item.customer_name}</p>
                    <p className="text-[10px] text-[#7A7265] mt-0.5">
                      ช่างสัก: <span className="text-[#A89F91]">{item.artist_name}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#7A7265]">รับเงินจริงรวม</p>
                    <p className="text-sm font-heading font-bold text-emerald-400">
                      {formatCurrency(item.actual_total_received)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#4A443A]/40 text-[#7A7265]">
                  <span className="text-[10px]">
                    ราคาตกลง: <span className="text-[#ECE4D3] font-medium">{formatCurrency(item.agreed_price)}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded text-[10px] font-medium">
                      เสร็จสิ้น
                    </span>
                    <span className="text-[10px]">
                      {new Date(item.completed_at).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
