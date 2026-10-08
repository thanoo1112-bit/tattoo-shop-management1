'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, User, Calendar, DollarSign, Clock, ShieldCheck, CreditCard, TriangleAlert } from 'lucide-react';
import { BookingItem, BookingStatus, formatDateTimeBangkok, formatCurrency, isMultiSessionIncompleteBooking, resolveBookingOperationalStatus } from './types';

interface BookingListProps {
  bookings: BookingItem[];
  selectedBooking: BookingItem | null;
  onSelectBooking: (booking: BookingItem) => void;
  onCheckSlip?: (bookingId: string) => void;
  initialFilter?: string;
}

export default function BookingList({
  bookings,
  selectedBooking,
  onSelectBooking,
  onCheckSlip,
  initialFilter,
}: BookingListProps) {
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  const getCategory = (b: BookingItem) => {
    const statusStr = (b.status || '').toUpperCase();
    const opKey = b.operational_status?.key || statusStr;

    if (statusStr === 'COMPLETED' || opKey === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (statusStr === 'CANCELLED' || statusStr === 'EXPIRED' || opKey === 'CANCELLED' || opKey === 'EXPIRED') {
      return 'CANCELLED';
    }
    const isMultiSession = Boolean(
      (b.sessions && b.sessions.length > 1) ||
      (b.sessions && b.sessions.some(s => (s.session_number || 1) >= 2)) ||
      isMultiSessionIncompleteBooking(b).isIncomplete ||
      opKey === 'MULTI_SESSION_INCOMPLETE'
    );
    if (isMultiSession) {
      return 'SESSIONS';
    }
    return 'SCHEDULED';
  };

  const statusCounts = useMemo(() => {
    let sessionsCount = 0;
    let completed = 0;
    let cancelled = 0;

    bookings.forEach((b) => {
      const cat = getCategory(b);
      if (cat === 'COMPLETED') completed++;
      else if (cat === 'CANCELLED') cancelled++;
      else if (cat === 'SESSIONS') sessionsCount++;
    });

    const scheduledCount = bookings.filter(b => {
      const cat = getCategory(b);
      return cat === 'SCHEDULED' || cat === 'SESSIONS';
    }).length;

    return {
      all: bookings.length,
      scheduled: scheduledCount,
      sessions: sessionsCount,
      completed,
      cancelled,
    };
  }, [bookings]);

  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: `ทั้งหมด (${statusCounts.all})` },
    { id: 'SCHEDULED', label: `นัดหมายแล้ว (${statusCounts.scheduled})` },
    { id: 'COMPLETED', label: `งานเสร็จสิ้น (${statusCounts.completed})` },
    { id: 'CANCELLED', label: `ยกเลิก (${statusCounts.cancelled})` },
  ];

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const cat = getCategory(b);

      if (statusFilter !== 'ALL') {
        if ((statusFilter === 'SCHEDULED' || statusFilter === 'CONFIRMED') && cat !== 'SCHEDULED' && cat !== 'SESSIONS') return false;
        if ((statusFilter === 'SESSIONS' || statusFilter === 'MULTI_SESSION_INCOMPLETE') && cat !== 'SESSIONS') return false;
        if (statusFilter === 'COMPLETED' && cat !== 'COMPLETED') return false;
        if (statusFilter === 'CANCELLED' && cat !== 'CANCELLED') return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCustomer = b.customer_name?.toLowerCase().includes(query);
        const matchesArtist = b.artist_name?.toLowerCase().includes(query);
        const matchesNote = b.customer_note?.toLowerCase().includes(query);
        if (!matchesCustomer && !matchesArtist && !matchesNote) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, searchQuery]);

  const renderHealthAlertBadge = (book: BookingItem) => {
    const hasMed = book.has_medical_condition;
    const hasAll = book.has_allergy;

    const isAlert = hasMed === true || hasAll === true;
    const isHealthy = hasMed === false && hasAll === false;

    if (isAlert) {
      return (
        <span
          title="มีข้อมูลสุขภาพ กรุณาตรวจสอบรายละเอียดก่อนให้บริการ"
          className="bg-[#2A1212] text-[#E8B4B4] border border-[#9C2F2F] px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help"
        >
          <TriangleAlert size={11} className="text-[#E8B4B4] shrink-0" />
          <span>มีข้อมูล</span>
        </span>
      );
    }

    if (isHealthy) {
      return (
        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center">
          ปกติ
        </span>
      );
    }

    return (
      <span className="bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center">
        ไม่ระบุ
      </span>
    );
  };

  const renderStatusBadge = (book: BookingItem) => {
    const isDirectBooking = (book as any).request_type === 'DIRECT_BOOKING' || (book as any).booking_source === 'ADMIN_CALENDAR';

    if (
      (book.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || book.has_pending_payment_submission) &&
      onCheckSlip
    ) {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCheckSlip(book.id);
            }}
            title="กดเพื่อตรวจสลิป"
            className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer shadow-sm"
          >
            <span>สลิปรอตรวจ</span>
          </button>
        </div>
      );
    }

    if (book.operational_status) {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <span className={`${book.operational_status.badgeClass} px-2 py-0.5 rounded text-[10px] font-semibold`}>
            {book.operational_status.label}
          </span>
        </div>
      );
    }

    switch (book.status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            รออนุมัติ
          </span>
        );
      case 'APPROVED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            อนุมัติแล้ว
          </span>
        );
      case 'WAITING_DEPOSIT':
      case 'CONFIRMED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ยืนยันคิวแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            กำลังสัก
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            เสร็จสิ้น
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ปฏิเสธ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
            ยกเลิก
          </span>
        );
      default:
        return null;
    }
  };

  const getFinancialBadge = (book: any) => {
    const fin = book?.financial;
    if (!fin) return null;

    const isCompleted = book.status === 'COMPLETED';
    const quoted = Number(fin.quoted_price || 0);
    const received = Number(fin.total_paid || 0);
    const isFullyPaid = fin.is_fully_paid || (quoted > 0 && received >= quoted);

    if (isCompleted) {
      if (isFullyPaid || (quoted > 0 && received >= quoted)) {
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ชำระครบ
          </span>
        );
      }
      const outstanding = Math.max(0, quoted - received);
      return (
        <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
          ค้างชำระ ฿{formatCurrency(outstanding)}
        </span>
      );
    }

    if (isFullyPaid || (quoted > 0 && received >= quoted)) {
      return (
        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
          ชำระครบ
        </span>
      );
    }
    if (received > 0) {
      return (
        <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
          ชำระบางส่วน
        </span>
      );
    }
    return (
      <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
        รอมัดจำ
      </span>
    );
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {filterPills.map((pill) => {
            const isSelected = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border shrink-0 ${
                  isSelected
                    ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow'
                    : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, ช่างสัก..."
            className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3]"
          />
        </div>
      </div>

      {/* Content List */}
      {filteredBookings.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40 space-y-2">
          <Calendar size={28} className="text-[#7A7265] mx-auto opacity-60" />
          <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3]">ยังไม่มีคิวงาน</h4>
          <p className="text-[11px] text-[#7A7265] max-w-sm mx-auto">
            เมื่อลูกค้าทำการจองคิวงานและได้รับการอนุมัติ คิวงานและสถานะการทำงานจะแสดงที่นี่
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#ECE4D3]">
              <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                <tr>
                  <th className="py-3 px-3">รหัสคิว / วันเวลานัด</th>
                  <th className="py-3 px-3">ลูกค้า</th>
                  <th className="py-3 px-3">ช่างสัก</th>
                  <th className="py-3 px-3">สถานะ</th>
                  <th className="py-3 px-3 text-center">แจ้งเตือนด้านสุขภาพ</th>
                  <th className="py-3 px-3 text-right">ราคาที่ตกลง</th>
                  <th className="py-3 px-3 text-right">รับเงินแล้ว</th>
                  <th className="py-3 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredBookings.map((book) => {
                  const isSelected = selectedBooking?.id === book.id;
                  const reqTime = book.requested_start_time || book.requested_time;
                  const timeFormatted = reqTime ? (reqTime.length >= 5 ? reqTime.slice(0, 5) : reqTime) : null;

                  return (
                    <tr
                      key={book.id}
                      onClick={() => onSelectBooking(book)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#1F1D1A]' : 'hover:bg-[#1F1D1A]/50'
                      }`}
                    >
                      <td className="py-3 px-3 text-[#A89F91]">
                        <span className="text-[10px] text-[#7A7265] font-mono block font-semibold">
                          #{book.id.slice(0, 8)}
                        </span>
                        <div className="font-medium text-[#ECE4D3] text-xs mt-0.5">
                          {book.requested_date || '-'}
                        </div>
                        {timeFormatted && (
                          <div className="text-[10px] text-amber-400/90 font-mono">
                            {timeFormatted} น.
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#ECE4D3]">
                        {book.customer_name}
                      </td>
                      <td className="py-3 px-3 text-[#A89F91]">
                        {book.artist_name}
                      </td>
                      <td className="py-3 px-3">
                        {renderStatusBadge(book)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderHealthAlertBadge(book)}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-[#ECE4D3]">
                        {book.financial?.quoted_price && book.financial.quoted_price > 0
                          ? `฿${formatCurrency(book.financial.quoted_price)}`
                          : 'ยังไม่กำหนดราคา'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-400">
                        ฿{formatCurrency(book.financial?.total_paid || 0)}
                      </td>
                      <td className="py-3 px-3 text-center text-[#7A7265]">
                        <ChevronRight size={14} className="inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-2.5">
            {filteredBookings.map((book) => {
              const isSelected = selectedBooking?.id === book.id;
              const reqTime = book.requested_start_time || book.requested_time;
              const timeFormatted = reqTime ? (reqTime.length >= 5 ? reqTime.slice(0, 5) : reqTime) : null;

              return (
                <div
                  key={book.id}
                  onClick={() => onSelectBooking(book)}
                  className={`border rounded-lg p-3.5 space-y-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#1F1D1A] border-[#ECE4D3]'
                      : 'bg-[#0E0D0C] border-[#4A443A]/70 hover:border-[#7A7265]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-[#7A7265] font-mono mr-1.5 font-semibold">
                        #{book.id.slice(0, 8)}
                      </span>
                      <span className="font-semibold text-xs text-[#ECE4D3]">{book.customer_name}</span>
                      <p className="text-[11px] text-[#7A7265] mt-0.5">
                        ช่าง: <span className="text-[#A89F91]">{book.artist_name}</span>
                        {book.requested_date && (
                          <span>
                            {' • '}วันที่: {book.requested_date} {timeFormatted ? `(${timeFormatted} น.)` : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {renderHealthAlertBadge(book)}
                      {renderStatusBadge(book)}
                    </div>
                  </div>

                  <div className="text-xs pt-2 border-t border-[#4A443A]/40 flex items-center justify-between">
                    <div className="text-right w-full">
                      <span className="text-[10px] text-[#7A7265] mr-1">รับเงินแล้ว:</span>
                      <span className="font-semibold text-emerald-400">
                        ฿{formatCurrency(book.financial?.total_paid || 0)}
                      </span>
                      <span className="text-[10px] text-[#7A7265] ml-1">
                        / {book.financial?.quoted_price && book.financial.quoted_price > 0 ? `฿${formatCurrency(book.financial.quoted_price)}` : 'ยังไม่กำหนดราคา'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
