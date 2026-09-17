'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  RefreshCw,
  CheckCircle2,
  X,
  FileCheck,
  Settings,
  Layers,
  DollarSign,
} from 'lucide-react';
import AdminRevenuePage from '@/components/admin/revenue/AdminRevenuePage';
import PaymentSummaryCards from './PaymentSummaryCards';
import PaymentBookingList from './PaymentBookingList';
import PaymentDetailPanel from './PaymentDetailPanel';
import RecordPaymentForm from './RecordPaymentForm';
import VoidPaymentDialog from './VoidPaymentDialog';
import PaymentSubmissionReviewQueue from './PaymentSubmissionReviewQueue';
import AdminPaymentSettingsSection from './AdminPaymentSettingsSection';
import {
  PaymentBookingDetail,
  BookingPaymentSummaryRow,
  BookingPaymentRecord,
  FinancialStatusFilter,
  BookingStatusFilter,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminPaymentPage() {
  const [activeMainTab, setActiveMainTab] = useState<'overview' | 'submissions' | 'settings' | 'revenue'>('overview');
  const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState<number>(0);

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
  const fetchLivePaymentData = useCallback(async (opts?: { isInitial?: boolean }) => {
    if (opts?.isInitial) {
      setIsLoading(true);
    }
    try {
      const supabase = createClient();

      // 1. Fetch live booking_payment_summary
      const { data: summaries, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('*');

      if (sumErr) throw sumErr;

      // 2. Fetch all bookings with joined artist, estimate, and sessions
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

      // 3. Fetch non-voided booking payments
      const { data: pList, error: pErr } = await supabase
        .from('booking_payments')
        .select('*')
        .neq('status', 'VOIDED')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      // 4. Fetch customers & profiles for display names
      const customerUids = Array.from(
        new Set(
          (bList || [])
            .map((b: any) => b.customer_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let custList: any[] = [];
      let profList: any[] = [];
      if (customerUids.length > 0) {
        const [cRes, pRes] = await Promise.all([
          supabase.from('customers').select('user_id, display_name, phone, email').in('user_id', customerUids),
          supabase.from('profiles').select('user_id, display_name, phone, email').in('user_id', customerUids),
        ]);
        if (cRes.data) custList = cRes.data;
        if (pRes.data) profList = pRes.data;
      }

      // 5. Map & Hydrate PaymentBookingDetail array
      const mapped: PaymentBookingDetail[] = (bList || []).map((b: any) => {
        const summary: BookingPaymentSummaryRow = (summaries || []).find((s: any) => s.booking_id === b.id) || {
          booking_id: b.id,
          estimate_request_id: b.estimate_request_id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          quoted_price: Number(b.tattoo_price || 0),
          deposit_required: Number(b.deposit_required || 0),
          paid_total: 0,
          remaining_balance: Number(b.tattoo_price || 0),
          deposit_paid: false,
          is_fully_paid: false,
        };

        const cust = (custList || []).find((c: any) => c.user_id === b.customer_user_id);
        const prof = (profList || []).find((p: any) => p.user_id === b.customer_user_id);
        const artist = b.artists;

        return {
          id: b.id,
          estimate_request_id: b.estimate_request_id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          requested_date: b.requested_date,
          booking_source: b.booking_source,
          approved_at: b.approved_at,
          confirmed_at: b.confirmed_at,
          created_at: b.created_at,
          status: b.status,
          customer_name: cust?.display_name || prof?.display_name || prof?.email?.split('@')[0] || 'ลูกค้าประจำ',
          customer_phone: cust?.phone || prof?.phone || undefined,
          customer_email: cust?.email || prof?.email || undefined,
          artist_name: artist?.name || 'ช่างประจำร้าน',
          artist_nickname: artist?.nickname || undefined,
          artwork_title: b.artwork_title || (b.booking_source === 'ESTIMATE' ? 'งานสักจากใบประเมินราคา' : 'งานสัก Custom'),
          summary,
          payments: (pList || [])
            .filter((p: any) => p.booking_id === b.id)
            .map((p: any) => ({
              id: p.id,
              booking_id: p.booking_id,
              customer_id: p.customer_id,
              customer_user_id: p.customer_user_id,
              payment_type: p.payment_type,
              amount: Number(p.amount || 0),
              currency: p.currency,
              payment_method: p.payment_method,
              payment_reference: p.payment_reference,
              status: p.status,
              customer_note: p.customer_note,
              staff_note: p.staff_note,
              paid_at: p.paid_at,
              created_at: p.created_at,
            })),
          sessions: (b.booking_sessions || []).map((s: any) => ({
            id: s.id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
          })),
        };
      });

      setBookings(mapped);

      // Keep selected booking updated if detail drawer is open
      setSelectedBooking((prev) => {
        if (!prev) return null;
        return mapped.find((m) => m.id === prev.id) || prev;
      });
    } catch (err: any) {
      console.error('Error fetching live payment data:', err);
      showToast('error', 'ไม่สามารถโหลดข้อมูลการเงินจากฐานข้อมูลได้: ' + (err.message || 'Network error'));
    } finally {
      if (opts?.isInitial) {
        setIsLoading(false);
      }
    }
  }, []);

  const isInitialMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isInitialMountedRef.current) {
      isInitialMountedRef.current = true;
      fetchLivePaymentData({ isInitial: true });
    } else {
      fetchLivePaymentData({ isInitial: false });
    }

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['booking_payments', 'booking_payment_submissions', 'bookings', 'customers'].includes(detail?.table)) {
        fetchLivePaymentData({ isInitial: false });
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
  }, [refreshTrigger, fetchLivePaymentData]);

  // KPI Calculations
  const kpiData = useMemo(() => {
    let waitingDepositCount = 0;
    let waitingDepositAmount = 0;
    let totalPaid = 0;
    let depositPaidCount = 0;

    bookings.forEach((b) => {
      const s = b.summary;
      totalPaid += s.paid_total;

      if (s.deposit_required > 0 && s.paid_total >= s.deposit_required) {
        depositPaidCount += 1;
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
      depositPaidCount,
      totalBookings: bookings.length,
    };
  }, [bookings]);

  // Filtered Bookings List
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
      if (financialFilter === 'UNPAID') {
        if (b.summary.deposit_required <= 0 || b.summary.paid_total > 0) return false;
      } else if (financialFilter === 'PARTIAL') {
        if (b.summary.paid_total <= 0 || b.summary.paid_total >= b.summary.deposit_required) return false;
      } else if (financialFilter === 'PAID') {
        if (b.summary.deposit_required <= 0 || b.summary.paid_total < b.summary.deposit_required) return false;
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
            <X size={16} className="text-red-400 shrink-0" />
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

      {/* Page Title & Subtitle Header */}
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
            ติดตามเงินมัดจำ ตรวจสอบสลิปโอนเงิน และตั้งค่าบัญชีรับชำระของสตูดิโอ
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

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#4A443A] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveMainTab('overview')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 " +
            (activeMainTab === 'overview'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <Layers size={14} className={activeMainTab === 'overview' ? 'text-[#9C2F2F]' : ''} />
          <span>ภาพรวมและประวัติการเงิน</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('submissions')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 relative " +
            (activeMainTab === 'submissions'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <FileCheck size={14} className={activeMainTab === 'submissions' ? 'text-[#C9A86A]' : ''} />
          <span>รอตรวจสอบสลิป</span>
          {pendingSubmissionsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-800 text-white font-mono animate-pulse font-semibold">
              {pendingSubmissionsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('revenue')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 " +
            (activeMainTab === 'revenue'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <DollarSign size={14} className={activeMainTab === 'revenue' ? 'text-[#9C2F2F]' : ''} />
          <span>รายได้</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('settings')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 " +
            (activeMainTab === 'settings'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <Settings size={14} className={activeMainTab === 'settings' ? 'text-[#9C2F2F]' : ''} />
          <span>ตั้งค่าการชำระเงิน</span>
        </button>
      </div>

      {/* Tab 1 Content: Overview & Bookings */}
      {activeMainTab === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          {/* 4 Summary Cards */}
          <PaymentSummaryCards
            waitingDepositCount={kpiData.waitingDepositCount}
            waitingDepositAmount={kpiData.waitingDepositAmount}
            totalPaid={kpiData.totalPaid}
            depositPaidCount={kpiData.depositPaidCount}
            totalBookings={kpiData.totalBookings}
          />

          {/* Booking Financial List with Filters */}
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

          {/* Slide-out Payment Detail Panel */}
          <PaymentDetailPanel
            booking={selectedBooking}
            isOpen={Boolean(selectedBooking)}
            onClose={() => setSelectedBooking(null)}
            onOpenRecordModal={() => setIsRecordModalOpen(true)}
            onOpenVoidModal={(p) => setVoidTargetPayment(p)}
            refreshTrigger={refreshTrigger}
          />

          {/* Record Payment Form Modal */}
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

          {/* Void Payment Confirmation Dialog */}
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
      )}

      {/* Tab 2 Content: Review Queue */}
      {activeMainTab === 'submissions' && (
        <div className="animate-fadeIn">
          <PaymentSubmissionReviewQueue
            onSuccessToast={(msg) => showToast('success', msg)}
            onErrorToast={(err) => showToast('error', err)}
            onRefreshParent={handleRefresh}
            onPendingCountChange={(count) => setPendingSubmissionsCount(count)}
          />
        </div>
      )}

      {/* Tab 3 Content: Payment Settings */}
      {activeMainTab === 'settings' && (
        <div className="animate-fadeIn">
          <AdminPaymentSettingsSection
            onSuccessToast={(msg) => showToast('success', msg)}
            onErrorToast={(err) => showToast('error', err)}
          />
        </div>
      )}

      {/* Tab 4 Content: Revenue Analytics & Records */}
      {activeMainTab === 'revenue' && (
        <div className="animate-fadeIn">
          <AdminRevenuePage />
        </div>
      )}
    </div>
  );
}
