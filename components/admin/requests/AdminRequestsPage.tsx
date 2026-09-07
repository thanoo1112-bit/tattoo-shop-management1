'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Calendar, RefreshCw, Layers } from 'lucide-react';
import RequestSummaryCards from './RequestSummaryCards';
import EstimateRequestList from './EstimateRequestList';
import EstimateDetailPanel from './EstimateDetailPanel';
import BookingList from './BookingList';
import BookingDetailPanel from './BookingDetailPanel';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import { PaymentSubmissionDetail } from '@/components/admin/payments/types';
import {
  EstimateRequestItem,
  BookingItem,
  BookingSessionItem,
  RequestSummaryCounts,
  resolveEstimateOperationalStatus,
  resolveBookingOperationalStatus,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminRequestsPage() {
  const [activeTab, setActiveTab] = useState<'estimates' | 'bookings'>('estimates');
  const [estimates, setEstimates] = useState<EstimateRequestItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateRequestItem | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [selectedPaymentSub, setSelectedPaymentSub] = useState<PaymentSubmissionDetail | null>(null);
  const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Main Live Data Fetcher (Section 4 & 34: Avoid N+1 query)
  const fetchAllRequestsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch estimate requests
      const { data: estData, error: estErr } = await supabase
        .from('estimate_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (estErr) throw estErr;

      // 2. Fetch bookings
      const { data: bookData, error: bookErr } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookErr) throw bookErr;

      // 3. Fetch booking sessions
      const { data: sesData, error: sesErr } = await supabase
        .from('booking_sessions')
        .select('*')
        .order('session_number', { ascending: true });

      if (sesErr) throw sesErr;

      // 4. Fetch booking payment summaries
      const { data: sumData, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('*');

      if (sumErr) throw sumErr;

      // 4b. Fetch pending payment submissions
      const { data: pendingSubmissions } = await supabase
        .from('booking_payment_submissions')
        .select('id, booking_id, status, claimed_amount, slip_path, reference_no, created_at')
        .eq('status', 'PENDING');

      setPendingSubmissionsCount(pendingSubmissions?.length || 0);

      // 5. Fetch active artists
      const { data: artData, error: artErr } = await supabase
        .from('artists')
        .select('id, name, nickname')
        .order('name');

      if (artErr) throw artErr;
      setArtists(artData || []);

      // 6. Fetch customers & profiles
      const { data: custData } = await supabase
        .from('customers')
        .select('user_id, display_name, phone, email, eligibility_confirmed_at, profile_completed_at');

      const { data: profData } = await supabase
        .from('profiles')
        .select('user_id, display_name, phone, email');

      const getCleanCustomerName = (c: any, p: any) => {
        const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ') 
          ? c.display_name 
          : (p?.display_name && p.display_name !== 'ลูกค้าประจำ') 
          ? p.display_name 
          : null;
        if (candidate) return candidate;
        const emailPrefix = c?.email ? c.email.split('@')[0] : p?.email ? p.email.split('@')[0] : null;
        if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') return emailPrefix;
        return 'ลูกค้า (ไม่ระบุชื่อ)';
      };

      const mappedBookings: BookingItem[] = (bookData || []).map((b: any) => {
        const artist = (artData || []).find((a) => a.id === b.artist_id);
        const customer = (custData || []).find((c) => c.user_id === b.customer_user_id);
        const profile = (profData || []).find((p) => p.user_id === b.customer_user_id);
        const summary = (sumData || []).find((f) => f.booking_id === b.id);
        const bookingSessions = (sesData || []).filter((s) => s.booking_id === b.id);
        const est = (estData || []).find((e: any) => e.id === b.estimate_request_id);

        const pendingSub = (pendingSubmissions || []).find((sub: any) => sub.booking_id === b.id);
        const hasPendingSlip = Boolean(pendingSub);
        const bItem: BookingItem = {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          requested_date: b.requested_date,
          requested_time: b.requested_time,
          status: b.status,
          customer_note: b.customer_note,
          admin_note: b.admin_note,
          placement: b.placement || est?.placement || 'ไม่ระบุ',
          width_cm: b.width_cm ?? est?.width_cm ?? null,
          height_cm: b.height_cm ?? est?.height_cm ?? null,
          style_preference: b.style_preference || est?.style || est?.style_preference || 'ไม่ระบุ',
          description: b.description || est?.description || b.customer_note || null,
          reference_images: b.reference_images || est?.reference_images || null,
          created_at: b.created_at,
          updated_at: b.updated_at,
          customer_name: getCleanCustomerName(customer, profile),
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: Boolean(customer?.eligibility_confirmed_at || customer?.profile_completed_at),
          artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
          artist_nickname: artist?.nickname || null,
          financial: {
            quoted_price: Number(summary?.quoted_price || 0),
            deposit_required: Number(summary?.deposit_required || 0),
            total_paid: Number(summary?.paid_total ?? summary?.total_paid ?? 0),
            remaining_balance: Number(summary?.remaining_balance || 0),
            is_deposit_paid: Boolean(summary?.is_deposit_paid),
            is_fully_paid: Boolean(summary?.is_fully_paid),
          },
          sessions: bookingSessions,
          has_pending_payment_submission: hasPendingSlip,
          pending_submission: pendingSub
            ? {
                id: pendingSub.id,
                booking_id: pendingSub.booking_id,
                status: pendingSub.status,
                claimed_amount: Number(pendingSub.claimed_amount || 0),
                slip_path: pendingSub.slip_path || null,
                proof_image_url: (pendingSub as any).proof_image_url || null,
                reference_no: pendingSub.reference_no || null,
                created_at: pendingSub.created_at,
              }
            : null,
        };
        bItem.operational_status = resolveBookingOperationalStatus(bItem, hasPendingSlip);
        return bItem;
      });

      // Map Estimate Requests with Operational Lifecycle Hydration
      const mappedEstimates: EstimateRequestItem[] = (estData || []).map((e: any) => {
        const artist = (artData || []).find((a) => a.id === e.artist_id);
        const customer = (custData || []).find((c) => c.user_id === e.customer_user_id);
        const profile = (profData || []).find((p) => p.user_id === e.customer_user_id);

        // Find linked booking
        const linkedBooking = mappedBookings.find((b) => b.estimate_request_id === e.id) || null;
        
        // Find if linked booking has pending payment submission
        const pendingSub = linkedBooking
          ? (pendingSubmissions || []).find((sub: any) => sub.booking_id === linkedBooking.id)
          : null;
        const hasPendingSlip = Boolean(pendingSub);

        const opStatus = resolveEstimateOperationalStatus(e, linkedBooking, hasPendingSlip);

        return {
          id: e.id,
          customer_user_id: e.customer_user_id,
          artist_id: e.artist_id,
          placement: e.placement,
          description: e.description,
          width_cm: e.width_cm,
          height_cm: e.height_cm,
          style_preference: e.style || e.style_preference || null,
          style: e.style || e.style_preference || null,
          preferred_date: e.preferred_date,
          reference_images: e.reference_images,
          status: e.status,
          quoted_price: e.quoted_price ? Number(e.quoted_price) : null,
          deposit_required: e.deposit_required ? Number(e.deposit_required) : null,
          estimated_duration_minutes: e.estimated_duration_minutes,
          quote_note: e.quote_note,
          quoted_at: e.quoted_at,
          created_at: e.created_at,
          updated_at: e.updated_at,
          customer_name: getCleanCustomerName(customer, profile),
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: Boolean(customer?.eligibility_confirmed_at || customer?.profile_completed_at),
          artist_name: artist?.name || 'ไม่ระบุช่าง',
          artist_nickname: artist?.nickname || null,
          linked_booking: linkedBooking,
          has_pending_payment_submission: hasPendingSlip,
          pending_submission: pendingSub
            ? {
                id: pendingSub.id,
                booking_id: pendingSub.booking_id,
                status: pendingSub.status,
                claimed_amount: Number(pendingSub.claimed_amount || 0),
                slip_path: pendingSub.slip_path || null,
                proof_image_url: (pendingSub as any).proof_image_url || null,
                reference_no: pendingSub.reference_no || null,
                created_at: pendingSub.created_at,
              }
            : null,
          operational_status: opStatus,
        };
      });

      setEstimates(mappedEstimates);
      setBookings(mappedBookings);

      // Keep selected items updated if open
      if (selectedEstimate) {
        const updatedEst = mappedEstimates.find((e) => e.id === selectedEstimate.id);
        if (updatedEst) setSelectedEstimate(updatedEst);
      }
      if (selectedBooking) {
        const updatedBook = mappedBookings.find((b) => b.id === selectedBooking.id);
        if (updatedBook) setSelectedBooking(updatedBook);
      }
    } catch (err: any) {
      console.error('Error loading requests & bookings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEstimate?.id, selectedBooking?.id]);

  useEffect(() => {
    fetchAllRequestsData();
  }, [refreshTrigger, fetchAllRequestsData]);

  // Check Slip Handler to open existing PaymentSubmissionReviewDrawer
  const handleOpenCheckSlip = useCallback(async (bookingId: string) => {
    if (!bookingId) return;
    try {
      const supabase = createClient();
      const { data: sub, error } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('status', 'PENDING')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !sub) {
        alert('ไม่พบข้อมูลสลิปรอตรวจ');
        return;
      }

      const subDetail: PaymentSubmissionDetail = {
        id: sub.id,
        booking_id: sub.booking_id,
        customer_user_id: sub.customer_user_id,
        claimed_amount: Number(sub.claimed_amount || 0),
        slip_path: sub.slip_path,
        reference_no: sub.reference_no,
        customer_note: sub.customer_note,
        status: sub.status,
        submitted_at: sub.submitted_at,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
        customer_name: 'ลูกค้า',
        artist_name: 'ช่างสักประจำร้าน',
        booking_status: 'WAITING_DEPOSIT',
        deposit_required: 0,
        paid_total: 0,
        outstanding_deposit: 0,
      };

      setSelectedPaymentSub(subDetail);
    } catch (err) {
      console.error('[AdminRequestsPage] handleOpenCheckSlip error:', err);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลสลิป');
    }
  }, []);

  // Top Summary Counts (Section 5: Card 2 = PENDING payment submissions "สลิปรอตรวจ")
  const summaryCounts: RequestSummaryCounts = useMemo(() => {
    const newEstimates = estimates.filter((e) => e.status === 'PENDING').length;
    const pendingSlips = pendingSubmissionsCount;
    const confirmed = bookings.filter((b) => b.status === 'CONFIRMED').length;
    const inProgress = bookings.filter((b) => b.status === 'IN_PROGRESS').length;

    return {
      newEstimatesCount: newEstimates,
      waitingDepositCount: pendingSlips,
      confirmedCount: confirmed,
      inProgressCount: inProgress,
    };
  }, [estimates, bookings, pendingSubmissionsCount]);

  return (
    <div className="space-y-6 font-prompt pb-12">
      {/* Title & Page Header */}
      <div className="border-b border-[#4A443A] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Layers size={12} className="text-[#9C2F2F]" />
            <span>Request & Booking Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            จัดการคิวงาน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            ติดตามคำขอ งานที่รออนุมัติ คิวที่ยืนยันแล้ว และสถานะงานสัก
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#ECE4D3] rounded-md transition-colors flex items-center gap-1.5 font-medium"
            title="รีเฟรชข้อมูลคำขอและคิวงาน"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards (Section 5) */}
      <RequestSummaryCards
        counts={summaryCounts}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main 2 Tabs Switcher (Section 6: Estimate != Booking) */}
      <div className="flex items-center border-b border-[#4A443A] gap-2">
        <button
          id="tab-btn-estimates"
          type="button"
          onClick={() => setActiveTab('estimates')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'estimates'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <FileText size={14} className={activeTab === 'estimates' ? 'text-[#9C2F2F]' : ''} />
          <span>คำขอจองคิวสัก ({estimates.length})</span>
          {summaryCounts.newEstimatesCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {summaryCounts.newEstimatesCount}
            </span>
          )}
        </button>

        <button
          id="tab-btn-bookings"
          type="button"
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'bookings'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <Calendar size={14} className={activeTab === 'bookings' ? 'text-[#9C2F2F]' : ''} />
          <span>คิวงานทั้งหมด ({bookings.length})</span>
          {summaryCounts.waitingDepositCount + summaryCounts.confirmedCount > 0 && (
            <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {summaryCounts.waitingDepositCount + summaryCounts.confirmedCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Estimate Requests List */}
      {activeTab === 'estimates' && (
        <EstimateRequestList
          estimates={estimates}
          selectedEstimate={selectedEstimate}
          onSelectEstimate={setSelectedEstimate}
          onCheckSlip={handleOpenCheckSlip}
        />
      )}

      {/* Tab 2: Bookings List */}
      {activeTab === 'bookings' && (
        <BookingList
          bookings={bookings}
          selectedBooking={selectedBooking}
          onSelectBooking={setSelectedBooking}
          onCheckSlip={handleOpenCheckSlip}
        />
      )}

      {/* Estimate Detail Panel */}
      {selectedEstimate && (
        <EstimateDetailPanel
          estimate={selectedEstimate}
          onClose={() => setSelectedEstimate(null)}
          onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
          onCheckSlip={handleOpenCheckSlip}
        />
      )}

      {/* Booking Detail Panel */}
      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          artists={artists}
          onClose={() => setSelectedBooking(null)}
          onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
          onCheckSlip={handleOpenCheckSlip}
        />
      )}

      {/* Payment Submission Review Drawer */}
      {selectedPaymentSub && (
        <PaymentSubmissionReviewDrawer
          isOpen={Boolean(selectedPaymentSub)}
          submission={selectedPaymentSub}
          onClose={() => setSelectedPaymentSub(null)}
          onSuccess={() => {
            setSelectedPaymentSub(null);
            setRefreshTrigger((prev) => prev + 1);
          }}
          onError={(err) => alert(err)}
        />
      )}
    </div>
  );
}
