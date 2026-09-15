'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import ReferenceUploader from './ReferenceUploader';
import TattooSizeInput from './TattooSizeInput';
import PlacementSelector from './PlacementSelector';
import DatePickerPopover from '../booking/DatePickerPopover';
import CustomerLoginModal from '../auth/CustomerLoginModal';

const HOURLY_TIME_OPTIONS = [
  { value: '', label: '-- เลือกเวลา (10:00 - 23:00) --' },
  { value: '10:00', label: '10:00 น.' },
  { value: '11:00', label: '11:00 น.' },
  { value: '12:00', label: '12:00 น.' },
  { value: '13:00', label: '13:00 น.' },
  { value: '14:00', label: '14:00 น.' },
  { value: '15:00', label: '15:00 น.' },
  { value: '16:00', label: '16:00 น.' },
  { value: '17:00', label: '17:00 น.' },
  { value: '18:00', label: '18:00 น.' },
  { value: '19:00', label: '19:00 น.' },
  { value: '20:00', label: '20:00 น.' },
  { value: '21:00', label: '21:00 น.' },
  { value: '22:00', label: '22:00 น.' },
  { value: '23:00', label: '23:00 น.' },
];
import { getThailandTodayStr } from '../portal/portalUtils';
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  User, 
  Calendar, 
  Image as ImageIcon, 
  Send,
  Clock,
  DollarSign,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  HeartPulse,
  ClipboardCheck
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface EstimateFormProps {
  initialArtistId?: string;
  preselectedArtistId?: string;
  preselectedArtworkImage?: string;
  preselectedStyle?: string;
  preselectedType?: 'ESTIMATE' | 'DIRECT_BOOKING';
  serviceType?: string | null;
  flashId?: string;
  compact?: boolean;
  onSuccess?: (requestId: string, bookingId?: string) => void;
}

const getArtistSpecialties = (artistObj?: any): string[] => {
  if (!artistObj) return [];
  const specs = Array.isArray(artistObj.specialties) && artistObj.specialties.length > 0
    ? artistObj.specialties.map((s: string) => s.trim()).filter(Boolean)
    : [];
  return specs.filter((s: string) => s !== 'ตามที่ช่างแนะนำ');
};

const translateRpcError = (msg: string): string => {
  if (!msg) return 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว';
  if (msg.includes('INVALID_SERVICE_TYPE')) {
    return 'กรุณาเลือกประเภทงานสักให้ถูกต้องก่อนดำเนินการต่อ';
  }
  if (msg.includes('ARTIST_DATE_BLOCKED')) {
    return 'ช่างปิดรับคิวในวันที่เลือก กรุณาเลือกวันอื่น';
  }
  if (msg.includes('ARTIST_DAY_ALREADY_BOOKED')) {
    return 'ช่างมีคิวในวันที่เลือกแล้ว กรุณาเลือกวันอื่น';
  }
  if (msg.includes('Cannot request booking for a past date')) {
    return 'ไม่สามารถเลือกวันที่ย้อนหลังได้';
  }
  if (msg.includes('placement is required')) {
    return 'กรุณาระบุตำแหน่งบนร่างกายให้ครบถ้วน';
  }
  if (msg.includes('p_requested_date is required')) {
    return 'กรุณาเลือกวันที่ต้องการจองคิว';
  }
  if (msg.includes('p_artist_id is required')) {
    return 'กรุณาเลือกช่างสักที่ต้องการ';
  }
  if (msg.includes('Authentication required') || msg.includes('42501')) {
    return 'กรุณาเข้าสู่ระบบเพื่อดำเนินการส่งคำขอจองคิว';
  }
  return msg;
};

const STEPS = [
  { step: 1, title: 'เลือกช่าง', subtitle: 'เลือกช่างสัก' },
  { step: 2, title: 'วันและเวลา', subtitle: 'เลือกวันและเวลา' },
  { step: 3, title: 'รายละเอียดงาน', subtitle: 'รายละเอียดงานสัก' },
  { step: 4, title: 'สุขภาพ', subtitle: 'ข้อมูลสุขภาพ' },
  { step: 5, title: 'ตรวจสอบ', subtitle: 'ตรวจสอบคำขอ' },
];

