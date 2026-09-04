'use client';

import React from 'react';
import {
  Search,
  Filter,
  Calendar,
  User,
  ChevronRight,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileX,
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
  financialFilter: FinancialStatusFilter;
  onFinancialFilterChange: (f: FinancialStatusFilter) => void;
  bookingStatusFilter: BookingStatusFilter;
  onBookingStatusFilterChange: (s: BookingStatusFilter) => void;
  isLoading?: boolean;
}

// Financial status mapping (Section 6)
function getFinancialStatusInfo(summary: PaymentBookingDetail['summary']) {
  if (summary.is_fully_paid) {
    return {
      label: 'ชำระครบ',
      badgeClass: 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40',
      dotClass: 'bg-emerald-400',
    };
  }
  if (summary.deposit_paid && !summary.is_fully_paid && summary.paid_total > 0) {
    return {
      label: 'ชำระบางส่วน',
      badgeClass: 'bg-blue-950/50 text-blue-400 border border-blue-800/40',
      dotClass: 'bg-blue-400',
    };
  }
  if (!summary.deposit_paid && summary.deposit_required > 0) {
    return {
      label: 'รอมัดจำ',
      badgeClass: 'bg-amber-950/50 text-amber-400 border border-amber-800/40',
      dotClass: 'bg-amber-400',
    };
  }
  return {
    label: 'ยังไม่มีรายการชำระ',
    badgeClass: 'bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A]',
    dotClass: 'bg-[#7A7265]',
  };
}

// Booking status styling
function getBookingStatusBadge(status: string) {
  switch (status) {
    case 'WAITING_DEPOSIT':
      return {
        label: 'รอมัดจำยืนยัน',
        class: 'bg-amber-950/40 text-amber-300 border-amber-800/40',
      };
    case 'CONFIRMED':
      return {
        label: 'ยืนยันคิวแล้ว',
        class: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
      };
    case 'IN_PROGRESS':
      return {
        label: 'กำลังดำเนินการสัก',
        class: 'bg-blue-950/40 text-blue-300 border-blue-800/40',
      };
    case 'COMPLETED':
      return {
        label: 'เสร็จสิ้นงาน',
        class: 'bg-purple-950/40 text-purple-300 border-purple-800/40',
      };
    case 'CANCELLED':
      return {
        label: 'ยกเลิก',
        class: 'bg-red-950/40 text-red-400 border-red-900/40',
      };
    case 'PENDING':
      return {
        label: 'รอตรวจสอบ',
        class: 'bg-yellow-950/40 text-yellow-400 border-yellow-800/40',
      };
    default:
      return {
        label: status,
        class: 'bg-[#1F1D1A] text-[#A89F91] border-[#4A443A]',
      };
  }
}

