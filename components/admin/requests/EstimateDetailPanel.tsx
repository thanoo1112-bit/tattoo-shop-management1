'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  CalendarClock,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck,
  Maximize2,
  FileText,
  AlertCircle,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Image as ImageIcon,
  CreditCard,
  Eye,
  Layers,
  Trash2,
} from 'lucide-react';
import { EstimateRequestItem, formatCurrency, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok, getTattooWorkTypeLabel, getColorTechniqueLabel } from './types';
import { formatTattooSize } from '@/lib/utils/formatters';
import { calculateBlockingEndTime } from '@/lib/utils/tattooDuration';
import { createClient } from '@/lib/supabase/client';
import { parseNoteWithPreferredTime, extractHHMM, getInitialStartTime } from '@/lib/noteUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import ProposeMultiDatesModal from '@/components/common/ProposeMultiDatesModal';
import { useApp } from '@/components/AppContext';
import { BlockedDateRecord, checkExistingDateWarning } from '@/lib/availabilityUtils';
import { calculateCustomerAgeYears } from '@/lib/customerUtils';

function parseFullNoteDetails(noteText?: string | null): {
  cleanNote: string;
  extractedTime: string | null;
  parsedPlacement: string | null;
  parsedSizeRaw: string | null;
} {
  if (!noteText || !noteText.trim()) {
    return { cleanNote: '', extractedTime: null, parsedPlacement: null, parsedSizeRaw: null };
  }

  let text = noteText.trim();
  let extractedTime: string | null = null;
  let parsedPlacement: string | null = null;
  let parsedSizeRaw: string | null = null;

  // 1. Bracketed placement: [ตำแหน่ง: ...] or [ตำแหน่งที่สัก: ...]
  const bracketPlacementMatch = text.match(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/i);
  if (bracketPlacementMatch) {
    parsedPlacement = bracketPlacementMatch[1].trim();
    text = text.replace(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/gi, '');
  } else {
    const linePlacementMatch = text.match(/(?:^|\n)(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\n]+)/i);
    if (linePlacementMatch) {
      parsedPlacement = linePlacementMatch[1].trim();
      text = text.replace(/(?:^|\n)(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\n]+)/gi, '');
    }
  }

  // 2. Bracketed size: [ขนาด: ...] or [ขนาดงานสัก: ...]
  const bracketSizeMatch = text.match(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/i);
  if (bracketSizeMatch) {
    parsedSizeRaw = bracketSizeMatch[1].trim();
    text = text.replace(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/gi, '');
  } else {
    const lineSizeMatch = text.match(/(?:^|\n)(?:ขนาด|ขนาดงานสัก):\s*([^\n]+)/i);
    if (lineSizeMatch) {
      parsedSizeRaw = lineSizeMatch[1].trim();
      text = text.replace(/(?:^|\n)(?:ขนาด|ขนาดงานสัก):\s*([^\n]+)/gi, '');
    }
  }

  // 3. Time tag: [เวลาสะดวก: ...] or [เวลาที่สะดวก: ...]
  const timeRegex = /\[(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม):\s*([^\]]+)\]/i;
  const timeMatch = text.match(timeRegex);
  if (timeMatch) {
    const rawTimeVal = timeMatch[1].trim();
    extractedTime = rawTimeVal.endsWith('น.') || rawTimeVal.endsWith('น') ? rawTimeVal : `${rawTimeVal} น.`;
    text = text.replace(timeRegex, '');
  } else {
    const lineTimeMatch = text.match(/(?:^|\n)(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม):\s*([^\n]+)/i);
    if (lineTimeMatch) {
      const rawTimeVal = lineTimeMatch[1].trim();
      extractedTime = rawTimeVal.endsWith('น.') || rawTimeVal.endsWith('น') ? rawTimeVal : `${rawTimeVal} น.`;
      text = text.replace(/(?:^|\n)(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม):\s*([^\n]+)/gi, '');
    }
  }

  // 4. Remove date tags if any e.g. [วันสะดวก: ...]
  text = text.replace(/\[(?:วันสะดวก|วันที่สะดวก|วันนัด):\s*([^\]]+)\]/gi, '');

  const cleanNote = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    cleanNote,
    extractedTime,
    parsedPlacement,
    parsedSizeRaw,
  };
}

const REJECT_REASON_PRESETS = [
  'คิวเต็ม / ไม่สามารถรับงานในวันที่ลูกค้าเลือก',
  'รายละเอียดงานไม่เพียงพอ',
  'งานอยู่นอกขอบเขตหรือสไตล์ที่ร้านรับ',
  'ขนาดหรือตำแหน่งไม่เหมาะสม',
  'ไม่สามารถติดต่อหรือยืนยันรายละเอียดกับลูกค้าได้',
  'อื่น ๆ',
] as const;

interface EstimateDetailPanelProps {
  estimate: EstimateRequestItem | null;
  blockedDates?: BlockedDateRecord[];
  onClose: () => void;
  onRefresh: () => void;
  onCheckSlip?: (bookingId: string) => void;
  onDeleteRequest?: (estimate: EstimateRequestItem) => void;
}

