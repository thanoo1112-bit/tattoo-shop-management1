'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistRequestDetailDrawer, { ArtistPendingEstimateDetail } from '../../../components/artist/ArtistRequestDetailDrawer';
import ArtistPaymentReviewDrawer from '../../../components/artist/ArtistPaymentReviewDrawer';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import { getTattooSizeCategory } from '@/lib/utils/tattooDuration';
import { 
  Inbox, 
  RefreshCw, 
  Eye, 
  Sparkles, 
  TriangleAlert
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  formatDateBangkok, 
  formatTimeBangkok 
} from '@/components/admin/calendar/calendarUtils';
import { getDepositDeadlineInfo } from '@/components/portal/portalUtils';

function isDepositExpired(booking?: any, estimate?: any, session?: any): boolean {
  const status = booking?.status || estimate?.status || session?.status;
  if (!status) return false;

  if (status === 'EXPIRED') return true;

  if (status === 'WAITING_DEPOSIT' || status === 'PENDING_DEPOSIT') {
    const approvedAt = booking?.approved_at || estimate?.accepted_at || estimate?.quoted_at;
    const createdAt = booking?.created_at || estimate?.created_at || session?.created_at;
    const requestedDate = booking?.requested_date || estimate?.preferred_date || (session?.start_at ? session.start_at.slice(0, 10) : null);
    const requestedStartTime = booking?.requested_start_time || estimate?.preferred_time || (session?.start_at ? session.start_at.slice(11, 19) : null);

    const dlInfo = getDepositDeadlineInfo(approvedAt, createdAt, requestedDate, requestedStartTime);
    return dlInfo?.isExpired ?? false;
  }

  return false;
}

