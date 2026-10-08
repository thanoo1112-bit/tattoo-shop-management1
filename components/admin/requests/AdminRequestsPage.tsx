'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle2, Layers, RefreshCw, FileText, Calendar } from 'lucide-react';
import EstimateRequestList from './EstimateRequestList';
import EstimateDetailPanel from './EstimateDetailPanel';
import BookingDetailPanel from './BookingDetailPanel';
import DeleteRejectedRequestDialog from './DeleteRejectedRequestDialog';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import AdminWorkQueue from '@/components/admin/AdminWorkQueue';
import { PaymentSubmissionDetail } from '@/components/admin/payments/types';
import {
  EstimateRequestItem,
  EstimateStatus,
  BookingItem,
  BookingSessionItem,
  resolveEstimateOperationalStatus,
  resolveBookingOperationalStatus,
} from './types';
import { createClient } from '@/lib/supabase/client';
import { BlockedDateRecord } from '@/lib/availabilityUtils';

interface AdminRequestsPageProps {
  defaultTab?: 'estimates' | 'bookings';
}

export default function AdminRequestsPage({ defaultTab = 'estimates' }: AdminRequestsPageProps = {}) {
  const [activeTab, setActiveTab] = useState<'estimates' | 'bookings'>(defaultTab);
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

  const handleTabChangeWithFilter = useCallback((tab: 'estimates' | 'bookings', filter?: string) => {
    setActiveTab(tab);
    if (filter) {
      setEstimateFilter(filter);
    }
  }, []);

  // Admin Delete Rejected Request State
  const [deleteTargetItem, setDeleteTargetItem] = useState<{
    id: string;
    name?: string;
    refImages?: string[] | null;
    sourceType: 'FLASH_RESERVATION' | 'CUSTOM_REQUEST';
    sourceId: string;
    status?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check URL query parameters to switch tab on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const filterParam = params.get('filter');
      const bookingIdParam = params.get('booking_id') || params.get('bookingId');

      if (tabParam === 'bookings' || tabParam === 'booking' || bookingIdParam) {
        setActiveTab('bookings');
      }
      if (filterParam) {
        setEstimateFilter(filterParam);
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

      // 1b. Fetch flash_reservations
      const { data: flashResData, error: flashResErr } = await supabase
        .from('flash_reservations')
        .select(`
          *,
          flash_designs (
            *,
            artists (
              id,
              name,
              nickname
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (flashResErr) console.error('Error fetching flash_reservations:', flashResErr);

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
        .select('id, user_id, display_name, phone, email, eligibility_confirmed_at, profile_completed_at, has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies');

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
        const flashRes = (flashResData || []).find((fr: any) => fr.id === b.flash_reservation_id);
        const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
        const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
        const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
        const flashStyle = flashDesignObj?.style || flashRes?.flash_design_style;

        const pendingSub = (pendingSubmissions || []).find((sub: any) => sub.booking_id === b.id);
        const hasPendingSlip = Boolean(pendingSub);

        const bookingPaidTotal = (payData || [])
          .filter((p: any) => p.booking_id === b.id && p.status !== 'VOIDED')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const totalPaid = Math.max(
          Number(summary?.paid_total ?? summary?.total_paid ?? 0),
          bookingPaidTotal
        );

        const isFlashBooking = Boolean(b.flash_reservation_id || (b as any).request_type === 'FLASH' || b.booking_source === 'FLASH');
        const rawQuotedPrice = isFlashBooking 
          ? (b as any)?.quoted_price 
          : ((b as any)?.quoted_price ?? est?.quoted_price ?? summary?.quoted_price);
        const quotedPriceVal = rawQuotedPrice != null ? Number(rawQuotedPrice) : 0;
        const depositReqVal = Number(summary?.deposit_required ?? est?.deposit_required ?? flashDesignObj?.deposit_amount ?? (b as any)?.deposit_required ?? 0);

        const isDepPaid = Boolean(
          summary?.is_deposit_paid ?? 
          summary?.deposit_paid ?? 
          (totalPaid > 0 && (depositReqVal === 0 || totalPaid >= depositReqVal))
        );

        const rawArtworkTitle = (b.artwork_title && b.artwork_title !== 'ลาย Flash' && b.artwork_title !== 'งานสัก')
          ? b.artwork_title
          : (flashTitle ? `ลาย Flash: ${flashTitle}` : (b.flash_reservation_id ? 'ลาย Flash' : undefined));

        let hasMedVal: boolean | null | undefined = undefined;
        let hasAllVal: boolean | null | undefined = undefined;

        if (customer) {
          if (customer.has_medical_condition !== undefined && customer.has_medical_condition !== null) {
            hasMedVal = Boolean(customer.has_medical_condition);
          } else if (customer.medical_conditions?.trim()) {
            hasMedVal = true;
          } else if (customer.medical_conditions === 'ไม่มี' || customer.medical_conditions === 'false') {
            hasMedVal = false;
          }

          if (customer.has_allergy !== undefined && customer.has_allergy !== null) {
            hasAllVal = Boolean(customer.has_allergy);
          } else if (customer.allergies?.trim()) {
            hasAllVal = true;
          } else if (customer.allergies === 'ไม่มี' || customer.allergies === 'false') {
            hasAllVal = false;
          }
        }

        if (hasMedVal === undefined && est?.has_medical_condition !== undefined && est?.has_medical_condition !== null) {
          hasMedVal = Boolean(est.has_medical_condition);
        }
        if (hasAllVal === undefined && est?.has_allergy !== undefined && est?.has_allergy !== null) {
          hasAllVal = Boolean(est.has_allergy);
        }

        if (hasMedVal === undefined && flashRes?.has_medical_condition !== undefined && flashRes?.has_medical_condition !== null) {
          hasMedVal = Boolean(flashRes.has_medical_condition);
        }
        if (hasAllVal === undefined && flashRes?.has_allergy !== undefined && flashRes?.has_allergy !== null) {
          hasAllVal = Boolean(flashRes.has_allergy);
        }

        const bItem: BookingItem = {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          flash_reservation_id: b.flash_reservation_id || null,
          requested_date: b.requested_date,
          requested_time: b.requested_start_time || b.requested_time || null,
          requested_start_time: b.requested_start_time || b.requested_time || null,
          status: b.status,
          customer_note: b.customer_note || flashRes?.customer_note,
          admin_note: b.admin_note || flashRes?.admin_note,
          placement: (b.placement && b.placement !== 'ไม่ระบุ' && b.placement !== 'CUSTOM')
            ? b.placement
            : (flashRes?.placement || est?.placement || null),
          width_cm: b.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? est?.width_cm ?? null,
          height_cm: b.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? est?.height_cm ?? null,
          estimated_size_tier: b.estimated_size_tier || est?.estimated_size_tier || null,
          size_label: flashDesignObj?.size_label || flashRes?.flash_design_size_label || b.size_label || est?.estimated_size_tier || null,
          style_preference: flashStyle || est?.style || est?.style_preference || b.style_preference || null,
          work_type: b.work_type || est?.work_type || (b.flash_reservation_id ? 'FLASH' : null),
          artwork_title: rawArtworkTitle,
          artwork_image_url: flashImgUrl || b.artwork_image_url || undefined,
          description: b.description || flashRes?.customer_note || est?.description || b.customer_note || null,
          reference_images: flashImgUrl ? [flashImgUrl] : (b.reference_images || est?.reference_images || null),
          created_at: b.created_at,
          updated_at: b.updated_at,
          customer_name: getCleanCustomerName(customer, profile),
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: customer ? (customer.eligibility_confirmed_at || customer.profile_completed_at ? true : undefined) : undefined,
          artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
          artist_nickname: artist?.nickname || null,
          has_medical_condition: hasMedVal,
          has_allergy: hasAllVal,
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

      // Map Flash Reservations
      const mappedFlashRequests: EstimateRequestItem[] = (flashResData || []).map((r: any) => {
        const design = r.flash_designs;
        const artist = design?.artists;
        const customer = (custData || []).find((c: any) => 
          (r.customer_user_id && c.user_id === r.customer_user_id) || 
          ((r as any).customer_id && c.id === (r as any).customer_id)
        );
        const profile = (profData || []).find((p: any) => p.user_id === r.customer_user_id);

        const customerName = getCleanCustomerName(customer, profile);

        // 1. Snapshot on flash_reservations (if present on record)
        let hasMedicalCondition: boolean | null | undefined = undefined;
        let medicalConditionNote: string | null = null;
        let hasAllergy: boolean | null | undefined = undefined;
        let allergyNote: string | null = null;
        let eligibilityConfirmedAt: string | null = r.eligibility_confirmed_at || null;

        if (r.has_medical_condition !== undefined && r.has_medical_condition !== null) {
          hasMedicalCondition = r.has_medical_condition;
          medicalConditionNote = r.medical_condition_note || null;
        } else if (r.medical_conditions?.trim()) {
          hasMedicalCondition = true;
          medicalConditionNote = r.medical_conditions.trim();
        } else if (r.medical_conditions === 'ไม่มี' || r.medical_conditions === 'false') {
          hasMedicalCondition = false;
        }

        if (r.has_allergy !== undefined && r.has_allergy !== null) {
          hasAllergy = r.has_allergy;
          allergyNote = r.allergy_note || null;
        } else if (r.allergies?.trim()) {
          hasAllergy = true;
          allergyNote = r.allergies.trim();
        } else if (r.allergies === 'ไม่มี' || r.allergies === 'false') {
          hasAllergy = false;
        }

        // 2. Fallback: Search across customer's estimate_requests for latest health disclosures
        const custEst = (estData || []).find((e: any) => 
          ((r.customer_user_id && e.customer_user_id === r.customer_user_id) || 
           (customer?.id && e.customer_id === customer.id)) && 
          (e.has_medical_condition !== null && e.has_medical_condition !== undefined)
        );

        if (hasMedicalCondition === undefined && custEst) {
          hasMedicalCondition = custEst.has_medical_condition;
          medicalConditionNote = custEst.medical_condition_note || null;
        }
        if (hasAllergy === undefined && custEst) {
          hasAllergy = custEst.has_allergy;
          allergyNote = custEst.allergy_note || null;
        }

        // 3. Fallback: Check current customer profile / record (custData)
        if (hasMedicalCondition === undefined && customer) {
          if ((customer as any).has_medical_condition !== undefined && (customer as any).has_medical_condition !== null) {
            hasMedicalCondition = (customer as any).has_medical_condition;
            medicalConditionNote = (customer as any).medical_condition_note || null;
          } else if (customer.medical_conditions?.trim()) {
            hasMedicalCondition = true;
            medicalConditionNote = customer.medical_conditions.trim();
          } else if (customer.medical_conditions === 'ไม่มี' || customer.medical_conditions === 'false') {
            hasMedicalCondition = false;
          }
        }

        if (hasAllergy === undefined && customer) {
          if ((customer as any).has_allergy !== undefined && (customer as any).has_allergy !== null) {
            hasAllergy = (customer as any).has_allergy;
            allergyNote = (customer as any).allergy_note || null;
          } else if (customer.allergies?.trim()) {
            hasAllergy = true;
            allergyNote = customer.allergies.trim();
          } else if (customer.allergies === 'ไม่มี' || customer.allergies === 'false') {
            hasAllergy = false;
          }
        }

        if (!eligibilityConfirmedAt && customer?.eligibility_confirmed_at) {
          eligibilityConfirmedAt = customer.eligibility_confirmed_at;
        }

        // Bracketed placement extraction fallback
        const noteText = r.customer_note || '';
        let parsedPlacement: string | null = null;
        const bracketPlacementMatch = noteText.match(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/i);
        if (bracketPlacementMatch) {
          parsedPlacement = bracketPlacementMatch[1].trim();
        } else {
          const linePlacementMatch = noteText.match(/(?:^|\n)(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\n]+)/i);
          if (linePlacementMatch) {
            parsedPlacement = linePlacementMatch[1].trim();
          }
        }

        const placementVal = (r.placement && r.placement.trim() && r.placement !== 'ไม่ระบุ')
          ? r.placement.trim()
          : (parsedPlacement || 'ไม่ระบุ');

        const widthCmVal = r.width_cm ? Number(r.width_cm) : null;
        const heightCmVal = r.height_cm ? Number(r.height_cm) : null;

        // Find linked booking & pending submission for Flash reservation
        const linkedBooking = mappedBookings.find((b: any) =>
          (b.flash_reservation_id && b.flash_reservation_id === r.id) ||
          ((b as any).flash_reservation_id && (b as any).flash_reservation_id === r.id) ||
          ((r as any).booking_id && b.id === (r as any).booking_id)
        ) || null;

        const pendingSub = linkedBooking
          ? (pendingSubmissions || []).find((sub: any) => sub.booking_id === linkedBooking.id)
          : (pendingSubmissions || []).find((sub: any) => (sub as any).flash_reservation_id === r.id);

        const hasPendingSlip = Boolean(pendingSub);

        const isPending = r.status === 'PENDING';
        const isApproved = r.status === 'APPROVED';
        const isRejected = r.status === 'REJECTED';
        const isCancelled = r.status === 'CANCELLED';
        const isExpired = r.status === 'EXPIRED';
        const isCompleted = r.status === 'COMPLETED';

        const opStatus = resolveEstimateOperationalStatus(r, linkedBooking, hasPendingSlip);
        const estItemStatus: EstimateStatus = isPending ? 'PENDING' : isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : isExpired ? 'EXPIRED' : isCancelled ? 'CANCELLED' : 'COMPLETED';

        return {
          id: r.id,
          customer_user_id: r.customer_user_id,
          artist_id: design?.artist_id || null,
          placement: placementVal,
          description: r.customer_note || '',
          width_cm: widthCmVal,
          height_cm: heightCmVal,
          style_preference: design?.style || 'Flash',
          style: design?.style || 'Flash',
          preferred_date: r.requested_date || null,
          preferred_time: r.requested_start_time ? (r.requested_start_time.length >= 5 ? r.requested_start_time.slice(0, 5) : r.requested_start_time) : null,
          reference_images: design?.image_url ? [design.image_url] : null,
          status: estItemStatus,
          request_type: 'FLASH',
          quoted_price: design?.price ? Number(design.price) : null,
          deposit_required: 500,
          estimated_duration_minutes: null,
          quote_note: r.admin_note || null,
          quoted_at: r.created_at,
          has_medical_condition: hasMedicalCondition,
          medical_condition_note: medicalConditionNote,
          has_allergy: hasAllergy,
          allergy_note: allergyNote,
          eligibility_confirmed_at: eligibilityConfirmedAt,
          created_at: r.created_at,
          updated_at: r.created_at,
          customer_name: customerName,
          customer_phone: customer?.phone || profile?.phone || undefined,
          customer_email: customer?.email || profile?.email || undefined,
          is_age_confirmed: customer ? (customer.eligibility_confirmed_at || customer.profile_completed_at ? true : undefined) : undefined,
          artist_name: artist?.name || 'ช่างประจำร้าน',
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
          flash_reservation: {
            id: r.id,
            flash_design_id: r.flash_design_id,
            customer_user_id: r.customer_user_id,
            status: r.status,
            requested_date: r.requested_date,
            requested_start_time: r.requested_start_time,
            placement: r.placement,
            width_cm: r.width_cm ? Number(r.width_cm) : null,
            height_cm: r.height_cm ? Number(r.height_cm) : null,
            customer_note: r.customer_note,
            admin_note: r.admin_note,
            approved_at: r.approved_at,
            rejected_at: r.rejected_at,
            cancelled_at: r.cancelled_at,
            completed_at: r.completed_at,
            created_at: r.created_at,
            flash_design: design ? {
              id: design.id,
              artist_id: design.artist_id,
              title: design.title,
              style: design.style,
              price: Number(design.price) || 0,
              deposit_amount: Number(design.deposit_amount) || 0,
              image_url: design.image_url,
              status: design.status,
              artist: artist ? {
                id: artist.id,
                name: artist.name,
                nickname: artist.nickname
              } : null
            } : null
          }
        };
      });

      const combinedEstimates = [...mappedEstimates, ...mappedFlashRequests].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setEstimates(combinedEstimates);
      setBookings(mappedBookings);

      // Keep selected items updated if open (using functional state updates)
      setSelectedEstimate((prev) => {
        if (!prev) return null;
        return combinedEstimates.find((e) => e.id === prev.id) || prev;
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
      if (['estimate_requests', 'flash_reservations', 'bookings', 'booking_payment_submissions', 'booking_sessions', 'booking_payments', 'customers', 'profiles'].includes(detail?.table)) {
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

      // Fetch booking details to know if Flash or Custom
      const { data: b } = await supabase
        .from('bookings')
        .select('*, flash_reservations(*, flash_designs(*))')
        .eq('id', bookingId)
        .maybeSingle();

      const fr = Array.isArray(b?.flash_reservations) ? b.flash_reservations[0] : b?.flash_reservations;
      const fd = fr?.flash_designs;
      const isFlash = Boolean(b?.flash_reservation_id || fr);
      const flashResId = fr?.id || b?.flash_reservation_id || null;
      const flashCode = flashResId ? (flashResId.toUpperCase().startsWith('FLASH-') ? flashResId : `FLASH-${flashResId.slice(0, 8).toUpperCase()}`) : null;

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
        booking_status: b?.status || 'WAITING_DEPOSIT',
        deposit_required: 500,
        paid_total: 0,
        outstanding_deposit: 500,
        flash_reservation_id: flashResId,
        flash_reservation_code: flashCode,
        artwork_title: fd?.title || b?.artwork_title || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'),
        artwork_image_url: fd?.image_url || b?.artwork_image_url || null,
        reference_images: fd?.image_url ? [fd.image_url] : (b?.reference_images || null),
        placement: fr?.placement || b?.placement || null,
        width_cm: fr?.width_cm || b?.width_cm || null,
        height_cm: fr?.height_cm || b?.height_cm || null,
        style: fd?.style || (isFlash ? 'Flash' : 'Custom'),
        description: fr?.customer_note || b?.description || null,
      };

      setSelectedPaymentSub(subDetail);
    } catch (err) {
      console.error('[AdminRequestsPage] handleOpenCheckSlip error:', err);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลสลิป');
    }
  }, []);

  // Tab 1 ("คำขอจากลูกค้า"): Customer requests (Pending evaluation, WAITING_DEPOSIT, WAITING_SLIP, REJECTED)
  const customerRequests = useMemo(() => {
    return estimates.filter((e) => {
      if (e.request_type === 'DIRECT_BOOKING') return false; // Admin-created logbook entries belong to Calendar/Work Queue
      
      if (e.linked_booking) {
        const bStatus = e.linked_booking.status;
        const hasPendingSlip = Boolean(
          e.has_pending_payment_submission ||
          e.linked_booking.has_pending_payment_submission ||
          e.operational_status?.key === 'WAITING_SLIP_VERIFICATION'
        );

        // If linked booking is confirmed/active/completed AND does not have pending slip: it belongs to Work Queue tab
        if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(bStatus) && !hasPendingSlip) {
          return false;
        }
      }

      return true;
    });
  }, [estimates]);

  // Tab 2 ("คิวงาน"): Confirmed/active queue items ONLY (WAITING_DEPOSIT strictly excluded)
  const workQueueBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'WAITING_DEPOSIT' || b.status === 'PENDING' || b.status === 'APPROVED') {
        return false;
      }

      const hasPendingSlip = Boolean(
        b.has_pending_payment_submission ||
        b.pending_submission?.status === 'PENDING' ||
        b.operational_status?.key === 'WAITING_SLIP_VERIFICATION'
      );
      if (hasPendingSlip) return false;

      return ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(b.status);
    });
  }, [bookings]);

  // Delete Rejected Request Handlers
  const handleOpenDeleteModal = useCallback((item: EstimateRequestItem) => {
    const isFlash = item.request_type === 'FLASH' || Boolean(item.flash_reservation);
    const flashResId = item.flash_reservation?.id || item.id;
    const targetSourceId = isFlash ? flashResId : item.id;

    setDeleteTargetItem({
      id: targetSourceId,
      name: item.customer_name,
      refImages: item.reference_images,
      sourceType: isFlash ? 'FLASH_RESERVATION' : 'CUSTOM_REQUEST',
      sourceId: targetSourceId,
      status: item.status,
    });
  }, []);

  const handleConfirmDeleteRejected = async () => {
    if (!deleteTargetItem?.sourceId) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();

      if (deleteTargetItem.sourceType === 'FLASH_RESERVATION') {
        // 1. Verify record exists and status is REJECTED
        const { data: resData, error: fetchErr } = await supabase
          .from('flash_reservations')
          .select('id, status')
          .eq('id', deleteTargetItem.sourceId)
          .maybeSingle();

        if (fetchErr || !resData) {
          setToastMessage('รายการนี้ถูกลบไปแล้ว');
          setTimeout(() => setToastMessage(null), 4000);
          setDeleteTargetItem(null);
          setSelectedEstimate(null);
          setSelectedBooking(null);
          setRefreshTrigger((prev) => prev + 1);
          return;
        }

        if (resData.status !== 'REJECTED') {
          setToastMessage('ไม่สามารถลบได้ เนื่องจากสถานะรายการมีการเปลี่ยนแปลง');
          setTimeout(() => setToastMessage(null), 4000);
          setDeleteTargetItem(null);
          setRefreshTrigger((prev) => prev + 1);
          return;
        }

        // 2. Delete ONLY from flash_reservations table where status = 'REJECTED'
        const { error: delErr } = await supabase
          .from('flash_reservations')
          .delete()
          .eq('id', deleteTargetItem.sourceId)
          .eq('status', 'REJECTED');

        if (delErr) {
          console.error('Error deleting flash_reservation:', delErr);
          setToastMessage(delErr.message || 'เกิดข้อผิดพลาดในการลบคำขอ');
          setTimeout(() => setToastMessage(null), 4000);
          setDeleteTargetItem(null);
          return;
        }

        // Close modal and drawers immediately
        setDeleteTargetItem(null);
        setSelectedEstimate(null);
        setSelectedBooking(null);

        // Refresh request list and KPIs
        setRefreshTrigger((prev) => prev + 1);

        // Show Toast
        setToastMessage('ลบคำขอที่ปฏิเสธแล้วเรียบร้อย');
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        // CUSTOM_REQUEST (existing RPC flow)
        const { data, error } = await supabase.rpc('admin_delete_rejected_request', {
          p_request_id: deleteTargetItem.sourceId,
        });

        if (error) {
          const isNotFound = error.code === 'P0002' || error.message?.includes('not found') || error.message?.includes('Target request');
          setToastMessage(isNotFound ? 'รายการนี้ถูกลบไปแล้ว' : (error.message || 'เกิดข้อผิดพลาดในการลบคำขอ'));
          setTimeout(() => setToastMessage(null), 4000);
          setDeleteTargetItem(null);
          setSelectedEstimate(null);
          setSelectedBooking(null);
          setRefreshTrigger((prev) => prev + 1);
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
        } else {
          setToastMessage('เกิดข้อผิดพลาดในการลบคำขอ');
          setTimeout(() => setToastMessage(null), 4000);
          setDeleteTargetItem(null);
        }
      }
    } catch (err: any) {
      console.error('Exception deleting rejected request:', err);
      setToastMessage(err.message || 'เกิดข้อผิดพลาดในการลบคำขอ');
      setTimeout(() => setToastMessage(null), 4000);
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
            <span>Request & Work Queue Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            จัดการคำขอและคิวงาน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            ติดตามคำขอประเมินราคา ตรวจสอบสลิปมัดจำ และจัดการคิวนัดหมายที่ยืนยันแล้ว
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#ECE4D3] rounded-md transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
            title="รีเฟรชข้อมูลคำขอและคิวงาน"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Main 2 Top Tabs Switcher (คำขอ / คิวงาน) */}
      <div className="flex items-center border-b border-[#4A443A] gap-2">
        <button
          id="tab-btn-estimates"
          type="button"
          onClick={() => setActiveTab('estimates')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'estimates'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <FileText size={15} className={activeTab === 'estimates' ? 'text-[#9C2F2F]' : ''} />
          <span>คำขอ ({customerRequests.length})</span>
          {pendingSubmissionsCount > 0 && (
            <span className="bg-amber-600 text-[#ECE4D3] text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {pendingSubmissionsCount}
            </span>
          )}
        </button>

        <button
          id="tab-btn-bookings"
          type="button"
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'bookings'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <Calendar size={15} className={activeTab === 'bookings' ? 'text-[#9C2F2F]' : ''} />
          <span>คิวงาน ({workQueueBookings.length})</span>
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'estimates' ? (
        <EstimateRequestList
          estimates={customerRequests}
          selectedEstimate={selectedEstimate}
          onSelectEstimate={setSelectedEstimate}
          onCheckSlip={handleOpenCheckSlip}
          onDeleteRequest={handleOpenDeleteModal}
          initialFilter={estimateFilter}
        />
      ) : (
        <AdminWorkQueue embedded={true} />
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
