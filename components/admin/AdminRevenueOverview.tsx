'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { Booking, BookingPayment } from '@/data/mockBookings';
import {
  Search,
  DollarSign,
  Calendar,
  Clock,
  User,
  Users,
  ChevronDown,
  Check,
  FileText,
  X,
  Sparkles,
  ArrowUpDown,
  TrendingUp,
  CreditCard,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  BarChart3,
  ChevronRight,
  BadgeDollarSign,
} from 'lucide-react';

export default function AdminRevenueOverview() {
  const { bookings, bookingPayments, artists } = useApp();

  // Date Range state ('today' | '7days' | 'this_month' | 'last_month' | 'this_year')
  const [dateRange, setDateRange] = useState<'today' | '7days' | 'this_month' | 'last_month' | 'this_year'>('this_month');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState('ALL');
  const [selectedPaymentStatusFilter, setSelectedPaymentStatusFilter] = useState('ALL');

  // Dropdown States
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [isPaymentStatusDropdownOpen, setIsPaymentStatusDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const paymentStatusDropdownRef = useRef<HTMLDivElement>(null);

  // Active Detail Drawer State
  const [selectedBookingRevenue, setSelectedBookingRevenue] = useState<{
    booking: Booking;
    payment?: BookingPayment;
  } | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDateDropdownOpen(false);
      }
      if (
        artistDropdownRef.current &&
        !artistDropdownRef.current.contains(event.target as Node)
      ) {
        setIsArtistDropdownOpen(false);
      }
      if (
        paymentStatusDropdownRef.current &&
        !paymentStatusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPaymentStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Bookings by Date Range
  const rangeFilteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // In current prototype, all bookings are September 2026
      if (dateRange === 'today') {
        return b.date === '2026-09-01';
      }
      if (dateRange === '7days') {
        return b.date >= '2026-09-01' && b.date <= '2026-09-07';
      }
      if (dateRange === 'this_month') {
        return b.date.startsWith('2026-09');
      }
      if (dateRange === 'last_month') {
        return b.date.startsWith('2026-08');
      }
      return true; // this_year
    });
  }, [bookings, dateRange]);

  // Overall Financial Aggregates
  const financialSummary = useMemo(() => {
    let totalWorkValue = 0;
    let totalDepositsReceived = 0;
    let completedJobsCount = 0;

    rangeFilteredBookings.forEach((b) => {
      totalWorkValue += b.price || 0;
      if (b.paymentStatus === 'DEPOSIT_PAID' || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED') {
        totalDepositsReceived += b.deposit || 0;
      }
      if (b.status === 'COMPLETED' || b.status === 'CONFIRMED') {
        completedJobsCount++;
      }
    });

    const totalRemainingBalance = Math.max(0, totalWorkValue - totalDepositsReceived);

    return {
      totalWorkValue,
      totalDepositsReceived,
      totalRemainingBalance,
      completedJobsCount,
    };
  }, [rangeFilteredBookings]);

  // Revenue By Artist Breakdown
  const revenueByArtist = useMemo(() => {
    return artists.map((artist) => {
      const artistJobs = rangeFilteredBookings.filter((b) => b.artistId === artist.id);
      const totalAmount = artistJobs.reduce((sum, b) => sum + (b.price || 0), 0);
      const depositAmount = artistJobs.reduce(
        (sum, b) => sum + (b.paymentStatus === 'DEPOSIT_PAID' ? b.deposit || 0 : 0),
        0
      );
      const completedCount = artistJobs.filter(
        (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'IN_PROGRESS'
      ).length;

      return {
        artist,
        jobsCount: artistJobs.length,
        completedCount,
        totalAmount,
        depositAmount,
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [artists, rangeFilteredBookings]);

  // Max Artist Revenue for relative bar width
  const maxArtistRevenue = useMemo(() => {
    const max = Math.max(...revenueByArtist.map((r) => r.totalAmount));
    return max > 0 ? max : 1;
  }, [revenueByArtist]);

  // Payment Status Summary
  const paymentStatusBreakdown = useMemo(() => {
    let depositPaidCount = 0;
    let depositPaidTotal = 0;

    let waitingDepositCount = 0;
    let waitingDepositTotal = 0;

    let unpaidPendingCount = 0;
    let unpaidPendingTotal = 0;

    rangeFilteredBookings.forEach((b) => {
      if (b.paymentStatus === 'DEPOSIT_PAID') {
        depositPaidCount++;
        depositPaidTotal += b.deposit || 0;
      } else if (b.status === 'WAITING_DEPOSIT') {
        waitingDepositCount++;
        waitingDepositTotal += b.deposit || 0;
      } else {
        unpaidPendingCount++;
        unpaidPendingTotal += b.price || 0;
      }
    });

    return {
      depositPaidCount,
      depositPaidTotal,
      waitingDepositCount,
      waitingDepositTotal,
      unpaidPendingCount,
      unpaidPendingTotal,
    };
  }, [rangeFilteredBookings]);

  // Daily Trend Data for Chart (e.g. 1-7 ก.ย. 2026)
  const dailyTrend = useMemo(() => {
    const daysMap = new Map<string, number>();

    // Preset standard 7 days of Sep 2026
    const days = ['01', '02', '03', '04', '05', '06', '07'];
    days.forEach((d) => daysMap.set(`2026-09-${d}`, 0));

    rangeFilteredBookings.forEach((b) => {
      if (daysMap.has(b.date)) {
        daysMap.set(b.date, (daysMap.get(b.date) || 0) + (b.price || 0));
      }
    });

    const list: { date: string; dayLabel: string; amount: number }[] = [];
    const thaiDays = ['1 ก.ย.', '2 ก.ย.', '3 ก.ย.', '4 ก.ย.', '5 ก.ย.', '6 ก.ย.', '7 ก.ย.'];

    let i = 0;
    daysMap.forEach((amount, date) => {
      list.push({
        date,
        dayLabel: thaiDays[i] || date.substring(8),
        amount,
      });
      i++;
    });

    return list;
  }, [rangeFilteredBookings]);

  const maxDailyAmount = useMemo(() => {
    const max = Math.max(...dailyTrend.map((d) => d.amount));
    return max > 0 ? max : 10000;
  }, [dailyTrend]);

  // Filtered Revenue Records (Table & Cards)
  const filteredRecords = useMemo(() => {
    return rangeFilteredBookings
      .filter((b) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.artworkTitle && b.artworkTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
          b.artistName.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' || b.artistId === selectedArtistFilter;

        let matchesPayment = true;
        if (selectedPaymentStatusFilter === 'DEPOSIT_PAID') {
          matchesPayment = b.paymentStatus === 'DEPOSIT_PAID';
        } else if (selectedPaymentStatusFilter === 'WAITING_DEPOSIT') {
          matchesPayment = b.status === 'WAITING_DEPOSIT';
        } else if (selectedPaymentStatusFilter === 'UNPAID') {
          matchesPayment = b.paymentStatus === 'UNPAID';
        }

        return matchesSearch && matchesArtist && matchesPayment;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rangeFilteredBookings, searchQuery, selectedArtistFilter, selectedPaymentStatusFilter]);

  // Helper Thai Date Formatter
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-') return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${
      parseInt(parts[0], 10) + 543
    }`;
  };

  // Helper Initials
  const getInitials = (name: string) => {
    if (!name) return 'C';
    return name.trim().charAt(0).toUpperCase();
  };

  // Helper Status Badge
  const getBookingStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return { label: 'ยืนยันคิวแล้ว', dot: 'bg-green-400', badge: 'text-green-300 bg-green-950/60 border-green-800' };
      case 'IN_PROGRESS':
        return { label: 'กำลังสัก', dot: 'bg-[#9C2F2F]', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'WAITING_DEPOSIT':
        return { label: 'รอมัดจำ', dot: 'bg-amber-400', badge: 'text-amber-300 bg-amber-950/60 border-amber-800' };
      case 'PENDING':
        return { label: 'รอตรวจสอบ', dot: 'bg-[#9C2F2F] animate-pulse', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'COMPLETED':
        return { label: 'เสร็จสิ้น', dot: 'bg-zinc-500', badge: 'text-[#7A7265] bg-zinc-900 border-[#4A443A]' };
      default:
        return { label: status, dot: 'bg-[#7A7265]', badge: 'text-[#A89F91] bg-[#171512] border-[#4A443A]' };
    }
  };

  return (
    <div className="space-y-6 font-prompt text-[#ECE4D3] pb-24 md:pb-12">
      {/* 1. TOP PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#4A443A] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <DollarSign size={12} className="text-[#9C2F2F]" />
            <span>REVENUE OVERVIEW • รายได้ร้าน</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            รายได้ร้าน
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5 font-light">
            ภาพรวมรายได้จากงานสักและการรับชำระของร้าน
          </p>
        </div>

        {/* Right Date Range Selector */}
        <div ref={dateDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsDateDropdownOpen((prev) => !prev)}
            className="h-[38px] px-3.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
          >
            <Calendar size={13} className="text-[#9C2F2F]" />
            <span>
              {dateRange === 'today' && 'วันนี้'}
              {dateRange === '7days' && '7 วันล่าสุด'}
              {dateRange === 'this_month' && 'เดือนนี้ (ก.ย. 2026)'}
              {dateRange === 'last_month' && 'เดือนก่อน'}
              {dateRange === 'this_year' && 'ปีนี้'}
            </span>
            <ChevronDown size={13} className="text-[#7A7265]" />
          </button>

          {isDateDropdownOpen && (
            <div className="absolute top-full mt-1 right-0 z-50 w-[170px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
              {[
                { id: 'today', label: 'วันนี้' },
                { id: '7days', label: '7 วันล่าสุด' },
                { id: 'this_month', label: 'เดือนนี้' },
                { id: 'last_month', label: 'เดือนก่อน' },
                { id: 'this_year', label: 'ปีนี้' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDateRange(item.id as any);
                    setIsDateDropdownOpen(false);
                  }}
                  className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                    dateRange === item.id
                      ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                      : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                  }`}
                >
                  <span>{item.label}</span>
                  {dateRange === item.id && (
                    <Check size={13} className="text-[#9C2F2F]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. TOP FINANCIAL SUMMARY (4 COMPACT CARDS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Work Value (Aged Paper Accent) */}
        <div className="p-4 bg-[#171512] border-l-4 border-l-[#9C2F2F] border border-[#4A443A] rounded-[8px] space-y-1 shadow-md">
          <span className="text-[10px] uppercase font-bold text-[#A89F91] tracking-wider block">
            รายได้รวม (Total Work Value)
          </span>
          <div className="text-2xl sm:text-3xl font-heading font-normal text-[#ECE4D3] pt-1">
            ฿{financialSummary.totalWorkValue.toLocaleString()}
          </div>
          <span className="text-[10px] text-[#7A7265] block font-mono">
            {rangeFilteredBookings.length} คิวงานทั้งหมด
          </span>
        </div>

        {/* Card 2: Received Deposits */}
        <div className="p-4 bg-[#171512] border border-[#4A443A] rounded-[8px] space-y-1 shadow-md">
          <span className="text-[10px] uppercase font-bold text-[#A89F91] tracking-wider block">
            มัดจำที่รับแล้ว (Deposits Paid)
          </span>
          <div className="text-2xl sm:text-3xl font-heading font-normal text-green-400 pt-1">
            ฿{financialSummary.totalDepositsReceived.toLocaleString()}
          </div>
          <span className="text-[10px] text-[#7A7265] block font-mono">
            ยอดเงินที่ได้รับการยืนยันแล้ว
          </span>
        </div>

        {/* Card 3: Remaining Balance (Tattoo Red Attention) */}
        <div className="p-4 bg-[#171512] border border-[#4A443A] rounded-[8px] space-y-1 shadow-md">
          <span className="text-[10px] uppercase font-bold text-[#A89F91] tracking-wider block">
            ยอดคงเหลือ (Balance Due)
          </span>
          <div className="text-2xl sm:text-3xl font-heading font-normal text-[#9C2F2F] pt-1">
            ฿{financialSummary.totalRemainingBalance.toLocaleString()}
          </div>
          <span className="text-[10px] text-[#7A7265] block font-mono">
            รอชำระหน้างานหลังสักเสร็จ
          </span>
        </div>

        {/* Card 4: Completed Jobs */}
        <div className="p-4 bg-[#171512] border border-[#4A443A] rounded-[8px] space-y-1 shadow-md">
          <span className="text-[10px] uppercase font-bold text-[#A89F91] tracking-wider block">
            งานเสร็จสิ้น / ยืนยัน
          </span>
          <div className="text-2xl sm:text-3xl font-heading font-normal text-[#ECE4D3] pt-1">
            {financialSummary.completedJobsCount} งาน
          </div>
          <span className="text-[10px] text-[#7A7265] block font-mono">
            ตามกำหนดการในช่วงนี้
          </span>
        </div>
      </div>

      {/* 3. TOOLBAR (SEARCH + ARTIST & PAYMENT FILTERS) */}
      <div className="bg-[#171512] border border-[#4A443A] p-3 rounded-[8px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 shadow-md">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาลูกค้าหรืองาน..."
            className="w-full h-[38px] pl-9 pr-8 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7265] hover:text-[#ECE4D3]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Artist Filter */}
          <div ref={artistDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsArtistDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <User size={13} className="text-[#9C2F2F]" />
              <span className="truncate max-w-[120px]">
                {selectedArtistFilter === 'ALL'
                  ? 'ช่างทั้งหมด'
                  : artists.find((a) => a.id === selectedArtistFilter)?.name || 'ช่างสัก'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isArtistDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[180px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtistFilter('ALL');
                    setIsArtistDropdownOpen(false);
                  }}
                  className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                    selectedArtistFilter === 'ALL'
                      ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                      : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                  }`}
                >
                  <span>ช่างทั้งหมด</span>
                  {selectedArtistFilter === 'ALL' && (
                    <Check size={13} className="text-[#9C2F2F]" />
                  )}
                </button>
                {artists.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => {
                      setSelectedArtistFilter(artist.id);
                      setIsArtistDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedArtistFilter === artist.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span className="truncate">{artist.name}</span>
                    {selectedArtistFilter === artist.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment Status Filter */}
          <div ref={paymentStatusDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsPaymentStatusDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <CreditCard size={13} className="text-[#9C2F2F]" />
              <span>
                {selectedPaymentStatusFilter === 'ALL' && 'การชำระทั้งหมด'}
                {selectedPaymentStatusFilter === 'DEPOSIT_PAID' && 'มัดจำแล้ว'}
                {selectedPaymentStatusFilter === 'WAITING_DEPOSIT' && 'รอมัดจำ'}
                {selectedPaymentStatusFilter === 'UNPAID' && 'ยังไม่ชำระ'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isPaymentStatusDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[170px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                {[
                  { id: 'ALL', label: 'การชำระทั้งหมด' },
                  { id: 'DEPOSIT_PAID', label: '● มัดจำแล้ว' },
                  { id: 'WAITING_DEPOSIT', label: '● รอมัดจำ' },
                  { id: 'UNPAID', label: '● ยังไม่ชำระ' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedPaymentStatusFilter(item.id);
                      setIsPaymentStatusDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedPaymentStatusFilter === item.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {selectedPaymentStatusFilter === item.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. MAIN DESKTOP 2-COLUMN LAYOUT (LEFT 65% / RIGHT 35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 65% (8 COLS ON LG): REVENUE TREND & REVENUE RECORDS */}
        <div className="lg:col-span-8 space-y-6">
          {/* 4.1 REVENUE TREND BAR CHART */}
          <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 shadow-lg">
            <div className="flex justify-between items-center border-b border-[#4A443A]/40 pb-3">
              <div className="flex items-center space-x-2">
                <BarChart3 size={15} className="text-[#9C2F2F]" />
                <h3 className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                  REVENUE TREND • แนวโน้มรายได้ (1–7 ก.ย. 2569)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#7A7265]">
                ยอดรวมรายวัน (THB)
              </span>
            </div>

            {/* Simple Minimal Bar Chart */}
            <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2">
              {dailyTrend.map((d) => {
                const heightPercent = d.amount > 0 ? (d.amount / maxDailyAmount) * 100 : 4;

                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    {/* Tooltip on Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-[#0E0D0C] border border-[#4A443A] text-[#ECE4D3] text-[10px] font-mono px-2 py-0.5 rounded pointer-events-none whitespace-nowrap shadow z-10">
                      ฿{d.amount.toLocaleString()}
                    </div>

                    {/* Bar Column */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full max-w-[42px] rounded-t-[4px] transition-all duration-300 ${
                        d.amount > 0
                          ? 'bg-[#ECE4D3]/80 group-hover:bg-[#9C2F2F]'
                          : 'bg-[#0E0D0C] border border-[#4A443A]/40'
                      }`}
                    />

                    {/* Date Label */}
                    <span className="text-[10px] font-mono text-[#7A7265] mt-2 group-hover:text-[#ECE4D3]">
                      {d.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4.2 REVENUE RECORDS TABLE */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                REVENUE RECORDS • รายการงานที่สร้างรายได้
              </h3>
              <span className="text-xs font-mono text-[#7A7265]">
                {filteredRecords.length} รายการ
              </span>
            </div>

            {/* Desktop Table (Hidden on Mobile) */}
            <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
                    <th className="py-3 px-4">วันที่</th>
                    <th className="py-3 px-4">ลูกค้า</th>
                    <th className="py-3 px-4">ผลงาน / ลายสัก</th>
                    <th className="py-3 px-4">ช่างสัก</th>
                    <th className="py-3 px-4">ราคางาน</th>
                    <th className="py-3 px-4">มัดจำแล้ว</th>
                    <th className="py-3 px-4">ยอดคงเหลือ</th>
                    <th className="py-3 px-4 text-right">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4A443A]/50">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-[#7A7265]">
                        {searchQuery ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลรายได้ในช่วงเวลานี้'}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((b) => {
                      const balance = Math.max(0, (b.price || 0) - (b.paymentStatus === 'DEPOSIT_PAID' ? b.deposit || 0 : 0));
                      const isSelected = selectedBookingRevenue?.booking.id === b.id;

                      return (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedBookingRevenue({ booking: b })}
                          className={`h-[68px] cursor-pointer transition-colors group ${
                            isSelected ? 'bg-[#1C1A16] ring-1 ring-[#9C2F2F]' : 'hover:bg-[#1C1A16]'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-[#ECE4D3]">
                            {formatThaiDate(b.date)}
                          </td>
                          <td className="py-3 px-4">
                            <strong className="text-[#ECE4D3] font-medium block">
                              {b.customerName}
                            </strong>
                            <span className="text-[10px] text-[#7A7265] font-mono block">
                              {b.customerEmail}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[#ECE4D3] font-medium block truncate max-w-[150px]">
                              {b.artworkTitle || 'Custom Tattoo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                            {b.artistName}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-[#ECE4D3]">
                            ฿{b.price?.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-green-400 font-semibold">
                            {b.paymentStatus === 'DEPOSIT_PAID' ? `฿${b.deposit?.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#9C2F2F] font-semibold">
                            ฿{balance.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold border inline-block ${
                                getBookingStatusBadge(b.status).badge
                              }`}
                            >
                              {getBookingStatusBadge(b.status).label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Revenue Cards (Visible on Mobile <= md) */}
            <div className="md:hidden space-y-3">
              {filteredRecords.length === 0 ? (
                <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
                  {searchQuery ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลรายได้ในช่วงเวลานี้'}
                </div>
              ) : (
                filteredRecords.map((b) => {
                  const balance = Math.max(0, (b.price || 0) - (b.paymentStatus === 'DEPOSIT_PAID' ? b.deposit || 0 : 0));

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBookingRevenue({ booking: b })}
                      className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-semibold text-[#ECE4D3]">
                            {b.customerName}
                          </h4>
                          <span className="text-xs text-[#A89F91] block mt-0.5">
                            {b.artworkTitle || 'Custom Tattoo'} • {b.artistName}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${
                            getBookingStatusBadge(b.status).badge
                          }`}
                        >
                          {getBookingStatusBadge(b.status).label}
                        </span>
                      </div>

                      {/* 3-Col Money Breakdown */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#4A443A]/40 text-center text-xs">
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/30">
                          <span className="text-[9px] text-[#7A7265] block">ราคางาน:</span>
                          <strong className="text-xs font-mono text-[#ECE4D3]">
                            ฿{b.price?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/30">
                          <span className="text-[9px] text-[#7A7265] block">มัดจำ:</span>
                          <strong className="text-xs font-mono text-green-400">
                            {b.paymentStatus === 'DEPOSIT_PAID' ? `฿${b.deposit?.toLocaleString()}` : '-'}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/30">
                          <span className="text-[9px] text-[#7A7265] block">คงเหลือ:</span>
                          <strong className="text-xs font-mono text-[#9C2F2F]">
                            ฿{balance.toLocaleString()}
                          </strong>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 text-[11px] font-mono text-[#7A7265]">
                        <span>วันที่: {formatThaiDate(b.date)}</span>
                        <span className="text-[#ECE4D3] font-semibold">แตะดูรายละเอียด ↗</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 35% (4 COLS ON LG): REVENUE BY ARTIST & PAYMENT BREAKDOWN */}
        <div className="lg:col-span-4 space-y-6">
          {/* 4.3 REVENUE BY ARTIST */}
          <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 shadow-lg">
            <div className="flex justify-between items-center border-b border-[#4A443A]/40 pb-3">
              <h3 className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                REVENUE BY ARTIST • รายได้ตามช่าง
              </h3>
              <span className="text-[10px] font-mono text-[#7A7265]">
                {artists.length} ช่าง
              </span>
            </div>

            <div className="space-y-3">
              {revenueByArtist.map(({ artist, jobsCount, totalAmount }) => {
                const percent = (totalAmount / maxArtistRevenue) * 100;

                return (
                  <div key={artist.id} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[#0E0D0C] border border-[#4A443A] shrink-0">
                          <img
                            src={artist.avatar}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <strong className="text-[#ECE4D3] block text-xs">
                            {artist.name}
                          </strong>
                          <span className="text-[10px] text-[#7A7265] block">
                            {jobsCount} งาน
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-sm text-[#ECE4D3]">
                        ฿{totalAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Neutral Progress Bar */}
                    <div className="w-full h-1.5 bg-[#0E0D0C] rounded-full overflow-hidden border border-[#4A443A]/30">
                      <div
                        style={{ width: `${percent}%` }}
                        className="h-full bg-[#9C2F2F] rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4.4 PAYMENT STATUS BREAKDOWN */}
          <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 shadow-lg">
            <div className="flex justify-between items-center border-b border-[#4A443A]/40 pb-3">
              <h3 className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                PAYMENT STATUS • สถานะการชำระ
              </h3>
              <CreditCard size={14} className="text-[#7A7265]" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-[#0E0D0C] rounded-[6px] border border-[#4A443A]/40 flex justify-between items-center">
                <div>
                  <span className="text-[#ECE4D3] font-medium block">
                    ● มัดจำแล้ว ({paymentStatusBreakdown.depositPaidCount} งาน)
                  </span>
                  <span className="text-[10px] text-[#7A7265]">รับเงินมัดจำแล้ว</span>
                </div>
                <strong className="font-mono text-green-400 text-sm">
                  ฿{paymentStatusBreakdown.depositPaidTotal.toLocaleString()}
                </strong>
              </div>

              <div className="p-3 bg-[#0E0D0C] rounded-[6px] border border-[#4A443A]/40 flex justify-between items-center">
                <div>
                  <span className="text-[#ECE4D3] font-medium block">
                    ● รอมัดจำ ({paymentStatusBreakdown.waitingDepositCount} งาน)
                  </span>
                  <span className="text-[10px] text-[#7A7265]">รอแจ้งหรือตรวจสลิป</span>
                </div>
                <strong className="font-mono text-amber-400 text-sm">
                  ฿{paymentStatusBreakdown.waitingDepositTotal.toLocaleString()}
                </strong>
              </div>

              <div className="p-3 bg-[#0E0D0C] rounded-[6px] border border-[#4A443A]/40 flex justify-between items-center">
                <div>
                  <span className="text-[#ECE4D3] font-medium block">
                    ● ยังไม่ชำระ ({paymentStatusBreakdown.unpaidPendingCount} งาน)
                  </span>
                  <span className="text-[10px] text-[#7A7265]">รอการยืนยันคิว</span>
                </div>
                <strong className="font-mono text-[#9C2F2F] text-sm">
                  ฿{paymentStatusBreakdown.unpaidPendingTotal.toLocaleString()}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. REVENUE DETAIL DRAWER (Desktop Side Drawer ~500px / Mobile Full Sheet) */}
      {selectedBookingRevenue && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedBookingRevenue(null)}
          />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <DollarSign size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    REVENUE DETAIL • รายละเอียดรายได้
                  </span>
                </div>
                <button
                  onClick={() => setSelectedBookingRevenue(null)}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3]">
                  รายการคิวจอง #{selectedBookingRevenue.booking.id}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-[4px] font-semibold inline-block border mt-1 ${
                    getBookingStatusBadge(selectedBookingRevenue.booking.status).badge
                  }`}
                >
                  ● {getBookingStatusBadge(selectedBookingRevenue.booking.status).label}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs overflow-y-auto">
              {/* Financial Breakdown Card */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  สรุปตัวเลขทางการเงิน (Financial Breakdown):
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">ราคางาน:</span>
                    <strong className="text-sm font-mono text-[#ECE4D3]">
                      ฿{selectedBookingRevenue.booking.price?.toLocaleString()}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">มัดจำแล้ว:</span>
                    <strong className="text-sm font-mono text-green-400">
                      {selectedBookingRevenue.booking.paymentStatus === 'DEPOSIT_PAID'
                        ? `฿${selectedBookingRevenue.booking.deposit?.toLocaleString()}`
                        : '-'}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">คงเหลือชำระ:</span>
                    <strong className="text-sm font-mono text-[#9C2F2F]">
                      ฿{(
                        (selectedBookingRevenue.booking.price || 0) -
                        (selectedBookingRevenue.booking.paymentStatus === 'DEPOSIT_PAID'
                          ? selectedBookingRevenue.booking.deposit || 0
                          : 0)
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Booking & Work Info */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  รายละเอียดงานและลูกค้า:
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ลูกค้า:</span>
                    <strong className="text-[#ECE4D3]">
                      {selectedBookingRevenue.booking.customerName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ช่างสัก:</span>
                    <strong className="text-[#ECE4D3]">
                      {selectedBookingRevenue.booking.artistName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ลายสัก / ผลงาน:</span>
                    <span className="text-[#ECE4D3]">
                      {selectedBookingRevenue.booking.artworkTitle || 'Custom Tattoo'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">วันและเวลา:</span>
                    <span className="font-mono text-[#ECE4D3]">
                      {formatThaiDate(selectedBookingRevenue.booking.date)}{' '}
                      {selectedBookingRevenue.booking.startTime} ({selectedBookingRevenue.booking.duration}h)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedBookingRevenue(null)}
                className="w-full min-h-[44px] bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
