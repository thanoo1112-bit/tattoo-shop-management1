'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Calendar, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import RequestSummaryCards from './RequestSummaryCards';
import EstimateRequestList from './EstimateRequestList';
import EstimateDetailPanel from './EstimateDetailPanel';
import BookingList from './BookingList';
import BookingDetailPanel from './BookingDetailPanel';
import DeleteRejectedRequestDialog from './DeleteRejectedRequestDialog';
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
import { BlockedDateRecord } from '@/lib/availabilityUtils';

export default function AdminRequestsPage() {
  const [activeTab, setActiveTab] = useState<'estimates' | 'bookings'>('estimates');
  const [estimates, setEstimates] = useState<EstimateRequestItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateRecord[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateRequestItem | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [selectedPaymentSub, setSelectedPaymentSub] = useState<PaymentSubmissionDetail | null>(null);
  const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [estimateFilter, setEstimateFilter] = useState<string>('ALL');
  const [bookingFilter, setBookingFilter] = useState<string>('ALL');

  const handleTabChangeWithFilter = useCallback((tab: 'estimates' | 'bookings', filter?: string) => {
    setActiveTab(tab);
    if (filter) {
      if (tab === 'estimates') setEstimateFilter(filter);
      if (tab === 'bookings') setBookingFilter(filter);
    }
  }, []);

  // Admin Delete Rejected Request State
  const [deleteTargetItem, setDeleteTargetItem] = useState<{ id: string; name?: string; refImages?: string[] | null } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check URL query parameters to switch tab on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const bookingIdParam = params.get('booking_id') || params.get('bookingId');

      if (tabParam === 'bookings' || tabParam === 'booking' || bookingIdParam) {
        setActiveTab('bookings');
      }
    }
  }, []);

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

      // 4b. Fetch non-voided booking payments for session paid calculation
      const { data: payData } = await supabase
        .from('booking_payments')
        .select('id, booking_id, booking_session_id, amount, status')
        .neq('status', 'VOIDED');

      // 4c. Fetch pending payment submissions
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

      // 5b. Fetch artist blocked dates
      const { data: blockedData } = await supabase
        .from('artist_blocked_dates')
        .select('id, scope, artist_id, blocked_date, reason');

      setBlockedDates(blockedData || []);

      // 6. Fetch customers & profiles
      const { data: custData } = await supabase
        .from('customers')
        .select('id, user_id, display_name, phone, email, eligibility_confirmed_at, profile_completed_at');

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
        return 'ไม่ระบุชื่อ';
      };

      const mappedBookings: BookingItem[] = (bookData || []).map((b: any) => {
        const artist = (artData || []).find((a) => a.id === b.artist_id);
        const customer = (custData || []).find((c) => (b.customer_id && c.id === b.customer_id) || (b.customer_user_id && c.user_id === b.customer_user_id));
        const profile = (profData || []).find((p) => p.user_id === b.customer_user_id);
        const summary = (sumData || []).find((f) => f.booking_id === b.id);
        const bookingSessions = (sesData || [])
          .filter((s) => s.booking_id === b.id)
          .map((s: any) => {
            const sessionPaidAmount = (payData || [])
              .filter((p: any) => p.booking_session_id === s.id && p.status !== 'VOIDED')
              .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
            return {
              ...s,
              session_paid_amount: sessionPaidAmount,
            };
          });
        const est = (estData || []).find((e: any) => e.id === b.estimate_request_id);

        const pendingSub = (pendingSubmissions || []).find((sub: any) => sub.booking_id === b.id);
        const hasPendingSlip = Boolean(pendingSub);

        const bookingPaidTotal = (payData || [])
          .filter((p: any) => p.booking_id === b.id && p.status !== 'VOIDED')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const totalPaid = Math.max(
          Number(summary?.paid_total ?? summary?.total_paid ?? 0),
          bookingPaidTotal
        );

        const quotedPriceVal = Number(summary?.quoted_price ?? est?.quoted_price ?? (b as any)?.quoted_price ?? 0);
        const depositReqVal = Number(summary?.deposit_required ?? est?.deposit_required ?? (b as any)?.deposit_required ?? 0);

        const isDepPaid = Boolean(
          summary?.is_deposit_paid ?? 
          summary?.deposit_paid ?? 
          (totalPaid > 0 && (depositReqVal === 0 || totalPaid >= depositReqVal))
        );

        const bItem: BookingItem = {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          requested_date: b.requested_date,
          requested_time: b.requested_start_time || b.requested_time || null,
          requested_start_time: b.requested_start_time || b.requested_time || null,
          status: b.status,
          customer_note: b.customer_note,
          admin_note: b.admin_note,
          placement: b.placement || est?.placement || 'ไม่ระบุ',
          width_cm: b.width_cm ?? est?.width_cm ?? null,
          height_cm: b.height_cm ?? est?.height_cm ?? null,
          style_preference: b.style_preference || est?.style || est?.style_preference || 'ไม่ระบุ',
          work_type: b.work_type || est?.work_type || null,
          description: b.description || est?.description || b.customer_note || null,
          reference_images: b.reference_images || est?.reference_images || null,
          created_at: b.created_at,
          updated_at: b.updated_at,
          customer_name: getCleanCustomerName(customer, profile),
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: customer ? (customer.eligibility_confirmed_at || customer.profile_completed_at ? true : undefined) : undefined,
          artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
          artist_nickname: artist?.nickname || null,
          has_medical_condition: Boolean(est?.has_medical_condition),
          has_allergy: Boolean(est?.has_allergy),
          estimated_min_price: est?.estimated_min_price ? Number(est.estimated_min_price) : null,
          estimated_max_price: est?.estimated_max_price ? Number(est.estimated_max_price) : null,
          price_estimated_at: est?.price_estimated_at || null,
          financial: {
            quoted_price: quotedPriceVal,
            deposit_required: depositReqVal,
            total_paid: totalPaid,
            remaining_balance: Math.max(0, quotedPriceVal - totalPaid),
            is_deposit_paid: isDepPaid,
            is_fully_paid: Boolean(summary?.is_fully_paid ?? (quotedPriceVal > 0 && totalPaid >= quotedPriceVal)),
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
        const customer = (custData || []).find((c) => (e.customer_id && c.id === e.customer_id) || (e.customer_user_id && c.user_id === e.customer_user_id));
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
          preferred_time: e.preferred_time || e.preferredTime || null,
          reference_images: e.reference_images,
          status: e.status,
          request_type: e.request_type,
          work_type: e.work_type || null,
          quoted_price: e.quoted_price ? Number(e.quoted_price) : null,
          deposit_required: e.deposit_required ? Number(e.deposit_required) : null,
          estimated_duration_minutes: e.estimated_duration_minutes,
          quote_note: e.quote_note,
          quoted_at: e.quoted_at,
          has_medical_condition: e.has_medical_condition !== undefined && e.has_medical_condition !== null ? Boolean(e.has_medical_condition) : e.has_medical_condition,
          medical_condition_note: e.medical_condition_note || null,
          has_allergy: e.has_allergy !== undefined && e.has_allergy !== null ? Boolean(e.has_allergy) : e.has_allergy,
          allergy_note: e.allergy_note || null,
          created_at: e.created_at,
          updated_at: e.updated_at,
          customer_name: getCleanCustomerName(customer, profile),
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: customer ? (customer.eligibility_confirmed_at || customer.profile_completed_at ? true : undefined) : undefined,
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

      // Keep selected items updated if open (using functional state updates)
      setSelectedEstimate((prev) => {
        if (!prev) return null;
        return mappedEstimates.find((e) => e.id === prev.id) || prev;
      });

      setSelectedBooking((prev) => {
        if (!prev) {
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const targetBookingId = params.get('booking_id') || params.get('bookingId');
            if (targetBookingId) {
              return mappedBookings.find((b) => b.id === targetBookingId) || null;
            }
          }
          return null;
        }
        return mappedBookings.find((b) => b.id === prev.id) || prev;
      });
    } catch (err: any) {
      console.error('Error loading requests & bookings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllRequestsData();

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['estimate_requests', 'bookings', 'booking_payment_submissions', 'booking_sessions', 'booking_payments', 'customers', 'profiles'].includes(detail?.table)) {
        fetchAllRequestsData();
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
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

  // Tab 1 ("คำขอจากลูกค้า"): Only customer-initiated requests (exclude Admin-created DIRECT_BOOKING)
  const customerRequests = useMemo(() => {
    return estimates.filter((e) => {
      if (e.request_type === 'DIRECT_BOOKING') return false; // Admin-created logbook entries belong to Calendar/Work Queue
      if (!e.linked_booking) return true;
      const hasPendingSlip = Boolean(
        e.has_pending_payment_submission ||
        e.linked_booking.has_pending_payment_submission ||
        e.operational_status?.key === 'WAITING_SLIP_VERIFICATION'
      );
      return e.status === 'PENDING' || hasPendingSlip;
    });
  }, [estimates]);

  // Tab 2 ("คิวงาน"): All confirmed / work queue items, including Admin-created direct bookings
  const workQueueBookings = useMemo(() => {
    return bookings.filter((b) => {
      const hasPendingSlip = Boolean(
        b.has_pending_payment_submission ||
        b.pending_submission?.status === 'PENDING' ||
        b.operational_status?.key === 'WAITING_SLIP_VERIFICATION'
      );
      if (hasPendingSlip) return false;
      return true; // All bookings in Work Queue tab are displayed
    });
  }, [bookings]);

  // Top Summary Counts for Admin Requests Page
  const summaryCounts: RequestSummaryCounts = useMemo(() => {
    const pendingEvaluation = customerRequests.filter(
      (e) => e.operational_status?.key === 'PENDING' || e.status === 'PENDING'
    ).length;
    const pendingSlips = customerRequests.filter(
      (e) => e.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || e.has_pending_payment_submission
    ).length;
    const confirmed = workQueueBookings.length;

    return {
      pendingEvaluationCount: pendingEvaluation,
      waitingCustomerCount: 0,
      waitingDepositCount: 0,
      pendingSlipsCount: pendingSlips,
      confirmedCount: confirmed,
    };
  }, [customerRequests, workQueueBookings]);

  // Delete Rejected Request Handlers
  const handleOpenDeleteModal = useCallback((item: { id: string; customer_name?: string; reference_images?: string[] | null }) => {
    setDeleteTargetItem({
      id: item.id,
      name: item.customer_name,
      refImages: item.reference_images,
    });
  }, []);

  const handleConfirmDeleteRejected = async () => {
    if (!deleteTargetItem?.id) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('admin_delete_rejected_request', {
        p_request_id: deleteTargetItem.id,
      });

      if (error) {
        alert(error.message || 'เกิดข้อผิดพลาดในการลบคำขอ');
        return;
      }

      if (data?.success) {
        // Storage cleanup for reference_images if returned
        const imagesToClean: string[] = data.reference_images || deleteTargetItem.refImages || [];
        if (imagesToClean.length > 0) {
          try {
            const storagePaths = imagesToClean.map((img) => {
              if (img.startsWith('customer-references/')) {
                return img.replace('customer-references/', '');
              }
              return img;
            });
            await supabase.storage.from('customer-references').remove(storagePaths);
          } catch (stErr) {
            console.error('Error cleaning reference images storage:', stErr);
          }
        }

        // Close modal and drawers immediately
        setDeleteTargetItem(null);
        setSelectedEstimate(null);
        setSelectedBooking(null);

        // Refresh request list and KPIs immediately
        setRefreshTrigger((prev) => prev + 1);

        // Show toast
        setToastMessage('ลบคำขอที่ปฏิเสธแล้วเรียบร้อย');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err: any) {
      console.error('Exception deleting rejected request:', err);
      alert(err.message || 'เกิดข้อผิดพลาดในการลบคำขอ');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 font-prompt pb-12 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[110] bg-emerald-950/90 text-emerald-200 border border-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

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

      {/* 4 KPI Summary Cards */}
      <RequestSummaryCards
        counts={summaryCounts}
        activeTab={activeTab}
        onTabChange={handleTabChangeWithFilter}
      />

      {/* Main 2 Tabs Switcher */}
      <div className="flex items-center border-b border-[#4A443A] gap-2">
        <button
          id="tab-btn-estimates"
          type="button"
          onClick={() => handleTabChangeWithFilter('estimates')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'estimates'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <FileText size={14} className={activeTab === 'estimates' ? 'text-[#9C2F2F]' : ''} />
          <span>คำขอจากลูกค้า ({customerRequests.length})</span>
          {summaryCounts.pendingEvaluationCount + summaryCounts.pendingSlipsCount > 0 && (
            <span className="bg-amber-600 text-[#ECE4D3] text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {summaryCounts.pendingEvaluationCount + summaryCounts.pendingSlipsCount}
            </span>
          )}
        </button>

        <button
          id="tab-btn-bookings"
          type="button"
          onClick={() => handleTabChangeWithFilter('bookings')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'bookings'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <Calendar size={14} className={activeTab === 'bookings' ? 'text-[#9C2F2F]' : ''} />
          <span>คิวงาน ({workQueueBookings.length})</span>
          {summaryCounts.confirmedCount > 0 && (
            <span className="bg-emerald-600 text-[#ECE4D3] text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {summaryCounts.confirmedCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Estimate Requests List (คำขอจากลูกค้า) */}
      {activeTab === 'estimates' && (
        <EstimateRequestList
          estimates={customerRequests}
          selectedEstimate={selectedEstimate}
          onSelectEstimate={setSelectedEstimate}
          onCheckSlip={handleOpenCheckSlip}
          onDeleteRequest={handleOpenDeleteModal}
          initialFilter={estimateFilter}
        />
      )}

      {/* Tab 2: Bookings List (คิวงาน) */}
      {activeTab === 'bookings' && (
        <BookingList
          bookings={workQueueBookings}
          selectedBooking={selectedBooking}
          onSelectBooking={setSelectedBooking}
          onCheckSlip={handleOpenCheckSlip}
          initialFilter={bookingFilter}
        />
      )}

      {/* Estimate Detail Panel */}
      {selectedEstimate && (
        <EstimateDetailPanel
          estimate={selectedEstimate}
          blockedDates={blockedDates}
          onClose={() => setSelectedEstimate(null)}
          onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
          onCheckSlip={handleOpenCheckSlip}
          onDeleteRequest={handleOpenDeleteModal}
        />
      )}

      {/* Booking Detail Panel */}
      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          artists={artists}
          blockedDates={blockedDates}
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

      {/* Delete Rejected Request Confirmation Dialog */}
      <DeleteRejectedRequestDialog
        isOpen={Boolean(deleteTargetItem)}
        requestId={deleteTargetItem?.id || null}
        customerName={deleteTargetItem?.name}
        onClose={() => setDeleteTargetItem(null)}
        onConfirm={handleConfirmDeleteRejected}
        isLoading={isDeleting}
      />
    </div>
  );
}
