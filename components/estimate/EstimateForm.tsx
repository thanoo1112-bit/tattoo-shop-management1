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
import { getThailandTodayStr, getThailandTomorrowStr } from '../portal/portalUtils';
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  User, 
  Calendar, 
  Image as ImageIcon, 
  Send,
  Lock,
  Clock,
  DollarSign,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Upload
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface EstimateFormProps {
  initialArtistId?: string;
  preselectedArtistId?: string;
  preselectedArtworkImage?: string;
  preselectedStyle?: string;
  preselectedType?: 'ESTIMATE' | 'DIRECT_BOOKING';
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

export type TattooWorkType = 'NEW_TATTOO' | 'REWORK' | 'COVER_UP' | 'SCAR_COVER';

const translateRpcError = (msg: string): string => {
  if (!msg) return 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว';
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

export default function EstimateForm({ 
  initialArtistId = '', 
  preselectedArtistId,
  preselectedArtworkImage,
  preselectedStyle,
  preselectedType,
  flashId,
  compact = false,
  onSuccess 
}: EstimateFormProps) {
  const router = useRouter();
  const { 
    artists, 
    isLoggedIn, 
    isCustomerProfileComplete,
    user,
    supabase,
    addEstimateRequest, 
    estimateDraft, 
    setEstimateDraft 
  } = useApp();

  // Flash Design State
  const [flashData, setFlashData] = useState<any | null>(null);
  const [loadingFlash, setLoadingFlash] = useState(!!flashId);
  const [flashError, setFlashError] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

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

  // Deposit Payment Slip Upload State
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipFilePreview, setSlipFilePreview] = useState<string | null>(null);

  // Submission State
  const [submitted, setSubmitted] = useState(false);
  const [isFlashSubmission, setIsFlashSubmission] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
  const [newBookingId, setNewBookingId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  // Handle Slip File Input Selection
  const handleSlipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG และ WEBP เท่านั้น');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    setError('');
    setSlipFile(file);
    const objectUrl = URL.createObjectURL(file);
    setSlipFilePreview(objectUrl);
  };

  const handleRemoveSlipFile = () => {
    setSlipFile(null);
    if (slipFilePreview) {
      URL.revokeObjectURL(slipFilePreview);
      setSlipFilePreview(null);
    }
  };

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

  // MAIN FORM SUBMIT HANDLER
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (preferredTime && preferredTime.trim() !== '') {
      const t = preferredTime.trim();
      const validTimes = HOURLY_TIME_OPTIONS.map((o) => o.value).filter(Boolean);
      if (!validTimes.includes(t)) {
        setError('กรุณาเลือกเวลาระหว่าง 10:00–23:00 น.');
        return;
      }
    }

    // =========================================================================
    // FLASH BOOKING SUBMISSION
    // =========================================================================
    if (flashId && flashData) {
      if (flashData.status !== 'AVAILABLE') {
        setError('ลาย Flash นี้ไม่พร้อมสำหรับการจองในขณะนี้ (สถานะ: ' + flashData.status + ')');
        return;
      }

      if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ (Others)' || placement.trim().toLowerCase() === 'others') {
        setError('กรุณาระบุตำแหน่งบนร่างกายให้ครบถ้วน');
        return;
      }

      if (!preferredTime || !preferredTime.trim()) {
        setError('กรุณาเลือกเวลาที่สะดวก');
        return;
      }

      if (preferredDate && preferredDate < getThailandTodayStr()) {
        setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
        return;
      }

      if (preferredDate && (flashData?.artist_id || flashData?.artist?.id || flashData?.artists?.id)) {
        const targetArtistId = flashData?.artist_id || flashData?.artist?.id || flashData?.artists?.id;
        const { data: busyCheck } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: targetArtistId,
          p_start_date: preferredDate,
          p_end_date: preferredDate,
        });
        if (Array.isArray(busyCheck) && busyCheck.length > 0) {
          setError('วันที่เลือกมีคิวงานที่ยืนยันแล้วของช่างสักท่านนี้ กรุณาเลือกวันอื่น');
          return;
        }
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
    if (!artistId) {
      setError('กรุณาเลือกช่างสักที่ต้องการ');
      return;
    }

    if (!style) {
      setError('กรุณาเลือกสไตล์งานสัก');
      return;
    }

    const selectedArtistObj = artists.find((a) => a.id === artistId);
    const availableStyles = getArtistSpecialties(selectedArtistObj);
    if (!availableStyles.includes(style)) {
      setError('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่');
      return;
    }

    if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ (Others)' || placement.trim().toLowerCase() === 'others') {
      setError('กรุณาระบุตำแหน่งที่ต้องการสัก');
      return;
    }

    if (!width || Number(width) <= 0 || !height || Number(height) <= 0) {
      setError('กรุณาระบุขนาดของงานสัก (ความกว้างและความสูงต้องมากกว่า 0 ซม.)');
      return;
    }

    if (!preferredDate) {
      setError('กรุณาเลือกวันที่ต้องการจองคิว');
      return;
    }

    if (!preferredTime || !preferredTime.trim()) {
      setError('กรุณาเลือกเวลาที่สะดวก');
      return;
    }

    const hasRefImage = Boolean(referenceImage || (referenceImages && referenceImages.length > 0));
    if (!hasRefImage) {
      setError('กรุณาอัปโหลดรูปภาพอ้างอิงอย่างน้อย 1 รูป');
      return;
    }

    if (preferredDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return;
    }

    // Availability validation check against busy ranges
    if (preferredDate && artistId) {
      const { data: busyCheck } = await supabase.rpc('get_artist_busy_ranges', {
        p_artist_id: artistId,
        p_start_date: preferredDate,
        p_end_date: preferredDate,
      });
      if (Array.isArray(busyCheck) && busyCheck.length > 0) {
        setError('วันที่เลือกมีคิวงานที่ยืนยันแล้วของช่างสักท่านนี้ กรุณาเลือกวันอื่น');
        return;
      }
    }

    if (hasMedicalCondition && (!medicalConditionNote || !medicalConditionNote.trim())) {
      setError('กรุณาระบุรายละเอียดโรคประจำตัวที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return;
    }

    if (hasAllergy && (!allergyNote || !allergyNote.trim())) {
      setError('กรุณาระบุรายละเอียดประวัติภูมิแพ้ที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return;
    }

    // MANDATORY SLIP FILE VALIDATION FOR DIRECT DEPOSIT FLOW
    if (!slipFile) {
      setError('กรุณาอัปโหลดหลักฐานการชำระเงิน (สลิปมัดจำ)');
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
      const finalRefImages = referenceImages.length > 0 
        ? referenceImages 
        : (referenceImage ? [referenceImage] : []);

      const formattedTime = preferredTime ? `${preferredTime}:00` : '13:00:00';

      // Step 1: Create Direct Booking Request & Booking Record in DB via RPC
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_direct_booking_request', {
        p_artist_id: artistId,
        p_requested_date: preferredDate,
        p_requested_start_time: formattedTime,
        p_placement: placement.trim(),
        p_style: style.trim(),
        p_width_cm: Number(width),
        p_height_cm: Number(height),
        p_description: description ? description.trim() : null,
        p_reference_images: finalRefImages,
        p_has_medical_condition: hasMedicalCondition,
        p_medical_condition_note: hasMedicalCondition ? medicalConditionNote.trim() : null,
        p_has_allergy: hasAllergy,
        p_allergy_note: hasAllergy ? allergyNote.trim() : null,
        p_customer_note: description ? description.trim() : null,
        p_work_type: null,
        p_color_technique: null,
      });

      if (rpcErr || !rpcRes) {
        console.error('RPC Error creating direct booking request:', rpcErr);
        throw new Error(translateRpcError(rpcErr?.message || 'เกิดข้อผิดพลาดในการสร้างคำขอจองคิว'));
      }

      const resBookingId = rpcRes.booking_id;
      const resEstimateId = rpcRes.estimate_request_id;

      if (!resBookingId) {
        throw new Error('ไม่สามารถสร้างคิวงานได้ กรุณาลองใหม่อีกครั้ง');
      }

      // Step 2: Upload Deposit Payment Slip file to Storage bucket 'booking-payment-slips'
      const fileExt = slipFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const randomId = crypto.randomUUID();
      const storagePath = `${user.id}/${resBookingId}/${randomId}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from('booking-payment-slips')
        .upload(storagePath, slipFile, {
          contentType: slipFile.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Storage error uploading payment slip:', uploadErr);
        throw new Error('อัปโหลดสลิปมัดจำไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }

      // Step 3: Submit Payment Slip via Canonical RPC: submit_booking_payment_slip
      const { error: subErr } = await supabase.rpc('submit_booking_payment_slip', {
        p_booking_id: resBookingId,
        p_claimed_amount: 500,
        p_slip_path: storagePath,
        p_reference_no: null,
        p_customer_note: description ? description.trim() : null,
      });

      if (subErr) {
        console.error('Error submitting payment slip RPC:', subErr);
        throw new Error(subErr?.message || 'เกิดข้อผิดพลาดในการบันทึกหลักฐานการชำระเงิน');
      }

      setNewRequestId(resEstimateId || resBookingId);
      setNewBookingId(resBookingId);
      setIsFlashSubmission(false);
      setSubmitted(true);
      if (onSuccess) onSuccess(resEstimateId || resBookingId, resBookingId);
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

    // DIRECT DEPOSIT SUBMISSION SUCCESS SCREEN
    const selectedArtistObj = artists.find((a) => a.id === artistId);
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
        <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 size={28} />
        </div>
        <div className="inline-flex items-center space-x-1.5 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded text-emerald-300 text-[11px] uppercase font-bold tracking-widest">
          <Sparkles size={12} />
          <span>BOOKING REQUEST SUBMITTED</span>
        </div>
        <h3 className="text-xl font-bold text-studio-primary">ส่งคำขอจองคิวสำเร็จแล้ว!</h3>
        
        <div className="bg-studio-main border border-emerald-900/40 p-4 rounded-[6px] max-w-md mx-auto text-left space-y-2 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-studio-border/60">
            <span className="text-studio-muted">รหัสคิวงาน:</span>
            <strong className="text-emerald-300 font-mono">#{newBookingId ? newBookingId.slice(0, 8).toUpperCase() : newRequestId.slice(0, 8).toUpperCase()}</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-studio-muted">สถานะ:</span>
            <span className="bg-blue-950/80 text-blue-300 border border-blue-800/80 px-2 py-0.5 rounded text-[10px] font-bold">
              รอตรวจสอบ
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-studio-muted">เงินมัดจำล็อกคิว:</span>
            <strong className="text-emerald-300 font-mono font-bold">฿500 (ชำระแล้วเรียบร้อย)</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-studio-muted">ช่างสักที่เลือก:</span>
            <span className="text-studio-primary">{selectedArtistObj?.name || 'ช่างประจำร้าน'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-studio-muted">วันที่ขอจอง:</span>
            <span className="text-studio-primary">{preferredDate} {preferredTime ? `(${preferredTime} น.)` : ''}</span>
          </div>
        </div>

        <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto font-light">
          ทางร้านจะทำการตรวจสอบรายละเอียดงานสักและหลักฐานการโอนเงินเพื่อยืนยันคิวให้คุณโดยเร็วที่สุด คุณสามารถติดตามสถานะการจองได้ที่ Customer Portal
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

  // =========================================================================
  // CUSTOMER DIRECT DEPOSIT BOOKING FORM UI
  // =========================================================================
  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div className={`w-full mx-auto space-y-5 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* Header Banner */}
      <div className="bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px]">
        <div className="flex items-center space-x-2 text-studio-red text-xs uppercase tracking-widest font-heading font-normal mb-1">
          <Sparkles size={14} />
          <span>157 TATTOO STUDIO</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
          แบบฟอร์มจองคิวสัก
        </h2>
        <p className="text-xs text-studio-secondary mt-1 font-light">
          กรอกรายละเอียดงานสักของคุณ ชำระเงินมัดจำ และแนบสลิปเพื่อส่งคำขอจองคิว
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Container */}
      <form 
        onSubmit={handleSubmit} 
        className={compact 
          ? "space-y-6 w-full" 
          : "bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-8 shadow-xl"
        }
      >
        
        <div className="space-y-6 w-full max-w-3xl mx-auto">
          
          {/* 1. Artist Selection */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
              <User size={14} className="text-studio-red" />
              <span>1. เลือกช่างสักที่ต้องการ <span className="text-studio-red">*</span></span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {artists.map((art) => {
                const specs = getArtistSpecialties(art);
                const specsLabel = specs.length > 0 ? specs.join(' / ') : 'ช่างประจำร้าน';
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleArtistSelect(art.id)}
                    className={`p-2.5 rounded-[4px] border text-left flex items-center space-x-2.5 transition-all min-w-0 ${
                      artistId === art.id 
                        ? 'border-studio-red bg-studio-sec shadow-inner' 
                        : 'border-studio-border hover:border-studio-border/80 bg-studio-main/60'
                    }`}
                  >
                    <img src={art.avatar} alt={art.name} className="w-8 h-8 object-cover rounded-full shrink-0 border border-studio-border" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-studio-primary truncate">{art.name}</h4>
                      <p className="text-[10px] text-studio-secondary truncate">{specsLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Style */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              2. สไตล์งานสัก <span className="text-studio-red">*</span>
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

          {/* 3. Preferred Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-2 sm:gap-3 items-end">
            <div>
              <DatePickerPopover
                value={preferredDate}
                onChange={(dateStr) => setPreferredDate(dateStr)}
                artistId={artistId}
                artistWorkingDays={getArtistSpecialties(selectedArtist)}
                label="3. วันที่ต้องการจองคิว *"
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
                onChange={(e) => setPreferredTime(e.target.value)}
                className="w-full min-h-[44px] bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] px-2 sm:px-3 py-2 outline-none rounded-[4px] cursor-pointer font-prompt truncate [color-scheme:dark]"
              >
                {HOURLY_TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#171512] text-[#ECE4D3]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Placement */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              4. ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span>
            </label>
            <PlacementSelector
              value={placement}
              onChange={setPlacement}
            />
          </div>

          {/* 5. Size Input */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              5. ขนาดของงานสัก (เซนติเมตร) <span className="text-studio-red">*</span>
            </label>
            <TattooSizeInput
              width={width}
              height={height}
              onWidthChange={setWidth}
              onHeightChange={setHeight}
            />
          </div>

          {/* 6. Reference Image Upload */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
              <ImageIcon size={14} className="text-studio-red" />
              <span>6. รูปอ้างอิง (REFERENCE) <span className="text-studio-red">*</span></span>
            </label>
            <ReferenceUploader
              value={referenceImage}
              values={referenceImages}
              onChange={setReferenceImage}
              onValuesChange={(paths) => {
                setReferenceImages(paths);
                setReferenceImage(paths[0] || '');
              }}
              maxImages={5}
            />
          </div>

          {/* 7. Description */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              7. รายละเอียดงานสักเพิ่มเติม
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายรายละเอียดลายที่ต้องการเพิ่มเติม เช่น ต้องการปรับเพิ่มดอกไม้, มีรอยสักเดิมทับ/ต้องการแก้, ต้องการปกปิดรอยแผลเป็น..."
              rows={3}
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary p-3 outline-none rounded-[4px] resize-none"
            />
          </div>

          {/* 8. Health Disclosure */}
          <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[6px] space-y-3 font-prompt">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs font-semibold pb-2 border-b border-[#4A443A]/60">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span>8. ข้อมูลสุขภาพที่เกี่ยวข้องกับการสัก (เพื่อความปลอดภัยของคุณ)</span>
            </div>

            {/* 8.1 Medical Condition */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                <input
                  type="checkbox"
                  checked={hasMedicalCondition}
                  onChange={(e) => {
                    setHasMedicalCondition(e.target.checked);
                    if (!e.target.checked) setMedicalConditionNote('');
                  }}
                  className="w-4 h-4 rounded border-[#4A443A] bg-[#0E0D0C] text-[#9C2F2F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="font-medium">มีโรคประจำตัวที่ควรแจ้งช่าง</span>
              </label>
              {hasMedicalCondition && (
                <textarea
                  value={medicalConditionNote}
                  onChange={(e) => setMedicalConditionNote(e.target.value)}
                  placeholder="ระบุชื่อโรคประจำตัว ยาที่รับประทาน หรือข้อควรระวัง..."
                  rows={2}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded-[4px] resize-none"
                />
              )}
            </div>

            {/* 8.2 Allergy History */}
            <div className="space-y-2 pt-1 border-t border-[#4A443A]/40">
              <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                <input
                  type="checkbox"
                  checked={hasAllergy}
                  onChange={(e) => {
                    setHasAllergy(e.target.checked);
                    if (!e.target.checked) setAllergyNote('');
                  }}
                  className="w-4 h-4 rounded border-[#4A443A] bg-[#0E0D0C] text-[#9C2F2F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="font-medium">มีประวัติแพ้อาหาร / ยา / สารเคมี / แอลกอฮอล์</span>
              </label>
              {hasAllergy && (
                <textarea
                  value={allergyNote}
                  onChange={(e) => setAllergyNote(e.target.value)}
                  placeholder="ระบุสิ่งที่แพ้ เช่น แพ้ยาชา, แพ้แอลกอฮอล์, แพ้ยางพารา (Latex)..."
                  rows={2}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded-[4px] resize-none"
                />
              )}
            </div>
          </div>

          {/* 9. Payment Deposit & Slip Upload */}
          <div className="bg-[#171512] border border-[#4A443A] p-4 sm:p-5 rounded-[6px] space-y-4 font-prompt">
            <div className="flex items-center justify-between pb-3 border-b border-[#4A443A]/60">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs font-semibold">
                <DollarSign size={16} className="text-amber-400 shrink-0" />
                <span>9. ชำระเงินมัดจำล็อกคิวงาน (DEPOSIT PAYMENT) <span className="text-studio-red">*</span></span>
              </div>
              <span className="bg-amber-950/80 border border-amber-800/80 text-amber-300 px-2.5 py-0.5 rounded text-[11px] font-bold">
                มัดจำ ฿500
              </span>
            </div>

            <div className="bg-[#0E0D0C] border border-[#4A443A]/60 p-3.5 rounded-[4px] space-y-2 text-xs text-[#A89F91]">
              <p className="text-xs text-[#ECE4D3] font-medium">
                กรุณาโอนเงินมัดจำ <strong className="text-amber-300 font-bold">500 บาท</strong> เพื่อยืนยันการจองคิว และแนบสลิปโอนเงินด้านล่าง:
              </p>
              <div className="bg-[#171512] border border-[#4A443A]/40 p-3 rounded text-xs space-y-1 font-mono text-[#ECE4D3]">
                <div>ธนาคาร: <strong className="text-amber-300">กสิกรไทย (KBANK)</strong></div>
                <div>เลขที่บัญชี: <strong className="text-amber-300 select-all font-bold">012-3-45678-9</strong></div>
                <div>ชื่อบัญชี: <strong>ร้าน 157 Tattoo Studio</strong></div>
              </div>
            </div>

            {/* Slip File Upload Input */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A89F91] block mb-1.5 font-semibold flex items-center justify-between">
                <span>หลักฐานการชำระเงิน (สลิปโอนเงินมัดจำ) <span className="text-studio-red">*</span></span>
                <span className="text-[10px] text-[#A89F91] font-normal">JPG, PNG, WEBP (สูงสุด 5MB)</span>
              </label>

              {slipFilePreview ? (
                <div className="relative border border-emerald-800/60 bg-emerald-950/20 p-3 rounded-[4px] flex items-center space-x-3">
                  <img src={slipFilePreview} alt="สลิปมัดจำ" className="w-16 h-20 object-cover rounded border border-emerald-800/40" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 size={14} />
                      <span>เลือกสลิปเรียบร้อยแล้ว</span>
                    </div>
                    <p className="text-[11px] text-studio-secondary truncate mt-0.5">{slipFile?.name}</p>
                    <button
                      type="button"
                      onClick={handleRemoveSlipFile}
                      className="text-[11px] text-red-400 hover:underline mt-1 cursor-pointer block"
                    >
                      ยกเลิก / เลือกรูปใหม่
                    </button>
                  </div>
                </div>
              ) : (
                <label className="border border-dashed border-[#4A443A] hover:border-[#9C2F2F] bg-[#0E0D0C] p-4 rounded-[4px] flex flex-col items-center justify-center cursor-pointer transition-colors space-y-1.5 text-center">
                  <Upload size={20} className="text-[#A89F91]" />
                  <span className="text-xs text-[#ECE4D3] font-medium">คลิกหรือลากไฟล์สลิปมาวางที่นี่</span>
                  <span className="text-[10px] text-[#A89F91]">กรุณาแนบสลิปมัดจำ 500 บาท เพื่อส่งคำขอจองคิว</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleSlipFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* 10. Steps After Submit Notice Box */}
          <div className="p-4 bg-[#171512] border border-[#4A443A] rounded-[6px] space-y-1.5 text-xs text-[#ECE4D3] font-prompt">
            <div className="flex items-center space-x-2 font-bold text-amber-300">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <span>10. ขั้นตอนถัดไปหลังส่งคำขอจองคิว</span>
            </div>
            <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
              เมื่อคุณแนบสลิปมัดจำและกดส่งคำขอเรียบร้อยแล้ว ทางร้านจะทำการตรวจสอบรายละเอียดงานและหลักฐานการโอนเงินเพื่อยืนยันคิวให้คุณโดยเร็วที่สุด
            </p>
          </div>

        </div>

        {/* Bottom Sticky / Summary Bar */}
        <div className="border-t border-studio-border pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-studio-sec p-3.5 rounded-[6px] border border-studio-border/60">
          <div className="text-xs text-studio-secondary space-y-0.5">
            <div>
              ช่าง: <strong className="text-studio-primary">{selectedArtist?.name || 'ยังไม่เลือกช่าง'}</strong> • 
              สไตล์: <strong className="text-studio-primary">{style || 'ยังไม่เลือกสไตล์'}</strong>
            </div>
            <div className="text-[11px]">
              ขนาด: <strong className="text-studio-red">{width}×{height} ซม.</strong> • 
              มัดจำ: <strong className="text-amber-300 font-bold">฿500</strong> • 
              สลิป: <strong className={slipFile ? "text-emerald-400" : "text-amber-400"}>{slipFile ? 'แนบแล้ว' : 'ยังไม่ได้แนบ'}</strong>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto min-h-[48px] text-xs uppercase tracking-wider font-semibold py-3.5 px-8 rounded-[4px] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-studio-red hover:bg-tattoo-red-dark text-studio-paper border border-studio-red shadow-lg shadow-studio-red/20"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="mr-2 animate-spin" />
                  <span>กำลังส่งคำขอจอง...</span>
                </>
              ) : (
                <>
                  <Send size={14} className="mr-2" />
                  <span>ส่งคำขอจอง (พร้อมสลิปมัดจำ ฿500)</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-[#A89F91] font-light text-center sm:text-right">
              ทางร้านจะตรวจสอบรายละเอียดงานและหลักฐานการโอนเงินเพื่อยืนยันคิว
            </span>
          </div>
        </div>

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