export default function PaymentBookingList({
  bookings,
  selectedBookingId,
  onSelectBooking,
  searchQuery,
  onSearchChange,
  financialFilter,
  onFinancialFilterChange,
  bookingStatusFilter,
  onBookingStatusFilterChange,
  isLoading,
}: PaymentBookingListProps) {
  const financialFilterOptions: { label: string; value: FinancialStatusFilter }[] = [
    { label: 'ทั้งหมด', value: 'ALL' },
    { label: 'รอมัดจำ', value: 'WAITING_DEPOSIT' },
    { label: 'ชำระบางส่วน', value: 'PARTIAL' },
    { label: 'ชำระครบ', value: 'FULLY_PAID' },
  ];

  const bookingStatusOptions: { label: string; value: BookingStatusFilter }[] = [
    { label: 'สถานะคิวทั้งหมด', value: 'ALL' },
    { label: 'WAITING_DEPOSIT', value: 'WAITING_DEPOSIT' },
    { label: 'CONFIRMED', value: 'CONFIRMED' },
    { label: 'IN_PROGRESS', value: 'IN_PROGRESS' },
    { label: 'COMPLETED', value: 'COMPLETED' },
  ];

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-lg overflow-hidden font-prompt">
      {/* Search & Filter Header */}
      <div className="p-3.5 sm:p-4 border-b border-[#4A443A] space-y-3">
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

          {/* Booking Status Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={bookingStatusFilter}
              onChange={(e) => onBookingStatusFilterChange(e.target.value as BookingStatusFilter)}
              aria-label="กรองตามสถานะคิวงาน"
              className="bg-[#0E0D0C] border border-[#4A443A] rounded-md px-2.5 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#ECE4D3] transition-colors cursor-pointer"
            >
              {bookingStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#171512]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Financial Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] text-[#7A7265] font-medium mr-1 hidden sm:inline">
            การเงิน:
          </span>
          {financialFilterOptions.map((opt) => {
            const isActive = financialFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onFinancialFilterChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-md font-medium tracking-wide transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#ECE4D3] text-[#0E0D0C]'
                    : 'bg-[#0E0D0C] text-[#A89F91] hover:text-[#ECE4D3] border border-[#4A443A]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-[#7A7265] animate-pulse">
          กำลังโหลดรายการการเงิน...
        </div>
      ) : bookings.length === 0 ? (
        /* Empty State (Section 19) */
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
                  <th className="py-3 px-4">ลูกค้า / วันที่นัด</th>
                  <th className="py-3 px-4">ช่างสัก</th>
                  <th className="py-3 px-4">สถานะคิว</th>
                  <th className="py-3 px-4 text-right">ราคางานสัก</th>
                  <th className="py-3 px-4 text-right">มัดจำที่ต้องจ่าย</th>
                  <th className="py-3 px-4 text-right">รับเงินแล้ว</th>
                  <th className="py-3 px-4 text-right">ยอดคงเหลือ</th>
                  <th className="py-3 px-4 text-center">สถานะการเงิน</th>
                  <th className="py-3 px-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/60">
                {bookings.map((b) => {
                  const isSelected = selectedBookingId === b.id;
                  const finStatus = getFinancialStatusInfo(b.summary);
                  const bStatus = getBookingStatusBadge(b.status);

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

                      {/* Booking Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${bStatus.class}`}>
                          {bStatus.label}
                        </span>
                      </td>

                      {/* Quoted Price */}
                      <td className="py-3.5 px-4 text-right font-medium text-[#ECE4D3]">
                        ฿{b.summary.quoted_price.toLocaleString('th-TH')}
                      </td>

                      {/* Deposit Required */}
                      <td className="py-3.5 px-4 text-right text-amber-300/90 font-medium">
                        ฿{b.summary.deposit_required.toLocaleString('th-TH')}
                      </td>

                      {/* Paid Total */}
                      <td className="py-3.5 px-4 text-right text-emerald-400 font-semibold">
                        ฿{b.summary.paid_total.toLocaleString('th-TH')}
                      </td>

                      {/* Remaining Balance */}
                      <td className="py-3.5 px-4 text-right font-semibold">
                        {b.summary.remaining_balance > 0 ? (
                          <span className="text-red-400">
                            ฿{b.summary.remaining_balance.toLocaleString('th-TH')}
                          </span>
                        ) : (
                          <span className="text-[#7A7265]">฿0</span>
                        )}
                      </td>

                      {/* Financial Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${finStatus.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${finStatus.dotClass}`} />
                          {finStatus.label}
                        </span>
                      </td>

                      {/* Action Icon */}
                      <td className="py-3.5 px-3 text-center text-[#7A7265]">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Section 18) */}
          <div className="md:hidden divide-y divide-[#4A443A]/60">
            {bookings.map((b) => {
              const isSelected = selectedBookingId === b.id;
              const finStatus = getFinancialStatusInfo(b.summary);
              const bStatus = getBookingStatusBadge(b.status);

              return (
                <div
                  key={b.id}
                  onClick={() => onSelectBooking(b)}
                  className={`p-3.5 cursor-pointer transition-colors active:bg-[#1F1D1A] ${
                    isSelected ? 'bg-[#1F1D1A]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-medium text-[#ECE4D3]">
                        {b.customer_name}
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] text-[#7A7265] mt-0.5">
                        <span className="flex items-center gap-1">
                          <User size={11} /> {b.artist_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} /> {b.requested_date || '-'}
                        </span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${finStatus.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${finStatus.dotClass}`} />
                      {finStatus.label}
                    </span>
                  </div>

                  {/* Financial Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-[#4A443A]/40 text-center">
                    <div className="bg-[#0E0D0C] p-2 rounded border border-[#4A443A]/60">
                      <p className="text-[10px] text-[#7A7265]">ราคางาน</p>
                      <p className="text-xs font-medium text-[#ECE4D3] mt-0.5">
                        ฿{b.summary.quoted_price.toLocaleString('th-TH')}
                      </p>
                    </div>

                    <div className="bg-[#0E0D0C] p-2 rounded border border-[#4A443A]/60">
                      <p className="text-[10px] text-emerald-400/80">รับแล้ว</p>
                      <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                        ฿{b.summary.paid_total.toLocaleString('th-TH')}
                      </p>
                    </div>

                    <div className="bg-[#0E0D0C] p-2 rounded border border-[#4A443A]/60">
                      <p className="text-[10px] text-red-400/80">คงเหลือ</p>
                      <p className="text-xs font-semibold text-red-400 mt-0.5">
                        ฿{b.summary.remaining_balance.toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2.5 text-[11px]">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${bStatus.class}`}>
                      {bStatus.label}
                    </span>
                    <span className="text-xs text-[#A89F91] flex items-center gap-1 font-medium">
                      ดูรายละเอียดการเงิน <ChevronRight size={13} />
                    </span>
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
