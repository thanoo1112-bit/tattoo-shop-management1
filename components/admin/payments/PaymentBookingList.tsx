'use client';

import React from 'react';
import {
  Search,
  User,
  CreditCard,
  FileSpreadsheet,
} from 'lucide-react';
import {
  PaymentBookingDetail,
} from './types';

interface PaymentBookingListProps {
  bookings: PaymentBookingDetail[];
  selectedBookingId?: string;
  onSelectBooking: (booking: PaymentBookingDetail) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedArtistId: string;
  onArtistChange: (artistId: string) => void;
  artists: Array<{ id: string; name: string; nickname: string | null }>;
  isLoading?: boolean;
}

// Helper to compute recorded deposit payment amount for a booking
function getDepositPaidSum(b: PaymentBookingDetail): number {
  if (!b.payments || b.payments.length === 0) return 0;
  return b.payments
    .filter((p: any) => String(p.status || '').toUpperCase() === 'RECORDED' && String(p.payment_type || '').toUpperCase() === 'DEPOSIT')
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
}

// Helper to compute recorded balance payment amount for a booking
function getBalancePaidSum(b: PaymentBookingDetail): number {
  if (!b.payments || b.payments.length === 0) return 0;
  return b.payments
    .filter((p: any) => String(p.status || '').toUpperCase() === 'RECORDED' && (String(p.payment_type || '').toUpperCase() === 'BALANCE' || String(p.payment_type || '').toUpperCase() === 'FULL_PAYMENT'))
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
}

