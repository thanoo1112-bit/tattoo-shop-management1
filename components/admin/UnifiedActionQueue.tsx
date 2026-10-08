'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatTattooSize } from '@/lib/utils/formatters';
import {
  ClipboardList,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Layers,
  ArrowRight,
  Eye,
  FileText,
  DollarSign,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import EstimateDetailPanel from '@/components/admin/requests/EstimateDetailPanel';
import BookingDetailPanel from '@/components/admin/requests/BookingDetailPanel';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';
import { resolveEstimateOperationalStatus } from '@/components/admin/requests/types';

export type UnifiedQueueTab = 'all' | 'custom' | 'payments' | 'flash';

export interface UnifiedQueueItem {
  id: string;
  type: 'custom' | 'payment' | 'flash';
  created_at: string;

  // Common metadata
  customerName: string;
  customerPhone?: string;
  artistName: string;

  // Custom request specific
  estimateData?: any;
  bookingData?: any;

  // Payment specific
  submissionData?: any;
  depositRequired?: number;
  claimedAmount?: number;

  // Flash specific
  flashData?: any;
}

function getFirstReferenceImage(est: any): string | null {
  if (!est) return null;
  const refs = est.reference_images || est.linked_booking?.reference_images || est.reference_image_url || est.reference_image;
  if (!refs) return null;
  if (Array.isArray(refs)) {
    return refs.length > 0 && typeof refs[0] === 'string' ? refs[0] : null;
  }
  if (typeof refs === 'string') {
    if (refs.startsWith('[') && refs.endsWith(']')) {
      try {
        const arr = JSON.parse(refs);
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') return arr[0];
      } catch (e) {
        // ignore
      }
    }
    return refs.trim() || null;
  }
  return null;
}

export default function UnifiedActionQueue() {
  const supabase = createClient();

  const [activeFilter, setActiveFilter] = useState<UnifiedQueueTab>('all');
  const [loading, setLoading] = useState(true);

  // Data lists
  const [items, setItems] = useState<UnifiedQueueItem[]>([]);

  // Drawers / Modals State
  const [selectedPaymentSub, setSelectedPaymentSub] = useState<any | null>(null);
  const [selectedEstimateReq, setSelectedEstimateReq] = useState<any | null>(null);
  const [selectedBookingReq, setSelectedBookingReq] = useState<any | null>(null);

  // Core Data Fetcher
  const fetchUnifiedQueue = useCallback(async (opts?: { isInitial?: boolean }) => {
    if (opts?.isInitial) {
      setLoading(true);
    }
    try {
      // 1. Fetch Artists
      const { data: artData } = await supabase.from('artists').select('id, name, nickname');
      const artMap = new Map<string, string>();
      (artData || []).forEach((a) => artMap.set(a.id, a.nickname ? `${a.name} (${a.nickname})` : a.name));

      // 2. Fetch Customers & Profiles
      const { data: custData } = await supabase
        .from('customers')
        .select('id, user_id, display_name, first_name, last_name, phone, email, eligibility_confirmed_at, profile_completed_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, medical_conditions, allergies');
      const { data: profData } = await supabase.from('profiles').select('user_id, display_name, phone, email');
      const { data: allHealthEstData } = await supabase
        .from('estimate_requests')
        .select('customer_user_id, has_medical_condition, medical_condition_note, has_allergy, allergy_note, created_at')
        .order('created_at', { ascending: false });

      const getCustomerInfo = (uid: string) => {
        const c = (custData || []).find((x) => x.user_id === uid);
        const p = (profData || []).find((x) => x.user_id === uid);
        const nameCandidate = c?.first_name
          ? `${c.first_name} ${c.last_name || ''}`.trim()
          : c?.display_name && c.display_name !== 'ลูกค้าประจำ'
          ? c.display_name
          : p?.display_name && p.display_name !== 'ลูกค้าประจำ'
          ? p.display_name
          : c?.email
          ? c.email.split('@')[0]
          : 'ลูกค้า';
        const phoneCandidate = p?.phone || c?.phone || '';
        const emailCandidate = p?.email || c?.email || '';
        const isConfirmed = c ? (c.eligibility_confirmed_at || c.profile_completed_at ? true : undefined) : undefined;

        let hasMedicalCondition: boolean | null | undefined = undefined;
        let medicalConditionNote: string | null = null;
        let hasAllergy: boolean | null | undefined = undefined;
        let allergyNote: string | null = null;

        if (c) {
          if ((c as any).has_medical_condition !== undefined && (c as any).has_medical_condition !== null) {
            hasMedicalCondition = (c as any).has_medical_condition;
            medicalConditionNote = (c as any).medical_condition_note || null;
          } else if (c.medical_conditions?.trim()) {
            hasMedicalCondition = true;
            medicalConditionNote = c.medical_conditions.trim();
          } else if (c.medical_conditions === 'ไม่มี' || c.medical_conditions === 'false') {
            hasMedicalCondition = false;
          }

          if ((c as any).has_allergy !== undefined && (c as any).has_allergy !== null) {
            hasAllergy = (c as any).has_allergy;
            allergyNote = (c as any).allergy_note || null;
          } else if (c.allergies?.trim()) {
            hasAllergy = true;
            allergyNote = c.allergies.trim();
          } else if (c.allergies === 'ไม่มี' || c.allergies === 'false') {
            hasAllergy = false;
          }
        }

        if (hasMedicalCondition === undefined) {
          const custEst = (allHealthEstData || []).find((e: any) => e.customer_user_id === uid && e.has_medical_condition !== null && e.has_medical_condition !== undefined);
          if (custEst) {
            hasMedicalCondition = custEst.has_medical_condition;
            medicalConditionNote = custEst.medical_condition_note || null;
          }
        }

        if (hasAllergy === undefined) {
          const custEst = (allHealthEstData || []).find((e: any) => e.customer_user_id === uid && e.has_allergy !== null && e.has_allergy !== undefined);
          if (custEst) {
            hasAllergy = custEst.has_allergy;
            allergyNote = custEst.allergy_note || null;
          }
        }

        return {
          name: nameCandidate,
          phone: phoneCandidate,
          email: emailCandidate,
          isConfirmed,
          hasMedicalCondition,
          medicalConditionNote,
          hasAllergy,
          allergyNote,
          rawCustomer: c,
        };
      };

      const unifiedList: UnifiedQueueItem[] = [];

      // A. Custom Tattoo Requests (estimate_requests)
      const { data: pendingEst } = await supabase
        .from('estimate_requests')
        .select('id, customer_id, customer_user_id, artist_id, placement, description, width_cm, height_cm, style_preference, style, preferred_date, preferred_time, reference_images, artwork_title, status, request_type, work_type, color_technique, quoted_price, estimated_min_price, estimated_max_price, deposit_required, estimated_duration_minutes, quote_note, quoted_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, created_at, updated_at')
        .eq('status', 'PENDING')
        .neq('request_type', 'DIRECT_BOOKING')
        .order('created_at', { ascending: false });

      if (pendingEst && pendingEst.length > 0) {
        const pendingEstIds = pendingEst.map((e: any) => e.id);
        const { data: linkedBookingsData } = await supabase
          .from('bookings')
          .select('*, artists(id, name, nickname), booking_sessions(id, session_number, start_at, end_at, status)')
          .in('estimate_request_id', pendingEstIds);

        const linkedBookingIds = (linkedBookingsData || []).map((b: any) => b.id);
        const { data: pendingSlipsData } = linkedBookingIds.length > 0
          ? await supabase
              .from('booking_payment_submissions')
              .select('id, booking_id, customer_user_id, status, claimed_amount, payment_type, slip_path, reference_no, submitted_at, reviewer_id, reviewer_note, reviewed_at, created_at')
              .in('booking_id', linkedBookingIds)
              .eq('status', 'PENDING')
          : { data: [] };

        (pendingEst || []).forEach((est: any) => {
          const custInfo = getCustomerInfo(est.customer_user_id);
          const artistObj = (artData || []).find((a: any) => a.id === est.artist_id);
          const artistFormatted = artistObj
            ? `${artistObj.name}${artistObj.nickname ? ` (${artistObj.nickname})` : ''}`
            : 'ช่างสักประจำร้าน';

          const linkedB = (linkedBookingsData || []).find((b: any) => b.estimate_request_id === est.id) || null;
          const pendingSub = linkedB
            ? (pendingSlipsData || []).find((sub: any) => sub.booking_id === linkedB.id)
            : null;
          const hasPendingSlip = Boolean(pendingSub);
          const opStatus = resolveEstimateOperationalStatus(est, linkedB, hasPendingSlip);

          unifiedList.push({
            id: est.id,
            type: 'custom',
            created_at: est.created_at,
            customerName: custInfo.name,
            customerPhone: custInfo.phone,
            artistName: artistFormatted,
            estimateData: {
              ...est,
              customer_name: custInfo.name,
              customer_phone: custInfo.phone,
              customer_email: custInfo.email,
              is_age_confirmed: custInfo.isConfirmed,
              has_medical_condition: est.has_medical_condition ?? custInfo.hasMedicalCondition,
              medical_condition_note: est.medical_condition_note || custInfo.medicalConditionNote,
              has_allergy: est.has_allergy ?? custInfo.hasAllergy,
              allergy_note: est.allergy_note || custInfo.allergyNote,
              artist_name: artistObj?.name || 'ยังไม่มอบหมายช่าง',
              artist_nickname: artistObj?.nickname || null,
              style_preference: est.style || est.style_preference || null,
              style: est.style || est.style_preference || null,
              work_type: est.work_type || null,
              color_technique: est.color_technique || null,
              quoted_price: est.quoted_price ? Number(est.quoted_price) : null,
              deposit_required: est.deposit_required ? Number(est.deposit_required) : null,
              estimated_min_price: est.estimated_min_price ? Number(est.estimated_min_price) : null,
              estimated_max_price: est.estimated_max_price ? Number(est.estimated_max_price) : null,
              linked_booking: linkedB,
              has_pending_payment_submission: hasPendingSlip,
              pending_submission: pendingSub,
              operational_status: opStatus,
            },
          });
        });
      }

      // B. Payment Reviews (booking_payment_submissions)
      const { data: pendingSubs } = await supabase
        .from('booking_payment_submissions')
        .select('id, booking_id, customer_user_id, status, claimed_amount, payment_type, slip_path, reference_no, submitted_at, reviewer_id, reviewer_note, reviewed_at, created_at')
        .eq('status', 'PENDING')
        .order('submitted_at', { ascending: false });

      if (pendingSubs && pendingSubs.length > 0) {
        const bookingIds = Array.from(new Set(pendingSubs.map((s: any) => s.booking_id)));
        const { data: rawBookings } = await supabase
          .from('bookings')
          .select('*, artists(id, name, nickname), booking_sessions(id, session_number, start_at, end_at, status), flash_reservations(*, flash_designs(*))')
          .in('id', bookingIds);

        const estIds = Array.from(new Set((rawBookings || []).map((b: any) => b.estimate_request_id).filter(Boolean)));
        const { data: rawEstimates } = estIds.length > 0
          ? await supabase.from('estimate_requests').select('*').in('id', estIds)
          : { data: [] };

        const { data: rawFinancials } = await supabase
          .from('booking_payment_summary')
          .select('booking_id, quoted_price, deposit_required, deposit_paid, final_paid, total_paid, paid_total, balance_due, payment_status')
          .in('booking_id', bookingIds);

        pendingSubs.forEach((sub: any) => {
          const b = (rawBookings || []).find((x: any) => x.id === sub.booking_id);
          const est = b?.estimate_request_id ? (rawEstimates || []).find((e: any) => e.id === b.estimate_request_id) : null;
          const fr = Array.isArray(b?.flash_reservations) ? b.flash_reservations[0] : b?.flash_reservations;
          const fd = fr?.flash_designs;
          const f = (rawFinancials || []).find((x: any) => x.booking_id === sub.booking_id);
          const custInfo = getCustomerInfo(sub.customer_user_id);
          const artistObj: any = Array.isArray(b?.artists) ? b.artists[0] : b?.artists;
          const artistFormatted = artistObj
            ? `${artistObj.name}${artistObj.nickname ? ` (${artistObj.nickname})` : ''}`
            : (b ? artMap.get(b.artist_id) || 'ช่างสักประจำร้าน' : 'ช่างสักประจำร้าน');

          const depReq = Number(f?.deposit_required ?? 500);
          const paidTotal = Number(f?.paid_total ?? 0);
          const outstanding = Math.max(0, depReq - paidTotal);

          const isFlash = Boolean(b?.flash_reservation_id || fr);
          const flashResId = fr?.id || b?.flash_reservation_id || null;
          const flashCode = flashResId ? (flashResId.toUpperCase().startsWith('FLASH-') ? flashResId : `FLASH-${flashResId.slice(0, 8).toUpperCase()}`) : null;

          const fullEstData = est ? {
            ...est,
            request_type: isFlash ? 'FLASH' : est.request_type,
            flash_reservation_id: flashResId || (est as any).flash_reservation_id,
            flash_reservation_code: flashCode || (est as any).flash_reservation_code,
            flash_reservation: fr || (est as any).flash_reservation,
            artwork_title: fd?.title || (est as any).artwork_title || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'),
            customer_name: custInfo.name,
            customer_phone: custInfo.phone,
            customer_email: custInfo.email,
            is_age_confirmed: custInfo.isConfirmed,
            artist_name: artistObj?.name || 'ยังไม่มอบหมายช่าง',
            artist_nickname: artistObj?.nickname || null,
            style_preference: fd?.style ? `Flash (${fd.style})` : (est.style || est.style_preference || null),
            style: fd?.style ? `Flash (${fd.style})` : (est.style || est.style_preference || null),
            placement: fr?.placement || est.placement || b?.placement || null,
            width_cm: fr?.width_cm ?? est.width_cm ?? b?.width_cm ?? null,
            height_cm: fr?.height_cm ?? est.height_cm ?? b?.height_cm ?? null,
            description: fr?.customer_note || est.description || b?.description || null,
            has_medical_condition: fr?.has_medical_condition !== undefined && fr?.has_medical_condition !== null ? Boolean(fr.has_medical_condition) : est.has_medical_condition,
            medical_condition_note: fr?.medical_condition_note || est.medical_condition_note || null,
            has_allergy: fr?.has_allergy !== undefined && fr?.has_allergy !== null ? Boolean(fr.has_allergy) : est.has_allergy,
            allergy_note: fr?.allergy_note || est.allergy_note || null,
            work_type: est.work_type || null,
            color_technique: est.color_technique || null,
            quoted_price: est.quoted_price ? Number(est.quoted_price) : (fd?.price ? Number(fd.price) : null),
            deposit_required: depReq,
            estimated_min_price: est.estimated_min_price ? Number(est.estimated_min_price) : null,
            estimated_max_price: est.estimated_max_price ? Number(est.estimated_max_price) : null,
            linked_booking: b ? {
              ...b,
              flash_reservation_id: flashResId,
              flash_reservation: fr,
              customer_name: custInfo.name,
              customer_phone: custInfo.phone,
              customer_email: custInfo.email,
              artist_name: artistObj?.name || 'ช่างสักประจำร้าน',
              artist_nickname: artistObj?.nickname || null,
              financial: {
                quoted_price: Number(f?.quoted_price || fd?.price || 0),
                deposit_required: depReq,
                total_paid: paidTotal,
                remaining_balance: Math.max(0, Number(f?.quoted_price || fd?.price || 0) - paidTotal),
                is_deposit_paid: paidTotal >= depReq,
                is_fully_paid: paidTotal >= Number(f?.quoted_price || fd?.price || 0),
              },
              sessions: b.booking_sessions || [],
              has_pending_payment_submission: true,
              pending_submission: sub,
            } : null,
            has_pending_payment_submission: true,
            pending_submission: sub,
            operational_status: resolveEstimateOperationalStatus(est, b, true),
          } : (b ? {
            id: b.id,
            request_type: isFlash ? 'FLASH' : 'CUSTOM',
            flash_reservation_id: flashResId,
            flash_reservation_code: flashCode,
            flash_reservation: fr,
            artwork_title: fd?.title || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'),
            created_at: b.created_at || sub.submitted_at,
            customer_user_id: sub.customer_user_id,
            customer_name: custInfo.name,
            customer_phone: custInfo.phone,
            customer_email: custInfo.email,
            is_age_confirmed: custInfo.isConfirmed,
            artist_name: artistObj?.name || 'ช่างสักประจำร้าน',
            artist_nickname: artistObj?.nickname || null,
            style_preference: fd?.style ? `Flash (${fd.style})` : (b.style_preference || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom')),
            style: fd?.style ? `Flash (${fd.style})` : (b.style_preference || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom')),
            placement: fr?.placement || b.placement || null,
            width_cm: fr?.width_cm ?? b.width_cm ?? null,
            height_cm: fr?.height_cm ?? b.height_cm ?? null,
            description: fr?.customer_note || b.description || null,
            has_medical_condition: fr?.has_medical_condition !== undefined && fr?.has_medical_condition !== null ? Boolean(fr.has_medical_condition) : (b as any).has_medical_condition,
            medical_condition_note: fr?.medical_condition_note || (b as any).medical_condition_note || null,
            has_allergy: fr?.has_allergy !== undefined && fr?.has_allergy !== null ? Boolean(fr.has_allergy) : (b as any).has_allergy,
            allergy_note: fr?.allergy_note || (b as any).allergy_note || null,
            quoted_price: Number(f?.quoted_price || fd?.price || 0),
            deposit_required: depReq,
            linked_booking: {
              ...b,
              flash_reservation_id: flashResId,
              flash_reservation: fr,
              customer_name: custInfo.name,
              customer_phone: custInfo.phone,
              customer_email: custInfo.email,
              artist_name: artistObj?.name || 'ช่างสักประจำร้าน',
              artist_nickname: artistObj?.nickname || null,
              financial: {
                quoted_price: Number(f?.quoted_price || fd?.price || 0),
                deposit_required: depReq,
                total_paid: paidTotal,
                remaining_balance: Math.max(0, Number(f?.quoted_price || fd?.price || 0) - paidTotal),
                is_deposit_paid: paidTotal >= depReq,
                is_fully_paid: paidTotal >= Number(f?.quoted_price || fd?.price || 0),
              },
              sessions: b.booking_sessions || [],
              has_pending_payment_submission: true,
              pending_submission: sub,
            },
            has_pending_payment_submission: true,
            pending_submission: sub,
            operational_status: resolveEstimateOperationalStatus({ id: b.id, status: 'CONFIRMED' } as any, b, true),
          } : null);

          unifiedList.push({
            id: sub.id,
            type: 'payment',
            created_at: sub.submitted_at,
            customerName: custInfo.name,
            customerPhone: custInfo.phone,
            artistName: artistFormatted,
            estimateData: fullEstData,
            submissionData: {
              ...sub,
              customer_name: custInfo.name,
              customer_phone: custInfo.phone,
              customer_email: custInfo.email,
              artist_name: artistFormatted,
              artist_nickname: artistObj?.nickname || null,
              flash_reservation_id: flashResId,
              flash_reservation_code: flashCode,
              artwork_title: fd?.title || b?.artwork_title || est?.style || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'),
              artwork_image_url: fd?.image_url || b?.artwork_image_url || null,
              reference_images: fd?.image_url ? [fd.image_url] : (b?.reference_images || null),
              placement: fr?.placement || b?.placement || est?.placement || null,
              width_cm: fr?.width_cm || b?.width_cm || est?.width_cm || null,
              height_cm: fr?.height_cm || b?.height_cm || est?.height_cm || null,
              style: fd?.style || est?.style || (isFlash ? 'Flash' : 'Custom'),
              description: fr?.customer_note || est?.description || b?.description || null,
              quoted_price: Number(f?.quoted_price ?? est?.quoted_price ?? fd?.price ?? 0),
              deposit_required: depReq,
              paid_total: paidTotal,
              outstanding_deposit: outstanding,
              requested_date: b?.requested_date || null,
              booking_status: b?.status || 'WAITING_DEPOSIT',
              estimate_request_id: b?.estimate_request_id || null,
              estimate_reference_images: est?.reference_images || null,
              sessions: b?.booking_sessions || [],
            },
            depositRequired: depReq,
            claimedAmount: Number(sub.claimed_amount || 0),
          });
        });
      }

      // C. Flash Booking Requests (flash_reservations)
      const { data: pendingFlash } = await supabase
        .from('flash_reservations')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (pendingFlash && pendingFlash.length > 0) {
        const flashIds = Array.from(new Set(pendingFlash.map((f: any) => f.flash_design_id)));
        const { data: rawFlashDesigns } = await supabase.from('flash_designs').select('*').in('id', flashIds);

        pendingFlash.forEach((fl: any) => {
          const design = (rawFlashDesigns || []).find((d: any) => d.id === fl.flash_design_id);
          const custInfo = getCustomerInfo(fl.customer_user_id);
          const artistNameStr = design ? artMap.get(design.artist_id) || 'ช่างสักประจำร้าน' : 'ช่างสักประจำร้าน';

          let hasMed: boolean | null | undefined = undefined;
          let medNote: string | null = null;
          let hasAll: boolean | null | undefined = undefined;
          let allNote: string | null = null;

          if (fl.has_medical_condition !== undefined && fl.has_medical_condition !== null) {
            hasMed = Boolean(fl.has_medical_condition);
            medNote = fl.medical_condition_note || null;
          } else if (fl.medical_conditions?.trim()) {
            hasMed = true;
            medNote = fl.medical_conditions.trim();
          } else if (fl.medical_conditions === 'ไม่มี' || fl.medical_conditions === 'false') {
            hasMed = false;
          }

          if (fl.has_allergy !== undefined && fl.has_allergy !== null) {
            hasAll = Boolean(fl.has_allergy);
            allNote = fl.allergy_note || null;
          } else if (fl.allergies?.trim()) {
            hasAll = true;
            allNote = fl.allergies.trim();
          } else if (fl.allergies === 'ไม่มี' || fl.allergies === 'false') {
            hasAll = false;
          }

          if (hasMed === undefined) {
            hasMed = custInfo.hasMedicalCondition;
            medNote = custInfo.medicalConditionNote;
          }
          if (hasAll === undefined) {
            hasAll = custInfo.hasAllergy;
            allNote = custInfo.allergyNote;
          }

          const flashEstData: any = {
            id: fl.id,
            created_at: fl.created_at,
            customer_user_id: fl.customer_user_id,
            customer_name: custInfo.name,
            customer_phone: custInfo.phone,
            customer_email: custInfo.email,
            is_age_confirmed: custInfo.isConfirmed,
            eligibility_confirmed_at: fl.eligibility_confirmed_at || custInfo.rawCustomer?.eligibility_confirmed_at || null,
            has_medical_condition: hasMed,
            medical_condition_note: medNote,
            has_allergy: hasAll,
            allergy_note: allNote,
            artist_id: design?.artist_id || '',
            artist_name: artistNameStr,
            style: design?.style || 'Flash',
            style_preference: design?.style || 'Flash',
            placement: fl.placement || 'ไม่ระบุ',
            width_cm: fl.width_cm || null,
            height_cm: fl.height_cm || null,
            description: fl.customer_note || '',
            preferred_date: fl.requested_date || null,
            preferred_time: fl.requested_start_time || null,
            status: fl.status || 'PENDING',
            request_type: 'FLASH',
            flash_design_id: fl.flash_design_id,
            flash_reservation: {
              ...fl,
              flash_designs: design,
              flash_design: design,
            },
            reference_images: design?.image_url ? [design.image_url] : [],
            quoted_price: Number(design?.price || 0),
            deposit_required: 500,
            operational_status: {
              key: 'PENDING',
              label: 'คำขอจอง Flash (รออนุมัติ)',
              badgeClass: 'bg-purple-950/80 text-purple-300 border border-purple-800/80',
            },
          };

          unifiedList.push({
            id: fl.id,
            type: 'flash',
            created_at: fl.created_at,
            customerName: custInfo.name,
            customerPhone: custInfo.phone,
            artistName: artistNameStr,
            estimateData: flashEstData,
            flashData: {
              ...fl,
              flash_design: design,
              customer_name: custInfo.name,
            },
          });
        });
      }

      // Sort unified items newest first
      unifiedList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(unifiedList);
    } catch (err) {
      console.error('Error fetching unified action queue:', err);
    } finally {
      if (opts?.isInitial) {
        setLoading(false);
      }
    }
  }, [supabase]);

  const isMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      fetchUnifiedQueue({ isInitial: true });
    } else {
      fetchUnifiedQueue({ isInitial: false });
    }
  }, [fetchUnifiedQueue]);

  // Counts per category
  const customCount = useMemo(() => items.filter((i) => i.type === 'custom').length, [items]);
  const paymentCount = useMemo(() => items.filter((i) => i.type === 'payment').length, [items]);
  const flashCount = useMemo(() => items.filter((i) => i.type === 'flash').length, [items]);
  const totalCount = items.length;

  // Filtered items for selected tab
  const displayedItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'custom') return items.filter((i) => i.type === 'custom');
    if (activeFilter === 'payments') return items.filter((i) => i.type === 'payment');
    if (activeFilter === 'flash') return items.filter((i) => i.type === 'flash');
    return items;
  }, [items, activeFilter]);

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full space-y-0 shadow-lg font-prompt">
      {/* SECTION HEADER */}
      <div className="p-4 sm:p-5 border-b border-studio-border bg-studio-sec/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="flex items-center space-x-2.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-studio-red animate-pulse" />
          <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
            งานที่ต้องดำเนินการ ({totalCount})
          </h2>
        </div>

        {/* Refresh & Scrollable Tabs */}
        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => fetchUnifiedQueue({ isInitial: false })}
            className="p-1.5 bg-studio-main border border-studio-border hover:border-studio-red text-studio-secondary hover:text-studio-primary rounded transition-colors shrink-0"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="flex bg-studio-main border border-studio-border rounded-[4px] p-0.5 text-xs overflow-x-auto max-w-full whitespace-nowrap scrollbar-none min-w-0 flex-1 sm:flex-initial">
            {[
              { key: 'all', label: `ทั้งหมด (${totalCount})` },
              { key: 'custom', label: `คำขอจอง (${customCount})` },
              { key: 'payments', label: `สลิปรอตรวจ (${paymentCount})` },
              { key: 'flash', label: `Flash (${flashCount})` },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveFilter(t.key as any)}
                className={`px-2.5 sm:px-3 py-1 rounded-[3px] font-medium transition-colors shrink-0 ${
                  activeFilter === t.key
                    ? 'bg-studio-red text-studio-primary font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* QUEUE BODY */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="p-12 text-center text-studio-secondary animate-pulse flex flex-col items-center justify-center space-y-2">
            <Loader2 size={20} className="animate-spin text-studio-red" />
            <span className="text-xs">กำลังโหลดงานที่ต้องดำเนินการ...</span>
          </div>
        ) : totalCount === 0 || displayedItems.length === 0 ? (
          /* EMPTY STATE */
          <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2">
            <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-sm text-studio-primary font-medium">
              {activeFilter === 'all' ? 'ไม่มีงานที่ต้องดำเนินการในขณะนี้' : 'ไม่มีรายการในหมวดหมู่นี้'}
            </p>
            <p className="text-xs text-studio-secondary max-w-sm mx-auto font-light">
              {activeFilter === 'all'
                ? 'คำขอจองคิว สลิปโอนเงินมัดจำ และการจอง Flash ทั้งหมดได้รับการตรวจสอบเรียบร้อยแล้ว'
                : 'ไม่มีรายการที่ตรงกับเงื่อนไขตัวกรองที่เลือกในขณะนี้'}
            </p>
          </div>
        ) : (
          /* UNIFIED ACTION ITEMS LIST */
          <div className="space-y-3">
            {displayedItems.map((item) => {
              // 1. CUSTOM TATTOO REQUEST ITEM
              if (item.type === 'custom') {
                const est = item.estimateData;
                const firstRefImage = getFirstReferenceImage(est);
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-studio-border hover:border-studio-red/50 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group cursor-pointer"
                    onClick={() => setSelectedEstimateReq(est)}
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Customer Reference Image Thumbnail */}
                      <div className="w-12 h-12 bg-studio-card border border-studio-border rounded overflow-hidden shrink-0">
                        <CustomerReferenceImage
                          src={firstRefImage}
                          alt={est.style || 'Custom Tattoo'}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-studio-red/15 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            คำขอจอง
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(item.created_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors">
                          งานสักสไตล์ {est.style || 'Custom'} ({formatTattooSize(est.width_cm, est.height_cm)})
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                          <span>ตำแหน่ง: {est.placement || 'ไม่ระบุ'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedEstimateReq(est)}
                        className="w-full sm:w-auto px-4 py-2 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded border border-studio-border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // 2. PAYMENT REVIEW ITEM
              if (item.type === 'payment') {
                const sub = item.submissionData;
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-amber-900/40 hover:border-amber-700/60 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group cursor-pointer"
                    onClick={() => {
                      if (item.estimateData) {
                        setSelectedEstimateReq(item.estimateData);
                      } else {
                        setSelectedPaymentSub(sub);
                      }
                    }}
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Single Slip Thumbnail */}
                      <div className="w-14 h-14 bg-studio-card border border-amber-900/50 rounded overflow-hidden shrink-0">
                        <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            สลิปรอตรวจ
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(item.created_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-amber-400 transition-colors">
                          แจ้งโอนมัดจำ: ฿{(Number(sub.claimed_amount || sub.deposit_required || 500)).toLocaleString()}
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                          <span>งาน: {sub.artwork_title || 'คิวจองสัก'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.estimateData) {
                            setSelectedEstimateReq(item.estimateData);
                          } else {
                            setSelectedPaymentSub(sub);
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-800 text-xs font-semibold rounded transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <ShieldCheck size={14} />
                        <span>ตรวจสลิป</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // 3. FLASH REQUEST ITEM
              if (item.type === 'flash') {
                const fl = item.flashData;
                const design = fl?.flash_design;
                const rawPlacement = fl?.placement || item.estimateData?.placement;
                const placementDisplay = (rawPlacement && rawPlacement.trim() && rawPlacement !== 'ไม่ระบุ')
                  ? rawPlacement.trim()
                  : 'ไม่ระบุตำแหน่ง';
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-studio-border hover:border-purple-500/50 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group cursor-pointer"
                    onClick={() => {
                      if (item.estimateData) {
                        setSelectedEstimateReq(item.estimateData);
                      }
                    }}
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-studio-card border border-studio-border rounded overflow-hidden shrink-0">
                        {design?.image_url ? (
                          <img src={design.image_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-[#181614] border border-[#38332E]/60 text-[#8C8275] p-1 text-center select-none rounded-[4px] font-prompt">
                            <ImageIcon size={16} className="text-[#A3998E]" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Flash
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(item.created_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-purple-300 transition-colors">
                          จองลาย Flash: {design?.title || 'แบบลายสัก Flash'}
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                          <span>ตำแหน่ง: {placementDisplay}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.estimateData) {
                            setSelectedEstimateReq(item.estimateData);
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded border border-studio-border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>

      {/* DRAWERS & REVIEW MODALS */}
      {selectedPaymentSub && (
        <PaymentSubmissionReviewDrawer
          isOpen={Boolean(selectedPaymentSub)}
          submission={selectedPaymentSub}
          onClose={() => setSelectedPaymentSub(null)}
          onSuccess={() => {
            setSelectedPaymentSub(null);
            fetchUnifiedQueue();
          }}
          onError={(err) => alert(err)}
        />
      )}

      {selectedEstimateReq && (
        <EstimateDetailPanel
          estimate={selectedEstimateReq}
          onClose={() => setSelectedEstimateReq(null)}
          onRefresh={() => {
            setSelectedEstimateReq(null);
            fetchUnifiedQueue();
          }}
          onCheckSlip={(bookingId) => {
            const sub = items.find((i) => i.type === 'payment' && i.submissionData?.booking_id === bookingId)?.submissionData;
            if (sub) {
              setSelectedPaymentSub(sub);
            }
          }}
        />
      )}
    </div>
  );
}
