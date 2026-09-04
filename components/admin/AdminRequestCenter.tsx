'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { Booking, BookingPayment } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import {
  Search,
  Filter,
  User,
  Calendar,
  Clock,
  MapPin,
  Maximize2,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock3,
  Sparkles,
  ChevronDown,
  Check,
  FileText,
  BadgeDollarSign,
  AlertCircle,
  X,
  ShieldCheck,
  ChevronRight,
  Eye,
  ArrowUpDown,
} from 'lucide-react';

export default function AdminRequestCenter() {
  const {
    bookings,
    estimateRequests,
    bookingPayments,
    artists,
    updateBookingStatus,
    updateEstimateStatus,
    verifyDepositPayment,
    rejectDepositPayment,
  } = useApp();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'bookings' | 'estimates' | 'deposits'>('bookings');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Custom Dropdowns
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Active Drawers State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateRequest | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<{
    payment: BookingPayment;
    booking?: Booking;
  } | null>(null);

  // Reject Confirmation State inside Booking Drawer
  const [isRejectingBooking, setIsRejectingBooking] = useState(false);
  const [bookingRejectReason, setBookingRejectReason] = useState('');

  // Reject Confirmation State inside Deposit Drawer
  const [isRejectingDeposit, setIsRejectingDeposit] = useState(false);
  const [depositRejectReason, setDepositRejectReason] = useState('');

  // Verify Confirmation State inside Deposit Drawer
  const [isConfirmingVerifyDeposit, setIsConfirmingVerifyDeposit] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        artistDropdownRef.current &&
        !artistDropdownRef.current.contains(event.target as Node)
      ) {
        setIsArtistDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset Drawer inner states when Drawer closes
  const closeAllDrawers = () => {
    setSelectedBooking(null);
    setSelectedEstimate(null);
    setSelectedDeposit(null);
    setIsRejectingBooking(false);
    setBookingRejectReason('');
    setIsRejectingDeposit(false);
    setDepositRejectReason('');
    setIsConfirmingVerifyDeposit(false);
  };

  // Pending Counts
  const pendingBookingsCount = useMemo(
    () => bookings.filter((b) => b.status === 'PENDING').length,
    [bookings]
  );
  const pendingEstimatesCount = useMemo(
    () => estimateRequests.filter((e) => e.status === 'PENDING').length,
    [estimateRequests]
  );
  const pendingDepositsCount = useMemo(
    () =>
      bookingPayments.filter(
        (p) => p.paymentType === 'DEPOSIT' && p.status === 'SUBMITTED'
      ).length,
    [bookingPayments]
  );
  const totalPendingAll = pendingBookingsCount + pendingEstimatesCount + pendingDepositsCount;

  // Filtered Booking Requests
  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          b.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.artworkTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.customerEmail?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' || b.artistId === selectedArtistFilter;

        const matchesStatus =
          selectedStatusFilter === 'ALL' || b.status === selectedStatusFilter;

        return matchesSearch && matchesArtist && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') return b.date.localeCompare(a.date);
        return a.date.localeCompare(b.date);
      });
  }, [bookings, searchQuery, selectedArtistFilter, selectedStatusFilter, sortOrder]);

  // Filtered Estimate Requests
  const filteredEstimates = useMemo(() => {
    return estimateRequests
      .filter((e) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          e.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.customerEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.style?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.description?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' || e.artistId === selectedArtistFilter;

        const matchesStatus =
          selectedStatusFilter === 'ALL' || e.status === selectedStatusFilter;

        return matchesSearch && matchesArtist && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') return b.submittedDate.localeCompare(a.submittedDate);
        return a.submittedDate.localeCompare(b.submittedDate);
      });
  }, [estimateRequests, searchQuery, selectedArtistFilter, selectedStatusFilter, sortOrder]);

  // Filtered Deposit Payments
  const filteredDeposits = useMemo(() => {
    return bookingPayments
      .filter((p) => p.paymentType === 'DEPOSIT')
      .map((payment) => ({
        payment,
        booking: bookings.find((b) => b.id === payment.bookingId),
      }))
      .filter(({ payment, booking }) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          booking?.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          booking?.artworkTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          payment.paymentReference?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' || booking?.artistId === selectedArtistFilter;

        const matchesStatus =
          selectedStatusFilter === 'ALL' || payment.status === selectedStatusFilter;

        return matchesSearch && matchesArtist && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest') return b.payment.createdAt.localeCompare(a.payment.createdAt);
        return a.payment.createdAt.localeCompare(b.payment.createdAt);
      });
  }, [bookingPayments, bookings, searchQuery, selectedArtistFilter, selectedStatusFilter, sortOrder]);

  // Helper date formatter
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${
      parseInt(parts[0], 10) + 543
    }`;
  };

  // Helper time formatter
  const formatThaiDateTime = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  // Status visual helpers
  const getBookingStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'PENDING':
        return {
          label: 'รอตรวจสอบ',
          dot: 'bg-[#9C2F2F] animate-pulse',
          badge: 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F]',
        };
      case 'WAITING_DEPOSIT':
        return {
          label: 'รอมัดจำ',
          dot: 'bg-amber-400',
          badge: 'bg-amber-950/60 border-amber-800 text-amber-300',
        };
      case 'CONFIRMED':
        return {
          label: 'ยืนยันคิวแล้ว',
          dot: 'bg-green-400',
          badge: 'bg-green-950/60 border-green-800 text-green-300',
        };
      case 'IN_PROGRESS':
        return {
          label: 'กำลังสัก',
          dot: 'bg-[#9C2F2F]',
          badge: 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F]',
        };
      case 'COMPLETED':
        return {
          label: 'เสร็จสิ้น',
          dot: 'bg-zinc-500',
          badge: 'bg-zinc-900 border-[#4A443A] text-[#7A7265]',
        };
      case 'REJECTED':
      case 'CANCELLED':
        return {
          label: 'ยกเลิก / ปฏิเสธ',
          dot: 'bg-red-500',
          badge: 'bg-red-950/60 border-red-800 text-red-400',
        };
      default:
        return {
          label: status,
          dot: 'bg-[#7A7265]',
          badge: 'bg-[#171512] border-[#4A443A] text-[#A89F91]',
        };
    }
  };

  const getEstimateStatusBadge = (status: EstimateRequest['status']) => {
    switch (status) {
      case 'PENDING':
        return {
          label: 'รอเสนอราคา',
          dot: 'bg-[#9C2F2F] animate-pulse',
          badge: 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F]',
        };
      case 'QUOTED':
        return {
          label: 'เสนอราคาแล้ว',
          dot: 'bg-amber-400',
          badge: 'bg-amber-950/60 border-amber-800 text-amber-300',
        };
      case 'ACCEPTED':
        return {
          label: 'ลูกค้าตอบรับแล้ว',
          dot: 'bg-green-400',
          badge: 'bg-green-950/60 border-green-800 text-green-300',
        };
      case 'REJECTED':
        return {
          label: 'ปฏิเสธคำขอ',
          dot: 'bg-red-500',
          badge: 'bg-red-950/60 border-red-800 text-red-400',
        };
      default:
        return {
          label: status,
          dot: 'bg-[#7A7265]',
          badge: 'bg-[#171512] border-[#4A443A] text-[#A89F91]',
        };
    }
  };

  const getDepositStatusBadge = (status: BookingPayment['status']) => {
    switch (status) {
      case 'SUBMITTED':
        return {
          label: 'แจ้งชำระแล้ว (รอตรวจ)',
          dot: 'bg-[#9C2F2F] animate-pulse',
          badge: 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F]',
        };
      case 'VERIFIED':
        return {
          label: 'ตรวจสอบแล้ว',
          dot: 'bg-green-400',
          badge: 'bg-green-950/60 border-green-800 text-green-300',
        };
      case 'REJECTED':
        return {
          label: 'สลิปไม่ถูกต้อง',
          dot: 'bg-red-500',
          badge: 'bg-red-950/60 border-red-800 text-red-400',
        };
      default:
        return {
          label: status,
          dot: 'bg-[#7A7265]',
          badge: 'bg-[#171512] border-[#4A443A] text-[#A89F91]',
        };
    }
  };

  return (
    <div className="space-y-6 font-prompt text-[#ECE4D3] pb-24 md:pb-12">
      {/* 1. TOP PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#4A443A] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Sparkles size={12} className="text-[#9C2F2F]" />
            <span>REQUEST CENTER • ศูนย์จัดการคำขอ</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            คำขอและงานที่ต้องตรวจสอบ
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5 font-light">
            จัดการคำขอจอง การประเมินราคา และการตรวจสอบมัดจำ
          </p>
        </div>

        {/* Right Date & Pending Summary Counter */}
        <div className="flex items-center space-x-3">
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[#7A7265] uppercase tracking-wider">
              สถานะคำขอปัจจุบัน:
            </span>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#9C2F2F] animate-pulse" />
              <span className="text-xs font-semibold text-[#ECE4D3] font-mono">
                {totalPendingAll} รายการรอดำเนินการ
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. REQUEST SUMMARY COUNTERS (3 Compact Tabs / Counters) */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Counter 1: Bookings */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('bookings');
            setSelectedStatusFilter('ALL');
          }}
          className={`p-3.5 sm:p-4 rounded-[8px] border text-left transition-all relative overflow-hidden ${
            activeTab === 'bookings'
              ? 'bg-[#171512] border-[#9C2F2F] ring-1 ring-[#9C2F2F]/40 shadow-lg'
              : 'bg-[#171512]/60 border-[#4A443A] hover:border-[#7A7265]'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs sm:text-sm font-semibold text-[#ECE4D3] block">
              คำขอจองคิว
            </span>
            {pendingBookingsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#9C2F2F] animate-pulse" />
            )}
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-heading font-normal text-[#ECE4D3]">
              {bookings.length}
            </span>
            {pendingBookingsCount > 0 && (
              <span className="text-[10px] sm:text-xs font-semibold text-[#9C2F2F]">
                ({pendingBookingsCount} รอตรวจ)
              </span>
            )}
          </div>
          {activeTab === 'bookings' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
          )}
        </button>

        {/* Counter 2: Estimates */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('estimates');
            setSelectedStatusFilter('ALL');
          }}
          className={`p-3.5 sm:p-4 rounded-[8px] border text-left transition-all relative overflow-hidden ${
            activeTab === 'estimates'
              ? 'bg-[#171512] border-[#9C2F2F] ring-1 ring-[#9C2F2F]/40 shadow-lg'
              : 'bg-[#171512]/60 border-[#4A443A] hover:border-[#7A7265]'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs sm:text-sm font-semibold text-[#ECE4D3] block">
              ประเมินราคา
            </span>
            {pendingEstimatesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#9C2F2F] animate-pulse" />
            )}
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-heading font-normal text-[#ECE4D3]">
              {estimateRequests.length}
            </span>
            {pendingEstimatesCount > 0 && (
              <span className="text-[10px] sm:text-xs font-semibold text-[#9C2F2F]">
                ({pendingEstimatesCount} รอเสนอ)
              </span>
            )}
          </div>
          {activeTab === 'estimates' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
          )}
        </button>

        {/* Counter 3: Deposits */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('deposits');
            setSelectedStatusFilter('ALL');
          }}
          className={`p-3.5 sm:p-4 rounded-[8px] border text-left transition-all relative overflow-hidden ${
            activeTab === 'deposits'
              ? 'bg-[#171512] border-[#9C2F2F] ring-1 ring-[#9C2F2F]/40 shadow-lg'
              : 'bg-[#171512]/60 border-[#4A443A] hover:border-[#7A7265]'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs sm:text-sm font-semibold text-[#ECE4D3] block">
              ตรวจมัดจำ
            </span>
            {pendingDepositsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#9C2F2F] animate-pulse" />
            )}
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-heading font-normal text-[#ECE4D3]">
              {bookingPayments.filter((p) => p.paymentType === 'DEPOSIT').length}
            </span>
            {pendingDepositsCount > 0 && (
              <span className="text-[10px] sm:text-xs font-semibold text-[#9C2F2F]">
                ({pendingDepositsCount} รอตรวจ)
              </span>
            )}
          </div>
          {activeTab === 'deposits' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
          )}
        </button>
      </div>

      {/* 3. MAIN NAVIGATION TABS */}
      <div className="flex border-b border-[#4A443A] space-x-6 sm:space-x-8 text-sm">
        <button
          type="button"
          onClick={() => {
            setActiveTab('bookings');
            setSelectedStatusFilter('ALL');
          }}
          className={`pb-3 font-medium flex items-center space-x-2 relative transition-colors ${
            activeTab === 'bookings'
              ? 'text-[#ECE4D3] font-semibold'
              : 'text-[#7A7265] hover:text-[#A89F91]'
          }`}
        >
          <span>คำขอจองคิว</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'bookings'
                ? 'bg-[#9C2F2F] text-[#ECE4D3]'
                : 'bg-[#171512] text-[#7A7265] border border-[#4A443A]'
            }`}
          >
            {bookings.length}
          </span>
          {activeTab === 'bookings' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F] rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('estimates');
            setSelectedStatusFilter('ALL');
          }}
          className={`pb-3 font-medium flex items-center space-x-2 relative transition-colors ${
            activeTab === 'estimates'
              ? 'text-[#ECE4D3] font-semibold'
              : 'text-[#7A7265] hover:text-[#A89F91]'
          }`}
        >
          <span>ขอประเมินราคา</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'estimates'
                ? 'bg-[#9C2F2F] text-[#ECE4D3]'
                : 'bg-[#171512] text-[#7A7265] border border-[#4A443A]'
            }`}
          >
            {estimateRequests.length}
          </span>
          {activeTab === 'estimates' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F] rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('deposits');
            setSelectedStatusFilter('ALL');
          }}
          className={`pb-3 font-medium flex items-center space-x-2 relative transition-colors ${
            activeTab === 'deposits'
              ? 'text-[#ECE4D3] font-semibold'
              : 'text-[#7A7265] hover:text-[#A89F91]'
          }`}
        >
          <span>ตรวจมัดจำ</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'deposits'
                ? 'bg-[#9C2F2F] text-[#ECE4D3]'
                : 'bg-[#171512] text-[#7A7265] border border-[#4A443A]'
            }`}
          >
            {bookingPayments.filter((p) => p.paymentType === 'DEPOSIT').length}
          </span>
          {activeTab === 'deposits' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F] rounded-full" />
          )}
        </button>
      </div>

      {/* 4. SEARCH & FILTER TOOLBAR */}
      <div className="bg-[#171512] border border-[#4A443A] p-3 rounded-[8px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        {/* Search Box */}
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
          {/* Custom Artist Filter */}
          <div ref={artistDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsArtistDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <User size={13} className="text-[#9C2F2F]" />
              <span className="truncate max-w-[110px]">
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

          {/* Sort Order Toggle */}
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
            className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-1.5 transition-colors"
            title="เรียงตามวันที่"
          >
            <ArrowUpDown size={12} className="text-[#9C2F2F]" />
            <span>{sortOrder === 'newest' ? 'ล่าสุด' : 'เก่าสุด'}</span>
          </button>
        </div>
      </div>

      {/* 5. TAB 1: BOOKING REQUESTS VIEW */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">ผลงาน / งานสัก</th>
                  <th className="py-3 px-4">ช่างสัก</th>
                  <th className="py-3 px-4">วันนัดหมาย</th>
                  <th className="py-3 px-4">เวลา</th>
                  <th className="py-3 px-4">ระยะเวลา</th>
                  <th className="py-3 px-4">ราคาประเมิน</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-[#7A7265]">
                      ไม่มีคำขอจองคิวที่รอตรวจสอบ
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((b) => {
                    const statusInfo = getBookingStatusBadge(b.status);
                    const isPending = b.status === 'PENDING';

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelectedBooking(b)}
                        className="h-[68px] hover:bg-[#1C1A16] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <strong className="text-[#ECE4D3] font-medium block">
                            {b.customerName}
                          </strong>
                          <span className="text-[10px] text-[#7A7265] font-mono block">
                            {b.customerEmail}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[#ECE4D3] font-medium block truncate max-w-[160px]">
                            {b.artworkTitle || 'Custom Tattoo'}
                          </span>
                          <span className="text-[10px] text-[#7A7265] uppercase font-mono">
                            {b.bookingType === 'flash' ? 'Flash' : 'Custom'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[#ECE4D3] font-medium block">
                            {b.artistName}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#ECE4D3]">
                          {formatThaiDate(b.date)}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#ECE4D3]">
                          {b.startTime}–{b.endTime}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#A89F91]">
                          {b.duration} ชม.
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[#ECE4D3]">
                          ฿{b.price?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold border inline-flex items-center space-x-1.5 ${statusInfo.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking(b);
                            }}
                            className={`px-3 py-1.5 rounded-[4px] text-xs font-semibold transition-colors ${
                              isPending
                                ? 'bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3]'
                                : 'bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] text-[#ECE4D3]'
                            }`}
                          >
                            ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (Visible on mobile <= md) */}
          <div className="md:hidden space-y-3">
            {filteredBookings.length === 0 ? (
              <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
                ไม่มีคำขอจองคิวที่รอตรวจสอบ
              </div>
            ) : (
              filteredBookings.map((b) => {
                const statusInfo = getBookingStatusBadge(b.status);

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-semibold text-[#ECE4D3]">
                          {b.customerName}
                        </h4>
                        <span className="text-xs text-[#A89F91] block mt-0.5">
                          {b.artworkTitle || 'Custom Tattoo'}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${statusInfo.badge}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#4A443A]/40 pt-2 text-[#A89F91]">
                      <div>
                        <span className="text-[10px] text-[#7A7265] block">ช่างสัก:</span>
                        <strong className="text-[#ECE4D3]">{b.artistName}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7A7265] block">วันและเวลา:</span>
                        <span className="font-mono text-[#ECE4D3]">
                          {formatThaiDate(b.date)} {b.startTime} ({b.duration}h)
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-[#4A443A]/40">
                      <span className="text-sm font-mono font-bold text-[#ECE4D3]">
                        ฿{b.price?.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(b);
                        }}
                        className="px-3 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] text-xs font-semibold rounded-[4px]"
                      >
                        ดูรายละเอียด
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 6. TAB 2: ESTIMATE REQUESTS VIEW */}
      {activeTab === 'estimates' && (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
                  <th className="py-3 px-4">รูปอ้างอิง</th>
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">ช่างสัก</th>
                  <th className="py-3 px-4">สไตล์</th>
                  <th className="py-3 px-4">ขนาด (cm)</th>
                  <th className="py-3 px-4">ตำแหน่ง</th>
                  <th className="py-3 px-4">วันที่ส่งคำขอ</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredEstimates.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-[#7A7265]">
                      ไม่มีคำขอประเมินราคาใหม่
                    </td>
                  </tr>
                ) : (
                  filteredEstimates.map((e) => {
                    const statusInfo = getEstimateStatusBadge(e.status);

                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedEstimate(e)}
                        className="h-[68px] hover:bg-[#1C1A16] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          {e.referenceImage ? (
                            <img
                              src={e.referenceImage}
                              alt=""
                              className="w-11 h-11 object-cover rounded-[4px] border border-[#4A443A] bg-[#0E0D0C]"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-[4px] bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#7A7265]">
                              <FileText size={16} />
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <strong className="text-[#ECE4D3] font-medium block">
                            {e.customerName}
                          </strong>
                          <span className="text-[10px] text-[#7A7265] font-mono block">
                            {e.customerEmail}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                          {e.artistName || 'ช่างสักประจำร้าน'}
                        </td>
                        <td className="py-3 px-4 text-[#A89F91] uppercase">
                          {e.style || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#ECE4D3]">
                          {e.width} × {e.height}
                        </td>
                        <td className="py-3 px-4 text-[#A89F91]">
                          {e.placement || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#7A7265]">
                          {formatThaiDateTime(e.submittedDate)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold border inline-flex items-center space-x-1.5 ${statusInfo.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedEstimate(e);
                            }}
                            className="px-3 py-1.5 bg-[#0E0D0C] hover:bg-[#9C2F2F] border border-[#4A443A] hover:border-[#9C2F2F] text-[#ECE4D3] rounded-[4px] text-xs font-semibold transition-colors"
                          >
                            ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Estimate Cards */}
          <div className="md:hidden space-y-3">
            {filteredEstimates.length === 0 ? (
              <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
                ไม่มีคำขอประเมินราคาใหม่
              </div>
            ) : (
              filteredEstimates.map((e) => {
                const statusInfo = getEstimateStatusBadge(e.status);

                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedEstimate(e)}
                    className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
                  >
                    <div className="flex space-x-3 items-center">
                      {e.referenceImage ? (
                        <img
                          src={e.referenceImage}
                          alt=""
                          className="w-14 h-14 object-cover rounded-[6px] border border-[#4A443A] bg-[#0E0D0C] shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-[6px] bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#7A7265] shrink-0">
                          <FileText size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-[#ECE4D3] truncate">
                          {e.customerName}
                        </h4>
                        <p className="text-xs text-[#A89F91] truncate">
                          สไตล์ {e.style} • ขนาด {e.width}×{e.height} cm
                        </p>
                        <span
                          className={`text-[9px] px-2 py-0.2 rounded font-semibold border inline-block mt-1 ${statusInfo.badge}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-[#4A443A]/40 text-xs">
                      <span className="text-[10px] text-[#7A7265]">
                        ตำแหน่ง: {e.placement}
                      </span>
                      <button
                        type="button"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setSelectedEstimate(e);
                        }}
                        className="px-3 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] text-xs font-semibold rounded-[4px]"
                      >
                        ดูรายละเอียด
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 7. TAB 3: DEPOSIT VERIFICATION VIEW */}
      {activeTab === 'deposits' && (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">งานที่จอง</th>
                  <th className="py-3 px-4">ช่างสัก</th>
                  <th className="py-3 px-4">ยอดมัดจำ</th>
                  <th className="py-3 px-4">วันที่แจ้งชำระ</th>
                  <th className="py-3 px-4">รหัสอ้างอิง / Reference</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#7A7265]">
                      ไม่มีรายการมัดจำที่รอตรวจสอบ
                    </td>
                  </tr>
                ) : (
                  filteredDeposits.map(({ payment, booking }) => {
                    const statusInfo = getDepositStatusBadge(payment.status);
                    const isSubmitted = payment.status === 'SUBMITTED';

                    return (
                      <tr
                        key={payment.id}
                        onClick={() => setSelectedDeposit({ payment, booking })}
                        className="h-[68px] hover:bg-[#1C1A16] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <strong className="text-[#ECE4D3] font-medium block">
                            {booking?.customerName || 'ลูกค้า'}
                          </strong>
                          <span className="text-[10px] text-[#7A7265] font-mono block">
                            {booking?.customerEmail || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[#ECE4D3] font-medium block truncate max-w-[160px]">
                            {booking?.artworkTitle || 'Tattoo Work'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                          {booking?.artistName || 'ช่างสักประจำร้าน'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-green-400 text-sm">
                          ฿{payment.amount?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#7A7265]">
                          {formatThaiDateTime(payment.submittedAt || payment.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#A89F91]">
                          {payment.paymentReference || 'REF-DIRECT'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-[4px] font-semibold border inline-flex items-center space-x-1.5 ${statusInfo.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                            <span>{statusInfo.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setSelectedDeposit({ payment, booking });
                            }}
                            className={`px-3 py-1.5 rounded-[4px] text-xs font-semibold transition-colors ${
                              isSubmitted
                                ? 'bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3]'
                                : 'bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] text-[#ECE4D3]'
                            }`}
                          >
                            {isSubmitted ? 'ตรวจสอบ' : 'ดูข้อมูล'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Deposit Cards */}
          <div className="md:hidden space-y-3">
            {filteredDeposits.length === 0 ? (
              <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
                ไม่มีรายการมัดจำที่รอตรวจสอบ
              </div>
            ) : (
              filteredDeposits.map(({ payment, booking }) => {
                const statusInfo = getDepositStatusBadge(payment.status);

                return (
                  <div
                    key={payment.id}
                    onClick={() => setSelectedDeposit({ payment, booking })}
                    className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-semibold text-[#ECE4D3]">
                          {booking?.customerName || 'ลูกค้า'}
                        </h4>
                        <span className="text-xs text-[#A89F91] block mt-0.5">
                          {booking?.artworkTitle || 'Tattoo Work'}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${statusInfo.badge}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#4A443A]/40 pt-2 text-[#A89F91]">
                      <div>
                        <span className="text-[10px] text-[#7A7265] block">ยอดมัดจำ:</span>
                        <strong className="text-green-400 font-mono text-sm">
                          ฿{payment.amount?.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#7A7265] block">เวลาที่แจ้ง:</span>
                        <span className="font-mono text-[#ECE4D3]">
                          {formatThaiDateTime(payment.submittedAt || payment.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-[#4A443A]/40">
                      <span className="text-[10px] text-[#7A7265] font-mono">
                        Ref: {payment.paymentReference || 'REF-DIRECT'}
                      </span>
                      <button
                        type="button"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setSelectedDeposit({ payment, booking });
                        }}
                        className="px-3 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] text-xs font-semibold rounded-[4px]"
                      >
                        ตรวจสอบ
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. DRAWER 1: BOOKING REQUEST DETAIL DRAWER */}
      {/* ========================================================================= */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={closeAllDrawers} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    BOOKING REQUEST • คำขอจองคิว
                  </span>
                </div>
                <button
                  onClick={closeAllDrawers}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center space-x-4">
                {selectedBooking.artworkImage ? (
                  <img
                    src={selectedBooking.artworkImage}
                    alt=""
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-[6px] border border-[#4A443A] bg-[#0E0D0C] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[6px] bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F] shrink-0">
                    <FileText size={24} />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-mono tracking-wider bg-[#0E0D0C] text-[#A89F91] px-2 py-0.5 rounded border border-[#4A443A] inline-block mb-1">
                    {selectedBooking.bookingType === 'flash' ? 'Flash Design' : 'Custom Design'}
                  </span>
                  <h2 className="text-lg sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                    {selectedBooking.artworkTitle || 'Tattoo Appointment'}
                  </h2>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-[4px] font-semibold inline-block border mt-1 ${
                      getBookingStatusBadge(selectedBooking.status).badge
                    }`}
                  >
                    ● {getBookingStatusBadge(selectedBooking.status).label}
                  </span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs">
              {/* Customer */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  ข้อมูลลูกค้า (Customer):
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">ชื่อลูกค้า:</span>
                    <strong className="text-[#ECE4D3]">{selectedBooking.customerName}</strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">อีเมล:</span>
                    <span className="text-[#A89F91] font-mono">{selectedBooking.customerEmail}</span>
                  </div>
                </div>
              </div>

              {/* Artist & Schedule */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  ช่างสักและกำหนดการ (Artist & Schedule):
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ช่างสัก:</span>
                    <strong className="text-[#ECE4D3]">{selectedBooking.artistName}</strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">วันและเวลา:</span>
                    <span className="text-[#ECE4D3] font-mono">
                      {formatThaiDate(selectedBooking.date)} {selectedBooking.startTime}–{selectedBooking.endTime} ({selectedBooking.duration} ชม.)
                    </span>
                  </div>
                </div>
              </div>

              {/* Specs & Pricing */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  สเปกและราคา (Specs & Financials):
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ตำแหน่งร่างกาย:</span>
                    <span className="text-[#ECE4D3]">{selectedBooking.placement || 'ตามที่ตกลง'}</span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ขนาด:</span>
                    <span className="text-[#ECE4D3]">
                      {selectedBooking.width && selectedBooking.height
                        ? `${selectedBooking.width} × ${selectedBooking.height} cm`
                        : 'ประเมินหน้างาน'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#4A443A]/40">
                  <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">ราคาค่าสัก:</span>
                    <strong className="text-sm font-mono text-[#ECE4D3]">
                      ฿{selectedBooking.price?.toLocaleString()}
                    </strong>
                  </div>
                  <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">ยอดมัดจำ:</span>
                    <strong className="text-sm font-mono text-green-400">
                      ฿{selectedBooking.deposit?.toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Reject Reason Area (when clicked reject) */}
              {isRejectingBooking && (
                <div className="p-4 bg-red-950/30 border border-red-800 rounded-[6px] space-y-3 animate-fadeIn">
                  <span className="text-xs font-semibold text-red-300 block">
                    ระบุเหตุผลในการปฏิเสธคำขอ:
                  </span>
                  <textarea
                    rows={3}
                    value={bookingRejectReason}
                    onChange={(e) => setBookingRejectReason(e.target.value)}
                    placeholder="ช่วงเวลานี้ไม่ว่าง / รายละเอียดงานไม่ครบถ้วน..."
                    className="w-full p-2.5 bg-[#0E0D0C] border border-red-800/80 rounded text-xs text-[#ECE4D3] outline-none focus:ring-1 focus:ring-red-500 placeholder-[#7A7265]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateBookingStatus(
                          selectedBooking.id,
                          'REJECTED',
                          bookingRejectReason || 'ทางร้านไม่สามารถรับคิวนี้ได้'
                        );
                        closeAllDrawers();
                      }}
                      className="flex-1 min-h-[40px] bg-red-800 hover:bg-red-700 text-[#ECE4D3] rounded text-xs font-semibold"
                    >
                      ยืนยันการปฏิเสธ
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejectingBooking(false)}
                      className="px-4 min-h-[40px] bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded text-xs font-medium"
                    >
                      กลับ
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isRejectingBooking && (
              <div className="pt-4 border-t border-[#4A443A]/60 flex flex-col sm:flex-row gap-3">
                {selectedBooking.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        updateBookingStatus(selectedBooking.id, 'WAITING_DEPOSIT');
                        closeAllDrawers();
                      }}
                      className="flex-1 min-h-[44px] bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3] rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
                    >
                      <CheckCircle2 size={15} />
                      <span>อนุมัติคำขอและรอมัดจำ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejectingBooking(true)}
                      className="min-h-[44px] px-4 bg-transparent hover:bg-red-950/30 border border-red-800 text-red-400 rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      <XCircle size={15} />
                      <span>ปฏิเสธ</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={closeAllDrawers}
                  className="min-h-[44px] px-5 bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. DRAWER 2: ESTIMATE REQUEST DETAIL DRAWER */}
      {/* ========================================================================= */}
      {selectedEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={closeAllDrawers} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    PRICE ESTIMATE • ขอประเมินราคา
                  </span>
                </div>
                <button
                  onClick={closeAllDrawers}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              {selectedEstimate.referenceImage && (
                <div className="w-full h-44 rounded-[6px] overflow-hidden border border-[#4A443A] bg-[#0E0D0C]">
                  <img
                    src={selectedEstimate.referenceImage}
                    alt="Reference"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3]">
                  คำขอประเมินราคา #{selectedEstimate.id}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-[4px] font-semibold inline-block border mt-1 ${
                    getEstimateStatusBadge(selectedEstimate.status).badge
                  }`}
                >
                  ● {getEstimateStatusBadge(selectedEstimate.status).label}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs">
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  ข้อมูลลูกค้าและช่างสัก:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">ลูกค้า:</span>
                    <strong className="text-[#ECE4D3]">{selectedEstimate.customerName}</strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">ช่างสักที่ระบุ:</span>
                    <strong className="text-[#ECE4D3]">
                      {selectedEstimate.artistName || 'ช่างสักประจำร้าน'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  สเปกงานที่ขอประเมิน:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">สไตล์:</span>
                    <span className="text-[#ECE4D3] uppercase">{selectedEstimate.style}</span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ตำแหน่ง:</span>
                    <span className="text-[#ECE4D3]">{selectedEstimate.placement}</span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ขนาด:</span>
                    <span className="text-[#ECE4D3] font-mono">
                      {selectedEstimate.width} × {selectedEstimate.height} ซม.
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">วันที่สะดวก:</span>
                    <span className="text-[#ECE4D3] font-mono">
                      {selectedEstimate.preferredDate || 'ตามคิวว่างของช่าง'}
                    </span>
                  </div>
                </div>
                {selectedEstimate.description && (
                  <div className="pt-2 border-t border-[#4A443A]/30">
                    <span className="text-[#7A7265] text-[10px] block">รายละเอียดเพิ่มเติม:</span>
                    <p className="text-[#A89F91] text-xs leading-relaxed mt-0.5">
                      {selectedEstimate.description}
                    </p>
                  </div>
                )}
              </div>

              {selectedEstimate.quotedPrice && (
                <div className="bg-[#0E0D0C] border border-amber-800/60 p-4 rounded-[6px] space-y-2">
                  <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">
                    ราคาที่เสนอไปแล้ว (Quoted Details):
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[#7A7265] block text-[10px]">ราคาประเมิน:</span>
                      <strong className="text-sm font-mono text-[#ECE4D3]">
                        ฿{selectedEstimate.quotedPrice.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#7A7265] block text-[10px]">ยอดมัดจำ:</span>
                      <strong className="text-sm font-mono text-green-400">
                        ฿{selectedEstimate.quotedDeposit?.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                  {selectedEstimate.quoteNote && (
                    <div className="pt-2 border-t border-[#4A443A]/30 text-xs text-[#A89F91]">
                      <span>โน้ตจากช่าง: {selectedEstimate.quoteNote}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
              <button
                type="button"
                onClick={closeAllDrawers}
                className="w-full min-h-[44px] bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. DRAWER 3: DEPOSIT VERIFICATION DETAIL DRAWER */}
      {/* ========================================================================= */}
      {selectedDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={closeAllDrawers} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    DEPOSIT VERIFICATION • ตรวจสอบมัดจำ
                  </span>
                </div>
                <button
                  onClick={closeAllDrawers}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3]">
                  รายการชำระมัดจำ #{selectedDeposit.payment.id}
                </h2>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-[4px] font-semibold inline-block border mt-1 ${
                    getDepositStatusBadge(selectedDeposit.payment.status).badge
                  }`}
                >
                  ● {getDepositStatusBadge(selectedDeposit.payment.status).label}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs">
              {/* Financial Breakdown */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  สรุปยอดเงินและส่วนต่าง (Financial Breakdown):
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">ราคารวม:</span>
                    <strong className="text-sm font-mono text-[#ECE4D3]">
                      ฿{selectedDeposit.booking?.price?.toLocaleString() || '0'}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">ยอดมัดจำ:</span>
                    <strong className="text-sm font-mono text-green-400">
                      ฿{selectedDeposit.payment.amount?.toLocaleString() || '0'}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#171512] rounded border border-[#4A443A]/40">
                    <span className="text-[10px] text-[#7A7265] block">คงเหลือชำระ:</span>
                    <strong className="text-sm font-mono text-[#A89F91]">
                      ฿{(
                        (selectedDeposit.booking?.price || 0) -
                        (selectedDeposit.payment.amount || 0)
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Customer & Booking reference */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  ข้อมูลคิวและลูกค้า:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">ลูกค้า:</span>
                    <strong className="text-[#ECE4D3]">
                      {selectedDeposit.booking?.customerName || 'ลูกค้า'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">ช่างสัก:</span>
                    <strong className="text-[#ECE4D3]">
                      {selectedDeposit.booking?.artistName || 'ช่างสัก'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">รหัสอ้างอิง:</span>
                    <span className="font-mono text-[#ECE4D3]">
                      {selectedDeposit.payment.paymentReference || 'REF-DIRECT'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] block text-[10px]">วันที่แจ้ง:</span>
                    <span className="font-mono text-[#ECE4D3]">
                      {formatThaiDateTime(
                        selectedDeposit.payment.submittedAt || selectedDeposit.payment.createdAt
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Verification Confirmation Area */}
              {isConfirmingVerifyDeposit && (
                <div className="p-4 bg-green-950/30 border border-green-800 rounded-[6px] space-y-3 animate-fadeIn">
                  <span className="text-xs font-semibold text-green-300 block">
                    ยืนยันว่าตรวจสอบยอดเงินมัดจำ ฿
                    {selectedDeposit.payment.amount?.toLocaleString()} เข้าบัญชีเรียบร้อยแล้ว?
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        verifyDepositPayment(selectedDeposit.payment.id);
                        closeAllDrawers();
                      }}
                      className="flex-1 min-h-[40px] bg-green-700 hover:bg-green-600 text-[#ECE4D3] rounded text-xs font-semibold"
                    >
                      ยืนยันมัดจำถูกต้อง
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingVerifyDeposit(false)}
                      className="px-4 min-h-[40px] bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded text-xs font-medium"
                    >
                      กลับ
                    </button>
                  </div>
                </div>
              )}

              {/* Reject Deposit Area */}
              {isRejectingDeposit && (
                <div className="p-4 bg-red-950/30 border border-red-800 rounded-[6px] space-y-3 animate-fadeIn">
                  <span className="text-xs font-semibold text-red-300 block">
                    ระบุเหตุผลในการปฏิเสธสลิป / การชำระเงิน:
                  </span>
                  <textarea
                    rows={3}
                    value={depositRejectReason}
                    onChange={(e) => setDepositRejectReason(e.target.value)}
                    placeholder="ยอดเงินไม่ถูกต้อง / สลิปซ้ำ / ไม่พบยอดเงินเข้าบัญชี..."
                    className="w-full p-2.5 bg-[#0E0D0C] border border-red-800/80 rounded text-xs text-[#ECE4D3] outline-none focus:ring-1 focus:ring-red-500 placeholder-[#7A7265]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        rejectDepositPayment(
                          selectedDeposit.payment.id,
                          depositRejectReason || 'หลักฐานการชำระเงินไม่ถูกต้อง'
                        );
                        closeAllDrawers();
                      }}
                      className="flex-1 min-h-[40px] bg-red-800 hover:bg-red-700 text-[#ECE4D3] rounded text-xs font-semibold"
                    >
                      ยืนยันการปฏิเสธ
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejectingDeposit(false)}
                      className="px-4 min-h-[40px] bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded text-xs font-medium"
                    >
                      กลับ
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isConfirmingVerifyDeposit && !isRejectingDeposit && (
              <div className="pt-4 border-t border-[#4A443A]/60 flex flex-col sm:flex-row gap-3">
                {selectedDeposit.payment.status === 'SUBMITTED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingVerifyDeposit(true)}
                      className="flex-1 min-h-[44px] bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3] rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
                    >
                      <CheckCircle2 size={15} />
                      <span>ยืนยันมัดจำ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejectingDeposit(true)}
                      className="min-h-[44px] px-4 bg-transparent hover:bg-red-950/30 border border-red-800 text-red-400 rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      <XCircle size={15} />
                      <span>ปฏิเสธสลิป</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={closeAllDrawers}
                  className="min-h-[44px] px-5 bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
