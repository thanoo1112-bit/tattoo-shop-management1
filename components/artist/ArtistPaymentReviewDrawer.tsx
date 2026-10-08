'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileText,
  CreditCard,
  Image as ImageIcon,
  Maximize2,
  Eye,
  Ban,
  RefreshCw,
  Send,
  AlertTriangle,
} from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import { formatTattooSize } from '@/lib/utils/formatters';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';
import { createClient } from '@/lib/supabase/client';

interface ArtistPaymentReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submission: any;
  booking: any;
  estimate: any;
  customerName: string;
  customerPhone: string;
  depositRequired: number;
}

export default function ArtistPaymentReviewDrawer({
  isOpen,
  onClose,
  submission,
  booking,
  estimate,
  customerName,
  customerPhone,
  depositRequired,
}: ArtistPaymentReviewDrawerProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Health / Age confirmation state
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');

  // Hydrated full customer details
  const [customerDetails, setCustomerDetails] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    dob?: string | null;
    age?: number | null;
    hasMedicalCondition?: boolean | null;
    medicalConditionNote?: string;
    hasAllergy?: boolean | null;
    allergyNote?: string;
    extraHealthNotes?: string;
  } | null>(null);

  // Hydrated Flash reservation details (if Flash deposit)
  const [flashDetails, setFlashDetails] = useState<any>(null);

  // Action states
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Rejection dialog toggle inside footer
  const [isRejectMode, setIsRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const customerUserId = estimate?.customer_user_id || booking?.customer_user_id || submission?.customer_user_id;

  // Hydrate full customer profile & health disclosures
  useEffect(() => {
    if (!isOpen || !submission) return;

    let isMounted = true;
    const cUid = customerUserId;
    const cId = booking?.customer_id || estimate?.customer_id;
    const estId = booking?.estimate_request_id || submission?.estimate_request_id || estimate?.id;
    const flashResId = booking?.flash_reservation_id || submission?.flash_reservation_id;

    const supabase = createClient();

    async function loadCustomerData() {
      try {
        // 1. Fetch customer master row
        let custData: any = null;
        if (cId) {
          const { data: c } = await supabase.from('customers').select('*').eq('id', cId).maybeSingle();
          custData = c;
        }
        if (!custData && cUid) {
          const { data: c } = await supabase.from('customers').select('*').eq('user_id', cUid).maybeSingle();
          custData = c;
        }

        // 2. Fetch profile row
        let profData: any = null;
        if (cUid) {
          const { data: p } = await supabase.from('profiles').select('*').eq('user_id', cUid).maybeSingle();
          profData = p;
        }

        // 3. Fetch estimate_requests row for health disclosure flags
        let estData: any = estimate;
        if (estId && (!estData || estData.has_medical_condition === undefined)) {
          const { data: e } = await supabase.from('estimate_requests').select('*').eq('id', estId).maybeSingle();
          if (e) estData = e;
        }

        // 4. Fetch flash_reservations row with flash_designs if Flash request
        let flashData: any = null;
        if (flashResId) {
          if (booking?.flash_reservation) {
            flashData = booking.flash_reservation;
            if (isMounted) setFlashDetails(booking.flash_reservation);
          } else {
            try {
              const artistId = booking?.artist_id || booking?.staff_artist_id;
              if (artistId) {
                const { data: rpcRes } = await supabase.rpc('artist_get_flash_reservations', { p_artist_id: artistId });
                const targetFr = (rpcRes || []).find((r: any) => r.id === flashResId);
                if (targetFr) {
                  flashData = {
                    ...targetFr,
                    flash_designs: {
                      id: targetFr.flash_design_id,
                      title: targetFr.flash_design_title,
                      style: targetFr.flash_design_style,
                      image_url: targetFr.flash_design_image_url,
                      price: targetFr.flash_design_price,
                      deposit_amount: targetFr.flash_design_deposit_amount,
                      size_label: targetFr.flash_design_size_label,
                    }
                  };
                  if (isMounted) setFlashDetails(flashData);
                }
              }
            } catch (e) {
              console.error('Error fetching flash_reservations via RPC in drawer:', e);
            }

            if (!flashData) {
              const { data: f } = await supabase
                .from('flash_reservations')
                .select('*, flash_designs(*)')
                .eq('id', flashResId)
                .maybeSingle();
              if (f) {
                flashData = f;
                if (isMounted) setFlashDetails(f);
              }
            }
          }
        }

        if (!isMounted) return;

        // Resolve Customer Name
        const resolvedName = custData?.first_name
          ? `${custData.first_name} ${custData.last_name || ''}`.trim()
          : custData?.display_name && custData.display_name !== 'ลูกค้าประจำ'
          ? custData.display_name
          : profData?.display_name && profData.display_name !== 'ลูกค้าประจำ'
          ? profData.display_name
          : customerName || 'ลูกค้า';

        // Resolve Customer Email
        const resolvedEmail = custData?.email || profData?.email || estData?.customer_email || booking?.customer_email || flashData?.email || 'ไม่ระบุอีเมล';

        // Resolve Customer Phone
        const resolvedPhone = profData?.phone || custData?.phone || estData?.customer_phone || booking?.customer_phone || flashData?.phone || customerPhone || 'ไม่ระบุเบอร์โทร';

        // Resolve DOB & Calculate Age
        const dobStr = custData?.date_of_birth || profData?.date_of_birth || estData?.customer_dob || flashData?.date_of_birth;
        let calculatedAge: number | null = null;
        if (dobStr) {
          const birth = new Date(dobStr);
          if (!isNaN(birth.getTime())) {
            const today = new Date();
            let a = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
              a--;
            }
            if (a >= 0) calculatedAge = a;
          }
        }

        // Resolve Health Disclosures (Unified Customer Health Resolver)
        let resolvedHasMed: boolean | null | undefined = undefined;
        let resolvedMedNote: string = '';
        let resolvedHasAlg: boolean | null | undefined = undefined;
        let resolvedAlgNote: string = '';

        // 1. Check customers master row first
        if (custData) {
          if (custData.has_medical_condition !== undefined && custData.has_medical_condition !== null) {
            resolvedHasMed = Boolean(custData.has_medical_condition);
            resolvedMedNote = custData.medical_condition_note || custData.medical_conditions || '';
          } else if (custData.medical_conditions?.trim()) {
            resolvedHasMed = true;
            resolvedMedNote = custData.medical_conditions.trim();
          }

          if (custData.has_allergy !== undefined && custData.has_allergy !== null) {
            resolvedHasAlg = Boolean(custData.has_allergy);
            resolvedAlgNote = custData.allergy_note || custData.allergies || '';
          } else if (custData.allergies?.trim()) {
            resolvedHasAlg = true;
            resolvedAlgNote = custData.allergies.trim();
          }
        }

        // 2. Check estimate_requests row if health fields still unresolved
        if (estData) {
          if (resolvedHasMed === undefined && estData.has_medical_condition !== undefined && estData.has_medical_condition !== null) {
            resolvedHasMed = Boolean(estData.has_medical_condition);
            resolvedMedNote = estData.medical_condition_note || '';
          }
          if (resolvedHasAlg === undefined && estData.has_allergy !== undefined && estData.has_allergy !== null) {
            resolvedHasAlg = Boolean(estData.has_allergy);
            resolvedAlgNote = estData.allergy_note || '';
          }
        }

        // Fallback to customer history in estimate_requests table
        if ((resolvedHasMed === undefined || resolvedHasAlg === undefined) && (cUid || cId)) {
          try {
            let estHistQ = supabase
              .from('estimate_requests')
              .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
              .order('created_at', { ascending: false })
              .limit(5);

            if (cUid) estHistQ = estHistQ.eq('customer_user_id', cUid);
            else if (cId) estHistQ = estHistQ.eq('customer_id', cId);

            const { data: estHist } = await estHistQ;
            if (Array.isArray(estHist) && estHist.length > 0) {
              for (const rec of estHist) {
                if (resolvedHasMed === undefined) {
                  const mNote = (rec.medical_condition_note || '').trim();
                  if (mNote) {
                    resolvedHasMed = true;
                    resolvedMedNote = mNote;
                  } else if (rec.has_medical_condition === false) {
                    resolvedHasMed = false;
                  } else if (rec.has_medical_condition === true) {
                    resolvedHasMed = true;
                    resolvedMedNote = 'มีโรคประจำตัว';
                  }
                }
                if (resolvedHasAlg === undefined) {
                  const aNote = (rec.allergy_note || '').trim();
                  if (aNote) {
                    resolvedHasAlg = true;
                    resolvedAlgNote = aNote;
                  } else if (rec.has_allergy === false) {
                    resolvedHasAlg = false;
                  } else if (rec.has_allergy === true) {
                    resolvedHasAlg = true;
                    resolvedAlgNote = 'มีประวัติการแพ้';
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Error querying estimate_requests history in ArtistPaymentReviewDrawer:', e);
          }
        }

        const healthNotes = flashData?.health_conditions || flashData?.health_notes || estData?.health_conditions || estData?.health_notes || booking?.health_conditions || booking?.health_notes || '';

        setCustomerDetails({
          name: resolvedName,
          email: resolvedEmail,
          phone: resolvedPhone,
          dob: dobStr || null,
          age: calculatedAge,
          hasMedicalCondition: resolvedHasMed ?? null,
          medicalConditionNote: resolvedMedNote,
          hasAllergy: resolvedHasAlg ?? null,
          allergyNote: resolvedAlgNote,
          extraHealthNotes: healthNotes,
        });

      } catch (err) {
        console.error('Error fetching customer details in drawer:', err);
      }
    }

    loadCustomerData();

    // Check age/health confirmation status
    if (estimate?.is_age_confirmed === true || booking?.is_age_confirmed === true) {
      setConfirmationState('confirmed');
    } else if (!cUid) {
      setConfirmationState('not_confirmed');
    } else {
      setConfirmationState('loading');
      const fetchConfirmation = async () => {
        try {
          const { data, error } = await supabase.rpc('artist_get_customer_confirmation', { p_customer_user_id: cUid });
          if (!isMounted) return;
          if (error) {
            setConfirmationState('error');
            return;
          }
          const res = Array.isArray(data) ? data[0] : data;
          setConfirmationState(res && res.is_confirmed ? 'confirmed' : 'not_confirmed');
        } catch {
          if (isMounted) setConfirmationState('error');
        }
      };
      fetchConfirmation();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, submission, customerUserId, customerName, customerPhone, estimate, booking]);

  if (!isOpen || !submission) return null;

  // Customer reference images
  const refImages: string[] = (estimate?.reference_images && estimate.reference_images.length > 0)
    ? estimate.reference_images
    : (booking?.reference_images && booking.reference_images.length > 0)
    ? booking.reference_images
    : (booking?.artwork_image_url ? [booking.artwork_image_url] : (flashDetails?.flash_designs?.image_url || flashDetails?.flash_design_image_url ? [flashDetails.flash_designs?.image_url || flashDetails.flash_design_image_url] : []));

  const isFlash = Boolean(booking?.flash_reservation_id || submission?.flash_reservation_id || flashDetails);
  const flashTitle = flashDetails?.flash_designs?.title || flashDetails?.flash_design_title || booking?.flash_reservation?.flash_designs?.title;
  const rawStyle = flashDetails?.flash_designs?.style || flashDetails?.flash_design_style || booking?.style || estimate?.style;
  const cleanStyle = rawStyle ? rawStyle.replace(/\s*custom\s*/gi, '').trim() : '';

  const workType = isFlash ? 'ลาย Flash' : 'งานสัก Custom';
  const designTitle = flashTitle || (booking?.artwork_title && booking.artwork_title.toLowerCase() !== 'custom' ? booking.artwork_title : null);
  const styleDisplay = cleanStyle && cleanStyle.toLowerCase() !== 'custom' ? cleanStyle : 'ไม่ระบุ';

  const artistName = booking?.artist_name || booking?.artists?.name || estimate?.artist_name || 'ช่างสักประจำร้าน';

  const placement = booking?.placement || estimate?.placement || flashDetails?.placement || 'ไม่ระบุ';
  const widthCm = booking?.width_cm || estimate?.width_cm || (flashDetails?.width_cm ? Number(flashDetails.width_cm) : (flashDetails?.size_cm ? parseFloat(flashDetails.size_cm) : null));
  const heightCm = booking?.height_cm || estimate?.height_cm || (flashDetails?.height_cm ? Number(flashDetails.height_cm) : null);
  const sizeHint = booking?.estimated_size_tier || estimate?.estimated_size_tier || flashDetails?.flash_designs?.size_label || flashDetails?.flash_design_size_label;
  const tattooSize = formatTattooSize(widthCm, heightCm, sizeHint);
  const description = estimate?.description || booking?.description || '';

  const calculatedDeposit = Number(
    booking?.deposit_required ??
    estimate?.deposit_required ??
    flashDetails?.flash_designs?.deposit_amount ??
    flashDetails?.flash_design_deposit_amount ??
    depositRequired ??
    0
  );
  const effectiveDepositRequired = calculatedDeposit > 0 ? calculatedDeposit : (Number(submission.claimed_amount) || 500);

  const appointmentDate = booking?.requested_date
    ? formatDateBangkok(booking.requested_date)
    : estimate?.preferred_date
    ? formatDateBangkok(estimate.preferred_date)
    : 'รอนัดหมาย';

  const appointmentTime = booking?.requested_start_time
    ? formatTimeBangkok(`2026-01-01T${booking.requested_start_time}`)
    : 'ไม่ระบุเวลา';

  const submittedDate = submission.submitted_at
    ? formatDateBangkok(submission.submitted_at, true)
    : 'ไม่ระบุวันที่ส่ง';

  const reqCode = isFlash
    ? `FLASH-${(booking?.flash_reservation_id || submission?.flash_reservation_id || flashDetails?.id || '').slice(0, 8).toUpperCase()}`
    : estimate?.id
    ? `REQ-${estimate.id.slice(0, 8)}`
    : booking?.id
    ? `REQ-${booking.id.slice(0, 8)}`
    : `REQ-${submission.booking_id.slice(0, 8)}`;

  const displayCustName = customerDetails?.name || customerName || 'ลูกค้า';
  const displayCustEmail = customerDetails?.email || 'ไม่ระบุอีเมล';
  const displayCustPhone = customerDetails?.phone || customerPhone || 'ไม่ระบุเบอร์โทร';

  let displayCustAge = 'ไม่พบข้อมูลวันเกิด';
  if (customerDetails?.age !== undefined && customerDetails?.age !== null) {
    displayCustAge = `${customerDetails.age} ปี`;
  }

  const formatCurrency = (amount: number) => {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Approve action handler (uses canonical RPC shared with Admin)
  const handleApprove = async () => {
    setActionError('');
    setActionSuccess('');
    setSubmitting(true);
    try {
      const supabase = createClient();
      const amountToApprove = Number(submission.claimed_amount) || depositRequired || 500;
      const { data, error: appErr } = await supabase.rpc('admin_approve_payment_submission', {
        p_submission_id: submission.id,
        p_verified_amount: amountToApprove,
        p_payment_method: 'BANK_TRANSFER',
        p_reference_no: submission.reference_no ? String(submission.reference_no).trim() : null,
        p_admin_note: 'ช่างสักตรวจสอบและอนุมัติสลิปมัดจำ',
      });

      if (appErr) {
        console.error('Error approving payment submission:', appErr);
        throw new Error(appErr.message || 'เกิดข้อผิดพลาดในการอนุมัติสลิป');
      }

      setActionSuccess('อนุมัติสลิปและยืนยันคิวเรียบร้อยแล้ว');
      setTimeout(() => {
        onClose();
        if (typeof window !== 'undefined') window.location.reload();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || 'ไม่สามารถอนุมัติสลิปได้');
    } finally {
      setSubmitting(false);
    }
  };

  // Reject action handler
  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim() || submitting) return;

    setActionError('');
    setActionSuccess('');
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: rejErr } = await supabase.rpc('artist_reject_payment_submission', {
        p_submission_id: submission.id,
        p_rejection_reason: rejectionReason.trim(),
      });

      if (rejErr) {
        console.error('Error rejecting payment submission:', rejErr);
        throw new Error(rejErr.message || 'เกิดข้อผิดพลาดในการปฏิเสธสลิป');
      }

      setActionSuccess('ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว');
      setTimeout(() => {
        onClose();
        if (typeof window !== 'undefined') window.location.reload();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || 'ไม่สามารถปฏิเสธสลิปได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn font-prompt"
      />

      {/* Drawer Container (Fixed Right 430-480px, Dark Background matching Admin) */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[450px] md:w-[480px] bg-[#171512] border-l border-[#4A443A] shadow-2xl flex flex-col font-prompt animate-slideInRight h-full">
        
        {/* Sticky Fixed Header: Request Code, Status Badge, Close Button */}
        <div className="p-4 border-b border-[#4A443A] flex items-center justify-between bg-[#0E0D0C] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm sm:text-base font-mono font-bold text-[#ECE4D3]">
              {reqCode}
            </span>
            <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold animate-pulse">
              สลิปรอตรวจ
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#7A7265] hover:text-[#ECE4D3] hover:bg-[#1F1D1A] rounded-lg transition-colors cursor-pointer"
            title="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Body: Ordered Vertical Stacked Boxes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          
          {/* กล่อง 1: แจ้งสถานะคำขอ / สถานะการชำระเงิน */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <AlertCircle size={13} className="text-[#9C2F2F]" />
              <span>สถานะคำขอ / การชำระเงิน</span>
            </div>
            <div className="bg-amber-950/30 border border-amber-800/50 p-2.5 rounded-lg text-xs text-amber-300 flex items-start gap-2">
              <Clock size={15} className="shrink-0 text-amber-400 mt-0.5" />
              <p className="leading-relaxed">
                รอตรวจสอบสลิปมัดจำ — ลูกค้าโอนเงินเรียบร้อยแล้ว รอช่างสักตรวจสอบหลักฐานเพื่อยืนยันคิว
              </p>
            </div>
          </div>

          {/* กล่อง 2: ข้อมูลลูกค้า — ชื่อ, อีเมล, เบอร์โทร, อายุ */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <User size={13} className="text-[#9C2F2F]" />
              <span>ข้อมูลลูกค้า</span>
            </div>

            <div className="space-y-2 bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
              {/* ชื่อลูกค้า */}
              <div className="flex items-center justify-between">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <User size={12} className="text-[#9C2F2F]" />
                  <span>ชื่อลูกค้า:</span>
                </span>
                <span className="font-semibold text-[#ECE4D3]">{displayCustName}</span>
              </div>

              {/* อีเมล */}
              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Mail size={12} className="text-[#7A7265]" />
                  <span>อีเมล:</span>
                </span>
                <span className="font-mono text-[#ECE4D3] text-[11px]">
                  {displayCustEmail}
                </span>
              </div>

              {/* เบอร์โทรศัพท์ */}
              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Phone size={12} className="text-[#7A7265]" />
                  <span>เบอร์โทรศัพท์:</span>
                </span>
                {displayCustPhone && displayCustPhone !== 'ไม่ระบุ' && displayCustPhone !== 'ไม่ระบุเบอร์โทร' ? (
                  <a
                    href={`tel:${displayCustPhone}`}
                    className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/50 transition-colors"
                  >
                    <Phone size={10} className="text-emerald-400" />
                    <span className="font-mono">{displayCustPhone}</span>
                  </a>
                ) : (
                  <span className="text-[#7A7265]">ไม่ระบุเบอร์โทร</span>
                )}
              </div>

              {/* อายุลูกค้า */}
              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Calendar size={12} className="text-[#7A7265]" />
                  <span>อายุลูกค้า:</span>
                </span>
                <span className="font-medium text-[#ECE4D3]">{displayCustAge}</span>
              </div>
            </div>
          </div>

          {/* กล่อง 3: ข้อมูลสุขภาพที่ลูกค้าแจ้ง (โรคประจำตัว, การแพ้ยา, การรับรองอายุ) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <ShieldCheck size={13} className="text-[#9C2F2F]" />
              <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
            </div>

            <div className="space-y-2 text-xs">
              {/* โรคประจำตัว / การเจ็บป่วย */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 space-y-1">
                <span className="text-[#7A7265] text-[10px] uppercase font-semibold block">โรคประจำตัว / การเจ็บป่วย</span>
                {customerDetails?.hasMedicalCondition === true ? (
                  <p className="text-amber-300 font-medium leading-relaxed bg-amber-950/40 p-2 rounded border border-amber-800/40 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 text-amber-400 mt-0.5" />
                    <span>{customerDetails.medicalConditionNote || 'ระบุว่ามีโรคประจำตัว'}</span>
                  </p>
                ) : customerDetails?.hasMedicalCondition === false ? (
                  <p className="text-emerald-400 font-light flex items-center gap-1 text-xs">
                    <CheckCircle2 size={13} /> ไม่มีโรคประจำตัว
                  </p>
                ) : (
                  <p className="text-[#7A7265] font-light italic text-xs">ยังไม่ให้ข้อมูล</p>
                )}
              </div>

              {/* ประวัติการแพ้ยา / แพ้สารเคมี */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 space-y-1">
                <span className="text-[#7A7265] text-[10px] uppercase font-semibold block">ประวัติการแพ้ยา / แพ้สารเคมี</span>
                {customerDetails?.hasAllergy === true ? (
                  <p className="text-amber-300 font-medium leading-relaxed bg-amber-950/40 p-2 rounded border border-amber-800/40 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 text-amber-400 mt-0.5" />
                    <span>{customerDetails.allergyNote || 'ระบุว่ามีประวัติแพ้'}</span>
                  </p>
                ) : customerDetails?.hasAllergy === false ? (
                  <p className="text-emerald-400 font-light flex items-center gap-1 text-xs">
                    <CheckCircle2 size={13} /> ไม่มีประวัติแพ้
                  </p>
                ) : (
                  <p className="text-[#7A7265] font-light italic text-xs">ยังไม่ให้ข้อมูล</p>
                )}
              </div>

              {/* ข้อจำกัดสุขภาพเพิ่มเติม (ถ้ามี) */}
              {customerDetails?.extraHealthNotes && customerDetails.extraHealthNotes.trim() !== '' && (
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 space-y-1">
                  <span className="text-[#7A7265] text-[10px] uppercase font-semibold block">ข้อจำกัดสุขภาพเพิ่มเติม</span>
                  <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap">
                    {customerDetails.extraHealthNotes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* กล่อง 4: วันนัด, เวลาเริ่ม, วันที่ส่งคำขอ */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <Calendar size={13} className="text-[#9C2F2F]" />
              <span>กำหนดการ & วันที่ส่งคำขอ</span>
            </div>

            <div className="space-y-2 bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Calendar size={12} className="text-[#7A7265]" />
                  <span>วันนัดหมาย:</span>
                </span>
                <span className="font-medium text-[#ECE4D3]">{appointmentDate}</span>
              </div>

              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Clock size={12} className="text-[#7A7265]" />
                  <span>เวลาเริ่ม:</span>
                </span>
                <span className="font-medium text-[#ECE4D3]">{appointmentTime}</span>
              </div>

              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265] flex items-center gap-1">
                  <Send size={12} className="text-[#7A7265]" />
                  <span>วันที่ส่งคำขอ/สลิป:</span>
                </span>
                <span className="text-[#A89F91]">{submittedDate}</span>
              </div>
            </div>
          </div>

          {/* กล่อง 5: รายละเอียดงานสัก — ประเภทงาน, ชื่อผลงาน (ถ้ามี), สไตล์งาน, ตำแหน่ง, ขนาด, รายละเอียดเพิ่มเติม */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <FileText size={13} className="text-[#9C2F2F]" />
              <span>รายละเอียดงานสัก</span>
            </div>

            <div className="space-y-2 bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#7A7265]">ประเภทงาน:</span>
                <span className="font-semibold text-[#ECE4D3]">{workType}</span>
              </div>

              {designTitle && (
                <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                  <span className="text-[#7A7265]">ชื่อผลงาน:</span>
                  <span className="font-semibold text-[#ECE4D3]">{designTitle}</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265]">สไตล์งาน:</span>
                <span className="font-medium text-[#ECE4D3]">{styleDisplay}</span>
              </div>

              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265]">ตำแหน่งสัก:</span>
                <span className="font-medium text-[#ECE4D3]">{placement}</span>
              </div>

              <div className="flex items-center justify-between border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#7A7265]">ขนาดงาน:</span>
                <span className="font-medium text-[#ECE4D3]">{tattooSize}</span>
              </div>

              {description && (
                <div className="border-t border-[#4A443A]/30 pt-2">
                  <span className="text-[#7A7265] block mb-1">รายละเอียดเพิ่มเติม:</span>
                  <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap break-words">
                    {description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* กล่อง 6: รูปอ้างอิง */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <ImageIcon size={13} className="text-[#9C2F2F]" />
                <span>รูปภาพอ้างอิง</span>
              </span>
              <span className="text-xs text-[#A89F91]">({refImages.length} รูป)</span>
            </div>

            {refImages.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {refImages.map((imgUrl: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setPreviewImage(imgUrl);
                      setIsLightboxOpen(true);
                    }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-[#4A443A] bg-[#171512] cursor-pointer hover:border-[#ECE4D3] transition-all relative group"
                  >
                    <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[#ECE4D3] transition-opacity">
                      <Maximize2 size={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#7A7265] py-2">ไม่มีรูปภาพอ้างอิง</p>
            )}
          </div>

          {/* กล่อง 7: หลักฐานการชำระเงิน — ยอดมัดจำที่ต้องชำระ, ยอดที่ลูกค้าจ่าย, ปุ่มดูสลิป */}
          <div className="bg-[#0E0D0C] border border-amber-800/60 rounded-xl p-3.5 space-y-3 shadow-sm font-prompt">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={14} />
                <span>หลักฐานการชำระเงินมัดจำ</span>
              </span>
            </div>

            <div className="space-y-2 bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#A89F91]">ยอดมัดจำที่ต้องชำระ:</span>
                <span className="font-bold text-red-400 font-mono text-sm">
                  ฿{formatCurrency(effectiveDepositRequired)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[#4A443A]/30 pt-2">
                <span className="text-[#A89F91]">ยอดที่ลูกค้าจ่าย:</span>
                <span className="text-sm font-bold text-amber-300 font-mono">
                  ฿{formatCurrency(Number(submission.claimed_amount))}
                </span>
              </div>

              {submission.reference_no && (
                <div className="flex items-center justify-between gap-2 border-t border-[#4A443A]/30 pt-2">
                  <span className="text-[#A89F91]">เลขที่อ้างอิง:</span>
                  <span className="font-mono text-[#ECE4D3]">{submission.reference_no}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#4A443A]/30">
                <span className="text-[#A89F91]">หลักฐานสลิป:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewImage(null);
                    setIsLightboxOpen(true);
                  }}
                  className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 active:bg-amber-950 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Eye size={14} />
                  <span>ดูสลิป</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Sticky Footer Bar at Bottom: ปุ่มเขียว ยืนยันสลิป และปุ่มแดง ปฏิเสธสลิป */}
        <div className="p-4 bg-[#0E0D0C] border-t border-[#4A443A] flex flex-col gap-2 shrink-0">
          
          {actionError && (
            <div className="p-2.5 bg-red-950/60 border border-red-900/60 rounded-lg text-xs text-red-400">
              {actionError}
            </div>
          )}

          {actionSuccess && (
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 font-semibold text-center">
              {actionSuccess}
            </div>
          )}

          {submission.status === 'PENDING' && !actionSuccess && (
            isRejectMode ? (
              <form onSubmit={handleReject} className="space-y-2.5 animate-fadeIn">
                <span className="text-xs text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                <input
                  type="text"
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="เช่น สลิปไม่ชัดเจน, ยอดเงินโอนไม่ตรง..."
                  className="w-full bg-[#171512] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400 placeholder-[#7A7265]"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRejectMode(false);
                      setRejectionReason('');
                    }}
                    className="px-3 py-1.5 bg-[#171512] text-xs text-[#A89F91] rounded-lg border border-[#4A443A] hover:text-[#ECE4D3] cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !rejectionReason.trim()}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <Ban size={13} />
                        <span>ยืนยันปฏิเสธสลิป</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleApprove}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>กำลังยืนยันคิว...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>ยืนยันสลิป & ยืนยันคิว</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsRejectMode(true)}
                  className="w-full py-2 bg-red-950/60 hover:bg-red-900 active:bg-red-950 text-red-300 border border-red-800/80 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Ban size={15} />
                  <span>ปฏิเสธสลิป</span>
                </button>
              </div>
            )
          )}

        </div>

      </div>

      {/* Lightbox Zoom Modal for Reference Images & Payment Proof */}
      {isLightboxOpen && (
        <div
          onClick={() => {
            setIsLightboxOpen(false);
            setPreviewImage(null);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-pointer animate-fadeIn"
        >
          <div className="max-w-full max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            {previewImage ? (
              <CustomerReferenceImage
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <PaymentSlipImage
                src={submission.slip_path}
                alt="Payment Slip Proof"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
          <button
            onClick={() => {
              setIsLightboxOpen(false);
              setPreviewImage(null);
            }}
            className="absolute top-4 right-4 text-white bg-[#171512] border border-[#4A443A] p-2 rounded-full cursor-pointer hover:bg-[#1F1D1A]"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