export default function PaymentBookingList({
  bookings,
  selectedBookingId,
  onSelectBooking,
  searchQuery,
  onSearchChange,
  selectedArtistId,
  onArtistChange,
  artists,
  isLoading,
}: PaymentBookingListProps) {
  // Export CSV handler
  const handleExportCSV = () => {
    if (!bookings || bookings.length === 0) return;
    const headers = [
      'วันที่',
      'ชื่อลูกค้า',
      'รายการ/งานสัก',
      'ช่างสัก',
      'มัดจำ',
      'ชำระหน้าร้าน',
      'ยอดรวม',
    ];
    const rows = bookings.map((b) => {
      const depositSum = getDepositPaidSum(b);
      const balanceSum = getBalancePaidSum(b);
      const totalQuoted = b.summary?.quoted_price || (b as any).quoted_price || 0;

      return [
        `"${b.requested_date || (b.created_at ? new Date(b.created_at).toLocaleDateString('th-TH') : '')}"`,
        `"${(b.customer_name || '').replace(/"/g, '""')}"`,
        `"${(b.artwork_title || '').replace(/"/g, '""')}"`,
        `"${(b.artist_name || '').replace(/"/g, '""')}"`,
        depositSum,
        balanceSum,
        totalQuoted,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Transaction_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl overflow-hidden shadow-lg font-prompt text-[#ECE4D3]">
      {/* Header Container: Title (Top Left) & CSV Export Button (Top Right) */}
      <div className="p-4 sm:p-5 border-b border-[#4A443A] bg-[#171512] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-heading font-semibold text-[#ECE4D3] tracking-wide">
              ตารางบันทึกรายการธุรกรรม (Transaction Logs)
            </h3>
            <p className="text-xs text-[#A89F91] mt-0.5 font-light">
              แสดงรายการธุรกรรมและการรับชำระเงินทั้งหมดในระบบ
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={bookings.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-md bg-[#0E0D0C] hover:bg-[#1F1D1A] border border-[#4A443A] hover:border-[#7A7265] text-xs font-medium text-[#ECE4D3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <FileSpreadsheet size={15} className="text-emerald-400" />
            <span>ส่งออกไฟล์ CSV</span>
          </button>
        </div>

        {/* Search & Filter Header */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between pt-1">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า, ช่างสัก..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#7A7265] transition-colors"
            />
          </div>

          {/* Artist Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#4A443A] rounded-md px-2.5 py-1.5 text-xs shrink-0">
            <User size={13} className="text-[#7A7265]" />
            <select
              value={selectedArtistId}
              onChange={(e) => onArtistChange(e.target.value)}
              aria-label="เลือกช่างสัก"
              className="bg-transparent text-[#ECE4D3] text-xs font-medium focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-[#171512] text-[#ECE4D3]">
                ช่างทั้งหมด
              </option>
              {artists.map((art) => (
                <option key={art.id} value={art.id} className="bg-[#171512] text-[#ECE4D3]">
                  {art.name} {art.nickname ? `(${art.nickname})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-[#7A7265] animate-pulse">
          กำลังโหลดรายการการเงิน...
        </div>
      ) : bookings.length === 0 ? (
        /* Empty State */
        <div className="py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center mx-auto mb-3 text-[#7A7265]">
            <CreditCard size={22} />
          </div>
          <h3 className="text-sm font-heading font-medium text-[#ECE4D3]">
            ยังไม่มีรายการการเงิน
          </h3>
          <p className="text-xs text-[#7A7265] mt-1 max-w-sm mx-auto font-light">
            เมื่อมีคิวงานและมีการบันทึกรับเงิน รายการจะแสดงที่นี่
          </p>
        </div>
      ) : (
        /* Table View (Horizontal scroll support for mobile & aligned header/data) */
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs whitespace-nowrap min-w-[650px]">
            <thead className="bg-[#0E0D0C] border-b border-[#4A443A] text-[11px] text-[#7A7265] uppercase tracking-wider font-normal">
              <tr>
                <th className="py-3.5 px-4 font-normal">วันที่</th>
                <th className="py-3.5 px-4 font-normal">ชื่อลูกค้า</th>
                <th className="py-3.5 px-4 font-normal">รายการ/งานสัก</th>
                <th className="py-3.5 px-4 font-normal">ช่างสัก</th>
                <th className="py-3.5 px-4 text-right font-normal">มัดจำ</th>
                <th className="py-3.5 px-4 text-right font-normal">ชำระหน้าร้าน</th>
                <th className="py-3.5 px-4 text-right font-normal">ยอดรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#4A443A]/50">
              {bookings.map((b) => {
                const isSelected = selectedBookingId === b.id;
                const depositSum = getDepositPaidSum(b);
                const balanceSum = getBalancePaidSum(b);
                const quotedPrice = b.summary?.quoted_price || (b as any).quoted_price || 0;

                return (
                  <tr
                    key={b.id}
                    onClick={() => onSelectBooking(b)}
                    className={`cursor-pointer transition-colors hover:bg-[#1F1D1A]/80 ${
                      isSelected ? 'bg-[#1F1D1A] ring-1 ring-inset ring-[#7A7265]' : ''
                    }`}
                  >
                    {/* 1. Date & Time */}
                    <td className="py-3.5 px-4 text-[#A89F91] font-mono text-[11px]">
                      {b.requested_date || (b.created_at ? new Date(b.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'ยังไม่ระบุ')}
                    </td>

                    {/* 2. Customer Name (Bold Cream/White) */}
                    <td className="py-3.5 px-4 font-bold text-[#ECE4D3]">
                      {b.customer_name}
                    </td>

                    {/* 3. Artwork Title */}
                    <td className="py-3.5 px-4 text-[#A89F91]">
                      {b.artwork_title || 'งานสัก Custom'}
                    </td>

                    {/* 4. Artist Name */}
                    <td className="py-3.5 px-4 font-medium text-[#ECE4D3]">
                      {b.artist_name}
                    </td>

                    {/* 5. Deposit Amount */}
                    <td className="py-3.5 px-4 text-right font-semibold text-[#ECE4D3] font-mono">
                      {depositSum > 0 ? `฿${depositSum.toLocaleString('th-TH')}` : '—'}
                    </td>

                    {/* 6. Onsite Balance Payment */}
                    <td className="py-3.5 px-4 text-right font-semibold text-[#ECE4D3] font-mono">
                      {balanceSum > 0 ? `฿${balanceSum.toLocaleString('th-TH')}` : '—'}
                    </td>

                    {/* 7. Total Quoted Price */}
                    <td className="py-3.5 px-4 text-right font-semibold text-[#ECE4D3] font-mono">
                      ฿{quotedPrice.toLocaleString('th-TH')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