export default function EstimateDetailPanel({
  estimate,
  blockedDates = [],
  onClose,
  onRefresh,
  onCheckSlip,
  onDeleteRequest,
}: EstimateDetailPanelProps) {
  if (!estimate) return null;
const { artists } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isConfirmingAccept, setIsConfirmingAccept] = useState(false);
  const [isSubmittingAccept, setIsSubmittingAccept] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isProposingDates, setIsProposingDates] = useState(false);
  const [latestProposedDate, setLatestProposedDate] = useState<string | null>(null);
  const [latestProposedTime, setLatestProposedTime] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadLatestProposedOption() {
      if (estimate?.id && estimate?.is_date_proposed) {
        // Priority 1: Check in-memory date_options from estimate_request_date_options (status = 'PENDING')
        const inMemoryOptions = Array.isArray((estimate as any).date_options)
          ? (estimate as any).date_options.filter((opt: any) => opt.status === 'PENDING')
          : Array.isArray((estimate as any).estimate_request_date_options)
          ? (estimate as any).estimate_request_date_options.filter((opt: any) => opt.status === 'PENDING')
          : [];

        if (inMemoryOptions.length > 0) {
          const latest = [...inMemoryOptions].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          if (latest?.proposed_date) {
            setLatestProposedDate(latest.proposed_date);
            setLatestProposedTime(latest.proposed_time || null);
            return;
          }
        }

        // Priority 2: Check mapped proposed_date / proposed_time
        if (estimate.proposed_date) {
          setLatestProposedDate(estimate.proposed_date);
          setLatestProposedTime(estimate.proposed_time || null);
          return;
        }

        // Priority 1 (remote fallback): If not present in props, query database
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('estimate_request_date_options')
            .select('proposed_date, proposed_time, status, created_at')
            .eq('estimate_request_id', estimate.id)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(1);

          if (!error && data && data.length > 0 && isMounted) {
            setLatestProposedDate(data[0].proposed_date);
            setLatestProposedTime(data[0].proposed_time);
            return;
          }
        } catch (err) {
          console.error('Failed to load proposed date options in drawer:', err);
        }
      } else {
        setLatestProposedDate(null);
        setLatestProposedTime(null);
      }
    }

    loadLatestProposedOption();
    return () => {
      isMounted = false;
    };
  }, [estimate?.id, estimate?.is_date_proposed, estimate?.proposed_date, estimate?.proposed_time, (estimate as any)?.date_options]);

  const handleAcceptRequest = async () => {
    if (!estimate) return;
    setAcceptError(null);
    setIsSubmittingAccept(true);

    try {
      const supabase = createClient();
      const internalStartTime = getInitialStartTime(estimate, '13:00');
      const formattedStartTime = internalStartTime.length === 5 ? `${internalStartTime}:00` : internalStartTime;

      const calcEndTime = calculateBlockingEndTime(
        internalStartTime,
        (estimate as any)?.estimated_size_tier,
        estimate.width_cm,
        estimate.height_cm,
        estimate.description
      );
      const formattedEndTime = calcEndTime.length === 5 ? `${calcEndTime}:00` : calcEndTime;

      const appointmentDate = estimate.preferred_date || new Date().toISOString().split('T')[0];

      const { error } = await supabase.rpc('admin_confirm_booking_request', {
        p_estimate_request_id: estimate.id,
        p_appointment_date: appointmentDate,
        p_start_time: formattedStartTime,
        p_end_time: formattedEndTime,
        p_deposit_required: 500,
        p_admin_note: null,
      });

      if (error) {
        console.error('RPC admin_confirm_booking_request error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        const isStatusMismatch =
          error.message?.includes('must be PENDING') ||
          error.message?.includes('is in status ACCEPTED') ||
          error.message?.includes('A booking already exists for estimate request');

        if (isStatusMismatch) {
          setAcceptError('คำขอนี้ได้รับการยืนยันไปแล้ว');
          if (typeof onRefresh === 'function') {
            onRefresh();
          }
        } else if (
          error.code === '23P01' ||
          error.message?.includes('no_artist_double_booking') ||
          error.message?.includes('conflicts with existing key')
        ) {
          setAcceptError('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว');
        } else if (error.code === '42501' || error.message?.includes('Unauthorized')) {
          setAcceptError('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
        } else if (error.code === '23505' || error.message?.includes('already exists')) {
          setAcceptError('บันทึกการยืนยันไม่สำเร็จ กรุณาตรวจสอบข้อมูลที่เกี่ยวข้อง');
        } else {
          setAcceptError(error.message || 'เกิดข้อผิดพลาดในการยืนยันคำขอ');
        }
        return;
      }

      setIsConfirmingAccept(false);
      setSuccessToast('รับคำขอและส่งคำขอมัดจำ 500 บาทเรียบร้อยแล้ว');
      setTimeout(() => {
        setSuccessToast(null);
      }, 4000);
      onRefresh();
    } catch (err: any) {
      console.error('Error accepting estimate request:', err);
      setAcceptError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    } finally {
      setIsSubmittingAccept(false);
    }
  };

  // Flash Actions State
  const [isSubmittingFlash, setIsSubmittingFlash] = useState(false);
  const [flashError, setFlashError] = useState<string | null>(null);

  const handleProcessFlashReservation = async (action: 'APPROVE' | 'REJECT' | 'CANCEL' | 'COMPLETE', adminNote?: string) => {
    if (!estimate || estimate.request_type !== 'FLASH' || !estimate.flash_reservation) return;

    const actionTextMap = {
      APPROVE: 'อนุมัติคำขอ Flash',
      REJECT: 'ปฏิเสธคำขอ Flash',
      CANCEL: 'ยกเลิกคำขอ Flash',
      COMPLETE: 'ทำเครื่องหมายจำหน่ายแล้ว (SOLD)',
    };

    if (action === 'APPROVE' && estimate.flash_reservation?.requested_date) {
      const resDate = estimate.flash_reservation.requested_date;
      const resTime = estimate.flash_reservation.requested_start_time || '10:00:00';
      const apptDateTime = new Date(`${resDate}T${resTime}`);
      if (apptDateTime.getTime() < Date.now()) {
        setFlashError('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
        return;
      }
    }

    if (!window.confirm(`ยืนยัน${actionTextMap[action]}หรือไม่?`)) return;

    setIsSubmittingFlash(true);
    setFlashError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_process_flash_reservation', {
        p_reservation_id: estimate.flash_reservation.id,
        p_action: action,
        p_admin_note: adminNote || null,
      });

      if (error) throw error;

      setSuccessToast(`${actionTextMap[action]}เรียบร้อยแล้ว`);
      setTimeout(() => {
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error(`Error processing flash reservation (${action}):`, err);
      if (err.message?.includes('PAST_APPOINTMENT_TIME')) {
        setFlashError('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
      } else {
        setFlashError(err.message || 'เกิดข้อผิดพลาดในการดำเนินการ');
      }
    } finally {
      setIsSubmittingFlash(false);
    }
  };

  const [previewModal, setPreviewModal] = useState<{ src: string; type: 'reference' | 'slip' } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState<string>('');
  const [customRejectReason, setCustomRejectReason] = useState<string>('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);



  // Payment Slip Actions State
  const [isApprovingSlip, setIsApprovingSlip] = useState(false);
  const [isRejectingSlip, setIsRejectingSlip] = useState(false);
  const [slipRejectReason, setSlipRejectReason] = useState('');
  const [isSubmittingSlipReject, setIsSubmittingSlipReject] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);

  // Customer Confirmation & Age Resolution State
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');
  const [customerDob, setCustomerDob] = useState<string | null>(null);

  // Panel Hydration State for Flash & Health Disclosure
  const [panelHydratedData, setPanelHydratedData] = useState<{
    healthStatus: 'loading' | 'success' | 'error';
    hasMedicalCondition?: boolean | null;
    medicalConditionNote?: string | null;
    hasAllergy?: boolean | null;
    allergyNote?: string | null;
    flashReservation?: any | null;
    flashDesign?: any | null;
  }>({ healthStatus: 'loading' });

  React.useEffect(() => {
    if (!estimate) {
      setConfirmationState('not_confirmed');
      setCustomerDob(null);
      setPanelHydratedData({ healthStatus: 'error' });
      return;
    }

    if ((estimate as any).date_of_birth) {
      setCustomerDob((estimate as any).date_of_birth);
    }

    if (estimate.is_age_confirmed === true) {
      setConfirmationState('confirmed');
    }

    const customerUserId = estimate.customer_user_id || estimate.linked_booking?.customer_user_id;
    const customerId = (estimate as any).customer_id || estimate.linked_booking?.customer_id;

    let isMounted = true;
    setConfirmationState('loading');
    setPanelHydratedData({ healthStatus: 'loading' });
    const supabase = createClient();

    async function fetchStatusAndHydrate() {
      try {
        // 1. Fetch customer eligibility & DOB & medical conditions
        if (customerUserId || customerId) {
          let query = supabase.from('customers').select('eligibility_confirmed_at, profile_completed_at, date_of_birth, medical_conditions');
          if (customerUserId) {
            query = query.eq('user_id', customerUserId);
          } else if (customerId) {
            query = query.eq('id', customerId);
          }

          const { data, error } = await query.maybeSingle();

          if (isMounted) {
            if (error) {
              console.error('Error fetching admin customer confirmation:', error);
              setConfirmationState('error');
            } else if (data) {
              const isConfirmed = Boolean(data.eligibility_confirmed_at || data.profile_completed_at);
              setConfirmationState(isConfirmed ? 'confirmed' : 'not_confirmed');
              if (data.date_of_birth) {
                setCustomerDob(data.date_of_birth);
              }
            } else {
              setConfirmationState('not_confirmed');
            }
          }
        } else {
          if (isMounted) setConfirmationState('not_confirmed');
        }

        // 2. Fetch Flash Reservation & Design
        const flashResId =
          (estimate as any)?.flash_reservation_id ||
          (estimate?.linked_booking as any)?.flash_reservation_id ||
          estimate?.flash_reservation?.id;

        let fetchedFlash: any = estimate?.flash_reservation || null;

        if (flashResId) {
          const { data: fr, error: frErr } = await supabase
            .from('flash_reservations')
            .select('*, flash_designs(*)')
            .eq('id', flashResId)
            .maybeSingle();

          if (frErr) {
            console.error('Error fetching flash_reservations in EstimateDetailPanel:', frErr);
          } else if (fr) {
            fetchedFlash = fr;
          }
        }

        // 3. Fetch estimate_request health flags (only for Custom requests with estimate_request_id)
        const estReqId = estimate?.id || estimate?.linked_booking?.estimate_request_id;
        let fetchedEst: any = null;
        if (estReqId) {
          const { data: estData } = await supabase
            .from('estimate_requests')
            .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
            .eq('id', estReqId)
            .maybeSingle();
          if (estData) fetchedEst = estData;
        }

        // 4. Fetch customer profile medical info (Check customers master row FIRST, then estimate_requests, then history)
        let hasMed: boolean | null | undefined = undefined;
        let medNote: string | null = null;
        let hasAllergy: boolean | null | undefined = undefined;
        let allergyNote: string | null = null;
        let healthFetchErr = false;

        // A. Check customers master profile FIRST (for both Flash and Custom)
        if (customerUserId || customerId) {
          try {
            let custQ = supabase.from('customers').select('has_medical_condition, medical_condition_note, has_allergy, allergy_note, medical_conditions, allergies');
            if (customerUserId) custQ = custQ.eq('user_id', customerUserId);
            else if (customerId) custQ = custQ.eq('id', customerId);
            const { data: custRow } = await custQ.maybeSingle();

            if (custRow) {
              if (custRow.has_medical_condition !== undefined && custRow.has_medical_condition !== null) {
                hasMed = Boolean(custRow.has_medical_condition);
                medNote = custRow.medical_condition_note || custRow.medical_conditions || null;
              } else if (custRow.medical_conditions?.trim()) {
                hasMed = true;
                medNote = custRow.medical_conditions.trim();
              }

              if (custRow.has_allergy !== undefined && custRow.has_allergy !== null) {
                hasAllergy = Boolean(custRow.has_allergy);
                allergyNote = custRow.allergy_note || custRow.allergies || null;
              } else if (custRow.allergies?.trim()) {
                hasAllergy = true;
                allergyNote = custRow.allergies.trim();
              }
            }
          } catch (e) {
            console.warn('Error querying customers master profile:', e);
          }
        }

        // B. Check direct estimate_requests flags if health fields still unresolved
        if (fetchedEst) {
          if (hasMed === undefined && fetchedEst.has_medical_condition !== undefined && fetchedEst.has_medical_condition !== null) {
            hasMed = Boolean(fetchedEst.has_medical_condition);
            medNote = fetchedEst.medical_condition_note || null;
          }
          if (hasAllergy === undefined && fetchedEst.has_allergy !== undefined && fetchedEst.has_allergy !== null) {
            hasAllergy = Boolean(fetchedEst.has_allergy);
            allergyNote = fetchedEst.allergy_note || null;
          }
        }

        // C. Fallback to customer history in estimate_requests table
        if ((hasMed === undefined || hasAllergy === undefined) && (customerUserId || customerId)) {
          try {
            let estHistQ = supabase
              .from('estimate_requests')
              .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
              .order('created_at', { ascending: false })
              .limit(5);

            if (customerUserId) estHistQ = estHistQ.eq('customer_user_id', customerUserId);
            else if (customerId) estHistQ = estHistQ.eq('customer_id', customerId);

            const { data: estHist, error: estHistErr } = await estHistQ;
            if (estHistErr) {
              console.error('Error querying customer estimate_requests history for health:', estHistErr);
              if (hasMed === undefined && hasAllergy === undefined) healthFetchErr = true;
            } else if (Array.isArray(estHist) && estHist.length > 0) {
              for (const rec of estHist) {
                if (hasMed === undefined) {
                  const mNote = (rec.medical_condition_note || '').trim();
                  if (mNote) {
                    hasMed = true;
                    medNote = mNote;
                  } else if (rec.has_medical_condition === false) {
                    hasMed = false;
                  } else if (rec.has_medical_condition === true) {
                    hasMed = true;
                    medNote = 'มีโรคประจำตัว';
                  }
                }
                if (hasAllergy === undefined) {
                  const aNote = (rec.allergy_note || '').trim();
                  if (aNote) {
                    hasAllergy = true;
                    allergyNote = aNote;
                  } else if (rec.has_allergy === false) {
                    hasAllergy = false;
                  } else if (rec.has_allergy === true) {
                    hasAllergy = true;
                    allergyNote = 'มีประวัติการแพ้';
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Error querying estimate_requests history:', e);
          }
        }

        if (hasMed === undefined) hasMed = null;
        if (hasAllergy === undefined) hasAllergy = null;

        if (!isMounted) return;

        const healthStatus = healthFetchErr ? 'error' : 'success';

        setPanelHydratedData({
          healthStatus,
          hasMedicalCondition: hasMed,
          medicalConditionNote: medNote,
          hasAllergy,
          allergyNote,
          flashReservation: fetchedFlash,
          flashDesign: fetchedFlash?.flash_designs || null,
        });
      } catch (err) {
        console.error('Exception fetching panel hydration:', err);
        if (isMounted) {
          setConfirmationState('error');
          setPanelHydratedData({ healthStatus: 'error' });
        }
      }
    }

    fetchStatusAndHydrate();

    return () => {
      isMounted = false;
    };
  }, [estimate?.id, estimate?.customer_user_id, estimate?.linked_booking?.customer_user_id, estimate?.is_age_confirmed]);

  // Removed early return to keep hooks unconditional

  const linkedBooking = estimate.linked_booking;
  const hasBooking = Boolean(linkedBooking || estimate.status !== 'PENDING');
  const pendingSubmission = estimate.linked_booking?.pending_submission || estimate.pending_submission;

  const customerName = linkedBooking?.customer_name || estimate.customer_name;
  const customerPhone = linkedBooking?.customer_phone || estimate.customer_phone;
  const customerEmail = estimate.customer_email || linkedBooking?.customer_email || '';

  const flashRes = panelHydratedData.flashReservation || estimate.flash_reservation || (linkedBooking as any)?.flash_reservations;
  const flashDesign = panelHydratedData.flashDesign || flashRes?.flash_designs || flashRes?.flash_design;
  const isFlash = Boolean(
    estimate.request_type === 'FLASH' ||
    (estimate as any).source_type === 'FLASH' ||
    (estimate as any).sourceType === 'FLASH' ||
    (estimate as any).flash_reservation_id ||
    (linkedBooking as any)?.flash_reservation_id ||
    flashRes
  );

  const flashResId = flashRes?.id || (estimate as any).flash_reservation_id || (linkedBooking as any)?.flash_reservation_id;
  const flashCode = flashResId
    ? (flashResId.toUpperCase().startsWith('FLASH-') ? flashResId : `FLASH-${flashResId.slice(0, 8).toUpperCase()}`)
    : (estimate as any).flash_reservation_code || null;

  const requestCode = flashCode || `REQ-${estimate.id.slice(0, 8).toUpperCase()}`;

  const isHealthUnknown = panelHydratedData.healthStatus === 'error';

  const isUnrecorded = panelHydratedData.healthStatus === 'success' && (
    (panelHydratedData.hasMedicalCondition === null || panelHydratedData.hasMedicalCondition === undefined) &&
    (panelHydratedData.hasAllergy === null || panelHydratedData.hasAllergy === undefined)
  );

  const isHealthy =
    panelHydratedData.healthStatus === 'success' &&
    panelHydratedData.hasMedicalCondition === false &&
    panelHydratedData.hasAllergy === false;

  const matchedArtist = artists.find((a) => a.id === (estimate.artist_id || linkedBooking?.artist_id));
  const rawArtistName = matchedArtist?.name || linkedBooking?.artist_name || estimate.artist_name || 'ไม่ระบุช่าง';
  const rawArtistNickname = matchedArtist?.nickname || linkedBooking?.artist_nickname || estimate.artist_nickname;
  const artistDisplay = rawArtistNickname ? `${rawArtistName} (${rawArtistNickname})` : rawArtistName;

  const rawDescription = flashRes?.customer_note || linkedBooking?.description || estimate.description || '';
  const { cleanNote, extractedTime, parsedPlacement, parsedSizeRaw } = parseFullNoteDetails(rawDescription);

  const styleDisplay = flashDesign?.style ? `Flash (${flashDesign.style})` : (linkedBooking?.style_preference || estimate.style_preference || estimate.style || 'ไม่ระบุ');

  const directPlacement = flashRes?.placement || linkedBooking?.placement || estimate.placement;
  const isDirectPlacementValid = directPlacement && directPlacement.trim() && directPlacement.trim() !== 'ไม่ระบุ';
  const placementDisplay = isDirectPlacementValid ? directPlacement.trim() : (parsedPlacement || 'ไม่ระบุ');

  const wCm = flashRes?.width_cm ?? linkedBooking?.width_cm ?? estimate.width_cm;
  const hCm = flashRes?.height_cm ?? linkedBooking?.height_cm ?? estimate.height_cm;
  const sizeDisplay = formatTattooSize(wCm, hCm, parsedSizeRaw || flashDesign?.size_label);
  const hasSizeInfo = sizeDisplay !== 'ไม่ระบุ';

  const activeSession = linkedBooking?.sessions?.find((s: any) => s.status !== 'CANCELLED') || linkedBooking?.sessions?.[0];
  const appointmentDateDisplay = activeSession?.start_at
    ? formatDateBangkok(activeSession.start_at)
    : linkedBooking?.requested_date
    ? formatDateBangkok(linkedBooking.requested_date)
    : estimate.preferred_date ? formatDateBangkok(estimate.preferred_date) : 'ไม่ระบุวัน';

  const appointmentStartTimeDisplay = activeSession?.start_at
    ? `${formatTimeBangkok(activeSession.start_at)} น.`
    : linkedBooking?.requested_time
    ? (linkedBooking.requested_time.length >= 5 ? `${linkedBooking.requested_time.slice(0, 5)} น.` : linkedBooking.requested_time)
    : 'ไม่ระบุเวลา';

  const preferredDateVal = estimate.preferred_date || flashRes?.requested_date || (linkedBooking as any)?.requested_date;
  const preferredDateDisplay = preferredDateVal ? formatDateBangkok(preferredDateVal) : 'ไม่ระบุวันสะดวก';

  const rawPreferredTime = estimate.preferred_time || (estimate as any).preferredTime || flashRes?.requested_start_time || (linkedBooking as any)?.requested_start_time || (linkedBooking as any)?.requested_time;
  let preferredTimeDisplay = 'ไม่ระบุ';
  if (rawPreferredTime) {
    const hhmm = extractHHMM(rawPreferredTime) || rawPreferredTime;
    preferredTimeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
  } else if (extractedTime) {
    preferredTimeDisplay = extractedTime;
  }

  const resolvedProposedDate = latestProposedDate || (() => {
    const inMemoryOptions = Array.isArray((estimate as any).date_options)
      ? (estimate as any).date_options.filter((opt: any) => opt.status === 'PENDING')
      : Array.isArray((estimate as any).estimate_request_date_options)
      ? (estimate as any).estimate_request_date_options.filter((opt: any) => opt.status === 'PENDING')
      : [];
    if (inMemoryOptions.length > 0) {
      const latest = [...inMemoryOptions].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (latest?.proposed_date) return latest.proposed_date;
    }
    return estimate.proposed_date || null;
  })();

  const resolvedProposedTime = latestProposedTime || (() => {
    const inMemoryOptions = Array.isArray((estimate as any).date_options)
      ? (estimate as any).date_options.filter((opt: any) => opt.status === 'PENDING')
      : Array.isArray((estimate as any).estimate_request_date_options)
      ? (estimate as any).estimate_request_date_options.filter((opt: any) => opt.status === 'PENDING')
      : [];
    if (inMemoryOptions.length > 0) {
      const latest = [...inMemoryOptions].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (latest?.proposed_time) return latest.proposed_time;
    }
    return estimate.proposed_time || null;
  })();

  const quotedPrice = linkedBooking?.financial?.quoted_price ?? estimate.quoted_price ?? flashDesign?.price ?? 0;
  const depositRequired = 500;

  const descriptionDisplay = cleanNote || 'ไม่มีคำอธิบายเพิ่มเติม';
  const rawImagesList: string[] = [];
  if (flashDesign?.image_url) {
    rawImagesList.push(flashDesign.image_url);
  }
  if (estimate.reference_images && Array.isArray(estimate.reference_images)) {
    rawImagesList.push(...estimate.reference_images);
  }
  if (linkedBooking?.reference_images && Array.isArray(linkedBooking.reference_images)) {
    rawImagesList.push(...linkedBooking.reference_images);
  }
  if ((estimate as any).artwork_image_url) {
    rawImagesList.push((estimate as any).artwork_image_url);
  }

  const refImages = Array.from(new Set(rawImagesList.filter(Boolean)));

  const handleApproveSlip = async () => {
    if (!pendingSubmission) return;
    if (!window.confirm(`ยืนยันอนุมัติหลักฐานการชำระเงินมัดจำจำนวน ${formatCurrency(pendingSubmission.claimed_amount)} หรือไม่?`)) {
      return;
    }

    setIsApprovingSlip(true);
    setSlipError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_approve_payment_submission', {
        p_submission_id: pendingSubmission.id,
        p_verified_amount: Number(pendingSubmission.claimed_amount || 0),
        p_payment_method: 'BANK_TRANSFER',
        p_reference_no: pendingSubmission.reference_no || null,
        p_admin_note: null,
      });

      if (error) throw error;

      setSuccessToast('อนุมัติการชำระเงินมัดจำเรียบร้อยแล้ว — ยืนยันคิวแล้ว');
      setTimeout(() => {
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error approving payment submission:', err);
      setSlipError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติสลิป');
    } finally {
      setIsApprovingSlip(false);
    }
  };

  const handleRejectSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSubmission) return;

    if (!slipRejectReason.trim()) {
      setSlipError('กรุณาระบุเหตุผลในการปฏิเสธสลิป');
      return;
    }

    setIsSubmittingSlipReject(true);
    setSlipError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_reject_payment_submission', {
        p_submission_id: pendingSubmission.id,
        p_rejection_reason: slipRejectReason.trim(),
      });

      if (error) throw error;

      setIsRejectingSlip(false);
      setSuccessToast('ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว');
      setTimeout(() => {
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error rejecting payment submission:', err);
      setSlipError(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธสลิป');
    } finally {
      setIsSubmittingSlipReject(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-500/15 text-blue-300 border border-blue-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอตรวจสอบ
          </span>
        );
      case 'ACCEPTED':
      case 'APPROVED':
        return (
          <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            {status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ยืนยันคำขอแล้ว'}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-500/15 text-red-300 border border-red-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#AFA79A] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
            จำหน่ายแล้ว / เสร็จสิ้น
          </span>
        );
      case 'QUOTED':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            เสนอราคาแล้ว
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
            หมดอายุ
          </span>
        );
      default:
        return null;
    }
  };

  const resetRejectState = () => {
    setSelectedRejectReason('');
    setCustomRejectReason('');
  };

  useEffect(() => {
    if (!isRejecting) {
      resetRejectState();
    }
  }, [isRejecting]);

  const getEffectiveRejectReason = () => {
    if (selectedRejectReason === 'อื่น ๆ') {
      return customRejectReason.trim();
    }
    return selectedRejectReason.trim();
  };

  const isRejectValid = Boolean(
    selectedRejectReason &&
    (selectedRejectReason === 'อื่น ๆ' ? customRejectReason.trim() : true)
  );

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveReason = getEffectiveRejectReason();
    if (!estimate || !effectiveReason) return;

    if (!window.confirm('ยืนยันการปฏิเสธคำขอจองนี้หรือไม่?')) return;

    setIsSubmittingReject(true);
    try {
      const supabase = createClient();
      if (estimate.request_type === 'FLASH' && estimate.flash_reservation) {
        const { error } = await supabase.rpc('admin_process_flash_reservation', {
          p_reservation_id: estimate.flash_reservation.id,
          p_action: 'REJECT',
          p_admin_note: effectiveReason,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('estimate_requests')
          .update({
            status: 'REJECTED',
            quote_note: `ปฏิเสธ: ${effectiveReason}`,
          })
          .eq('id', estimate.id);

        if (error) throw error;
      }
      resetRejectState();
      setIsRejecting(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      console.error('Error rejecting request:', err);
    } finally {
      setIsSubmittingReject(false);
    }
  };



  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 animate-fadeIn"
      />

      {/* Drawer Body */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[560px] bg-studio-card border-l border-studio-border shadow-2xl flex flex-col font-prompt animate-slideInRight h-[100dvh] overflow-hidden">
        
        {/* SECTION 0: HEADER / STATUS (Fixed top) */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between shrink-0 bg-studio-card">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-[#ECE4D3] bg-studio-sec px-2.5 py-1 rounded border border-studio-border">
              {requestCode}
            </span>
            {(() => {
              const isDirectBooking = estimate.request_type === 'DIRECT_BOOKING';
              const isWaitingSlip = Boolean(
                (estimate.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || estimate.has_pending_payment_submission) &&
                estimate.linked_booking?.id &&
                onCheckSlip
              );

              // 1. If customer submitted payment slip awaiting verification: show ONLY "สลิปรอตรวจ" badge
              if (isWaitingSlip) {
                return (
                  <button
                    type="button"
                    onClick={() => onCheckSlip?.(estimate.linked_booking!.id)}
                    title="กดเพื่อตรวจสลิป"
                    className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer"
                  >
                    <span>สลิปรอตรวจ</span>
                  </button>
                );
              }

              // 2. Direct Booking created by Admin
              if (isDirectBooking) {
                return (
                  <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2.5 py-0.5 rounded text-xs font-semibold">
                    สร้างโดยแอดมิน
                  </span>
                );
              }

              // 3. Status Badge: show operational_status if present, otherwise fallback to getStatusBadge(estimate.status)
              if (estimate.operational_status) {
                return (
                  <span className={`${estimate.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                    {estimate.operational_status.label}
                  </span>
                );
              }

              return getStatusBadge(estimate.status);
            })()}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#CFC7BA] hover:text-[#ECE4D3] hover:bg-studio-sec border border-studio-border transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toast Feedback */}
        {successToast && (
          <div className="p-3 bg-emerald-950/80 border-b border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn shrink-0">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
        )}

        {/* Scroll Content (flex-1 overflow-y-auto) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-6 text-xs">
          
          {/* SECTION 1: ADMIN VIEW INTRO */}
          <div className="p-3.5 bg-studio-sec/80 border border-studio-border rounded-xl flex items-start space-x-3 text-[#CFC7BA]">
            <ShieldCheck size={16} className="text-studio-red-bright shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-[#ECE4D3] block text-xs">
                {estimate.request_type === 'FLASH'
                  ? 'รายละเอียดคำขอจองลาย Flash (Admin View)'
                  : 'รายละเอียดคำขอจองงานสัก (Admin View)'}
              </span>
              <p className="text-[11px] text-[#AFA79A] leading-relaxed">
                ดูรายละเอียดคำขอ ติดตามสถานะ และจัดการขั้นตอนของงานสัก
              </p>
            </div>
          </div>

          {/* SECTION 2: ข้อมูลลูกค้าที่ติดต่อ */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red-bright" />
              <span>ข้อมูลลูกค้าที่ติดต่อ</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-[#CFC7BA]">ชื่อลูกค้า:</span>
                <span className="text-[#ECE4D3] font-medium">{customerName || 'ลูกค้า (ไม่ระบุชื่อ)'}</span>
              </div>
              {customerEmail ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">อีเมล:</span>
                  <span className="text-[#ECE4D3] font-mono truncate max-w-[220px]">{customerEmail}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">อีเมล:</span>
                  <span className="text-[#AFA79A] text-xs">ไม่ระบุอีเมล</span>
                </div>
              )}
              {customerPhone ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">เบอร์โทรศัพท์:</span>
                  <a
                    href={`tel:${customerPhone}`}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded transition-colors"
                  >
                    <Phone size={12} />
                    <span>{customerPhone}</span>
                  </a>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">เบอร์โทรศัพท์:</span>
                  <span className="text-[#AFA79A] text-xs">ไม่ระบุเบอร์โทร</span>
                </div>
              )}
              {(() => {
                const customerAge = calculateCustomerAgeYears(customerDob || (estimate as any)?.date_of_birth || (estimate?.linked_booking as any)?.date_of_birth);
                return (
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[#CFC7BA]">อายุลูกค้า:</span>
                    {confirmationState === 'loading' ? (
                      <span className="inline-flex items-center space-x-1 text-[#AFA79A] bg-studio-card/80 border border-studio-border px-2.5 py-0.5 rounded text-[11px]">
                        <span>กำลังตรวจสอบ...</span>
                      </span>
                    ) : customerAge !== null ? (
                      <span className="text-[#ECE4D3] font-mono text-xs font-semibold">
                        {customerAge} ปี
                      </span>
                    ) : (
                      <span className="text-[#AFA79A] text-xs">
                        ไม่พบข้อมูลวันเกิด
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* SECTION 2.5: ข้อมูลสุขภาพที่ลูกค้าแจ้ง */}
          <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 space-y-3 font-prompt">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} className={panelHydratedData.healthStatus === 'loading' ? "text-studio-muted shrink-0" : isHealthUnknown ? "text-amber-400 shrink-0" : isHealthy ? "text-emerald-400 shrink-0" : "text-amber-400 shrink-0"} />
                <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
              </div>
            </div>

            {panelHydratedData.healthStatus === 'loading' ? (
              <div className="flex items-center space-x-2 text-xs text-studio-muted bg-studio-sec/60 border border-[#4A443A]/50 p-2.5 rounded-lg">
                <span>กำลังโหลดข้อมูลสุขภาพ...</span>
              </div>
            ) : isHealthUnknown ? (
              <div className="flex items-center space-x-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-lg">
                <AlertCircle size={15} className="shrink-0 text-amber-400" />
                <span>ไม่สามารถโหลดข้อมูลได้</span>
              </div>
            ) : isUnrecorded ? (
              <div className="flex items-center space-x-2 text-xs text-studio-muted bg-studio-sec/60 border border-[#4A443A]/50 p-2.5 rounded-lg">
                <AlertCircle size={15} className="shrink-0 text-studio-muted" />
                <span>ยังไม่ให้ข้อมูล (ยังไม่ได้ระบุโรคประจำตัวและประวัติการแพ้)</span>
              </div>
            ) : isHealthy ? (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                <span>สุขภาพปกติ (ไม่มีโรคประจำตัวและไม่มีประวัติการแพ้)</span>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {(() => {
                  const hasMedCondition = panelHydratedData.hasMedicalCondition ?? (estimate as any).has_medical_condition;
                  const medConditionNote = panelHydratedData.medicalConditionNote || (estimate as any).medical_condition_note;
                  const hasAllergyCondition = panelHydratedData.hasAllergy ?? (estimate as any).has_allergy;
                  const allergyConditionNote = panelHydratedData.allergyNote || (estimate as any).allergy_note;

                  return (
                    <>
                      {/* โรคประจำตัว */}
                      {hasMedCondition === true ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              โรคประจำตัว
                            </span>
                            <span className="inline-flex items-center space-x-1 text-amber-300 bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 rounded text-[11px] font-medium">
                              <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                              <span>มีโรคประจำตัว</span>
                            </span>
                          </div>
                          {medConditionNote?.trim() ? (
                            <p className="text-xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/40 whitespace-pre-wrap leading-relaxed">
                              {medConditionNote.trim()}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-300/70 bg-amber-500/5 p-2 rounded-lg border border-amber-400/40 font-light italic">
                              ลูกค้าแจ้งว่ามีโรคประจำตัว (ไม่ได้ระบุรายละเอียด)
                            </p>
                          )}
                        </div>
                      ) : hasMedCondition === false ? (
                        <div className="flex items-center justify-between text-xs py-0.5">
                          <span className="text-studio-muted">โรคประจำตัว:</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                            <CheckCircle2 size={12} /> ไม่มีโรคประจำตัว
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs py-0.5">
                          <span className="text-studio-muted">โรคประจำตัว:</span>
                          <span className="text-studio-muted text-[11px]">ไม่พบข้อมูล</span>
                        </div>
                      )}

                      {/* ประวัติการแพ้ */}
                      {hasAllergyCondition === true ? (
                        <div className={`space-y-1.5 ${hasMedCondition !== undefined && hasMedCondition !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              ประวัติการแพ้
                            </span>
                            <span className="inline-flex items-center space-x-1 text-amber-300 bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 rounded text-[11px] font-medium">
                              <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                              <span>มีประวัติภูมิแพ้</span>
                            </span>
                          </div>
                          {allergyConditionNote?.trim() ? (
                            <p className="text-xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/40 whitespace-pre-wrap leading-relaxed">
                              {allergyConditionNote.trim()}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-300/70 bg-amber-500/5 p-2 rounded-lg border border-amber-400/40 font-light italic">
                              ลูกค้าแจ้งว่ามีประวัติการแพ้ (ไม่ได้ระบุรายละเอียด)
                            </p>
                          )}
                        </div>
                      ) : hasAllergyCondition === false ? (
                        <div className={`flex items-center justify-between text-xs py-0.5 ${hasMedCondition !== undefined && hasMedCondition !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                          <span className="text-studio-muted">ประวัติการแพ้:</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                            <CheckCircle2 size={12} /> ไม่มีอาการแพ้
                          </span>
                        </div>
                      ) : (
                        <div className={`flex items-center justify-between text-xs py-0.5 ${hasMedCondition !== undefined && hasMedCondition !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                          <span className="text-studio-muted">ประวัติการแพ้:</span>
                          <span className="text-studio-muted text-[11px]">ไม่พบข้อมูล</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* SECTION 3: วันที่ต้องการสัก & วันที่ส่งคำขอ */}
          {(() => {
            const prefWarning = preferredDateVal
              ? checkExistingDateWarning(preferredDateVal, estimate.artist_id, blockedDates, rawArtistNickname || rawArtistName)
              : { hasWarning: false, warningMessage: null };

            return (
              <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                  <Calendar size={14} className="text-studio-red-bright" />
                  <span>วันที่ต้องการสัก & วันที่ส่งคำขอ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[#CFC7BA] text-[10px] block">วันที่ลูกค้าเลือก</span>
                    <span className="text-sm font-semibold text-[#ECE4D3]">
                      {preferredDateVal ? formatDateBangkok(preferredDateVal) : 'ไม่ระบุ'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#CFC7BA] text-[10px] block">เวลาที่เลือก</span>
                    <span className="text-sm font-semibold text-[#ECE4D3]">
                      {preferredTimeDisplay}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#CFC7BA] text-[10px] block">วันที่ส่งคำขอ</span>
                    <span className="text-xs font-medium text-[#ECE4D3]">
                      {(() => {
                        const submitTime = (estimate as any).submitted_at || estimate.created_at;
                        return submitTime ? formatDateTimeBangkok(submitTime) : '-';
                      })()}
                    </span>
                  </div>
                </div>
                {prefWarning.hasWarning && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-center gap-2 mt-2">
                    <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                    <span>{prefWarning.warningMessage}</span>
                  </div>
                )}
                {(estimate.is_date_proposed || Boolean((estimate as any).proposed_date) || Boolean(estimate.flash_reservation?.proposed_date)) && (
                  <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl space-y-1.5 mt-2">
                    <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-xs">
                      <CalendarClock size={15} className="shrink-0" />
                      <span>เสนอวันใหม่แล้ว — รอลูกค้ายืนยัน</span>
                    </div>
                    {(resolvedProposedDate || (estimate as any).proposed_date || estimate.flash_reservation?.proposed_date) && (
                      <div className="text-xs text-[#E2DDD4]">
                        <span>วันและเวลาที่เสนอ: </span>
                        <span className="text-amber-200 font-semibold">
                          {formatDateBangkok(resolvedProposedDate || (estimate as any).proposed_date || estimate.flash_reservation?.proposed_date)}
                          {(resolvedProposedTime || (estimate as any).proposed_time || estimate.flash_reservation?.proposed_time) ? ` เวลา ${extractHHMM((resolvedProposedTime || (estimate as any).proposed_time || estimate.flash_reservation?.proposed_time)!) || (resolvedProposedTime || (estimate as any).proposed_time || estimate.flash_reservation?.proposed_time)} น.` : ''}
                        </span>
                      </div>
                    )}
                    {(estimate.proposed_artist_note || (estimate as any).proposal_note || estimate.flash_reservation?.proposal_note) && (
                      <p className="text-xs text-[#E2DDD4] leading-relaxed">
                        ข้อความถึงลูกค้า: <span className="text-[#ECE4D3] font-medium">{estimate.proposed_artist_note || (estimate as any).proposal_note || estimate.flash_reservation?.proposal_note}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 4: รายละเอียดงานสักที่ต้องการ */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
              <Layers size={14} className="text-studio-red-bright" />
              <span>{estimate.request_type === 'FLASH' ? 'รายละเอียดคำขอจอง Flash' : 'รายละเอียดงานสักที่ต้องการ'}</span>
            </div>
            <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
              {isFlash && (flashDesign?.title || (estimate.flash_reservation as any)?.flash_designs?.title || (estimate as any).artwork_title) && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">ชื่อลาย Flash:</span>
                  <span className="text-[#ECE4D3] font-medium">{flashDesign?.title || (estimate.flash_reservation as any)?.flash_designs?.title || (estimate as any).artwork_title}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-[#CFC7BA]">{estimate.request_type === 'FLASH' ? 'ช่างเจ้าของลาย:' : 'ช่างที่ลูกค้าเลือก:'}</span>
                <span className="text-[#ECE4D3] font-medium">{artistDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#CFC7BA]">สไตล์ลายสัก:</span>
                <span className="text-[#ECE4D3] font-medium">{styleDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#CFC7BA]">ตำแหน่งที่สัก:</span>
                <span className="text-[#ECE4D3] font-medium">{placementDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#CFC7BA]">ขนาดประมาณ:</span>
                <span className="text-[#ECE4D3] font-mono">{sizeDisplay}</span>
              </div>
              {estimate.color_technique && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#CFC7BA]">ลักษณะการลงสี:</span>
                  <span className="text-[#ECE4D3] font-medium">{getColorTechniqueLabel(estimate.color_technique)}</span>
                </div>
              )}
            </div>

            {cleanNote && (
              <div className="pt-2 border-t border-studio-border/60">
                <span className="text-[#AFA79A] text-[10px] block mb-1">รายละเอียดเพิ่มเติมจากลูกค้า:</span>
                <p className="text-[#ECE4D3] text-xs bg-studio-sec p-3 rounded-lg border border-studio-border whitespace-pre-wrap leading-relaxed">
                  {cleanNote}
                </p>
              </div>
            )}
          </div>

          {/* SECTION 5: รูปภาพอ้างอิง */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <span className="text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold block">
              รูปภาพอ้างอิง
            </span>
            {refImages.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {refImages.map((imgUrl: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewModal({ src: imgUrl, type: 'reference' })}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-studio-border bg-studio-sec cursor-pointer hover:border-studio-red/60 transition-colors relative group"
                  >
                    <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Maximize2 size={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-studio-sec/40 border border-studio-border/60 rounded-lg text-center text-[#AFA79A] text-[11px]">
                ไม่มีภาพอ้างอิงแนบมากับคำขอนี้
              </div>
            )}
          </div>

          {/* FLASH DEPOSIT SLIP VERIFICATION CARD (Under Reference Images) */}
          {isFlash && pendingSubmission && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
              <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  หลักฐานการชำระเงินมัดจำ
                </span>
              </div>

              {/* Standalone Card with 3 stacked rows */}
              <div className="bg-studio-sec border border-studio-border rounded-xl p-3.5 space-y-2.5 text-xs">
                {/* Row 1: ยอดมัดจำที่ต้องชำระ */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#CFC7BA]">ยอดมัดจำที่ต้องชำระ:</span>
                  <span className="text-sm font-bold text-[#ECE4D3] font-mono">
                    ฿{formatCurrency(estimate.deposit_required || (linkedBooking as any)?.deposit_amount || 500)}
                  </span>
                </div>

                {/* Row 2: ยอดที่ลูกค้าจ่าย */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/50">
                  <span className="text-[#CFC7BA]">ยอดที่ลูกค้าจ่าย:</span>
                  <span className="text-sm font-bold text-amber-300 font-mono">
                    ฿{formatCurrency(pendingSubmission.claimed_amount)}
                  </span>
                </div>

                {/* Row 3: หลักฐานสลิป */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/50">
                  <span className="text-[#CFC7BA]">หลักฐานสลิป:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const slipUrl = pendingSubmission.proof_image_url || pendingSubmission.slip_path || null;
                      if (slipUrl) setPreviewModal({ src: slipUrl, type: 'slip' });
                    }}
                    className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye size={14} />
                    <span>ดูสลิป</span>
                  </button>
                </div>
              </div>

              {/* Slip Error Feedback */}
              {slipError && (
                <div className="p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{slipError}</span>
                </div>
              )}

              {/* Actions Under Card (2 full-width vertical buttons) */}
              {isRejectingSlip ? (
                <form onSubmit={handleRejectSlip} className="pt-2 border-t border-studio-border/50 space-y-2.5 animate-fadeIn">
                  <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                  <input
                    type="text"
                    required
                    value={slipRejectReason}
                    onChange={(e) => setSlipRejectReason(e.target.value)}
                    placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                    className="w-full bg-studio-card border border-studio-border rounded-lg p-2 text-xs text-studio-primary focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejectingSlip(false)}
                      className="px-3 py-1.5 bg-studio-card text-xs text-studio-muted rounded border border-studio-border hover:text-studio-primary"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingSlipReject}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium disabled:opacity-50"
                    >
                      {isSubmittingSlipReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธสลิป'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2 pt-1 w-full">
                  <button
                    type="button"
                    disabled={isApprovingSlip}
                    onClick={handleApproveSlip}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>{isApprovingSlip ? 'กำลังบันทึก...' : 'ยืนยันสลิป & ยืนยันคิว'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRejectingSlip(true)}
                    className="w-full py-2.5 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <XCircle size={15} className="shrink-0" />
                    <span>ปฏิเสธสลิป</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECTION 5.5: เหตุผลที่ปฏิเสธ (สำหรับสถานะ REJECTED) */}
          {estimate.status === 'REJECTED' && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 space-y-2 font-prompt">
              <div className="flex items-center space-x-2 text-red-400 text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} className="shrink-0" />
                <span>เหตุผลที่ปฏิเสธ</span>
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed font-light bg-black/40 p-3 rounded-lg border border-red-900/40">
                {estimate.quote_note || (linkedBooking as any)?.rejection_reason || (estimate as any).rejection_reason || 'ขออภัย ทางร้านไม่สามารถรับคำขอจองนี้ได้เนื่องจากไม่ตรงตามเงื่อนไข'}
              </p>
            </div>
          )}

          {/* Pending Deposit Payment Submission for Custom Requests */}
          {!isFlash && pendingSubmission && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
              <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  หลักฐานการชำระเงินมัดจำ
                </span>
              </div>

              {/* Standalone Card with 3 stacked rows */}
              <div className="bg-studio-sec border border-studio-border rounded-xl p-3.5 space-y-2.5 text-xs">
                {/* Row 1: ยอดมัดจำที่ต้องชำระ */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#CFC7BA]">ยอดมัดจำที่ต้องชำระ:</span>
                  <span className="text-sm font-bold text-[#ECE4D3] font-mono">
                    ฿{formatCurrency(estimate.deposit_required || (linkedBooking as any)?.deposit_amount || 500)}
                  </span>
                </div>

                {/* Row 2: ยอดที่ลูกค้าจ่าย */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/50">
                  <span className="text-[#CFC7BA]">ยอดที่ลูกค้าจ่าย:</span>
                  <span className="text-sm font-bold text-amber-300 font-mono">
                    ฿{formatCurrency(pendingSubmission.claimed_amount)}
                  </span>
                </div>

                {/* Row 3: หลักฐานสลิป */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/50">
                  <span className="text-[#CFC7BA]">หลักฐานสลิป:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const slipUrl = pendingSubmission.proof_image_url || pendingSubmission.slip_path || null;
                      if (slipUrl) setPreviewModal({ src: slipUrl, type: 'slip' });
                    }}
                    className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye size={14} />
                    <span>ดูสลิป</span>
                  </button>
                </div>
              </div>

              {/* Slip Error Feedback */}
              {slipError && (
                <div className="p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{slipError}</span>
                </div>
              )}

              {/* Slip Actions */}
              {isRejectingSlip ? (
                <form onSubmit={handleRejectSlip} className="pt-2 border-t border-studio-border/50 space-y-2.5 animate-fadeIn">
                  <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                  <input
                    type="text"
                    required
                    value={slipRejectReason}
                    onChange={(e) => setSlipRejectReason(e.target.value)}
                    placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                    className="w-full bg-studio-card border border-studio-border rounded-lg p-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejectingSlip(false)}
                      className="px-3 py-1.5 bg-studio-card text-xs text-[#AFA79A] rounded border border-studio-border hover:text-[#ECE4D3]"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingSlipReject}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium disabled:opacity-50"
                    >
                      {isSubmittingSlipReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธสลิป'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2 pt-1 w-full">
                  <button
                    type="button"
                    disabled={isApprovingSlip}
                    onClick={handleApproveSlip}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span className="truncate">{isApprovingSlip ? 'กำลังบันทึก...' : 'ยืนยันสลิป & ยืนยันคิว'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRejectingSlip(true)}
                    className="w-full py-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
                  >
                    <XCircle size={15} className="shrink-0" />
                    <span className="truncate">ปฏิเสธสลิป</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Action Footer (shrink-0 p-4 border-t bg-studio-card) */}
        {estimate.status === 'PENDING' && estimate.request_type !== 'FLASH' ? (
          <div className="shrink-0 p-4 border-t border-studio-border bg-studio-card space-y-2">
            <button
              id="btn-open-manage-form"
              type="button"
              onClick={() => {
                setAcceptError(null);
                setIsConfirmingAccept(true);
              }}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 hover:border-emerald-500 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Calendar size={14} className="shrink-0 text-white" />
              <span>รับคำขอ</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProposingDates(true)}
              className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-600 border border-amber-600 hover:border-amber-500 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarClock size={14} className="shrink-0 text-white" />
              <span>{estimate.is_date_proposed ? 'เสนอวันใหม่อีกครั้ง' : 'เสนอวันใหม่'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetRejectState();
                setIsRejecting(true);
              }}
              className="w-full py-2.5 px-4 bg-red-800 hover:bg-red-700 border border-red-700 hover:border-red-600 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <XCircle size={14} className="shrink-0 text-white" />
              <span>ปฏิเสธคำขอ</span>
            </button>
          </div>
        ) : estimate.request_type === 'FLASH' && !pendingSubmission ? (
          <div className="shrink-0 p-4 border-t border-studio-border bg-studio-card space-y-3 font-prompt">
            {flashError && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 text-xs text-red-300 rounded-lg flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span>{flashError}</span>
              </div>
            )}

            {estimate.status === 'PENDING' && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isSubmittingFlash}
                  onClick={() => handleProcessFlashReservation('APPROVE')}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 hover:border-emerald-500 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{isSubmittingFlash ? 'กำลังบันทึก...' : 'อนุมัติคำขอ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsProposingDates(true)}
                  disabled={isSubmittingFlash}
                  className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-600 border border-amber-600 hover:border-amber-500 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CalendarClock size={14} className="shrink-0 text-white" />
                  <span>{(estimate.is_date_proposed || Boolean((estimate as any).proposed_date) || Boolean(estimate.flash_reservation?.proposed_date)) ? 'เสนอวันใหม่อีกครั้ง' : 'เสนอวันใหม่'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingFlash}
                  onClick={() => {
                    resetRejectState();
                    setIsRejecting(true);
                  }}
                  className="w-full py-2.5 px-4 bg-red-800 hover:bg-red-700 border border-red-700 hover:border-red-600 text-white rounded-xl font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <XCircle size={14} className="shrink-0" />
                  <span>{isSubmittingFlash ? 'กำลังบันทึก...' : 'ปฏิเสธคำขอ'}</span>
                </button>
              </div>
            )}

            {(estimate.status === 'APPROVED' || estimate.status === 'ACCEPTED') && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmittingFlash}
                  onClick={() => handleProcessFlashReservation('COMPLETE')}
                  className="px-2 py-2.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-xs font-bold text-white rounded-xl transition-colors flex items-center justify-center gap-1 shadow cursor-pointer disabled:opacity-50 min-w-0"
                >
                  <Sparkles size={14} className="shrink-0" />
                  <span className="truncate">{isSubmittingFlash ? 'กำลังบันทึก...' : 'จำหน่ายแล้ว (SOLD)'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingFlash}
                  onClick={() => handleProcessFlashReservation('CANCEL')}
                  className="px-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 min-w-0"
                >
                  <XCircle size={14} className="shrink-0" />
                  <span className="truncate">ยกเลิกคำขอ</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="shrink-0 p-4 border-t border-studio-border bg-studio-card">
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-studio-sec hover:bg-studio-card text-[#CFC7BA] hover:text-[#ECE4D3] rounded-xl font-semibold text-xs border border-studio-border transition-colors cursor-pointer"
            >
              ปิด
            </button>
          </div>
        )}
      </div>

      {/* Admin Confirm Accept Request Child Modal Overlay */}
      {isConfirmingAccept && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl font-prompt my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-[#ECE4D3]">ยืนยันรับคำขอ</h3>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingAccept) {
                    setIsConfirmingAccept(false);
                    setAcceptError(null);
                  }
                }}
                disabled={isSubmittingAccept}
                className="text-[#CFC7BA] hover:text-[#ECE4D3] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#CFC7BA] leading-relaxed">
                ระบบจะส่งคำขอมัดจำ 500 บาทให้ลูกค้า และคงล็อกวัน/เวลาที่ลูกค้าเลือกไว้
              </p>

              {acceptError && (
                <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{acceptError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingAccept(false);
                    setAcceptError(null);
                  }}
                  disabled={isSubmittingAccept}
                  className="px-4 py-2 bg-studio-sec hover:bg-studio-card text-xs text-[#CFC7BA] rounded-xl border border-studio-border font-medium cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleAcceptRequest}
                  disabled={isSubmittingAccept}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs text-white rounded-xl font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingAccept ? (
                    <span>กำลังบันทึก...</span>
                  ) : (
                    <span>รับคำขอและส่งคำขอมัดจำ</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Admin Reject Request Child Modal Overlay */}
      {isRejecting && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl font-prompt my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-red-400">ระบุเหตุผลในการปฏิเสธคำขอ</h3>
              <button
                type="button"
                onClick={() => {
                  resetRejectState();
                  setIsRejecting(false);
                }}
                disabled={isSubmittingReject}
                className="text-[#CFC7BA] hover:text-[#ECE4D3] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleReject} className="space-y-4 text-xs">
              {/* Section: เลือกเหตุผลในการปฏิเสธ */}
              <div className="space-y-2">
                <label className="font-semibold text-xs text-[#ECE4D3] block">
                  เลือกเหตุผลในการปฏิเสธ
                </label>
                <div className="space-y-1.5">
                  {REJECT_REASON_PRESETS.map((preset, idx) => {
                    const isSelected = selectedRejectReason === preset;
                    return (
                      <label
                        key={idx}
                        onClick={() => setSelectedRejectReason(preset)}
                        className={`p-2.5 rounded-xl border transition-all flex items-center space-x-2.5 cursor-pointer ${
                          isSelected
                            ? 'border-red-500/50 bg-red-950/30 text-[#ECE4D3] font-medium'
                            : 'border-studio-border bg-studio-main hover:border-red-800/40 text-[#CFC7BA]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="reject_reason_preset"
                          checked={isSelected}
                          onChange={() => setSelectedRejectReason(preset)}
                          className="w-3.5 h-3.5 accent-red-500 cursor-pointer shrink-0"
                        />
                        <span className="text-xs leading-normal">{preset}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {selectedRejectReason === 'อื่น ๆ' && (
                <div className="space-y-1.5 pt-1">
                  <textarea
                    rows={3}
                    required
                    value={customRejectReason}
                    onChange={(e) => setCustomRejectReason(e.target.value)}
                    placeholder="ระบุเหตุผลเพิ่มเติม เพื่อแจ้งให้ลูกค้าทราบ"
                    disabled={isSubmittingReject}
                    className="w-full bg-studio-main border border-studio-border focus:border-red-500/50 rounded-xl p-3 text-xs text-[#ECE4D3] placeholder-[#AFA79A] focus:outline-none font-prompt resize-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => {
                    resetRejectState();
                    setIsRejecting(false);
                  }}
                  disabled={isSubmittingReject}
                  className="px-4 py-2 bg-studio-sec hover:bg-studio-card text-xs text-[#CFC7BA] rounded-xl border border-studio-border font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReject || !isRejectValid}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-xs text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Admin Propose New Dates Modal Overlay */}
      {isProposingDates && estimate && (
        <ProposeMultiDatesModal
          isOpen={isProposingDates}
          estimateRequestId={estimate.request_type === 'FLASH' ? null : estimate.id}
          flashReservationId={estimate.request_type === 'FLASH' ? (estimate.flash_reservation?.id || estimate.id) : null}
          requestCode={estimate.request_type === 'FLASH' ? `FLASH-${(estimate.flash_reservation?.id || estimate.id).slice(0, 8).toUpperCase()}` : (estimate.id ? (estimate.id.length > 8 ? `REQ-${estimate.id.slice(0, 8).toUpperCase()}` : `REQ-${estimate.id.toUpperCase()}`) : undefined)}
          customerName={estimate.customer_name}
          tattooSize={estimate.request_type === 'FLASH' ? ((estimate.flash_reservation?.flash_design as any)?.size_label || formatTattooSize(estimate.width_cm, estimate.height_cm)) : formatTattooSize(estimate.width_cm, estimate.height_cm)}
          preferredDate={estimate.preferred_date || (estimate as any).requested_date || estimate.flash_reservation?.requested_date}
          preferredTime={estimate.preferred_time || (estimate as any).requested_start_time || (estimate as any).preferredTime || estimate.flash_reservation?.requested_start_time || null}
          defaultDate={(estimate.is_date_proposed || Boolean((estimate as any).proposed_date) || Boolean(estimate.flash_reservation?.proposed_date)) ? (resolvedProposedDate || latestProposedDate || (estimate as any).proposed_date || estimate.flash_reservation?.proposed_date || null) : null}
          defaultTime={(estimate.is_date_proposed || Boolean((estimate as any).proposed_date) || Boolean(estimate.flash_reservation?.proposed_date)) ? (resolvedProposedTime || latestProposedTime || (estimate as any).proposed_time || estimate.flash_reservation?.proposed_time || null) : null}
          onClose={() => setIsProposingDates(false)}
          onSuccess={() => {
            setIsProposingDates(false);
            onRefresh();
            onClose();
          }}
        />
      )}

      {/* Lightbox Modal for Image Preview */}
      {previewModal && mounted && createPortal(
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
        >
          <div className="max-w-full max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            {previewModal.type === 'reference' ? (
              <CustomerReferenceImage
                src={previewModal.src}
                alt="Reference Image Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <PaymentSlipImage
                src={previewModal.src}
                alt="Payment Slip Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
          <button
            onClick={() => setPreviewModal(null)}
            className="absolute top-4 right-4 text-[#ECE4D3] bg-[#171512] border border-[#4A443A] p-2 rounded-full hover:border-[#9C2F2F] transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}
