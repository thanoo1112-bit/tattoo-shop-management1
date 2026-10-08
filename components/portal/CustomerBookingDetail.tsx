'use client';

import React, { useState } from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate, CustomerFlashReservationRecord, EstimateDateOption } from './types';
import { createClient } from '@/lib/supabase/client';
import BookingStatusBadge from './BookingStatusBadge';
import {
  X,
  Calendar,
  CalendarClock,
  Clock,
  User,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Layers,
  FileText,
  BadgeDollarSign,
  Sparkles,
  MapPin,
  Palette,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Info,
  Trash2,
} from 'lucide-react';
import { formatThaiDate, formatTimeBangkok, formatCurrency, resolveCustomerDisplayStatus, formatServiceTypeLabel, getDepositDeadlineInfo, parseFlashCustomerNote } from './portalUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import CustomerDepositPaymentSection from './CustomerDepositPaymentSection';
import CustomerEditBookingModal from './CustomerEditBookingModal';
import CustomerEditFlashModal from './CustomerEditFlashModal';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';

interface CustomerBookingDetailProps {
  item: CustomerPortalBooking | CustomerPortalEstimate | CustomerFlashReservationRecord | any;
  type: 'estimate' | 'booking' | 'flash';
  estimates?: CustomerPortalEstimate[];
  onClose: () => void;
  onRefresh?: () => void;
  onTransitionToBooking?: (estimate: CustomerPortalEstimate) => void;
}



