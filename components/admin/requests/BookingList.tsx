'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, User, Calendar, DollarSign, Clock, ShieldCheck, CreditCard } from 'lucide-react';
import { BookingItem, BookingStatus, formatDateTimeBangkok, formatCurrency } from './types';

interface BookingListProps {
  bookings: BookingItem[];
  selectedBooking: BookingItem | null;
  onSelectBooking: (booking: BookingItem) => void;
}

export default function BookingList({
  bookings,
  selectedBooking,
  onSelectBooking,
}: BookingListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: 'ทั้งหมด' },
    { id: 'PENDING', label: 'รออนุมัติ' },
    { id: 'WAITING_DEPOSIT', label: 'รอมัดจำ' },
    { id: 'CONFIRMED', label: 'ยืนยันคิว' },
    { id: 'IN_PROGRESS', label: 'กำลังสัก' },
    { id: 'COMPLETED', label: 'เสร็จสิ้น' },
    { id: 'CANCELLED', label: 'ยกเลิก' },
  ];

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
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

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
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
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            รอมัดจำ
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ยืนยันคิว
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

  const getFinancialBadge = (fin: any) => {
    if (!fin) return null;
    if (fin.is_fully_paid) {
      return (
        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
          ชำระครบ
        </span>
      );
    }
    if (fin.total_paid > 0) {
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
                  <th className="py-3 px-3">วันที่ต้องการ</th>
                  <th className="py-3 px-3">ลูกค้า</th>
                  <th className="py-3 px-3">ช่างสัก</th>
                  <th className="py-3 px-3">สถานะคิวงาน</th>
                  <th className="py-3 px-3">สถานะการเงิน</th>
                  <th className="py-3 px-3 text-right">ราคาที่ตกลง</th>
                  <th className="py-3 px-3 text-right">รับเงินแล้ว</th>
                  <th className="py-3 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredBookings.map((book) => {
                  const isSelected = selectedBooking?.id === book.id;
                  return (
                    <tr
                      key={book.id}
                      onClick={() => onSelectBooking(book)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#1F1D1A]' : 'hover:bg-[#1F1D1A]/50'
                      }`}
                    >
                      <td className="py-3 px-3 text-[#A89F91]">
                        {book.requested_date || '-'}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#ECE4D3]">
                        {book.customer_name}
                      </td>
                      <td className="py-3 px-3 text-[#A89F91]">
                        {book.artist_name}
                      </td>
                      <td className="py-3 px-3">{getStatusBadge(book.status)}</td>
                      <td className="py-3 px-3">{getFinancialBadge(book.financial)}</td>
                      <td className="py-3 px-3 text-right font-medium text-[#ECE4D3]">
                        {formatCurrency(book.financial?.quoted_price || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-400">
                        {formatCurrency(book.financial?.total_paid || 0)}
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
                      <span className="font-semibold text-sm text-[#ECE4D3]">{book.customer_name}</span>
                      <p className="text-[11px] text-[#7A7265] mt-0.5">
                        ช่าง: <span className="text-[#A89F91]">{book.artist_name}</span>
                        {book.requested_date && ` • วันที่: ${book.requested_date}`}
                      </p>
                    </div>
                    {getStatusBadge(book.status)}
                  </div>

                  <div className="text-xs pt-2 border-t border-[#4A443A]/40 flex items-center justify-between">
                    <div>{getFinancialBadge(book.financial)}</div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#7A7265] mr-1">รับแล้ว:</span>
                      <span className="font-semibold text-emerald-400">
                        {formatCurrency(book.financial?.total_paid || 0)}
                      </span>
                      <span className="text-[10px] text-[#7A7265] ml-1">
                        / {formatCurrency(book.financial?.quoted_price || 0)}
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
