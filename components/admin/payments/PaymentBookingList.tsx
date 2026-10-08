'use client';

import React from 'react';
import {
  Search,
  Calendar,
  User,
  ChevronRight,
  CreditCard,
} from 'lucide-react';
import {
  PaymentBookingDetail,
  FinancialStatusFilter,
  BookingStatusFilter,
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

// Booking status badge helper
function getBookingStatusBadge(status: string) {
  const st = String(status || '').toUpperCase();
  switch (st) {
    case 'WAITING_DEPOSIT':
    case 'CONFIRMED':
    case 'SCHEDULED':
      return {
        label: 'นัดหมายแล้ว',
        class: 'bg-blue-950/40 text-blue-300 border-blue-800/40',
      };
    case 'IN_PROGRESS':
      return {
        label: 'กำลังสัก',
        class: 'bg-[#9C2F2F]/20 text-[#ECE4D3] border-[#9C2F2F]/60',
      };
    case 'COMPLETED':
      return {
        label: 'เสร็จสิ้น',
        class: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
      };
    case 'EXPIRED':
      return {
        label: 'หมดเวลาชำระมัดจำ',
        class: 'bg-zinc-900/60 text-zinc-400 border-zinc-700/50',
      };
    case 'CANCELLED':
      return {
        label: 'ยกเลิกแล้ว',
        class: 'bg-red-950/40 text-red-400 border-red-900/40',
      };
    case 'PENDING':
      return {
        label: 'รอตรวจสอบ',
        class: 'bg-yellow-950/40 text-yellow-400 border-yellow-800/40',
      };
    case 'REJECTED':
      return {
        label: 'ปฏิเสธ',
        class: 'bg-red-950/40 text-red-400 border-red-900/40',
      };
    default:
      return {
        label: status,
        class: 'bg-[#1F1D1A] text-[#A89F91] border-[#4A443A]',
      };
  }
}

// Payment status badge helper
function getPaymentStatusBadge(status: string) {
  const st = String(status || '').toUpperCase();
  if (st === 'COMPLETED') {
    return {
      label: 'ชำระครบแล้ว',
      class: 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40',
    };
  }
  if (st === 'EXPIRED') {
    return {
      label: 'หมดเวลาชำระมัดจำ',
      class: 'bg-zinc-900/50 text-zinc-400 border border-zinc-700/40',
    };
  }
  if (st === 'CANCELLED' || st === 'REJECTED') {
    return {
      label: 'ยกเลิกแล้ว',
      class: 'bg-red-950/50 text-red-400 border border-red-900/40',
    };
  }
  return {
    label: 'รอปิดงาน',
    class: 'bg-amber-950/50 text-amber-400 border border-amber-800/40',
  };
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

// Helper to compute total recorded payment amount for a booking
function getRecordedPaymentsSum(b: PaymentBookingDetail): number {
  if (!b.payments || b.payments.length === 0) return 0;
  return b.payments
    .filter((p: any) => String(p.status || '').toUpperCase() === 'RECORDED')
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
  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-lg overflow-hidden font-prompt">
      {/* Search & Filter Header */}
      <div className="p-3.5 sm:p-4 border-b border-[#4A443A]">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
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
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3] transition-colors"
            />
          </div>

          {/* Artist Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#4A443A] rounded-md px-2.5 py-1.5 text-xs shrink-0">
            <User size={13} className="text-[#7A7265]" />
            <select
              value={selectedArtistId}
              onChange={(e) => onArtistChange(e.target.value)}
              aria-label="เลือกช่างสัก"
              className="bg-transparent text-[#ECE4D3] text-xs font-[#ECE4D3] font-medium focus:outline-none cursor-pointer pr-1"
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
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#ECE4D3]">
              <thead className="bg-[#0E0D0C] border-b border-[#4A443A] text-[11px] text-[#7A7265] uppercase tracking-wider font-heading">
                <tr>
                  <th className="py-3 px-4">ลูกค้า / วันนัด</th>
                  <th className="py-3 px-4">ช่างสัก</th>
                  <th className="py-3 px-4">งาน / ลายสัก</th>
                  <th className="py-3 px-4 text-right">เงินมัดจำ</th>
                  <th className="py-3 px-4 text-right">ชำระวันปิดงาน</th>
                  <th className="py-3 px-4 text-right">ยอดรับรวม</th>
                  <th className="py-3 px-4 text-center">สถานะ</th>
                  <th className="py-3 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/60">
                {bookings.map((b) => {
                  const isSelected = selectedBookingId === b.id;
                  const bStatus = getBookingStatusBadge(b.status);
                  const depositSum = getDepositPaidSum(b);
                  const balanceSum = getBalancePaidSum(b);
                  const recordedSum = getRecordedPaymentsSum(b);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelectBooking(b)}
                      className={`cursor-pointer transition-colors hover:bg-[#1F1D1A] ${
                        isSelected ? 'bg-[#1F1D1A] ring-1 ring-inset ring-[#7A7265]' : ''
                      }`}
                    >
                      {/* Customer & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#ECE4D3] hover:text-[#9C2F2F] transition-colors">
                          {b.customer_name}
                        </div>
                        <div className="text-[11px] text-[#7A7265] flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          <span>{b.requested_date || 'ยังไม่ระบุวัน'}</span>
                        </div>
                      </td>

                      {/* Artist */}
                      <td className="py-3.5 px-4 text-[#A89F91]">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-[#7A7265]" />
                          <span>{b.artist_name}</span>
                        </div>
                      </td>

                      {/* Artwork Title */}
                      <td className="py-3.5 px-4 text-[#A89F91]">
                        {b.artwork_title || 'ไม่พบรายละเอียดงาน'}
                      </td>

                      {/* Deposit Paid */}
                      <td className="py-3.5 px-4 text-right text-amber-400 font-mono">
                        {depositSum > 0 ? `฿${depositSum.toLocaleString('th-TH')}` : '—'}
                      </td>

                      {/* Balance Paid */}
                      <td className="py-3.5 px-4 text-right text-emerald-400 font-mono">
                        {balanceSum > 0 ? `฿${balanceSum.toLocaleString('th-TH')}` : '—'}
                      </td>

                      {/* Actual Received Amount (ยอดรับรวม) */}
                      <td className="py-3.5 px-4 text-right text-emerald-400 font-mono font-bold text-sm">
                        ฿{recordedSum.toLocaleString('th-TH')}
                      </td>

                      {/* Booking Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${bStatus.class}`}>
                          {bStatus.label}
                        </span>
                      </td>

                      {/* Action Column (จัดการ) */}
                      <td className="py-3.5 px-3 text-center text-[#7A7265]">
                        <span className="inline-flex items-center gap-1 text-xs text-[#A89F91] hover:text-[#ECE4D3] transition-colors font-medium">
                          <span>รายละเอียด</span>
                          <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Layout C) */}
          <div className="md:hidden divide-y divide-[#4A443A]/60">
            {bookings.map((b) => {
              const isSelected = selectedBookingId === b.id;
              const bStatus = getBookingStatusBadge(b.status);
              const depositSum = getDepositPaidSum(b);
              const balanceSum = getBalancePaidSum(b);
              const recordedSum = getRecordedPaymentsSum(b);

              return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectBooking(b)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectBooking(b);
                    }
                  }}
                  className={`p-3.5 cursor-pointer transition-colors active:bg-[#1F1D1A] hover:bg-[#1F1D1A]/80 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#7A7265] ${
                    isSelected ? 'bg-[#1F1D1A]' : ''
                  }`}
                >
                  {/* Header: Customer Name, Status Badge, Artwork, Artist & Date, Chevron */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-[#ECE4D3] truncate">
                        {b.customer_name}
                      </h4>
                      <p className="text-xs text-[#A89F91] mt-0.5 font-medium truncate">
                        {b.artwork_title || 'ไม่พบรายละเอียดงาน'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#7A7265] mt-1.5">
                        <span className="flex items-center gap-1 shrink-0">
                          <User size={11} className="text-[#7A7265]" />
                          <span className="text-[#A89F91]">{b.artist_name}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Calendar size={11} className="text-[#7A7265]" />
                          <span>{b.requested_date || '-'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${bStatus.class}`}>
                        {bStatus.label}
                      </span>
                      <ChevronRight size={16} className="text-[#7A7265]" />
                    </div>
                  </div>

                  {/* Financial Boxes Section (Layout C: 2 side-by-side boxes with ~10px gap) */}
                  <div className="grid grid-cols-2 gap-2.5 mt-3 pt-2.5 border-t border-[#4A443A]/40">
                    {/* Left Box: Deposit (Top) & Balance (Bottom) separated by thin line */}
                    <div className="bg-[#0E0D0C] p-2.5 rounded border border-[#4A443A]/60 flex flex-col justify-between gap-1.5 font-mono">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-[#7A7265] font-sans">มัดจำ</span>
                        <span className="text-xs font-semibold text-amber-400">
                          {depositSum > 0 ? `฿${depositSum.toLocaleString('th-TH')}` : '—'}
                        </span>
                      </div>
                      <div className="border-t border-[#4A443A]/40" />
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-[#7A7265] font-sans">ปิดงาน</span>
                        <span className="text-xs font-semibold text-emerald-400">
                          {balanceSum > 0 ? `฿${balanceSum.toLocaleString('th-TH')}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Right Box: Dark green bg & border, centered ยอดรับรวม & large green sum */}
                    <div className="bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded flex flex-col items-center justify-center text-center font-mono">
                      <span className="text-[10px] text-emerald-300/80 font-sans font-medium">
                        ยอดรับรวม
                      </span>
                      <span className="text-base font-bold text-emerald-400 mt-0.5">
                        ฿{recordedSum.toLocaleString('th-TH')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