export default function EstimateForm({ 
  initialArtistId = '', 
  preselectedArtistId,
  preselectedArtworkImage,
  preselectedStyle,
  preselectedType,
  serviceType,
  flashId,
  compact = false,
  onSuccess 
}: EstimateFormProps) {
  const router = useRouter();
  const formTopRef = useRef<HTMLDivElement>(null);

  const { 
    artists, 
    isLoggedIn, 
    isCustomerProfileComplete,
    user,
    supabase,
    estimateDraft, 
    setEstimateDraft 
  } = useApp();

  // Multi-Step Form State (5 Steps)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Flash Design State
  const [flashData, setFlashData] = useState<any | null>(null);
  const [loadingFlash, setLoadingFlash] = useState(!!flashId);
  const [flashError, setFlashError] = useState('');

  // Common / Normal Booking Form State
  const [artistId, setArtistId] = useState(preselectedArtistId || initialArtistId || '');
  const [referenceImage, setReferenceImage] = useState(preselectedArtworkImage || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(preselectedArtworkImage ? [preselectedArtworkImage] : []);
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [placement, setPlacement] = useState('');
  const [style, setStyle] = useState(preselectedStyle || '');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');

  // Health Disclosure State
  const [hasMedicalCondition, setHasMedicalCondition] = useState(false);
  const [medicalConditionNote, setMedicalConditionNote] = useState('');
  const [hasAllergy, setHasAllergy] = useState(false);
  const [allergyNote, setAllergyNote] = useState('');

  // Submission State
  const [submitted, setSubmitted] = useState(false);
  const [isFlashSubmission, setIsFlashSubmission] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
  const [newBookingId, setNewBookingId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollToTop = () => {
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 1. Load Flash Record if flashId is provided
  useEffect(() => {
    if (!flashId) {
      setFlashData(null);
      setLoadingFlash(false);
      return;
    }

    let isMounted = true;
    setLoadingFlash(true);
    setFlashError('');

    supabase
      .from('flash_designs')
      .select(`
        id,
        artist_id,
        title,
        description,
        price,
        deposit_amount,
        estimated_duration_minutes,
        image_url,
        additional_images,
        status,
        artists:artist_id (id, name, avatar),
        artist:artist_id (id, name, avatar)
      `)
      .eq('id', flashId)
      .single()
      .then(({ data, error: err }: any) => {
        if (!isMounted) return;
        setLoadingFlash(false);
        if (err || !data) {
          console.error('Error fetching flash design:', err);
          setFlashError('ไม่พบข้อมูลแบบลายสัก Flash ที่ระบุ');
          return;
        }

        setFlashData(data);
        if (data.artist_id) setArtistId(data.artist_id);
        if (data.image_url) {
          setReferenceImage(data.image_url);
          setReferenceImages([data.image_url, ...(data.additional_images || [])]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [flashId, supabase]);

  // Handle Artist Selection & Sync Style
  const handleArtistSelect = (selectedId: string) => {
    setArtistId(selectedId);
    setError('');

    const artistObj = artists.find((a) => a.id === selectedId);
    const specialties = getArtistSpecialties(artistObj);

    if (specialties.length > 0) {
      if (!style || !specialties.includes(style)) {
        setStyle(specialties[0]);
      }
    } else {
      setStyle('');
    }
  };

  // Restore draft if user just logged in
  useEffect(() => {
    if (estimateDraft && isLoggedIn && user) {
      if (estimateDraft.artistId) setArtistId(estimateDraft.artistId);
      if (estimateDraft.referenceImage) setReferenceImage(estimateDraft.referenceImage);
      if (estimateDraft.referenceImages && estimateDraft.referenceImages.length > 0) {
        setReferenceImages(estimateDraft.referenceImages);
      }
      if (estimateDraft.width) setWidth(estimateDraft.width);
      if (estimateDraft.height) setHeight(estimateDraft.height);
      if (estimateDraft.placement) setPlacement(estimateDraft.placement);
      if (estimateDraft.style) setStyle(estimateDraft.style);
      if (estimateDraft.description) setDescription(estimateDraft.description);
      if (estimateDraft.preferredDate) setPreferredDate(estimateDraft.preferredDate);
      if (estimateDraft.preferredTime) setPreferredTime(estimateDraft.preferredTime);
      setEstimateDraft(null);
    }
  }, [estimateDraft, isLoggedIn, user, setEstimateDraft]);

  // Save Draft helper for guest users
  const saveDraft = () => {
    setEstimateDraft({
      artistId,
      artistName: artists.find((a) => a.id === artistId)?.name || '',
      referenceImage: referenceImages[0] || referenceImage || '',
      referenceImages: referenceImages.length > 0 ? referenceImages : (referenceImage ? [referenceImage] : []),
      width,
      height,
      placement,
      style,
      work_type: null,
      description,
      preferredDate: preferredDate || undefined,
      preferredTime: preferredTime || undefined,
    } as any);
  };

  // =========================================================================
  // STEP VALIDATIONS
  // =========================================================================

  // STEP 1 VALIDATION (เลือกช่างสัก - ARTIST ONLY)
  const validateStep1 = (): boolean => {
    setError('');
    if (!artistId) {
      setError('กรุณาเลือกช่างสักที่ต้องการ');
      return false;
    }
    return true;
  };

  // STEP 2 VALIDATION (เลือกวันและเวลา - DATE & TIME)
  const validateStep2 = async (): Promise<boolean> => {
    setError('');

    if (!preferredDate) {
      setError('กรุณาเลือกวันที่ต้องการจองคิว');
      return false;
    }

    if (preferredDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return false;
    }

    if (!preferredTime || !preferredTime.trim()) {
      setError('กรุณาเลือกเวลาที่สะดวก');
      return false;
    }

    const t = preferredTime.trim();
    const validTimes = HOURLY_TIME_OPTIONS.map((o) => o.value).filter(Boolean);
    if (!validTimes.includes(t)) {
      setError('กรุณาเลือกเวลาระหว่าง 10:00–23:00 น.');
      return false;
    }

    // Availability validation check against busy ranges
    if (preferredDate && artistId) {
      try {
        const { data: busyCheck } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: artistId,
          p_start_date: preferredDate,
          p_end_date: preferredDate,
        });
        if (Array.isArray(busyCheck) && busyCheck.length > 0) {
          setError('วันที่เลือกมีคิวงานที่ยืนยันแล้วของช่างสักท่านนี้ กรุณาเลือกวันอื่น');
          return false;
        }
      } catch (err: any) {
        console.warn('Busy check warning:', err);
      }
    }

    return true;
  };

  // STEP 3 VALIDATION (รายละเอียดงานสัก)
  const validateStep3 = (): boolean => {
    setError('');

    if (flashId && flashData) {
      if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ (Others)' || placement.trim().toLowerCase() === 'others') {
        setError('กรุณาระบุตำแหน่งบนร่างกายให้ครบถ้วน');
        return false;
      }
      return true;
    }

    if (!style) {
      setError('กรุณาเลือกสไตล์งานสัก');
      return false;
    }

    const selectedArtistObj = artists.find((a) => a.id === artistId);
    const availableStyles = getArtistSpecialties(selectedArtistObj);
    if (style !== 'ตามที่ช่างแนะนำ' && availableStyles.length > 0 && !availableStyles.includes(style)) {
      setError('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่');
      return false;
    }

    if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ (Others)' || placement.trim().toLowerCase() === 'others') {
      setError('กรุณาระบุตำแหน่งที่ต้องการสัก');
      return false;
    }

    if (!width || Number(width) <= 0 || !height || Number(height) <= 0) {
      setError('กรุณาระบุขนาดของงานสัก (ความกว้างและความสูงต้องมากกว่า 0 ซม.)');
      return false;
    }

    const hasRefImage = Boolean(referenceImage || (referenceImages && referenceImages.length > 0));
    if (!hasRefImage) {
      setError('กรุณาอัปโหลดรูปภาพอ้างอิงอย่างน้อย 1 รูป');
      return false;
    }

    return true;
  };

  // STEP 4 VALIDATION (ข้อมูลสุขภาพ)
  const validateStep4 = (): boolean => {
    setError('');

    if (hasMedicalCondition && (!medicalConditionNote || !medicalConditionNote.trim())) {
      setError('กรุณาระบุรายละเอียดโรคประจำตัวที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return false;
    }

    if (hasAllergy && (!allergyNote || !allergyNote.trim())) {
      setError('กรุณาระบุรายละเอียดประวัติภูมิแพ้ที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return false;
    }

    return true;
  };

  // NEXT / PREV BUTTON HANDLERS
  const handleNextStep = async () => {
    setLoading(true);
    let ok = false;
    if (currentStep === 1) {
      ok = validateStep1();
    } else if (currentStep === 2) {
      ok = await validateStep2();
    } else if (currentStep === 3) {
      ok = validateStep3();
    } else if (currentStep === 4) {
      ok = validateStep4();
    }
    setLoading(false);

    if (ok) {
      setError('');
      setCurrentStep((prev) => Math.min(prev + 1, 5));
      scrollToTop();
    }
  };

  const handlePrevStep = () => {
    setError('');
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    scrollToTop();
  };

  // MAIN FORM SUBMIT HANDLER (STEP 5 FINAL SUBMIT)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Re-verify all steps before submit
    const s1Ok = validateStep1();
    if (!s1Ok) {
      setCurrentStep(1);
      scrollToTop();
      return;
    }

    const s2Ok = await validateStep2();
    if (!s2Ok) {
      setCurrentStep(2);
      scrollToTop();
      return;
    }

    const s3Ok = validateStep3();
    if (!s3Ok) {
      setCurrentStep(3);
      scrollToTop();
      return;
    }

    const s4Ok = validateStep4();
    if (!s4Ok) {
      setCurrentStep(4);
      scrollToTop();
      return;
    }

    // =========================================================================
    // FLASH BOOKING SUBMISSION
    // =========================================================================
    if (flashId && flashData) {
      if (flashData.status !== 'AVAILABLE') {
        setError('ลาย Flash นี้ไม่พร้อมสำหรับการจองในขณะนี้ (สถานะ: ' + flashData.status + ')');
        return;
      }

      if (!isLoggedIn || !user) {
        saveDraft();
        setShowLogin(true);
        return;
      }

      if (!isCustomerProfileComplete) {
        saveDraft();
        router.push('/complete-profile?next=' + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }

      setLoading(true);

      try {
        const noteWithPlacement = placement 
          ? `[ตำแหน่ง: ${placement.trim()}] ${description || ''}`.trim()
          : description;

        const { data, error: rpcErr } = await supabase.rpc('create_flash_reservation', {
          p_flash_design_id: flashData.id,
          p_requested_date: preferredDate || null,
          p_requested_start_time: preferredTime ? `${preferredTime}:00` : '13:00:00',
          p_customer_note: noteWithPlacement || null,
        });

        if (rpcErr) throw rpcErr;

        const resId = data?.reservation_id || (typeof data === 'string' ? data : flashData.id);
        setNewRequestId(resId);
        setIsFlashSubmission(true);
        setSubmitted(true);
        if (onSuccess) onSuccess(resId);
      } catch (err: any) {
        console.error('Error creating flash reservation:', err);
        setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองลาย Flash กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
      return;
    }

    // =========================================================================
    // DIRECT DEPOSIT CUSTOMER BOOKING SUBMISSION
    // =========================================================================
    if (!isLoggedIn || !user) {
      saveDraft();
      setShowLogin(true);
      return;
    }

    if (!isCustomerProfileComplete) {
      saveDraft();
      router.push('/complete-profile?next=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }

    setLoading(true);

    try {
      const finalRefImages = referenceImages.length > 0 
        ? referenceImages 
        : (referenceImage ? [referenceImage] : []);

      const rawDesc = description ? description.trim() : '';
      const formattedPreferredTime = preferredTime && preferredTime.trim()
        ? (preferredTime.trim().length === 5 ? `${preferredTime.trim()}:00` : preferredTime.trim())
        : undefined;

      // Atomic Submit: Creates both estimate_requests and bookings in 1 DB Transaction
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_customer_booking_request', {
        p_artist_id: artistId,
        p_placement: placement.trim(),
        p_width_cm: Number(width),
        p_height_cm: Number(height),
        p_style: style.trim(),
        p_description: rawDesc,
        p_preferred_date: preferredDate || null,
        p_preferred_time: formattedPreferredTime || null,
        p_reference_images: finalRefImages.slice(0, 5),
        p_has_medical_condition: hasMedicalCondition,
        p_medical_condition_note: hasMedicalCondition ? medicalConditionNote.trim() : null,
        p_has_allergy: hasAllergy,
        p_allergy_note: hasAllergy ? allergyNote.trim() : null,
        p_work_type: null,
      });

      if (rpcErr) {
        console.error('Error calling create_customer_booking_request:', rpcErr);
        throw new Error(translateRpcError(rpcErr.message));
      }

      const reqId = rpcRes?.estimate_request_id || '';
      const bookId = rpcRes?.booking_id || '';

      setEstimateDraft(null);
      setNewRequestId(reqId);
      setNewBookingId(bookId);
      setIsFlashSubmission(false);
      setSubmitted(true);

      if (onSuccess) onSuccess(reqId, bookId);
    } catch (err: any) {
      console.error('Error submitting customer booking request:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  // Helper for Thai Date format
  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return 'ยังไม่ระบุ';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10) + 543;
        const monthNames = [
          'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
          'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
        const day = parseInt(parts[2], 10);
        return `${day} ${month} ${year}`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  // =========================================================================
  // SUBMITTED SUCCESS SCREEN
  // =========================================================================
  if (submitted) {
    if (isFlashSubmission) {
      const flashArtistName = flashData?.artists?.name || 'ช่างประจำสตูดิโอ';
      return (
        <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={28} />
          </div>
          <div className="inline-flex items-center space-x-1.5 bg-emerald-950/50 border border-emerald-800/60 px-3 py-1 rounded text-emerald-300 text-[11px] uppercase font-bold tracking-widest">
            <Sparkles size={12} />
            <span>FLASH RESERVATION SUBMITTED</span>
          </div>
          <h3 className="text-xl font-bold text-studio-primary">ส่งคำขอจองแบบลายสัก Flash สำเร็จแล้ว!</h3>
          
          <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] max-w-md mx-auto text-left space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-studio-border/60">
              <span className="text-studio-muted">รหัสรายการ:</span>
              <strong className="text-studio-primary font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">แบบลายสัก:</span>
              <strong className="text-studio-primary">{flashData?.title}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ช่างสัก:</span>
              <span className="text-studio-primary">{flashArtistName}</span>
            </div>
          </div>

          <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto font-light">
            ทางร้านได้รับคำขอจองลาย Flash ของคุณเรียบร้อยแล้ว กรุณาตรวจสอบสถานะและขั้นตอนถัดไปใน Customer Portal
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/portal?tab=bookings';
                }
              }}
              className="min-h-[44px] flex-1 bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center justify-center cursor-pointer shadow-lg"
            >
              ดูสถานะการจองใน Customer Portal
            </button>
          </div>
        </div>
      );
    }

    // Normal Customer Booking Submission Success Screen
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-5 font-prompt animate-fadeIn">
        <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-1">
          <CheckCircle2 size={28} />
        </div>
        
        <div>
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-3 py-1 rounded text-[11px] font-semibold">
            สถานะ: รอชำระมัดจำ
          </span>
          <h3 className="text-xl font-bold text-studio-primary mt-2">ส่งคำขอจองคิวเรียบร้อยแล้ว</h3>
          <p className="text-xs text-studio-secondary mt-1">
            รหัสคำขอจอง: <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
          </p>
        </div>

        {/* Steps Card */}
        <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[8px] max-w-md mx-auto text-left space-y-2.5 text-xs">
          <h4 className="font-semibold text-[#ECE4D3] text-xs border-b border-[#4A443A]/60 pb-1.5 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-400" />
            <span>ขั้นตอนถัดไปเพื่อยืนยันคิวงาน</span>
          </h4>
          <ol className="space-y-2 text-[11px] text-[#A89F91]">
            <li className="flex items-start gap-2">
              <span className="bg-amber-500/20 text-amber-300 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px] mt-0.5">1</span>
              <span>ชำระเงินมัดจำคิว <strong>฿500</strong> ภายใน 1 ชั่วโมง</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-amber-500/20 text-amber-300 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px] mt-0.5">2</span>
              <span>ส่งหลักฐานการชำระเงิน (สลิป) ➔ สถานะเปลี่ยนเป็น <strong>&quot;รอตรวจสอบสลิป&quot;</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-amber-500/20 text-amber-300 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px] mt-0.5">3</span>
              <span>รอช่างสักตรวจสอบและยืนยันสลิป</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px] mt-0.5">4</span>
              <span>เมื่อช่างยืนยันแล้ว ➔ สถานะเปลี่ยนเป็น <strong>&quot;ยืนยันคิวแล้ว&quot;</strong> สมบูรณ์</span>
            </li>
          </ol>
          <div className="pt-2 border-t border-[#4A443A]/40 text-[11px] text-amber-300/90 italic">
            * ราคางานจริงจะสรุปตามรายละเอียด ขนาด ความซับซ้อน และหน้างานในวันที่เข้ารับบริการ
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=bookings';
            }
          }}
          className="min-h-[44px] w-full max-w-md bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red cursor-pointer shadow-lg mx-auto block"
        >
          ไปที่หน้าชำระมัดจำ / ติดตามสถานะ (Portal)
        </button>
      </div>
    );
  }

  // Selected Artist Helper
  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div ref={formTopRef} className={`w-full mx-auto space-y-5 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* STEPPER HEADER — DESKTOP (5 STEPS) */}
      <div className="hidden md:block bg-studio-card border border-studio-border rounded-[8px] p-4 shadow-md font-prompt">
        <div className="flex items-center justify-between">
          {STEPS.map((s, idx) => {
            const stepNum = s.step;
            const isCurrent = currentStep === stepNum;
            const isCompleted = currentStep > stepNum;
            return (
              <React.Fragment key={stepNum}>
                <button
                  type="button"
                  onClick={() => {
                    if (stepNum < currentStep) {
                      setError('');
                      setCurrentStep(stepNum);
                      scrollToTop();
                    }
                  }}
                  disabled={stepNum > currentStep}
                  className={`flex items-center space-x-2.5 transition-all ${
                    stepNum <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                      isCompleted
                        ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                        : isCurrent
                        ? 'bg-studio-red border border-studio-red text-white shadow-lg shadow-studio-red/30'
                        : 'bg-studio-main border border-studio-border text-studio-muted'
                    }`}
                  >
                    {isCompleted ? <Check size={14} /> : `0${stepNum}`}
                  </div>
                  <div className="text-left">
                    <span className={`text-[10px] uppercase tracking-wider block font-semibold ${
                      isCurrent ? 'text-studio-red' : isCompleted ? 'text-emerald-400' : 'text-studio-muted'
                    }`}>
                      0{stepNum} {s.title}
                    </span>
                    <span className={`text-[11px] font-semibold block ${
                      isCurrent ? 'text-studio-primary font-bold' : isCompleted ? 'text-studio-primary' : 'text-studio-secondary'
                    }`}>
                      {s.subtitle}
                    </span>
                  </div>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-[2px] mx-2 transition-all ${
                    currentStep > stepNum ? 'bg-emerald-500/40' : 'bg-studio-border'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* STEPPER HEADER — MOBILE (5 STEPS) */}
      <div className="block md:hidden bg-studio-card border border-studio-border rounded-[8px] p-4 font-prompt">
        <div className="flex justify-between items-center mb-2">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold block">
              ขั้นตอน {currentStep} จาก 5
            </span>
            <h3 className="text-sm font-bold text-studio-primary">
              {STEPS[currentStep - 1].subtitle}
            </h3>
          </div>
          <span className="text-xs text-studio-muted font-mono font-bold">
            {Math.round((currentStep / 5) * 100)}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-studio-main rounded-full overflow-hidden border border-studio-border">
          <div
            className="h-full bg-studio-red transition-all duration-300 rounded-full"
            style={{ width: `${(currentStep / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400 animate-fadeIn">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form Container */}
      <form 
        onSubmit={handleSubmit} 
        className={compact 
          ? "space-y-6 w-full" 
          : "bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-6 shadow-xl"
        }
      >
        
        {/* ===================================================================
            STEP 1 — เลือกช่างสัก (ARTIST ONLY)
            =================================================================== */}
        {currentStep === 1 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto animate-fadeIn">
            
            <div className="border-b border-studio-border pb-3">
              <h3 className="text-lg font-bold text-studio-primary flex items-center gap-2">
                <User className="text-studio-red shrink-0" size={18} />
                <span>เลือกช่างสัก</span>
              </h3>
              <p className="text-xs text-studio-secondary mt-0.5">
                เลือกช่างที่คุณต้องการจองคิว
              </p>
            </div>

            {/* Artist Selection Cards */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-3 font-semibold flex items-center gap-1.5">
                <Sparkles size={14} className="text-studio-red" />
                <span>เลือกช่างสักที่ต้องการ <span className="text-studio-red">*</span></span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {artists.map((art) => {
                  const specs = getArtistSpecialties(art);
                  const specsLabel = specs.length > 0 ? specs.join(' / ') : 'ช่างประจำร้าน';
                  const isSelected = artistId === art.id;
                  return (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => handleArtistSelect(art.id)}
                      className={`p-3.5 rounded-[6px] border text-left flex items-center space-x-3 transition-all cursor-pointer min-w-0 ${
                        isSelected 
                          ? 'border-studio-red bg-studio-sec shadow-inner ring-1 ring-studio-red/40' 
                          : 'border-studio-border hover:border-studio-border/80 bg-studio-main/60'
                      }`}
                    >
                      <img src={art.avatar} alt={art.name} className="w-12 h-12 object-cover rounded-full shrink-0 border border-studio-border" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-studio-primary truncate">{art.name}</h4>
                        <p className="text-[10px] text-studio-secondary truncate mt-0.5">{specsLabel}</p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 bg-studio-red rounded-full flex items-center justify-center text-white shrink-0">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 1 Navigation CTA */}
            <div className="border-t border-studio-border pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleNextStep}
                disabled={loading || !artistId}
                className="w-full sm:w-auto min-h-[44px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-8 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center justify-center space-x-2 cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    <span>ถัดไป</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ===================================================================
            STEP 2 — เลือกวันและเวลา (DATE & TIME ONLY)
            =================================================================== */}
        {currentStep === 2 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto animate-fadeIn">
            
            <div className="border-b border-studio-border pb-3">
              <h3 className="text-lg font-bold text-studio-primary flex items-center gap-2">
                <Calendar className="text-studio-red shrink-0" size={18} />
                <span>เลือกวันและเวลา</span>
              </h3>
              <p className="text-xs text-studio-secondary mt-0.5">
                เลือกวันที่และเวลาที่สะดวกเข้ารับบริการ (ช่าง: <strong className="text-studio-primary">{selectedArtist?.name || 'ช่างประจำร้าน'}</strong>)
              </p>
            </div>

            {/* Date & Time Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-3 items-end">
              <div>
                <DatePickerPopover
                  value={preferredDate}
                  onChange={(dateStr) => {
                    setPreferredDate(dateStr);
                    setError('');
                  }}
                  artistId={artistId}
                  artistWorkingDays={getArtistSpecialties(selectedArtist)}
                  label="วันที่ต้องการจองคิว *"
                  disabled={!artistId}
                  placeholder={!artistId ? 'เลือกช่างสักก่อน' : 'เลือกวันที่ต้องการจองคิว *'}
                />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1">
                  <Clock size={12} className="text-studio-red shrink-0" />
                  <span className="truncate">เวลาที่สะดวก <span className="text-studio-red">*</span></span>
                </label>
                <select
                  value={preferredTime}
                  onChange={(e) => {
                    setPreferredTime(e.target.value);
                    setError('');
                  }}
                  className="w-full min-h-[44px] bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] px-3 py-2 outline-none rounded-[4px] cursor-pointer font-prompt truncate [color-scheme:dark]"
                >
                  {HOURLY_TIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#171512] text-[#ECE4D3]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 2 Navigation CTA */}
            <div className="border-t border-studio-border pt-4 flex justify-between gap-3">
              <button
                type="button"
                onClick={handlePrevStep}
                className="min-h-[44px] bg-studio-main hover:bg-studio-sec text-studio-primary text-xs uppercase tracking-wider py-3 px-6 font-semibold transition-all rounded-[4px] border border-studio-border flex items-center space-x-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>ย้อนกลับ</span>
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                disabled={loading}
                className="min-h-[44px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-8 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center space-x-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    <span>ถัดไป</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ===================================================================
            STEP 3 — รายละเอียดงานสัก
            =================================================================== */}
        {currentStep === 3 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto animate-fadeIn">
            
            <div className="border-b border-studio-border pb-3">
              <h3 className="text-lg font-bold text-studio-primary flex items-center gap-2">
                <FileText className="text-studio-red shrink-0" size={18} />
                <span>รายละเอียดงานสัก</span>
              </h3>
              <p className="text-xs text-studio-secondary mt-0.5">
                ราคางานจริงสรุปตามรายละเอียด ขนาด ความซับซ้อน และหน้างาน
              </p>
            </div>

            {/* 3.1 Style */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                สไตล์งานสัก <span className="text-studio-red">*</span>
              </label>
              {artists.length === 0 ? (
                <select
                  disabled
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                >
                  <option value="">กำลังโหลดสไตล์ของช่าง...</option>
                </select>
              ) : !artistId ? (
                <select
                  disabled
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                >
                  <option value="">กรุณาเลือกช่างก่อน</option>
                </select>
              ) : artistSpecialties.length === 0 ? (
                <div className="space-y-1">
                  <select
                    disabled
                    className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                  >
                    <option value="">ยังไม่มีข้อมูลสไตล์งานของช่างคนนี้</option>
                  </select>
                </div>
              ) : (
                <select
                  value={style}
                  onChange={(e) => {
                    setStyle(e.target.value);
                    setError('');
                  }}
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2 outline-none rounded-[4px] cursor-pointer"
                >
                  <option value="" disabled>เลือกสไตล์งานสัก</option>
                  {style === 'ตามที่ช่างแนะนำ' && (
                    <option value="ตามที่ช่างแนะนำ">ตามที่ช่างแนะนำ</option>
                  )}
                  {artistSpecialties.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 3.2 Placement */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span>
              </label>
              <PlacementSelector
                value={placement}
                onChange={(val) => {
                  setPlacement(val);
                  setError('');
                }}
              />
            </div>

            {/* 3.3 Size Input */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                ขนาดของงานสัก (เซนติเมตร) <span className="text-studio-red">*</span>
              </label>
              <TattooSizeInput
                width={width}
                height={height}
                onWidthChange={(w) => {
                  setWidth(w);
                  setError('');
                }}
                onHeightChange={(h) => {
                  setHeight(h);
                  setError('');
                }}
              />
            </div>

            {/* 3.4 Reference Image Upload */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
                <ImageIcon size={14} className="text-studio-red" />
                <span>รูปอ้างอิง (REFERENCE) <span className="text-studio-red">*</span></span>
              </label>
              <ReferenceUploader
                value={referenceImage}
                values={referenceImages}
                onChange={(img) => {
                  setReferenceImage(img);
                  setError('');
                }}
                onValuesChange={(paths) => {
                  setReferenceImages(paths);
                  setReferenceImage(paths[0] || '');
                  setError('');
                }}
                maxImages={5}
              />
            </div>

            {/* 3.5 Description */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                รายละเอียดงานสักเพิ่มเติม
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="อธิบายรายละเอียดลายที่ต้องการเพิ่มเติม เช่น ต้องการปรับเพิ่มดอกไม้, มีรอยสักเดิมทับ/ต้องการแก้, ต้องการปกปิดรอยแผลเป็น..."
                rows={3}
                className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary p-3 outline-none rounded-[4px] resize-none"
              />
            </div>

            {/* Step 3 Navigation CTA */}
            <div className="border-t border-studio-border pt-4 flex justify-between gap-3">
              <button
                type="button"
                onClick={handlePrevStep}
                className="min-h-[44px] bg-studio-main hover:bg-studio-sec text-studio-primary text-xs uppercase tracking-wider py-3 px-6 font-semibold transition-all rounded-[4px] border border-studio-border flex items-center space-x-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>ย้อนกลับ</span>
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="min-h-[44px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-8 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center space-x-2 cursor-pointer shadow-lg"
              >
                <span>ถัดไป</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        )}

        {/* ===================================================================
            STEP 4 — ข้อมูลสุขภาพ
            =================================================================== */}
        {currentStep === 4 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto animate-fadeIn">
            
            <div className="border-b border-studio-border pb-3">
              <h3 className="text-lg font-bold text-studio-primary flex items-center gap-2">
                <HeartPulse className="text-studio-red shrink-0" size={18} />
                <span>ข้อมูลสุขภาพและการยินยอม</span>
              </h3>
              <p className="text-xs text-studio-secondary mt-0.5">
                กรอกข้อมูลสุขภาพและประวัติการแพ้เพื่อความปลอดภัยของคุณในการรับบริการ
              </p>
            </div>

            {/* Health Disclosure Form Block */}
            <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 font-prompt">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs font-semibold pb-2 border-b border-[#4A443A]/60">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <span>ข้อระวังทางสุขภาพที่ควรแจ้งช่างสัก</span>
              </div>

              {/* 4.1 Medical Condition */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                  <input
                    type="checkbox"
                    checked={hasMedicalCondition}
                    onChange={(e) => {
                      setHasMedicalCondition(e.target.checked);
                      if (!e.target.checked) setMedicalConditionNote('');
                      setError('');
                    }}
                    className="w-4 h-4 rounded border-[#4A443A] bg-[#0E0D0C] text-[#9C2F2F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="font-medium">มีโรคประจำตัวที่ควรแจ้งช่าง</span>
                </label>
                {hasMedicalCondition && (
                  <textarea
                    value={medicalConditionNote}
                    onChange={(e) => {
                      setMedicalConditionNote(e.target.value);
                      setError('');
                    }}
                    placeholder="ระบุชื่อโรคประจำตัว ยาที่รับประทาน หรือข้อควรระวัง..."
                    rows={2}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded-[4px] resize-none"
                  />
                )}
              </div>

              {/* 4.2 Allergy History */}
              <div className="space-y-2 pt-2 border-t border-[#4A443A]/40">
                <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                  <input
                    type="checkbox"
                    checked={hasAllergy}
                    onChange={(e) => {
                      setHasAllergy(e.target.checked);
                      if (!e.target.checked) setAllergyNote('');
                      setError('');
                    }}
                    className="w-4 h-4 rounded border-[#4A443A] bg-[#0E0D0C] text-[#9C2F2F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="font-medium">มีประวัติแพ้อาหาร / ยา / สารเคมี / แอลกอฮอล์</span>
                </label>
                {hasAllergy && (
                  <textarea
                    value={allergyNote}
                    onChange={(e) => {
                      setAllergyNote(e.target.value);
                      setError('');
                    }}
                    placeholder="ระบุสิ่งที่แพ้ เช่น แพ้ยาชา, แพ้แอลกอฮอล์, แพ้ยางพารา (Latex)..."
                    rows={2}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded-[4px] resize-none"
                  />
                )}
              </div>
            </div>

            {/* Step 4 Navigation CTA */}
            <div className="border-t border-studio-border pt-4 flex justify-between gap-3">
              <button
                type="button"
                onClick={handlePrevStep}
                className="min-h-[44px] bg-studio-main hover:bg-studio-sec text-studio-primary text-xs uppercase tracking-wider py-3 px-6 font-semibold transition-all rounded-[4px] border border-studio-border flex items-center space-x-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>ย้อนกลับ</span>
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="min-h-[44px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-8 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center space-x-2 cursor-pointer shadow-lg"
              >
                <span>ถัดไป</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        )}

        {/* ===================================================================
            STEP 5 — ตรวจสอบคำขอ (SUMMARY & SUBMIT)
            =================================================================== */}
        {currentStep === 5 && (
          <div className="space-y-6 w-full max-w-3xl mx-auto animate-fadeIn">
            
            <div className="border-b border-studio-border pb-3">
              <h3 className="text-lg font-bold text-studio-primary flex items-center gap-2">
                <ClipboardCheck className="text-studio-red shrink-0" size={18} />
                <span>ตรวจสอบข้อมูลก่อนส่ง</span>
              </h3>
              <p className="text-xs text-studio-secondary mt-0.5">
                ตรวจสอบความถูกต้องของข้อมูลทั้งหมดก่อนส่งคำขอจองคิว
              </p>
            </div>

            {/* Read-Only Summary Card */}
            <div className="bg-studio-main border border-studio-border p-4 sm:p-5 rounded-[8px] space-y-4 font-prompt text-xs">
              
              {/* Selected Artist */}
              <div className="flex items-center justify-between pb-3 border-b border-studio-border/60">
                <div className="flex items-center space-x-3">
                  {selectedArtist?.avatar ? (
                    <img src={selectedArtist.avatar} alt={selectedArtist.name} className="w-10 h-10 object-cover rounded-full border border-studio-border" />
                  ) : (
                    <div className="w-10 h-10 bg-studio-sec rounded-full flex items-center justify-center text-studio-muted">
                      <User size={18} />
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-studio-muted uppercase tracking-wider block">ช่างสักที่เลือก</span>
                    <strong className="text-sm text-studio-primary font-semibold">{selectedArtist?.name || 'ช่างประจำร้าน'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(1);
                    scrollToTop();
                  }}
                  className="text-[11px] text-studio-red hover:underline font-semibold"
                >
                  แก้ไข
                </button>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-studio-border/60">
                <div>
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">วันที่ต้องการจอง:</span>
                  <strong className="text-studio-primary font-medium">{formatThaiDate(preferredDate)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">เวลาที่สะดวก:</span>
                  <strong className="text-studio-primary font-medium">{preferredTime ? `${preferredTime} น.` : 'ยังไม่ระบุ'}</strong>
                </div>
              </div>

              {/* Tattoo Work Specs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-studio-border/60">
                <div>
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">สไตล์งานสัก:</span>
                  <strong className="text-studio-primary font-medium">{style || '-'}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">ตำแหน่ง:</span>
                  <strong className="text-studio-primary font-medium">{placement || '-'}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">ขนาด:</span>
                  <strong className="text-studio-red font-semibold">{width} × {height} ซม.</strong>
                </div>
              </div>

              {/* Reference Images */}
              {referenceImages.length > 0 && (
                <div className="pb-3 border-b border-studio-border/60">
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block mb-2">รูปภาพอ้างอิง ({referenceImages.length} รูป):</span>
                  <div className="flex flex-wrap gap-2">
                    {referenceImages.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Reference ${i + 1}`}
                        className="w-16 h-16 object-cover rounded border border-studio-border shadow-sm"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {description && (
                <div className="pb-3 border-b border-studio-border/60">
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block mb-1">รายละเอียดเพิ่มเติม:</span>
                  <p className="text-studio-secondary font-light whitespace-pre-wrap">{description}</p>
                </div>
              )}

              {/* Health Info */}
              <div>
                <span className="text-[10px] text-studio-muted uppercase tracking-wider block mb-1">ข้อมูลสุขภาพ:</span>
                {hasMedicalCondition || hasAllergy ? (
                  <div className="space-y-1 text-amber-300">
                    {hasMedicalCondition && <div>• โรคประจำตัว: {medicalConditionNote || 'ระบุแล้ว'}</div>}
                    {hasAllergy && <div>• ประวัติแพ้: {allergyNote || 'ระบุแล้ว'}</div>}
                  </div>
                ) : (
                  <span className="text-studio-secondary font-light">ไม่มีข้อมูลสุขภาพพิเศษ</span>
                )}
              </div>

            </div>

            {/* Booking Condition Box */}
            <div className="bg-[#171512] border border-[#4A443A] p-4 sm:p-5 rounded-[8px] space-y-3 font-prompt">
              <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-2.5">
                <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs sm:text-sm font-bold">
                  <Sparkles size={16} className="text-amber-400 shrink-0" />
                  <span>เงื่อนไขการส่งคำขอจองคิว</span>
                </div>
                <div className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2.5 py-1 rounded text-xs font-bold">
                  เงินมัดจำคิว ฿500
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#A89F91]">
                <div className="flex items-start space-x-2.5 bg-[#0E0D0C] p-3 rounded-[6px] border border-[#4A443A]/40">
                  <DollarSign size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#ECE4D3] block mb-0.5">การชำระเงินมัดจำ:</strong>
                    <p className="text-[11px] font-light leading-relaxed">
                      กรุณาชำระเงินมัดจำ ฿500 ภายใน 1 ชั่วโมงหลังส่งคำขอ
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5 bg-[#0E0D0C] p-3 rounded-[6px] border border-[#4A443A]/40">
                  <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#ECE4D3] block mb-0.5">ราคางานจริง:</strong>
                    <p className="text-[11px] font-light leading-relaxed">
                      สรุปหน้างานตามรายละเอียด ขนาด ความซับซ้อน และงานจริงในวันสัก
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 Final CTA Bar */}
            <div className="border-t border-studio-border pt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
              <button
                type="button"
                onClick={handlePrevStep}
                className="w-full sm:w-auto min-h-[44px] bg-studio-main hover:bg-studio-sec text-studio-primary text-xs uppercase tracking-wider py-3 px-6 font-semibold transition-all rounded-[4px] border border-studio-border flex items-center justify-center space-x-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto min-h-[48px] text-xs uppercase tracking-wider font-semibold py-3.5 px-8 rounded-[4px] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-studio-red hover:bg-tattoo-red-dark text-white border border-studio-red shadow-lg shadow-studio-red/20"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    <span>กำลังส่งคำขอจองคิว...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} className="mr-2" />
                    <span>ส่งคำขอจองคิว</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </form>

      {/* Lazy Auth Pop-up */}
      {showLogin && (
        <CustomerLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
