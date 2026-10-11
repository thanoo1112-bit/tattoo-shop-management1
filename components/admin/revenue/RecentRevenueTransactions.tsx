'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import { CompletedBookingRecord, formatCurrency } from './types';

interface RecentRevenueTransactionsProps {
  completedBookings: CompletedBookingRecord[];
}

export default function RecentRevenueTransactions({
  completedBookings,
}: RecentRevenueTransactionsProps) {
  // Export CSV handler
  const handleExportCSV = () => {
    if (!completedBookings || completedBookings.length === 0) return;
    const headers = [
      'วันที่ปิดงาน',
      'ชื่อลูกค้า',
      'รายการ/งานสัก',
      'ช่างสัก',
      'ยอดรวม',
      'รับเงินจริงรวม',
      'สถานะ',
    ];
    const rows = completedBookings.map((item) => {
      return [
        `"${new Date(item.completed_at).toLocaleDateString('th-TH')}"`,
        `"${(item.customer_name || '').replace(/"/g, '""')}"`,
        `"${((item as any).artwork_title || 'งานสัก Custom').replace(/"/g, '""')}"`,
        `"${(item.artist_name || '').replace(/"/g, '""')}"`,
        item.agreed_price,
        item.actual_total_received,
        '"เสร็จสิ้น"',
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Completed_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt text-[#ECE4D3]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4A443A] pb-3.5">
        <div>
          <h3 className="text-base sm:text-lg font-heading font-semibold text-[#ECE4D3] tracking-wide">
            ตารางบันทึกรายการธุรกรรม (Transaction Logs)
          </h3>
          <p className="text-xs text-[#A89F91] mt-0.5">
            คิวงานสักที่ปิดงานเสร็จสิ้นเรียบร้อยแล้ว (10 รายการล่าสุด)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={completedBookings.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-[#0E0D0C] hover:bg-[#1F1D1A] border border-[#4A443A] hover:border-[#7A7265] text-xs font-medium text-[#ECE4D3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>ส่งออกไฟล์ CSV</span>
          </button>

          <Link
            href="/admin/payments?status=COMPLETED"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ECE4D3] hover:text-white transition-colors py-1.5 px-3 rounded-md bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265]"
          >
            <span>ดูงานเสร็จทั้งหมด</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Content */}
      {completedBookings.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          ยังไม่มีรายการงานที่เสร็จสิ้นในระบบ
        </div>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs whitespace-nowrap min-w-[750px]">
            <thead className="bg-[#0E0D0C] border-b border-[#4A443A] text-[11px] text-[#7A7265] uppercase tracking-wider font-normal">
              <tr>
                <th className="py-3 px-4 font-normal">วันที่ปิดงาน</th>
                <th className="py-3 px-4 font-normal">ชื่อลูกค้า</th>
                <th className="py-3 px-4 font-normal">รายการ/งานสัก</th>
                <th className="py-3 px-4 font-normal">ช่างสัก</th>
                <th className="py-3 px-4 text-right font-normal">ราคางานที่ตกลง</th>
                <th className="py-3 px-4 text-right font-normal">รับเงินจริงรวม</th>
                <th className="py-3 px-4 text-center font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#4A443A]/50">
              {completedBookings.map((item) => (
                <tr key={item.id} className="hover:bg-[#1F1D1A]/80 transition-colors">
                  <td className="py-3.5 px-4 text-[#A89F91] font-mono text-[11px]">
                    {new Date(item.completed_at).toLocaleString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[#ECE4D3]">
                    {item.customer_name}
                  </td>
                  <td className="py-3.5 px-4 text-[#A89F91]">
                    {(item as any).artwork_title || 'งานสัก Custom'}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[#ECE4D3]">
                    {item.artist_name}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-[#ECE4D3] font-mono">
                    {formatCurrency(item.agreed_price)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-[#ECE4D3] font-mono">
                    {formatCurrency(item.actual_total_received)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 px-2 py-0.5 rounded text-[11px] font-medium">
                      เสร็จสิ้น
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