export default function ArtistRequestsPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING_SLIP' | 'NEW' | 'WAITING_DEPOSIT' | 'REJECTED'>('ALL');
  const [allArtistRequests, setAllArtistRequests] = useState<any[]>([]);
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [flashReservationsMap, setFlashReservationsMap] = useState<Map<string, any>>(new Map());

  // Drawer States
  const [selectedPendingEstimate, setSelectedPendingEstimate] = useState<ArtistPendingEstimateDetail | null>(null);
  const [isRequestDrawerOpen, setIsRequestDrawerOpen] = useState(false);
  const [selectedPaymentReviewSub, setSelectedPaymentReviewSub] = useState<any | null>(null);
  const [activeLightboxSlipPath, setActiveLightboxSlipPath] = useState<string | null>(null);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && staffArtistId))
  );

  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isAuthorized, authLoading]);

  const fetchArtistRequests = useCallback(async () => {
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      // 1. Fetch bookings assigned to staffArtistId
      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (bErr) console.error('Error fetching bookings:', bErr);

      const dbBookings = bData || [];
      const bMap = new Map<string, any>();
      dbBookings.forEach((b: any) => bMap.set(b.id, b));
      setBookingsMap(bMap);

      // 2. Fetch linked estimate_requests
      const estimateIds = Array.from(new Set(dbBookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let dbEstimates: any[] = [];
      if (estimateIds.length > 0) {
        const { data: estData } = await supabase
          .from('estimate_requests')
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, work_type, estimated_min_price, estimated_max_price, price_estimated_at, request_type')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 3. Fetch ALL estimate_requests assigned to staffArtistId
      const { data: allEstData, error: pEstErr } = await supabase
        .from('estimate_requests')
        .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, request_type, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, work_type, proposed_date, proposed_time, proposed_price, proposed_artist_note, is_date_proposed')
        .eq('artist_id', staffArtistId)
        .order('created_at', { ascending: false });

      if (pEstErr) console.error('Error fetching estimate requests:', pEstErr);

      // 4. Fetch flash_reservations via RPC
      const { data: flashRpcData, error: fErr } = await supabase
        .rpc('artist_get_flash_reservations', { p_artist_id: staffArtistId });

      if (fErr) console.error('Error fetching flash reservations via RPC:', fErr);

      const artistFlashRes = (flashRpcData || []).map((res: any) => ({
        ...res,
        placement: res.placement,
        width_cm: res.width_cm,
        height_cm: res.height_cm,
        flash_designs: {
          id: res.flash_design_id,
          title: res.flash_design_title,
          style: res.flash_design_style,
          image_url: res.flash_design_image_url,
          price: res.flash_design_price,
          deposit_amount: res.flash_design_deposit_amount,
          width_cm: res.flash_design_width_cm || res.width_cm,
          height_cm: res.flash_design_height_cm || res.height_cm,
          artist_id: res.flash_design_artist_id,
        }
      }));

      // 5. Query pending payment submissions
      const dbBookingIds = dbBookings.map((b: any) => b.id);
      let pSubmissions: any[] = [];
      if (dbBookingIds.length > 0) {
        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        pSubmissions = subData || [];

        const flashResIds = Array.from(new Set(dbBookings.map((b: any) => b.flash_reservation_id).filter(Boolean)));
        let frMap = new Map<string, any>();
        artistFlashRes.forEach((fr: any) => { if (fr.id) frMap.set(fr.id, fr); });
        if (flashResIds.length > 0) {
          const { data: frData } = await supabase
            .from('flash_reservations')
            .select('*, flash_designs(*)')
            .in('id', flashResIds);
          (frData || []).forEach((fr: any) => {
            if (fr.id && !frMap.has(fr.id)) frMap.set(fr.id, fr);
          });
        }
        setFlashReservationsMap(frMap);
      }
      setPendingSubmissions(pSubmissions);

      // 6. Map Operational Status for Custom & Flash Requests
      const estItems = (allEstData || []).map((est: any) => {
        const linkedBooking = Array.from(bMap.values()).find((b: any) => b.estimate_request_id === est.id);
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus: 'NEW' | 'WAITING_DEPOSIT' | 'PENDING_SLIP' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'CONFIRMED' | 'OTHER' = 'NEW';

        if (est.status === 'CONFIRMED' || linkedBooking?.status === 'CONFIRMED' || linkedBooking?.status === 'IN_PROGRESS' || linkedBooking?.status === 'COMPLETED') {
          opStatus = 'CONFIRMED';
        } else if (est.status === 'EXPIRED' || linkedBooking?.status === 'EXPIRED') {
          opStatus = 'EXPIRED';
        } else if (est.status === 'CANCELLED' || linkedBooking?.status === 'CANCELLED') {
          opStatus = 'CANCELLED';
        } else if (est.status === 'REJECTED' || linkedBooking?.status === 'REJECTED') {
          opStatus = 'REJECTED';
        } else if (hasPendingSlip || est.status === 'SLIP_SUBMITTED' || est.status === 'PENDING_SLIP') {
          opStatus = 'PENDING_SLIP';
        } else if (est.status === 'PENDING') {
          opStatus = 'NEW';
        } else if (['ACCEPTED', 'QUOTED', 'APPROVED', 'WAITING_DEPOSIT', 'DEPOSIT_PENDING'].includes(est.status) || linkedBooking?.status === 'WAITING_DEPOSIT') {
          if (isDepositExpired(linkedBooking, est)) {
            opStatus = 'EXPIRED';
          } else {
            opStatus = 'WAITING_DEPOSIT';
          }
        } else {
          opStatus = 'NEW';
        }

        return {
          ...est,
          id: est.id,
          item_type: 'ESTIMATE',
          requestCode: `REQ-${est.id.slice(0, 8).toUpperCase()}`,
          derived_operational_status: opStatus,
          style_display: est.style || est.style_preference || 'งานสัก Custom',
          ref_image: est.reference_images?.[0] || null,
          date_display: est.preferred_date,
          time_display: est.preferred_time,
          placement_display: est.placement || 'ไม่ระบุตำแหน่ง',
        };
      });

      const flashItems = (artistFlashRes || []).map((res: any) => {
        const linkedBooking = Array.from(bMap.values()).find(
          (b: any) => (b.flash_reservation_id && b.flash_reservation_id === res.id) || ((b as any).flash_reservation_id && (b as any).flash_reservation_id === res.id)
        );
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus: 'NEW' | 'WAITING_DEPOSIT' | 'PENDING_SLIP' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'CONFIRMED' | 'OTHER' = 'NEW';

        if (res.status === 'CONFIRMED' || res.status === 'COMPLETED' || linkedBooking?.status === 'CONFIRMED' || linkedBooking?.status === 'COMPLETED') {
          opStatus = 'CONFIRMED';
        } else if (res.status === 'EXPIRED' || linkedBooking?.status === 'EXPIRED') {
          opStatus = 'EXPIRED';
        } else if (res.status === 'CANCELLED' || linkedBooking?.status === 'CANCELLED') {
          opStatus = 'CANCELLED';
        } else if (res.status === 'REJECTED' || linkedBooking?.status === 'REJECTED') {
          opStatus = 'REJECTED';
        } else if (hasPendingSlip || res.status === 'SLIP_SUBMITTED' || res.status === 'PENDING_SLIP') {
          opStatus = 'PENDING_SLIP';
        } else if (res.status === 'PENDING') {
          opStatus = 'NEW';
        } else if (['ACCEPTED', 'QUOTED', 'APPROVED', 'WAITING_DEPOSIT', 'DEPOSIT_PENDING'].includes(res.status) || linkedBooking?.status === 'WAITING_DEPOSIT') {
          if (isDepositExpired(linkedBooking, res)) {
            opStatus = 'EXPIRED';
          } else {
            opStatus = 'WAITING_DEPOSIT';
          }
        } else {
          opStatus = 'NEW';
        }

        const flashImgUrl = res.flash_design_image_url ?? res.flash_designs?.image_url ?? null;
        const flashTitle = res.flash_design_title ?? res.flash_designs?.title ?? null;
        const flashStyle = res.flash_design_style ?? res.flash_designs?.style ?? null;
        const flashSizeLabel = res.flash_design_size_label ?? res.flash_designs?.size_label ?? null;

        return {
          ...res,
          id: res.id,
          sourceType: 'FLASH',
          item_type: 'FLASH',
          is_flash: true,
          requestCode: `FLASH-${res.id.slice(0, 8).toUpperCase()}`,
          derived_operational_status: opStatus,
          style_display: flashStyle ?? 'Flash',
          ref_image: flashImgUrl,
          flash_image_url: flashImgUrl,
          flash_title: flashTitle,
          flash_style: flashStyle,
          flash_size_label: flashSizeLabel,
          date_display: res.requested_date,
          time_display: res.requested_start_time,
          placement_display: res.placement ?? 'ไม่ระบุตำแหน่ง',
          description: res.customer_note ?? '',
          width_cm: res.width_cm ?? null,
          height_cm: res.height_cm ?? null,
          size_label: flashSizeLabel,
          created_at: res.created_at,
          has_medical_condition: res.has_medical_condition ?? null,
          medical_condition_note: res.medical_condition_note ?? null,
          has_allergy: res.has_allergy ?? null,
          allergy_note: res.allergy_note ?? null,
        };
      });

      const combinedRequests = [...estItems, ...flashItems]
        .filter((r: any) => r.derived_operational_status !== 'CONFIRMED' && r.derived_operational_status !== 'OTHER')
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setAllArtistRequests(combinedRequests);

      // 7. Customer Profile Resolution via RPC & Customers Table
      const customerUserIds = Array.from(
        new Set([
          ...dbBookings.map((b: any) => b.customer_user_id),
          ...combinedRequests.map((e: any) => e.customer_user_id),
          ...pSubmissions.map((s: any) => s.customer_user_id)
        ].filter(Boolean))
      );

      if (customerUserIds.length > 0) {
        const { data: contactsData } = await supabase
          .rpc('artist_get_customer_contacts', { p_customer_user_ids: customerUserIds });

        const cMap = new Map<string, any>();
        const pMap = new Map<string, any>();

        (contactsData || []).forEach((c: any) => {
          if (c.user_id) {
            cMap.set(c.user_id, { user_id: c.user_id, display_name: c.display_name, phone: c.phone });
            pMap.set(c.user_id, { user_id: c.user_id, display_name: c.display_name, phone: c.phone });
          }
        });

        const { data: custRows } = await supabase
          .from('customers')
          .select('user_id, display_name, phone, email, date_of_birth')
          .in('user_id', customerUserIds);

        if (custRows) {
          custRows.forEach((c: any) => {
            if (c.user_id) {
              const existingC = cMap.get(c.user_id) || {};
              cMap.set(c.user_id, {
                ...existingC,
                ...c,
                display_name: existingC.display_name || c.display_name,
                phone: existingC.phone || c.phone,
                date_of_birth: c.date_of_birth || existingC.date_of_birth || null,
              });
            }
          });
        }

        setCustomersMap(cMap);
        setProfilesMap(pMap);
      }
    } catch (err) {
      console.error('Exception fetching artist requests:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistRequests();
    }
  }, [isAuthorized, staffArtistId, fetchArtistRequests]);

  // Compute status counts
  const statusCounts = useMemo(() => {
    let newReq = 0;
    let waitingDeposit = 0;
    let pendingSlip = pendingSubmissions.length;
    let rejected = 0;
    let expired = 0;
    let cancelled = 0;

    allArtistRequests.forEach((req) => {
      const op = req.derived_operational_status;
      if (op === 'NEW') newReq++;
      else if (op === 'WAITING_DEPOSIT') waitingDeposit++;
      else if (op === 'REJECTED') rejected++;
      else if (op === 'EXPIRED') expired++;
      else if (op === 'CANCELLED') cancelled++;
    });

    const all = pendingSlip + newReq + waitingDeposit;

    return {
      all,
      new: newReq,
      waitingDeposit,
      pendingSlip,
      rejected,
      expired,
      cancelled,
    };
  }, [allArtistRequests, pendingSubmissions]);

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'ALL') {
      return allArtistRequests.filter(
        (req) => req.derived_operational_status !== 'EXPIRED' && req.derived_operational_status !== 'CANCELLED'
      );
    }
    if (requestFilter === 'REJECTED') {
      return allArtistRequests.filter((req) => req.derived_operational_status === 'REJECTED');
    }
    return allArtistRequests.filter((req) => req.derived_operational_status === requestFilter);
  }, [allArtistRequests, requestFilter]);

  const getStatusBadgeConfig = (opStatus: string) => {
    switch (opStatus) {
      case 'NEW':
        return { label: 'รอตรวจสอบ', className: 'bg-blue-950/60 text-blue-400 border border-blue-800/60' };
      case 'WAITING_DEPOSIT':
        return { label: 'รอมัดจำ', className: 'bg-purple-950/60 text-purple-400 border border-purple-800/60' };
      case 'PENDING_SLIP':
        return { label: 'สลิปรอตรวจ', className: 'bg-amber-950/80 text-amber-300 border border-amber-800/80 animate-pulse' };
      case 'REJECTED':
        return { label: 'ปฏิเสธ', className: 'bg-red-950/50 text-red-400 border border-red-900/60' };
      case 'EXPIRED':
        return { label: 'หมดเวลาชำระมัดจำ', className: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80' };
      case 'CANCELLED':
        return { label: 'ยกเลิก', className: 'bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A]' };
      default:
        return { label: 'รอตรวจสอบ', className: 'bg-blue-950/60 text-blue-400 border border-blue-800/60' };
    }
  };

  const getCleanCustomerName = (uid?: string | null) => {
    if (!uid) return 'ลูกค้า';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ')
      ? c.display_name
      : (p?.display_name && p.display_name !== 'ลูกค้าประจำ')
      ? p.display_name
      : (c?.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : null);
    if (candidate && candidate !== 'ลูกค้าประจำ' && candidate !== 'ลูกค้า 157 TATTOO') {
      return candidate;
    }
    const emailPrefix = c?.email ? c.email.split('@')[0] : p?.email ? p.email.split('@')[0] : null;
    if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') {
      return emailPrefix;
    }
    return 'ลูกค้า (ไม่ระบุชื่อ)';
  };

  const getCustomerPhone = (uid?: string | null) => {
    if (!uid) return '';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const phone = p?.phone || c?.phone || '';
    return phone ? formatThaiPhoneForDisplay(phone) : '';
  };

  const getIsAgeConfirmed = (uid?: string | null): boolean | undefined => {
    if (!uid) return undefined;
    const c = customersMap.get(uid);
    if (c?.eligibility_confirmed_at || c?.profile_completed_at) {
      return true;
    }
    return undefined;
  };

  const handleOpenRequestDetail = (est: any) => {
    const customer = est.customer_user_id ? customersMap.get(est.customer_user_id) : null;
    const prof = est.customer_user_id ? profilesMap.get(est.customer_user_id) : null;
    const isFlash = Boolean(est.is_flash || est.item_type === 'FLASH' || est.sourceType === 'FLASH' || est.flash_design_id);

    const detail: ArtistPendingEstimateDetail = {
      id: est.id,
      customer_user_id: est.customer_user_id,
      customer_name: getCleanCustomerName(est.customer_user_id),
      customer_phone: customer?.phone ?? prof?.phone ?? null,
      customer_email: prof?.email ?? customer?.email ?? null,
      customer_dob: customer?.date_of_birth ?? prof?.date_of_birth ?? (est as any).date_of_birth ?? null,
      date_of_birth: customer?.date_of_birth ?? prof?.date_of_birth ?? (est as any).date_of_birth ?? null,
      is_age_confirmed: getIsAgeConfirmed(est.customer_user_id),
      artist_id: est.artist_id ?? est.flash_design_artist_id ?? est.flash_designs?.artist_id ?? null,
      artist_name: staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน',
      placement: est.placement ?? est.placement_display ?? null,
      description: est.customer_note ?? est.description ?? null,
      width_cm: est.width_cm ?? null,
      height_cm: est.height_cm ?? null,
      style_preference: est.flash_design_style ?? est.flash_designs?.style ?? est.style ?? est.style_preference ?? null,
      preferred_date: est.requested_date ?? est.preferred_date ?? null,
      preferred_time: est.requested_start_time ?? est.preferred_time ?? null,
      reference_images: est.reference_images ?? null,
      flash_image_url: est.flash_design_image_url ?? est.flash_designs?.image_url ?? est.flash_image_url ?? null,
      flash_title: est.flash_design_title ?? est.flash_designs?.title ?? est.flash_title ?? null,
      flash_size_label: est.flash_design_size_label ?? est.flash_designs?.size_label ?? est.size_label ?? null,
      has_medical_condition: est.has_medical_condition ?? (customer as any)?.has_medical_condition ?? null,
      medical_condition_note: est.medical_condition_note ?? (customer as any)?.medical_condition_note ?? null,
      has_allergy: est.has_allergy ?? (customer as any)?.has_allergy ?? null,
      allergy_note: est.allergy_note ?? (customer as any)?.allergy_note ?? null,
      proposed_date: est.proposed_date ?? null,
      proposed_time: est.proposed_time ?? null,
      proposed_price: est.proposed_price ?? null,
      proposed_artist_note: est.proposed_artist_note ?? null,
      is_date_proposed: est.is_date_proposed ?? false,
      quoted_price: est.quoted_price ?? null,
      status: est.status,
      created_at: est.created_at,
      is_flash: isFlash,
      sourceType: isFlash ? 'FLASH' : 'CUSTOM',
    };

    setSelectedPendingEstimate(detail);
    setIsRequestDrawerOpen(true);
  };

  if (authLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt">
        <span className="text-xs text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</span>
      </div>
    );
  }

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';

  return (
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col md:pl-64 pb-20 md:pb-10">
      <ArtistHeader />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-studio-red-bright uppercase tracking-wider font-semibold">
                งานของฉัน
              </span>
              <span className="text-studio-muted text-xs">•</span>
              <span className="text-xs text-studio-secondary">
                คำขอประเมินราคา & จองคิว
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary mt-1">
              คำขอจากลูกค้า
            </h1>
          </div>

          <button
            onClick={() => fetchArtistRequests()}
            disabled={loading}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-studio-red-bright' : ''} />
            <span>อัปเดตข้อมูล</span>
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-studio-border/60 pb-3">
          {[
            { id: 'ALL', label: `ทั้งหมด (${statusCounts.all})` },
            { id: 'NEW', label: `รอตรวจสอบ (${statusCounts.new})` },
            { id: 'WAITING_DEPOSIT', label: `รอมัดจำ (${statusCounts.waitingDeposit})` },
            { id: 'PENDING_SLIP', label: `สลิปรอตรวจ (${statusCounts.pendingSlip})` },
            { id: 'REJECTED', label: `ปฏิเสธ (${statusCounts.rejected})` },
          ].map((tab) => {
            const isActive = requestFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRequestFilter(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow-xs'
                    : 'bg-studio-card hover:bg-studio-sec text-studio-secondary hover:text-studio-primary border-studio-border'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="p-8 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
            กำลังโหลดรายการคำขอ...
          </div>
        ) : (
          (() => {
            const showPendingSlips = requestFilter === 'ALL' || requestFilter === 'PENDING_SLIP';
            const showRequests = requestFilter !== 'PENDING_SLIP';
            const requestsToRender = showRequests
              ? filteredRequests.filter((req) => req.derived_operational_status !== 'PENDING_SLIP')
              : [];

            const totalCountToRender = (showPendingSlips ? pendingSubmissions.length : 0) + requestsToRender.length;

            if (totalCountToRender === 0) {
              return (
                <div className="p-6 sm:p-8 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                    <Inbox size={18} />
                  </div>
                  <p className="text-sm font-medium text-studio-primary">ไม่มีรายการคำขอในหมวดหมู่นี้</p>
                  <p className="text-xs text-studio-muted">
                    รายการคำขอจากลูกค้าตามสถานะที่เลือกจะปรากฏในส่วนนี้
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-studio-border bg-studio-card shadow-md">
                  <table className="w-full text-left text-xs font-prompt text-studio-primary">
                    <thead className="bg-studio-sec/80 text-studio-muted uppercase text-[10px] tracking-wider border-b border-studio-border">
                      <tr>
                        <th className="py-3 px-4 font-semibold">รหัส / ลูกค้า</th>
                        <th className="py-3 px-4 font-semibold">งานและขนาด</th>
                        <th className="py-3 px-4 font-semibold">สไตล์</th>
                        <th className="py-3 px-4 font-semibold">วันและเวลานัด</th>
                        <th className="py-3 px-4 font-semibold text-center font-prompt">ข้อมูลสุขภาพ</th>
                        <th className="py-3 px-4 font-semibold">ยื่นคำขอเมื่อ</th>
                        <th className="py-3 px-4 font-semibold text-center">สถานะ</th>
                        <th className="py-3 px-4 font-semibold text-center">ดูรายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-studio-border/50">
                      {/* Pending Slips */}
                      {showPendingSlips &&
                        pendingSubmissions.map((sub: any) => {
                          const booking = bookingsMap.get(sub.booking_id);
                          const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                          const customerName = getCleanCustomerName(sub.customer_user_id);
                          const customerPhone = getCustomerPhone(sub.customer_user_id);
                          const isFlashSub = Boolean(booking?.flash_reservation_id || (estimate as any)?.request_type === 'FLASH');
                          const rawSubStyle = (
                            (booking as any)?.style ||
                            (booking as any)?.style_preference ||
                            (estimate as any)?.style ||
                            (estimate as any)?.style_preference ||
                            ''
                          );
                          const cleanStyle = rawSubStyle.replace(/\s*custom\s*/gi, '').trim();
                          const baseTitle = isFlashSub ? 'ลาย Flash' : 'งานสัก';
                          const tattooTitle = cleanStyle
                            ? (cleanStyle.toLowerCase() === baseTitle.toLowerCase() ? baseTitle : `${baseTitle} (${cleanStyle})`)
                            : (booking?.artwork_title?.replace(/\s*custom\s*/gi, '').trim() || baseTitle);

                          const depositRequired = Number(booking?.deposit_required ?? estimate?.deposit_required ?? 0);
                          const claimedAmount = Number(sub.claimed_amount || 0);
                          const isAgeConfirmed = getIsAgeConfirmed(sub.customer_user_id);
                          const hasHealthData = Boolean((estimate as any)?.has_medical_condition || (estimate as any)?.has_allergy);

                          return (
                            <tr key={`SLIP-ROW-${sub.id}`} className="hover:bg-studio-sec/40 transition-colors">
                              <td className="py-3 px-4">
                                <span className="text-[10px] text-[#7A7265] font-mono font-semibold block">
                                  #{sub.id.slice(0, 8).toUpperCase()}
                                </span>
                                <div className="font-semibold text-studio-primary mt-0.5">{customerName}</div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-10 h-10 bg-studio-sec border border-amber-900/50 rounded-lg overflow-hidden shrink-0">
                                    <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="font-medium text-studio-primary">{tattooTitle}</div>
                                    <div className="text-[11px] text-amber-400 font-semibold">
                                      โอนมัดจำ: ฿{(claimedAmount || depositRequired || 500).toLocaleString('th-TH')}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-4 text-[#A89F91]">
                                <div className="font-medium text-xs text-[#ECE4D3]">
                                  {cleanStyle || (isFlashSub ? 'Flash' : 'ไม่ระบุสไตล์')}
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-mono text-studio-primary">
                                  {booking?.booking_date ? formatDateBangkok(booking.booking_date) : (booking?.requested_date ? formatDateBangkok(booking.requested_date) : 'ไม่ระบุวัน')}
                                </div>
                                {booking?.requested_start_time && (
                                  <div className="text-[11px] text-studio-muted font-mono">
                                    {extractHHMM(booking.requested_start_time)} น.
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-4 text-center">
                                {hasHealthData ? (
                                  <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
                                    <TriangleAlert size={10} /> มีข้อมูล
                                  </span>
                                ) : isAgeConfirmed ? (
                                  <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium">
                                    ยืนยันอายุแล้ว
                                  </span>
                                ) : (
                                  <span className="bg-studio-sec text-studio-muted border border-studio-border px-2 py-0.5 rounded text-[10px] font-medium">
                                    รอตรวจสอบ
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-mono text-studio-primary">
                                  {sub.submitted_at ? formatDateBangkok(sub.submitted_at) : (sub.created_at ? formatDateBangkok(sub.created_at) : '-')}
                                </div>
                                {(sub.submitted_at || sub.created_at) && (
                                  <div className="text-[11px] text-studio-muted font-mono">
                                    {formatTimeBangkok(sub.submitted_at || sub.created_at)}
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-4 text-center">
                                <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-medium inline-flex items-center">
                                  สลิปรอตรวจ
                                </span>
                              </td>

                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                                    const enrichedBooking = booking ? { ...booking, flash_reservation: flashRes } : booking;
                                    setSelectedPaymentReviewSub({ sub, booking: enrichedBooking, estimate, customerName, customerPhone, depositRequired });
                                  }}
                                  className="px-3 py-1.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border text-xs font-semibold rounded-lg transition-colors inline-flex items-center space-x-1 cursor-pointer shadow-xs"
                                >
                                  <Eye size={13} />
                                  <span>ดูรายละเอียด</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                      {/* Customer Requests */}
                      {requestsToRender.map((item: any) => {
                        const customerName = getCleanCustomerName(item.customer_user_id);
                        const requestCode = item.requestCode || `REQ-${item.id.slice(0, 8).toUpperCase()}`;
                        const statusBadge = getStatusBadgeConfig(item.derived_operational_status);
                        const refImageSrc = item.ref_image || item.reference_images?.[0] || item.flash_designs?.image_url || null;
                        const isFlash = Boolean(item.is_flash || item.item_type === 'FLASH' || item.sourceType === 'FLASH' || item.flash_design_id);
                        const isInactive = ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(item.derived_operational_status);
                        const sizeCategory = getTattooSizeCategory(item.estimated_size_tier, item.width_cm, item.height_cm, item.size_text);
                        const rawSizeText = item.estimated_size_tier || item.size_tier || item.size_text || (sizeCategory ? `Size ${sizeCategory}` : null);
                        const sizeDisplay = (item.width_cm || item.height_cm || item.estimated_size_tier || item.size_text || sizeCategory)
                          ? formatTattooSize(item.width_cm, item.height_cm, rawSizeText)
                          : null;
                        const { extractedTime } = parseNoteWithPreferredTime(item.description);
                        const rawTime = item.time_display ? extractHHMM(item.time_display) : item.preferred_time ? extractHHMM(item.preferred_time) : extractedTime;
                        const formattedTime = rawTime ? (rawTime.endsWith('น.') || rawTime.endsWith('น') ? rawTime : `${rawTime} น.`) : null;
                        const targetDate = item.date_display || item.preferred_date || item.requested_date;

                        const rawWorkTitle = isFlash
                          ? (item.flash_title || item.flash_designs?.title || item.title || item.artwork_title || 'ลาย Flash')
                          : (item.artwork_title || item.title || 'งานสัก');
                        const workTitle = rawWorkTitle.replace(/\s*custom\s*/gi, '').trim() || (isFlash ? 'ลาย Flash' : 'งานสัก');
                        const rawStyle = isFlash
                          ? (item.flash_style || item.flash_designs?.style || item.style || item.style_preference || '')
                          : (item.style || item.style_preference || item.style_display || '');
                        const styleName = rawStyle.toLowerCase() === 'custom' ? '' : rawStyle;
                        const placement = item.placement || 'ไม่ระบุตำแหน่ง';
                        const isAgeConfirmed = getIsAgeConfirmed(item.customer_user_id);
                        const hasHealthData = Boolean(item.has_medical_condition || item.has_allergy);

                        return (
                          <tr
                            key={`${item.item_type || 'REQ'}-${item.id}`}
                            className={
                              isInactive
                                ? "bg-zinc-950/40 text-zinc-400 opacity-80 hover:bg-zinc-900/50 transition-colors"
                                : "hover:bg-studio-sec/40 transition-colors"
                            }
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[10px] text-[#7A7265] font-mono font-semibold">
                                  #{item.id.slice(0, 8).toUpperCase()}
                                </span>
                                {isFlash && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium inline-flex items-center gap-0.5">
                                    <Sparkles size={9} /> Flash
                                  </span>
                                )}
                              </div>
                              <div className={isInactive ? "font-semibold text-zinc-300 mt-0.5" : "font-semibold text-studio-primary mt-0.5"}>
                                {customerName}
                              </div>
                            </td>

                            <td className="py-3 px-4 max-w-[220px]">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-studio-border/80 bg-studio-sec flex items-center justify-center relative shadow-xs">
                                  <CustomerReferenceImage
                                    src={refImageSrc}
                                    alt="งานสักอ้างอิง"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                  <div className={isInactive ? "font-medium text-zinc-300 truncate" : "font-medium text-studio-primary truncate"}>
                                    {workTitle}
                                  </div>
                                  <div className="text-[11px] text-[#A89F91] truncate max-w-[180px]">
                                    {placement !== 'ไม่ระบุตำแหน่ง'
                                      ? (sizeDisplay && sizeDisplay !== 'ไม่ระบุขนาด' ? `${placement} · ${sizeDisplay}` : placement)
                                      : (sizeDisplay && sizeDisplay !== 'ไม่ระบุขนาด' ? sizeDisplay : 'ไม่ระบุตำแหน่ง')}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-[#A89F91]">
                              <div className="font-medium text-xs text-[#ECE4D3]">
                                {styleName || (isFlash ? 'Flash' : 'ไม่ระบุสไตล์')}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className={`font-mono ${isInactive ? 'text-zinc-300' : 'text-studio-primary'}`}>
                                {targetDate ? formatDateBangkok(targetDate) : 'ไม่ระบุวัน'}
                              </div>
                              {formattedTime && (
                                <div className="text-[11px] text-studio-muted font-mono">{formattedTime}</div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center">
                              {hasHealthData ? (
                                <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
                                  <TriangleAlert size={10} /> มีข้อมูล
                                </span>
                              ) : isAgeConfirmed ? (
                                <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium">
                                  ยืนยันอายุแล้ว
                                </span>
                              ) : (
                                <span className="bg-studio-sec text-studio-muted border border-studio-border px-2 py-0.5 rounded text-[10px] font-medium">
                                  รอตรวจสอบ
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-mono text-studio-primary">
                                {item.created_at ? formatDateBangkok(item.created_at) : (item.submitted_at ? formatDateBangkok(item.submitted_at) : '-')}
                              </div>
                              {(item.created_at || item.submitted_at) && (
                                <div className="text-[11px] text-studio-muted font-mono">
                                  {formatTimeBangkok(item.created_at || item.submitted_at)}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded border font-medium inline-flex items-center ${statusBadge.className}`}>
                                {statusBadge.label}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenRequestDetail(item.rawItem || item)}
                                className="px-3 py-1.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border text-xs font-semibold rounded-lg transition-colors inline-flex items-center space-x-1 cursor-pointer shadow-xs"
                              >
                                <Eye size={13} />
                                <span>ดูรายละเอียด</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="grid grid-cols-1 gap-3.5 md:hidden font-prompt">
                  {showPendingSlips &&
                    pendingSubmissions.map((sub: any) => {
                      const booking = bookingsMap.get(sub.booking_id);
                      const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                      const customerName = getCleanCustomerName(sub.customer_user_id);
                      const customerPhone = getCustomerPhone(sub.customer_user_id);
                      const depositRequired = Number(booking?.deposit_required ?? estimate?.deposit_required ?? 0);
                      const claimedAmount = Number(sub.claimed_amount || 0);

                      return (
                        <div
                          key={`SLIP-MOB-${sub.id}`}
                          className="bg-studio-card border border-amber-900/40 p-4 rounded-xl flex flex-col justify-between gap-4 shadow-md font-prompt"
                        >
                          <div className="flex items-start space-x-3.5 w-full">
                            <div className="w-14 h-14 bg-studio-sec border border-amber-900/50 rounded-lg overflow-hidden shrink-0">
                              <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                            </div>
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-medium inline-flex items-center">
                                  สลิปรอตรวจ
                                </span>
                                <span className="text-[10px] text-studio-muted font-mono">#{sub.id.slice(0, 8)}</span>
                              </div>
                              <h4 className="text-sm font-semibold text-studio-primary">
                                แจ้งโอนมัดจำ: ฿{(claimedAmount || depositRequired || 500).toLocaleString('th-TH')}
                              </h4>
                              <div className="text-xs text-studio-secondary">
                                ลูกค้า: <strong className="text-studio-primary">{customerName}</strong>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                              const enrichedBooking = booking ? { ...booking, flash_reservation: flashRes } : booking;
                              setSelectedPaymentReviewSub({ sub, booking: enrichedBooking, estimate, customerName, customerPhone, depositRequired });
                            }}
                            className="w-full px-4 py-2 bg-studio-sec text-studio-primary border border-studio-border text-xs font-semibold rounded-lg flex items-center justify-center space-x-1"
                          >
                            <Eye size={14} />
                            <span>ดูรายละเอียด</span>
                          </button>
                        </div>
                      );
                    })}

                  {requestsToRender.map((item: any) => {
                    const customerName = getCleanCustomerName(item.customer_user_id);
                    const statusBadge = getStatusBadgeConfig(item.derived_operational_status);
                    const refImageSrc = item.ref_image || item.reference_images?.[0] || item.flash_designs?.image_url || null;
                    const isFlash = Boolean(item.is_flash || item.item_type === 'FLASH' || item.sourceType === 'FLASH' || item.flash_design_id);
                    const isInactive = ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(item.derived_operational_status);
                    const sizeCategory = getTattooSizeCategory(item.estimated_size_tier, item.width_cm, item.height_cm, item.size_text);
                    const rawSizeText = item.estimated_size_tier || item.size_tier || item.size_text || (sizeCategory ? `Size ${sizeCategory}` : null);
                    const sizeDisplay = (item.width_cm || item.height_cm || item.estimated_size_tier || item.size_text || sizeCategory)
                      ? formatTattooSize(item.width_cm, item.height_cm, rawSizeText)
                      : null;
                    const targetDate = item.date_display || item.preferred_date || item.requested_date;

                    const rawWorkTitle = isFlash
                      ? (item.flash_title || item.flash_designs?.title || item.title || item.artwork_title || 'ลาย Flash')
                      : (item.artwork_title || item.title || 'งานสัก');
                    const workTitle = rawWorkTitle.replace(/\s*custom\s*/gi, '').trim() || (isFlash ? 'ลาย Flash' : 'งานสัก');
                    const rawStyle = isFlash
                      ? (item.flash_style || item.flash_designs?.style || item.style || item.style_preference || '')
                      : (item.style || item.style_preference || item.style_display || '');
                    const styleName = rawStyle.toLowerCase() === 'custom' ? '' : rawStyle;
                    const placement = item.placement || 'ไม่ระบุตำแหน่ง';

                    const placementAndSize = placement !== 'ไม่ระบุตำแหน่ง'
                      ? (sizeDisplay && sizeDisplay !== 'ไม่ระบุขนาด' ? `${placement} · ${sizeDisplay}` : placement)
                      : (sizeDisplay && sizeDisplay !== 'ไม่ระบุขนาด' ? sizeDisplay : 'ไม่ระบุตำแหน่ง');

                    return (
                      <div
                        key={`MOB-${item.item_type || 'REQ'}-${item.id}`}
                        className={
                          isInactive
                            ? "bg-zinc-950/40 border border-zinc-800/80 p-3.5 rounded-xl shadow-xs flex flex-col justify-between gap-3.5 font-prompt opacity-85"
                            : "bg-studio-card border border-studio-border p-3.5 rounded-xl shadow-md flex flex-col justify-between gap-3.5 font-prompt"
                        }
                      >
                        <div className="flex items-center gap-3.5 min-w-0 w-full">
                          <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-studio-border/80 bg-studio-sec flex items-center justify-center relative">
                            <CustomerReferenceImage src={refImageSrc} alt="งานสักอ้างอิง" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className="text-[10px] font-mono text-[#7A7265] font-semibold">
                                #{item.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded border font-medium inline-flex items-center ${statusBadge.className}`}>
                                {statusBadge.label}
                              </span>
                              {isFlash && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium inline-flex items-center gap-0.5">
                                  <Sparkles size={9} /> Flash
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-semibold text-studio-primary truncate">{customerName}</h4>
                            <div className="text-xs text-[#A89F91] truncate">
                              {workTitle} · {placementAndSize}
                            </div>
                            <div className="text-[11px] text-[#7A7265] truncate">
                              วันสะดวก: {targetDate ? formatDateBangkok(targetDate) : 'ไม่ระบุ'} • สไตล์: <span className="text-[#A89F91]">{styleName || (isFlash ? 'Flash' : 'ไม่ระบุสไตล์')}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenRequestDetail(item.rawItem || item)}
                          className="w-full px-4 py-2 bg-studio-sec text-studio-primary border border-studio-border text-xs font-semibold rounded-lg flex items-center justify-center space-x-1"
                        >
                          <Eye size={14} />
                          <span>ดูรายละเอียด</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </main>

      <ArtistMobileNav />

      {/* Drawers & Modals */}
      <ArtistRequestDetailDrawer
        isOpen={isRequestDrawerOpen}
        onClose={() => setIsRequestDrawerOpen(false)}
        estimate={selectedPendingEstimate}
        onSuccess={() => fetchArtistRequests()}
      />

      {selectedPaymentReviewSub && (
        <ArtistPaymentReviewDrawer
          isOpen={Boolean(selectedPaymentReviewSub)}
          onClose={() => setSelectedPaymentReviewSub(null)}
          submission={selectedPaymentReviewSub.sub}
          booking={selectedPaymentReviewSub.booking}
          estimate={selectedPaymentReviewSub.estimate}
          customerName={selectedPaymentReviewSub.customerName}
          customerPhone={selectedPaymentReviewSub.customerPhone}
          depositRequired={selectedPaymentReviewSub.depositRequired}
        />
      )}

      <PaymentSlipLightbox
        isOpen={Boolean(activeLightboxSlipPath)}
        src={activeLightboxSlipPath}
        onClose={() => setActiveLightboxSlipPath(null)}
      />
    </div>
  );
}
