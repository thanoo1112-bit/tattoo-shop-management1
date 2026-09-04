'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import PaymentSummaryCards from './PaymentSummaryCards';
import PaymentBookingList from './PaymentBookingList';
import PaymentDetailPanel from './PaymentDetailPanel';
import RecordPaymentForm from './RecordPaymentForm';
import VoidPaymentDialog from './VoidPaymentDialog';
import {
  PaymentBookingDetail,
  BookingPaymentSummaryRow,
  BookingPaymentRecord,
  FinancialStatusFilter,
  BookingStatusFilter,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminPaymentPage() {
  const [bookings, setBookings] = useState<PaymentBookingDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [financialFilter, setFinancialFilter] = useState<FinancialStatusFilter>('ALL');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<BookingStatusFilter>('ALL');

  // Modals & Panels State
  const [selectedBooking, setSelectedBooking] = useState<PaymentBookingDetail | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [voidTargetPayment, setVoidTargetPayment] = useState<BookingPaymentRecord | null>(null);

  // Toast Feedback State (Section 20: No browser alert)
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Main Live Data Fetcher
  const fetchLivePaymentData = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch live booking_payment_summary
      const { data: summaries, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('*');

      if (sumErr) throw sumErr;

      // 2. Fetch live bookings with artists, estimate_requests, and sessions
      const { data: bList, error: bErr } = await supabase
        .from('bookings')
        .select(`
          *,
          artists (id, name, nickname),
          estimate_requests (id, placement, description, customer_user_id),
          booking_sessions (id, session_number, start_at, end_at, status)
        `)
        .order('created_at', { ascending: false });

      if (bErr) throw bErr;

      // 3. Fetch customers for name and contact info
      const { data: custList } = await supabase
        .from('customers')
        .select('id, user_id, display_name, phone, email');

      // 4. Combine into complete PaymentBookingDetail
      const combined: PaymentBookingDetail[] = (bList || []).map((b: any) => {
        const sumRow = (summaries || []).find((s: any) => s.booking_id === b.id) || {
          booking_id: b.id,
          estimate_request_id: b.estimate_request_id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          quoted_price: 0,
          deposit_required: 0,
          paid_total: 0,
          remaining_balance: 0,
          deposit_paid: false,
          is_fully_paid: false,
        };

        const cust = (custList || []).find((c: any) => c.user_id === b.customer_user_id);
        const artist = b.artists;

        return {
          id: b.id,
          estimate_request_id: b.estimate_request_id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          requested_date: b.requested_date,
          status: b.status,
          approved_at: b.approved_at,
          confirmed_at: b.confirmed_at,
          created_at: b.created_at,
          customer_name: cust?.display_name || 'ลูกค้า 157 Tattoo',
          customer_phone: cust?.phone || '',
          customer_email: cust?.email || '',
          artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
          artist_nickname: artist?.nickname || null,
          placement: b.estimate_requests?.placement || undefined,
          summary: {
            booking_id: sumRow.booking_id,
            estimate_request_id: sumRow.estimate_request_id,
            customer_user_id: sumRow.customer_user_id,
            artist_id: sumRow.artist_id,
            quoted_price: Number(sumRow.quoted_price || 0),
            deposit_required: Number(sumRow.deposit_required || 0),
            paid_total: Number(sumRow.paid_total || 0),
            remaining_balance: Number(sumRow.remaining_balance || 0),
            deposit_paid: Boolean(sumRow.deposit_paid),
            is_fully_paid: Boolean(sumRow.is_fully_paid),
          },
          sessions: (b.booking_sessions || []).map((s: any) => ({
            id: s.id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
          })),
        };
      });

      setBookings(combined);

      // If a booking is currently selected, update its reference
      if (selectedBooking) {
        const updated = combined.find((item) => item.id === selectedBooking.id);
        if (updated) setSelectedBooking(updated);
      }
    } catch (err: any) {
      console.error('Error loading live payment data:', err);
      showToast('error', 'ไม่สามารถโหลดข้อมูลการเงินจากฐานข้อมูลได้: ' + (err.message || 'Network error'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking?.id]);

  useEffect(() => {
    fetchLivePaymentData();
  }, [refreshTrigger]);

  // KPI Calculations (Section 4)
  const kpiData = useMemo(() => {
    let waitingDepositCount = 0;
    let waitingDepositAmount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let fullyPaidCount = 0;

    bookings.forEach((b) => {
      const s = b.summary;
      totalPaid += s.paid_total;
      totalRemaining += s.remaining_balance;

      if (s.is_fully_paid) {
        fullyPaidCount += 1;
      }

      if (!s.deposit_paid && s.deposit_required > 0) {
        waitingDepositCount += 1;
        waitingDepositAmount += Math.max(0, s.deposit_required - s.paid_total);
      }
    });

    return {
      waitingDepositCount,
      waitingDepositAmount,
      totalPaid,
      totalRemaining,
      fullyPaidCount,
      totalBookings: bookings.length,
    };
  }, [bookings]);

  // Filtered Bookings List (Section 7)
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = b.customer_name.toLowerCase().includes(q);
        const matchArtist = b.artist_name.toLowerCase().includes(q);
        const matchId = b.id.toLowerCase().includes(q);
        if (!matchCust && !matchArtist && !matchId) return false;
      }

      // 2. Financial filter
      if (financialFilter === 'WAITING_DEPOSIT') {
        if (b.summary.deposit_paid || b.summary.deposit_required <= 0) return false;
      } else if (financialFilter === 'PARTIAL') {
        if (!b.summary.deposit_paid || b.summary.is_fully_paid || b.summary.paid_total <= 0) return false;
      } else if (financialFilter === 'FULLY_PAID') {
        if (!b.summary.is_fully_paid) return false;
      }

      // 3. Booking status filter
      if (bookingStatusFilter !== 'ALL') {
        if (b.status !== bookingStatusFilter) return false;
      }

      return true;
    });
  }, [bookings, searchQuery, financialFilter, bookingStatusFilter]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6 font-prompt">
      {/* Toast Feedback Notification */}
      {feedbackToast && (
        <div
          className={`fixed top-20 right-4 sm:right-8 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl border text-xs font-medium animate-fadeIn ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
              : 'bg-red-950 text-red-300 border-red-700'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-400 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
          <button
            onClick={() => setFeedbackToast(null)}
            className="ml-2 text-[#7A7265] hover:text-[#ECE4D3] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Title & Subtitle Header (Section 4) */}
      <div className="border-b border-[#4A443A] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 sm:px-3 sm:py-1 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <CreditCard size={12} className="text-[#9C2F2F]" />
            <span>Financial & Payments</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            การเงินและการชำระเงิน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            ติดตามเงินมัดจำ ยอดที่รับแล้ว และยอดคงเหลือของงานสัก
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#ECE4D3] rounded-md transition-colors flex items-center gap-1.5 font-medium"
            title="รีเฟรชข้อมูลล่าสุดจากฐานข้อมูล"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards (Section 4) */}
      <PaymentSummaryCards
        waitingDepositCount={kpiData.waitingDepositCount}
        waitingDepositAmount={kpiData.waitingDepositAmount}
        totalPaid={kpiData.totalPaid}
        totalRemaining={kpiData.totalRemaining}
        fullyPaidCount={kpiData.fullyPaidCount}
        totalBookings={kpiData.totalBookings}
      />

      {/* Booking Financial List with Filters (Section 5, 6, 7) */}
      <PaymentBookingList
        bookings={filteredBookings}
        selectedBookingId={selectedBooking?.id}
        onSelectBooking={(b) => setSelectedBooking(b)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        financialFilter={financialFilter}
        onFinancialFilterChange={setFinancialFilter}
        bookingStatusFilter={bookingStatusFilter}
        onBookingStatusFilterChange={setBookingStatusFilter}
        isLoading={isLoading}
      />

      {/* Slide-out Payment Detail Panel (Section 8) */}
      <PaymentDetailPanel
        booking={selectedBooking}
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        onOpenRecordModal={() => setIsRecordModalOpen(true)}
        onOpenVoidModal={(p) => setVoidTargetPayment(p)}
        refreshTrigger={refreshTrigger}
      />

      {/* Record Payment Form Modal (Section 9, 10, 11) */}
      <RecordPaymentForm
        booking={selectedBooking}
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSuccess={(msg) => {
          showToast('success', msg);
          handleRefresh();
        }}
        onError={(err) => showToast('error', err)}
      />

      {/* Void Payment Confirmation Dialog (Section 14) */}
      <VoidPaymentDialog
        payment={voidTargetPayment}
        isOpen={Boolean(voidTargetPayment)}
        onClose={() => setVoidTargetPayment(null)}
        onSuccess={(msg) => {
          showToast('success', msg);
          handleRefresh();
        }}
        onError={(err) => showToast('error', err)}
      />
    </div>
  );
}