export default function CustomerBookingDetail({
  item,
  type,
  estimates,
  onClose,
  onRefresh,
}: CustomerBookingDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [fetchedDateOptions, setFetchedDateOptions] = useState<EstimateDateOption[]>([]);

  const isBooking = type === 'booking' || Boolean((item as any)?.financial);
  const isFlash = type === 'flash' || Boolean((item as any)?.flash_reservation_id) || Boolean((item as any)?.is_flash);
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;
  const flashRes = ((item as any)?.flash_reservation || item) as CustomerFlashReservationRecord;
  const flashDesign = flashRes?.flash_design || flashRes?.flash_designs;

  // Flash note & legacy fallback parsing (scoped strictly to isFlash)
  const flashNoteParsed = React.useMemo(() => {
    if (!isFlash) return { parsedPlacement: null, parsedSizeRaw: null, cleanNote: '' };
    return parseFlashCustomerNote(flashRes?.customer_note || booking?.customer_note);
  }, [isFlash, flashRes?.customer_note, booking?.customer_note]);

  const effectiveFlashPlacement = (flashRes?.placement && flashRes.placement.trim())
    ? flashRes.placement.trim()
    : (booking?.placement || flashNoteParsed.parsedPlacement || 'ไม่ระบุ');

  const formattedFlashSize = React.useMemo(() => {
    if (!isFlash) return null;
    const w = flashRes?.width_cm ? Number(flashRes.width_cm) : (booking?.width_cm ? Number(booking.width_cm) : 0);
    const h = flashRes?.height_cm ? Number(flashRes.height_cm) : (booking?.height_cm ? Number(booking.height_cm) : 0);
    if (w > 0 && h > 0) {
      const res = formatTattooSize(w, h);
      return (res && res !== 'ไม่ระบุ') ? res : null;
    }
    if (flashNoteParsed.parsedSizeRaw) {
      const res = formatTattooSize(null, null, flashNoteParsed.parsedSizeRaw);
      return (res && res !== 'ไม่ระบุ') ? res : null;
    }
    return null;
  }, [isFlash, flashRes?.width_cm, flashRes?.height_cm, booking?.width_cm, booking?.height_cm, flashNoteParsed.parsedSizeRaw]);

  const [linkedBooking, setLinkedBooking] = React.useState<CustomerPortalBooking | null>(
    (flashRes as any)?.booking || null
  );

  React.useEffect(() => {
    let isMounted = true;
    const fetchBooking = async () => {
      if (isFlash && flashRes?.id && !((item as any)?.financial)) {
        if ((flashRes as any)?.booking) {
          setLinkedBooking((flashRes as any).booking);
        } else {
          try {
            const supabase = createClient();
            const { data: bData } = await supabase
              .from('bookings')
              .select('id, customer_user_id, artist_id, status, approved_at, quoted_price, created_at, artist:artists(id, name, nickname)')
              .eq('flash_reservation_id', flashRes.id)
              .maybeSingle();

            if (!isMounted) return;
            if (bData) {
              const { data: finData } = await supabase
                .from('booking_payment_summary')
                .select('*')
                .eq('booking_id', bData.id)
                .maybeSingle();

              const { data: subData } = await supabase
                .from('booking_payment_submissions')
                .select('id, status')
                .eq('booking_id', bData.id)
                .eq('status', 'PENDING');

              if (isMounted) {
                setLinkedBooking({
                  id: bData.id,
                  customer_user_id: bData.customer_user_id,
                  artist_id: bData.artist_id,
                  artist: (bData as any)?.artist || null,
                  estimate_request_id: null,
                  status: bData.status,
                  approved_at: bData.approved_at,
                  started_at: null,
                  completed_at: null,
                  created_at: bData.created_at,
                  requested_date: flashRes.requested_date || '',
                  requested_start_time: flashRes.requested_start_time || null,
                  customer_note: flashRes.customer_note || null,
                  admin_note: flashRes.admin_note || null,
                  sessions: [],
                  financial: {
                    booking_id: bData.id,
                    customer_user_id: bData.customer_user_id,
                    quoted_price: finData?.quoted_price ? Number(finData.quoted_price) : Number(bData.quoted_price || 10000),
                    deposit_required: finData?.deposit_required ? Number(finData.deposit_required) : 500,
                    paid_total: Number(finData?.paid_total || 0),
                    remaining_balance: finData?.remaining_balance ? Number(finData.remaining_balance) : null,
                    deposit_paid: Boolean(finData?.deposit_paid),
                    is_fully_paid: Boolean(finData?.is_fully_paid),
                  },
                  has_pending_payment_submission: Boolean(subData && subData.length > 0),
                } as unknown as CustomerPortalBooking);
              }
            }
          } catch (err) {
            console.error('Error fetching linked booking for flash:', err);
          }
        }
      }
    };
    fetchBooking();
    return () => {
      isMounted = false;
    };
  }, [isFlash, flashRes?.id, (flashRes as any)?.booking, (item as any)?.financial]);

  const effectiveBooking = (item.id && (item as any)?.financial)
    ? (item as CustomerPortalBooking)
    : (isBooking ? booking : (isFlash ? linkedBooking : null));
  const hasPendingSlip = Boolean((item as any).has_pending_payment_submission || effectiveBooking?.has_pending_payment_submission);

  let displayStatus = '';
  if (isFlash) {
    const s = (effectiveBooking?.status || flashRes?.status || '').toUpperCase();
    if (s === 'PENDING' || s === 'PENDING_REVIEW') displayStatus = 'PENDING';
    else if (s === 'WAITING_DEPOSIT' || s === 'PENDING_PAYMENT') displayStatus = hasPendingSlip ? 'SLIP_REVIEW' : 'WAITING_DEPOSIT';
    else if (s === 'SLIP_REVIEW' || s === 'VERIFICATION_PENDING') displayStatus = 'SLIP_REVIEW';
    else if (s === 'APPROVED' || s === 'CONFIRMED' || s === 'IN_PROGRESS') displayStatus = 'CONFIRMED';
    else if (s === 'COMPLETED') displayStatus = 'COMPLETED';
    else if (s === 'REJECTED') displayStatus = 'REJECTED';
    else if (s === 'CANCELLED') displayStatus = 'CANCELLED';
    else if (s === 'EXPIRED') displayStatus = 'EXPIRED';
    else displayStatus = s;
  } else {
    displayStatus = resolveCustomerDisplayStatus(item.status, hasPendingSlip);
  }

  const artistDisplayName = React.useMemo(() => {
    const formatName = (artObj: any) => {
      if (!artObj) return null;
      const obj = Array.isArray(artObj) ? artObj[0] : artObj;
      if (!obj || !obj.name) return null;
      return `${obj.name}${obj.nickname ? ` (${obj.nickname})` : ''}`;
    };

    const fdName = formatName(flashDesign?.artist) || formatName((flashDesign as any)?.artists);
    if (fdName) return fdName;

    const frFdName = formatName((flashRes as any)?.flash_design?.artist) || formatName((flashRes as any)?.flash_design?.artists);
    if (frFdName) return frFdName;

    const frName = formatName((flashRes as any)?.artist) || formatName((flashRes as any)?.artists);
    if (frName) return frName;

    const itemArtName = formatName((item as any)?.artist) || formatName((item as any)?.artists);
    if (itemArtName) return itemArtName;

    const effArtName = formatName(effectiveBooking?.artist) || formatName((effectiveBooking as any)?.artists);
    if (effArtName) return effArtName;

    const linkArtName = formatName((linkedBooking as any)?.artist) || formatName((linkedBooking as any)?.artists);
    if (linkArtName) return linkArtName;

    const bookArtName = formatName(booking?.artist) || formatName((booking as any)?.artists);
    if (bookArtName) return bookArtName;

    const directName = (item as any)?.artist_name || (booking as any)?.artist_name || (linkedBooking as any)?.artist_name || (effectiveBooking as any)?.artist_name;
    if (directName) {
      const directNick = (item as any)?.artist_nickname || (booking as any)?.artist_nickname || (linkedBooking as any)?.artist_nickname || (effectiveBooking as any)?.artist_nickname;
      return `${directName}${directNick ? ` (${directNick})` : ''}`;
    }

    return 'ช่างสักประจำร้าน';
  }, [flashDesign, flashRes, item, effectiveBooking, linkedBooking, booking]);

  // Cancel Request Handler (Soft Cancel via customer_cancel_request RPC)
  const handleConfirmCancel = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc('customer_cancel_request', {
        p_target_id: item.id,
      });

      if (rpcError) throw rpcError;
      if (data && data.success === false) {
        throw new Error(data.message || data.error || 'ไม่สามารถยกเลิกคำขอได้');
      }

      setShowCancelModal(false);
      setError('');
      onClose();

      if (onRefresh) {
        try {
          await onRefresh();
        } catch (refErr) {
          console.error('[handleConfirmCancel] onRefresh error:', refErr);
        }
      }
    } catch (err: any) {
      console.error('Error cancelling request:', err);
      const rawMsg = err?.message || '';
      let cleanMsg = 'ไม่สามารถยกเลิกคำขอได้ กรุณาลองใหม่หรือติดต่อร้าน';
      if (rawMsg.includes('อยู่ระหว่างดำเนินการ') || rawMsg.includes('ติดต่อร้าน')) {
        cleanMsg = 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว';
      } else if (rawMsg.includes('ไม่มีสิทธิ์')) {
        cleanMsg = 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้';
      }
      setError(cleanMsg);
      setShowCancelModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Soft Hide Request Handler from Customer Portal (via customer_hide_estimate_request or customer_hide_flash_reservation RPC)
  const handleConfirmHideFromPortal = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      if (isFlash) {
        const { data, error: rpcError } = await supabase.rpc('customer_hide_flash_reservation', {
          p_reservation_id: item.id,
        });
        if (rpcError) {
          const { error: directErr } = await supabase
            .from('flash_reservations')
            .update({ customer_hidden_at: new Date().toISOString() })
            .eq('id', item.id);
          if (directErr) throw rpcError;
        } else if (data && data.success === false) {
          throw new Error(data.message || data.error || 'ไม่สามารถลบออกจากประวัติได้');
        }
      } else {
        const targetEstimateId = isBooking ? (booking.estimate_request_id || item.id) : item.id;
        const { data, error: rpcError } = await supabase.rpc('customer_hide_estimate_request', {
          p_estimate_request_id: targetEstimateId,
        });
        if (rpcError) {
          const { error: directErr } = await supabase
            .from('estimate_requests')
            .update({ customer_hidden_at: new Date().toISOString() })
            .eq('id', targetEstimateId);
          if (directErr) throw rpcError;
        } else if (data && data.success === false) {
          throw new Error(data.message || data.error || 'ไม่สามารถลบออกจากประวัติได้');
        }
      }

      setShowDeleteModal(false);
      setError('');
      onClose();

      if (onRefresh) {
        try {
          await onRefresh();
        } catch (refErr) {
          console.error('[handleConfirmHideFromPortal] onRefresh error:', refErr);
        }
      }
    } catch (err: any) {
      console.error('Error hiding request from portal history:', err);
      const rawMsg = err?.message || '';
      let cleanMsg = 'ไม่สามารถลบออกจากประวัติได้ กรุณาลองใหม่หรือติดต่อร้าน';
      if (rawMsg.includes('ไม่มีสิทธิ์')) {
        cleanMsg = 'คุณไม่มีสิทธิ์ซ่อนรายการนี้';
      }
      setError(cleanMsg);
      setShowDeleteModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Date Options if proposed
  React.useEffect(() => {
    if (type === 'estimate' && estimate?.id && estimate?.is_date_proposed) {
      const supabase = createClient();
      supabase
        .from('estimate_request_date_options')
        .select('*')
        .eq('estimate_request_id', estimate.id)
        .neq('status', 'CANCELLED')
        .order('option_order', { ascending: true })
        .then(({ data, error: fetchErr }) => {
          if (!fetchErr && data && data.length > 0) {
            setFetchedDateOptions(data as EstimateDateOption[]);
            const available = data.find((o: any) => o.status === 'PENDING');
            if (available) {
              setSelectedOptionId(available.id);
            }
          }
        });
    }
  }, [type, estimate?.id, estimate?.is_date_proposed]);

  // Ensure selectedOptionId is initialized for date_options on estimate item
  React.useEffect(() => {
    if (type === 'estimate' && estimate?.is_date_proposed && !selectedOptionId) {
      const opts = fetchedDateOptions.length > 0
        ? fetchedDateOptions
        : (estimate?.date_options?.filter((o) => o.status !== 'CANCELLED') || []);
      if (opts.length > 0) {
        const available = opts.find((o) => o.status === 'PENDING');
        if (available) {
          setSelectedOptionId(available.id);
        }
      }
    }
  }, [type, estimate?.is_date_proposed, estimate?.date_options, fetchedDateOptions, selectedOptionId]);

  // Select Proposed Date Option Handler
  const handleConfirmSelectOption = async () => {
    if (!selectedOptionId) {
      setError('กรุณาเลือกวันนัดหมายที่ต้องการ');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc('customer_select_booking_date_option', {
        p_option_id: selectedOptionId,
      });

      if (rpcError) throw rpcError;

      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      console.error('Error selecting booking date option:', err);
      setError(err?.message || 'ไม่สามารถยืนยันวันนัดหมายได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelFlashReservation = async () => {
    if (!window.confirm('ท่านต้องการยกเลิกคำขอจองลาย Flash นี้ใช่หรือไม่?')) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('cancel_flash_reservation', {
        p_reservation_id: item.id,
      });

      if (rpcError) throw rpcError;

      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถยกเลิกคำขอได้');
    } finally {
      setLoading(false);
    }
  };

  const isGeneralTattoo = !isFlash;

  const hasSubmittedDepositSlip = Boolean(
    hasPendingSlip ||
    displayStatus === 'SLIP_REVIEW' ||
    displayStatus === 'CONFIRMED' ||
    displayStatus === 'IN_PROGRESS' ||
    displayStatus === 'COMPLETED' ||
    effectiveBooking?.financial?.deposit_paid ||
    ((effectiveBooking?.financial?.paid_total ?? 0) > 0) ||
    (item as any)?.financial?.deposit_paid ||
    (((item as any)?.financial?.paid_total ?? 0) > 0) ||
    (booking?.financial?.deposit_paid) ||
    (((booking?.financial?.paid_total ?? 0) > 0))
  );

  const canCustomerEdit = isGeneralTattoo
    ? (displayStatus === 'PENDING' && !hasSubmittedDepositSlip)
    : (isFlash && (displayStatus === 'PENDING' || (flashRes?.status || '').toUpperCase() === 'PENDING') && !hasSubmittedDepositSlip);

  const canCustomerCancel = !hasSubmittedDepositSlip && (
    isGeneralTattoo
      ? (displayStatus === 'PENDING' || displayStatus === 'WAITING_DEPOSIT')
      : (isFlash && (
          displayStatus === 'PENDING' ||
          displayStatus === 'WAITING_DEPOSIT' ||
          (flashRes?.status || '').toUpperCase() === 'PENDING' ||
          (flashRes?.status || '').toUpperCase() === 'WAITING_DEPOSIT'
        ))
  );

  const canDeleteRequest = item.status === 'CANCELLED' || item.status === 'REJECTED';
  const showInFlightNotice = (hasSubmittedDepositSlip || displayStatus === 'SLIP_REVIEW' || displayStatus === 'CONFIRMED' || displayStatus === 'IN_PROGRESS') && displayStatus !== 'CANCELLED' && displayStatus !== 'REJECTED' && displayStatus !== 'COMPLETED';

  // ESC keypress listener for Lightbox
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      }
    };
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxIndex]);

  // Reference Images array
  const referenceImages = isFlash
    ? (flashDesign?.image_url ? [flashDesign.image_url] : (booking.artwork_image_url ? [booking.artwork_image_url] : (booking.reference_images || [])))
    : (isBooking
        ? (booking.reference_images && booking.reference_images.length > 0
            ? booking.reference_images
            : (booking.artwork_image_url ? [booking.artwork_image_url] : []))
        : (estimate.reference_images || []));

  // Preview Image
  const previewImage = referenceImages[0] || null;

  const depositAmount = isFlash
    ? (effectiveBooking?.financial?.deposit_required ?? 500)
    : (isBooking
        ? booking.financial?.deposit_required
        : estimate.deposit_required);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-studio-main/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="relative w-full max-w-lg bg-studio-card border border-studio-border rounded-t-2xl sm:rounded-[8px] overflow-hidden flex flex-col shadow-2xl"
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 1rem)' }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 p-1.5 bg-studio-main/60 hover:bg-studio-red text-studio-primary rounded-full transition-colors duration-200"
          title="ปิด"
        >
          <X size={16} />
        </button>

        {/* Scrollable Container */}
        <div className="p-6 overflow-y-auto space-y-5 pb-8">
          {/* Header */}
          <div className="border-b border-studio-border pb-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-studio-red font-semibold block">
                  {isFlash ? 'รายละเอียดการจองลาย Flash' : (isBooking ? 'รายละเอียดคิวจองสัก' : 'รายละเอียดคำขอจองคิว')}
                </span>
                <span className="text-[10px] text-studio-muted font-mono">
                  #{item.id.slice(0, 8)}
                </span>
              </div>
              {isFlash && (
                <h3 className="text-base font-bold text-studio-primary mt-1">
                  {flashDesign?.title || booking.artwork_title || 'แบบลายสัก Flash'}
                </h3>
              )}
            </div>
            <BookingStatusBadge status={displayStatus as any} type={type === 'flash' ? 'booking' : type} />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-[10px] text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status Context Banner */}
          {item.status === 'PENDING' && (
            <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
                <Clock size={14} className="text-[#9C2F2F] animate-pulse" />
                <span>ส่งคำขอจองแล้ว (รอร้านตรวจสอบ)</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                ทางร้านได้รับคำขอจองคิวของคุณแล้ว ขณะนี้กำลังรอช่างสักตรวจสอบรายละเอียด วันที่สะดวก และจัดคิวงานให้คุณ
              </p>
            </div>
          )}

          {item.status === 'WAITING_DEPOSIT' && (
            <div className="bg-[#171512] border border-[#9C2F2F]/50 p-3.5 rounded-[6px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
                  <Wallet size={14} className="text-studio-red" />
                  <span>{hasPendingSlip ? 'ส่งหลักฐานแล้ว — รอตรวจสลิป' : 'ยืนยันคิวแล้ว — รอชำระเงินมัดจำ'}</span>
                </div>
                {depositAmount && depositAmount > 0 && (
                  <span className="text-xs font-bold text-studio-red">
                    ฿{formatCurrency(depositAmount)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                {hasPendingSlip
                  ? 'ทางร้านได้รับหลักฐานการชำระเงินมัดจำของคุณแล้ว ขณะนี้กำลังรอร้านค้าตรวจสอบสลิป'
                  : 'คำขอของคุณได้รับการยืนยันแล้ว กรุณาชำระเงินมัดจำเพื่อยืนยันและล็อกคิว'}
              </p>
            </div>
          )}

          {item.status === 'CONFIRMED' && (
            <div className="bg-[#171512] border border-emerald-800/40 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 size={14} />
                <span>ยืนยันคิวเรียบร้อยแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                คิวสักของคุณได้รับการยืนยันและลงตารางนัดหมายเรียบร้อยแล้ว
                <br />
                แนะนำให้พักผ่อนและรับประทานอาหารให้พร้อมก่อนมา แต่งกายให้สะดวกต่อบริเวณที่จะสัก
              </p>
            </div>
          )}

          {item.status === 'IN_PROGRESS' && (
            <div className="bg-[#171512] border border-[#9C2F2F]/60 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-studio-red">
                <Sparkles size={14} />
                <span>กำลังดำเนินงานสัก</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                คิวสักของคุณกำลังอยู่ในขั้นตอนการให้บริการสักที่สตูดิโอ
              </p>
            </div>
          )}

          {item.status === 'COMPLETED' && (
            <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 size={14} />
                <span>งานสักเสร็จสิ้นแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                ขอบคุณที่ไว้วางใจใช้บริการกับ 157 TATTOO Studio ดูแลรอยสักตามคำแนะนำของช่างเพื่อผลลัพธ์ที่ดีที่สุด
              </p>
            </div>
          )}

          {item.status === 'REJECTED' && (
            <div className="bg-red-950/30 border border-red-900/40 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                <AlertTriangle size={14} />
                <span>
                  {(booking.rejection_reason || estimate.quote_note || '').includes('มัดจำ')
                    ? 'ปฏิเสธ — ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด'
                    : 'ไม่สามารถรับคำขอนี้ได้'}
                </span>
              </div>
              <p className="text-[11px] text-red-300/80 leading-relaxed font-light">
                {booking.rejection_reason || estimate.quote_note || 'ขออภัย ทางร้านไม่สามารถรับคำขอจองนี้ได้เนื่องจากคิวงานเต็มหรือไม่ตรงตามเงื่อนไข'}
              </p>
            </div>
          )}

          {item.status === 'CANCELLED' && (
            <div className="bg-[#171512] border border-red-900/30 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#A89F91]">
                <X size={14} className="text-red-400" />
                <span>ยกเลิกคิวแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                รายการจองคิวนี้ถูกยกเลิกแล้ว
              </p>
            </div>
          )}

          {/* Reference Image Gallery */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-studio-secondary block">
              รูปภาพอ้างอิง {referenceImages.length > 0 ? `(${referenceImages.length} รูป)` : ''}
            </span>
            {referenceImages.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 max-w-full">
                {referenceImages.slice(0, 5).map((imgUrl, idx) => (
                  <div
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-[6px] border border-studio-border hover:border-studio-red bg-studio-main overflow-hidden shrink-0 cursor-pointer group shadow-sm transition-all"
                    title={`คลิกเพื่อดูรูปที่ ${idx + 1}`}
                  >
                    <CustomerReferenceImage
                      src={imgUrl}
                      alt={`Reference ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ZoomIn size={16} className="text-white" />
                    </div>
                    <span className="absolute bottom-1 left-1 bg-black/80 text-[9px] font-mono text-[#ECE4D3] px-1 py-0.2 rounded border border-white/10 select-none">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-studio-main border border-studio-border/60 rounded-[6px] text-center text-xs text-studio-muted italic font-light">
                ไม่มีรูปอ้างอิง
              </div>
            )}
          </div>

          {/* Core Info Specs Grid */}
          <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-3 text-xs text-studio-primary">
            <div className="flex justify-between">
              <span className="text-studio-secondary flex items-center gap-1.5">
                <User size={13} /> ช่างสัก
              </span>
              <span className="font-semibold">{artistDisplayName}</span>
            </div>

            {isBooking ? (
              <>
                {/* 2. สไตล์ลายสัก */}
                {Boolean(booking.style || (booking as any).style_preference || (booking.artwork_title && booking.artwork_title !== 'งานสัก Custom')) && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Palette size={13} /> สไตล์ลายสัก
                    </span>
                    <span className="font-semibold">
                      {booking.style || (booking as any).style_preference || booking.artwork_title}
                    </span>
                  </div>
                )}

                {/* 3. ตำแหน่งที่สัก */}
                {booking.placement && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <MapPin size={13} /> ตำแหน่งที่สัก
                    </span>
                    <span className="font-semibold">{booking.placement}</span>
                  </div>
                )}

                {/* 4. ขนาดงานสัก */}
                {booking.width_cm && booking.height_cm && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Maximize2 size={13} /> ขนาดงานสัก
                    </span>
                    <span className="font-semibold">
                      {formatTattooSize(booking.width_cm, booking.height_cm)}
                    </span>
                  </div>
                )}

                {/* Multi-Session Schedule List (Real appointment time) */}
                {booking.sessions && booking.sessions.length > 0 ? (
                  <div className="pt-2 border-t border-studio-border/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-studio-primary">
                      <span className="flex items-center gap-1 text-studio-red">
                        <Layers size={12} /> รอบการนัดหมายสัก
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {booking.sessions.map((ses) => {
                        const rawStart = formatTimeBangkok(ses.start_at).replace(/\s*น\.?\s*$/i, '').trim();
                        const startDisplay = rawStart ? `${rawStart} น.` : '-';

                        return (
                          <div
                            key={ses.id}
                            className="bg-studio-card/80 border border-studio-border/60 p-2.5 rounded-[6px] flex items-center justify-between text-[11px]"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-studio-primary flex items-center gap-1.5 text-xs">
                                <Calendar size={13} className="text-studio-red shrink-0" />
                                <span>
                                  {booking.sessions.length > 1 ? `รอบที่ ${ses.session_number} : ` : ''}
                                  {formatThaiDate(ses.start_at)} · {startDisplay}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ml-2 ${
                                ses.status === 'IN_PROGRESS'
                                  ? 'bg-studio-red/20 text-studio-red border border-studio-red/40'
                                  : ses.status === 'COMPLETED'
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                                  : 'bg-[#171512] text-[#ECE4D3] border border-[#4A443A]'
                              }`}
                            >
                              {ses.status === 'IN_PROGRESS'
                                ? 'กำลังสัก'
                                : ses.status === 'COMPLETED'
                                ? 'เสร็จสิ้น'
                                : ses.status === 'CANCELLED'
                                ? 'ยกเลิก'
                                : 'นัดหมายแล้ว'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : booking.requested_date ? (
                  <div className="pt-2 border-t border-studio-border/30 flex justify-between text-xs">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Calendar size={13} /> วันนัด
                    </span>
                    <span className="font-semibold text-studio-primary">
                      {formatThaiDate(booking.requested_date)}
                      {booking.requested_start_time
                        ? ` · ${booking.requested_start_time.slice(0, 5)} น.`
                        : ''}
                    </span>
                  </div>
                ) : null}



                {/* 4. Deposit Payment Section (QR, Slip Upload & Verification Status) */}
                {(booking.status === 'WAITING_DEPOSIT' ||
                  booking.status === 'CONFIRMED' ||
                  Boolean(booking.financial && (booking.financial.deposit_required || booking.financial.paid_total > 0))) && (
                  <div className="pt-2 border-t border-studio-border/30">
                    <CustomerDepositPaymentSection
                      booking={booking}
                      onRefresh={onRefresh}
                    />
                  </div>
                )}


              </>
            ) : isFlash ? (
              <>
                {/* 2. สไตล์ลายสัก */}
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Palette size={13} /> สไตล์ลายสัก
                  </span>
                  <span className="font-semibold">{flashDesign?.style || '-'}</span>
                </div>

                {/* 3. ตำแหน่งที่สัก */}
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <MapPin size={13} /> ตำแหน่งที่สัก
                  </span>
                  <span className="font-semibold">{effectiveFlashPlacement}</span>
                </div>

                {/* 4. ขนาดงานสัก (แสดงเฉพาะเมื่อมีข้อมูลขนาดจริง) */}
                {formattedFlashSize && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Maximize2 size={13} /> ขนาดงานสัก
                    </span>
                    <span className="font-semibold">{formattedFlashSize}</span>
                  </div>
                )}

                {/* 5. วันนัด */}
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Calendar size={13} /> วันนัด
                  </span>
                  <span className="font-semibold">
                    {flashRes?.requested_date ? formatThaiDate(flashRes.requested_date, true) : '-'}
                  </span>
                </div>

                {/* 6. เวลาเริ่ม */}
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Clock size={13} /> เวลาเริ่ม
                  </span>
                  <span className="font-semibold text-studio-primary">
                    {flashRes?.requested_start_time ? `${flashRes.requested_start_time.slice(0, 5)} น.` : '-'}
                  </span>
                </div>

                {/* 7. รายละเอียดเพิ่มเติม (แสดงเมื่อมีข้อความเหลือหลังตัด tag legacy) */}
                {flashNoteParsed.cleanNote && (
                  <div className="pt-2 border-t border-studio-border/20">
                    <span className="text-studio-secondary block mb-1">รายละเอียดเพิ่มเติม:</span>
                    <p className="text-[11px] text-studio-secondary leading-relaxed bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light whitespace-pre-wrap">
                      {flashNoteParsed.cleanNote}
                    </p>
                  </div>
                )}



                {/* 9. Deposit Payment Section (QR, Slip Upload & Verification Status for Flash) */}
                {effectiveBooking && (
                  (effectiveBooking.status === 'WAITING_DEPOSIT' ||
                   effectiveBooking.status === 'CONFIRMED' ||
                   displayStatus === 'WAITING_DEPOSIT' ||
                   displayStatus === 'SLIP_REVIEW' ||
                   Boolean(effectiveBooking.financial && (effectiveBooking.financial.deposit_required || effectiveBooking.financial.paid_total > 0)))
                ) && (
                  <div className="pt-2 border-t border-studio-border/30">
                    <CustomerDepositPaymentSection
                      booking={effectiveBooking}
                      onRefresh={onRefresh}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 2. สไตล์ลายสัก */}
                {estimate.style && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Palette size={13} /> สไตล์ลายสัก
                    </span>
                    <span className="font-semibold">{estimate.style}</span>
                  </div>
                )}

                {/* 3. ตำแหน่งที่สัก */}
                {estimate.placement && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <MapPin size={13} /> ตำแหน่งที่สัก
                    </span>
                    <span className="font-semibold">{estimate.placement}</span>
                  </div>
                )}

                {/* 4. ขนาดงานสัก */}
                {estimate.width_cm && estimate.height_cm && (
                  <div className="flex justify-between">
                    <span className="text-studio-secondary flex items-center gap-1.5">
                      <Maximize2 size={13} /> ขนาดงานสัก
                    </span>
                    <span className="font-semibold">
                      {formatTattooSize(estimate.width_cm, estimate.height_cm)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Calendar size={13} /> วันนัด
                  </span>
                  <span className="font-semibold">
                    {formatThaiDate(estimate.preferred_date, true)}
                  </span>
                </div>
                {(() => {
                  const rawTime = estimate.preferred_time || (estimate as any).preferredTime || null;
                  const { cleanNote } = parseNoteWithPreferredTime(estimate.description);
                  let preferredTimeDisplay: string | null = null;
                  if (rawTime && rawTime.trim()) {
                    const hhmm = extractHHMM(rawTime.trim()) || rawTime.trim();
                    preferredTimeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
                  }
                  return (
                    <>
                      {preferredTimeDisplay && (
                        <div className="flex justify-between">
                          <span className="text-studio-secondary flex items-center gap-1.5">
                            <Clock size={13} /> เวลาเริ่ม
                          </span>
                          <span className="font-semibold text-studio-primary">
                            {preferredTimeDisplay}
                          </span>
                        </div>
                      )}



                      {cleanNote && (
                        <div className="pt-2 border-t border-studio-border/20">
                          <span className="text-studio-secondary block mb-1">รายละเอียดเพิ่มเติม:</span>
                          <p className="text-[11px] text-studio-secondary leading-relaxed bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                            {cleanNote}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {/* Multi-Option Date Proposal Card from Artist */}
          {Boolean(estimate.is_date_proposed) && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-[8px] space-y-4 font-prompt">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                  <CalendarClock size={18} className="text-amber-400 shrink-0" />
                  <span>เลือกวันนัดหมายที่สะดวก</span>
                </div>
                <p className="text-xs text-amber-200/80">
                  ช่างสักเสนอวันนัดหมายใหม่ กรุณาเลือก 1 ตัวเลือก
                </p>
              </div>

              {estimate.proposed_artist_note && (
                <div className="bg-black/50 p-3 rounded-lg border border-amber-900/40 text-xs text-amber-200/90 leading-relaxed">
                  <span className="font-semibold text-amber-300 block mb-0.5">ข้อความจากทางร้าน:</span>
                  <p className="whitespace-pre-wrap">{estimate.proposed_artist_note}</p>
                </div>
              )}

              {/* Options Radio List */}
              {(() => {
                const effectiveOptions = fetchedDateOptions.length > 0
                  ? fetchedDateOptions
                  : (estimate.date_options && estimate.date_options.length > 0
                      ? estimate.date_options.filter((o) => o.status !== 'CANCELLED')
                      : (estimate.proposed_date
                          ? [{ id: 'legacy-1', estimate_request_id: estimate.id, proposed_date: estimate.proposed_date, proposed_time: estimate.proposed_time || '10:00', option_order: 1, status: 'PENDING' as const }]
                          : []));

                const isSingleOption = effectiveOptions.length === 1;

                return (
                  <div className="space-y-2.5">
                    <span className="text-[11px] font-semibold text-studio-secondary block">
                      {isSingleOption ? 'วันนัดหมายที่เสนอ:' : 'ตัวเลือกวันนัดหมายจากทางร้าน:'}
                    </span>

                    {effectiveOptions.map((opt, idx) => {
                      const isUnavailable = opt.status === 'UNAVAILABLE';
                      const isSelected = selectedOptionId === opt.id || isSingleOption;
                      const hhmm = extractHHMM(opt.proposed_time) || opt.proposed_time;
                      const timeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;

                      return (
                        <div
                          key={opt.id || idx}
                          onClick={() => {
                            if (!isUnavailable) setSelectedOptionId(opt.id);
                          }}
                          className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                            isUnavailable
                              ? 'bg-studio-main/40 border-studio-border/40 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-amber-950/80 border-amber-500 shadow-md text-amber-100 ring-1 ring-amber-500'
                              : 'bg-studio-card/90 border-studio-border hover:border-amber-700/60 text-studio-primary cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {!isSingleOption && (
                              <input
                                type="radio"
                                name="booking_date_option"
                                checked={isSelected}
                                disabled={isUnavailable}
                                onChange={() => setSelectedOptionId(opt.id)}
                                className="w-4 h-4 accent-amber-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            )}
                            <div className="space-y-0.5">
                              {!isSingleOption && (
                                <span className="text-xs font-bold block text-amber-300">
                                  ตัวเลือกที่ {opt.option_order || idx + 1}
                                </span>
                              )}
                              <div className="text-xs font-medium flex items-center gap-2">
                                <span>{formatThaiDate(opt.proposed_date)}</span>
                                <span className="font-mono text-amber-200">· {timeDisplay}</span>
                              </div>
                            </div>
                          </div>

                          {isUnavailable && (
                            <span className="text-[10px] bg-red-950/80 text-red-300 border border-red-800/80 px-2 py-0.5 rounded font-semibold shrink-0">
                              ตัวเลือกนี้ถูกจองไปแล้ว
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Proposal Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleConfirmSelectOption}
                  disabled={loading || !selectedOptionId}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  <span>{loading ? 'กำลังดำเนินการ...' : 'ยืนยันวันนัดหมาย'}</span>
                </button>

                {canCustomerCancel && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={loading}
                    className="py-2.5 px-4 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    ยกเลิกคำขอ
                  </button>
                )}
              </div>
            </div>
          )}

          {/* In-Flight Status Notice for General Tattoo */}
          {showInFlightNotice && (
            <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#A89F91]">
                <Info size={14} className="text-[#C9A86A] shrink-0" />
                <span>คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว</span>
              </div>
            </div>
          )}

          {/* Booking Actions: Edit, Cancel, & Delete Buttons */}
          {(canCustomerEdit || canCustomerCancel || canDeleteRequest) && !estimate?.is_date_proposed && (
            <div className="pt-3 border-t border-studio-border/30 flex flex-col sm:flex-row gap-2.5 justify-end">
              {canCustomerEdit && (
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 bg-studio-main border border-studio-border text-studio-primary hover:border-studio-red hover:text-studio-red text-xs font-bold rounded-[4px] transition-all disabled:opacity-50"
                >
                  แก้ไขคำขอ
                </button>
              )}
              {canCustomerCancel && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    if (isFlash) {
                      handleCancelFlashReservation();
                    } else {
                      setShowCancelModal(true);
                    }
                  }}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 bg-transparent border border-red-900/60 text-red-400 hover:bg-red-950/40 hover:border-red-500 text-xs font-bold rounded-[4px] transition-all disabled:opacity-50"
                >
                  {loading ? 'กำลังยกเลิกคำขอ...' : 'ยกเลิกคำขอ'}
                </button>
              )}
              {canDeleteRequest && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setShowDeleteModal(true);
                  }}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 bg-red-950/40 border border-red-800/80 text-red-400 hover:bg-red-900/60 hover:border-red-500 text-xs font-bold rounded-[4px] transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>{loading ? 'กำลังลบคำขอ...' : 'ลบคำขอ'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
          <div className="w-full max-w-md bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertTriangle size={20} />
              <h3 className="text-base font-bold text-studio-primary">ยืนยันการยกเลิกคำขอ</h3>
            </div>
            <p className="text-xs text-studio-secondary leading-relaxed font-light">
              คุณต้องการยกเลิกคำขอจองคิวนี้ใช่หรือไม่? รายการคำขอจะถูกเปลี่ยนสถานะเป็นยกเลิกและย้ายไปแสดงที่แท็บ &ldquo;ยกเลิก / ปฏิเสธ&rdquo;
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setShowCancelModal(false);
                }}
                disabled={loading}
                className="px-4 py-2 bg-studio-main border border-studio-border text-studio-secondary hover:text-studio-primary text-xs font-semibold rounded-[4px] transition-all"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-[4px] transition-all shadow-md disabled:opacity-50"
              >
                {loading ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกคำขอ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soft-Hide Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
          <div className="w-full max-w-md bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-amber-400">
              <Trash2 size={20} />
              <h3 className="text-base font-bold text-studio-primary">ลบออกจากประวัติของฉัน</h3>
            </div>
            <p className="text-xs text-studio-secondary leading-relaxed font-light">
              คุณต้องการซ่อนรายการนี้ออกจากประวัติของคุณหรือไม่? (รายการจะถูกลบออกจากหน้าจอของคุณ แต่อัดมินและช่างจะยังคงบันทึกประวัติไว้)
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setShowDeleteModal(false);
                }}
                disabled={loading}
                className="px-4 py-2 bg-studio-main border border-studio-border text-studio-secondary hover:text-studio-primary text-xs font-semibold rounded-[4px] transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmHideFromPortal}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-[4px] transition-all shadow-md disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>{loading ? 'กำลังซ่อน...' : 'ยืนยันลบออกจากประวัติ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Request Modal */}
      {showEditModal && (
        isFlash ? (
          <CustomerEditFlashModal
            item={flashRes}
            onClose={() => setShowEditModal(false)}
            onSuccess={() => {
              setShowEditModal(false);
              if (onRefresh) onRefresh();
              onClose();
            }}
          />
        ) : (
          <CustomerEditBookingModal
            item={item}
            type={type}
            onClose={() => setShowEditModal(false)}
            onSuccess={() => {
              setShowEditModal(false);
              if (onRefresh) onRefresh();
              onClose();
            }}
          />
        )
      )}

      {/* Lightbox Gallery Modal */}
      {lightboxIndex !== null && referenceImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-studio-red bg-black/60 hover:bg-black/90 border border-white/20 p-2 rounded-full transition-colors z-20"
            title="ปิด (Esc)"
          >
            <X size={20} />
          </button>

          {/* Main Image Container */}
          <div
            className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerReferenceImage
              src={referenceImages[lightboxIndex]}
              alt={`Reference View ${lightboxIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
              showSkeleton={true}
            />
          </div>

          {/* Next / Previous Controls */}
          {referenceImages.length > 1 && (
            <div
              className="flex items-center space-x-4 mt-4 text-[#ECE4D3] z-20 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev > 0 ? prev - 1 : referenceImages.length - 1) : 0
                  )
                }
                className="p-2 bg-studio-card border border-studio-border hover:border-studio-red hover:bg-studio-red text-white rounded-full transition-colors shadow-lg"
                title="รูปก่อนหน้า"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-mono font-semibold bg-studio-card px-3 py-1 rounded border border-studio-border">
                {lightboxIndex + 1} / {referenceImages.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev < referenceImages.length - 1 ? prev + 1 : 0) : 0
                  )
                }
                className="p-2 bg-studio-card border border-studio-border hover:border-studio-red hover:bg-studio-red text-white rounded-full transition-colors shadow-lg"
                title="รูปถัดไป"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
