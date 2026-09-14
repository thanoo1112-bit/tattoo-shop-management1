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
  ChevronRight
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

// Helper to extract clean specialties array from artist object
const getArtistSpecialties = (art?: any): string[] => {
  if (!art) return [];
  let specs: string[] = [];
  if (Array.isArray(art.specialties) && art.specialties.length > 0) {
    specs = art.specialties.map((s: string) => s.trim()).filter(Boolean);
  } else if (typeof art.specialty === 'string' && art.specialty.trim()) {
    specs = art.specialty.split('/').map((s: string) => s.trim()).filter(Boolean);
  }
  return specs.filter((s: string) => s !== 'ตามที่ช่างแนะนำ');
};

export type TattooWorkType = 'NEW_TATTOO' | 'REWORK' | 'COVER_UP' | 'SCAR_COVER';

const translateRpcError = (msg: string): string => {
  if (!msg) return 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว';
  if (msg.includes('ARTIST_BASE_PRICE_NOT_CONFIGURED')) {
    return 'ยังไม่สามารถประเมินราคาสำหรับช่างคนนี้ได้ กรุณาติดต่อร้าน';
  }
  if (msg.includes('PRICING_SETTINGS_NOT_CONFIGURED') || msg.includes('PRICE_ESTIMATE_SNAPSHOT_INVALID') || msg.includes('PRICING_RULE_NOT_FOUND')) {
    return 'ระบบประเมินราคายังไม่พร้อมใช้งาน กรุณาติดต่อร้าน';
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

const translateEstimateRpcError = (msg: string): string => {
  if (!msg) return 'ไม่สามารถประเมินราคาได้ในขณะนี้ กรุณาติดต่อร้าน';
  if (msg.includes('ARTIST_BASE_PRICE_NOT_CONFIGURED')) {
    return 'ยังไม่สามารถประเมินราคาสำหรับช่างคนนี้ได้ กรุณาติดต่อร้าน';
  }
  if (msg.includes('INVALID_TATTOO_DIMENSIONS') || msg.includes('width_cm and height_cm must be positive')) {
    return 'กรุณาตรวจสอบขนาดงานสักอีกครั้ง';
  }
  if (
    msg.includes('PRICING_SETTINGS_NOT_CONFIGURED') ||
    msg.includes('COLOR_PRICING_RULE_NOT_CONFIGURED') ||
    msg.includes('WORK_TYPE_PRICING_RULE_NOT_CONFIGURED') ||
    msg.includes('SIZE_RULE_CONFIGURATION_INVALID')
  ) {
    return 'ระบบประเมินราคายังไม่พร้อมใช้งาน กรุณาติดต่อร้าน';
  }
  return 'ระบบประเมินราคายังไม่พร้อมใช้งาน กรุณาติดต่อร้าน';
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

  // Request Type State (Unified Customer Booking Flow: DIRECT_BOOKING)
  const [requestType, setRequestType] = useState<'ESTIMATE' | 'DIRECT_BOOKING'>(
    preselectedType || 'DIRECT_BOOKING'
  );

  useEffect(() => {
    if (preselectedType) {
      setRequestType(preselectedType);
    }
  }, [preselectedType]);

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

  // Submission State
  const [submitted, setSubmitted] = useState(false);
  const [isFlashSubmission, setIsFlashSubmission] = useState(false);
  const [isDirectBookingSubmission, setIsDirectBookingSubmission] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
  const [newBookingId, setNewBookingId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Phase 7D: Customer Price Estimate Preview State
  const [priceEstimate, setPriceEstimate] = useState<{
    minPrice: number;
    maxPrice: number;
    sizeLabel?: string;
    colorLabel?: string;
    workTypeLabel?: string;
  } | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimateFingerprint, setEstimateFingerprint] = useState<{
    artistId: string;
    width: number;
    height: number;
  } | null>(null);

  // Validate if current price-affecting inputs match the previewed fingerprint
  const isEstimateValid = React.useMemo(() => {
    if (!priceEstimate || !estimateFingerprint) return false;
    return (
      estimateFingerprint.artistId === artistId &&
      estimateFingerprint.width === width &&
      estimateFingerprint.height === height
    );
  }, [priceEstimate, estimateFingerprint, artistId, width, height]);

  const isEstimateStale = React.useMemo(() => {
    if (!priceEstimate || !estimateFingerprint) return false;
    return !isEstimateValid;
  }, [priceEstimate, isEstimateValid, estimateFingerprint]);

  const handleCalculatePriceEstimate = async () => {
    setEstimateError(null);
    setError('');

    if (!artistId) {
      setEstimateError('กรุณาเลือกช่างสักที่ต้องการก่อนประเมินราคา');
      return;
    }
    if (!width || width <= 0 || !height || height <= 0) {
      setEstimateError('กรุณากรอกขนาดงานสัก (ความกว้างและความสูง) ให้มากกว่า 0 ซม.');
      return;
    }

    setIsEstimating(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('calculate_tattoo_price_estimate', {
        p_artist_id: artistId,
        p_width_cm: width,
        p_height_cm: height,
        p_color_technique: null,
        p_work_type: null,
      });

      if (rpcErr) {
        setEstimateError(translateEstimateRpcError(rpcErr.message));
        setPriceEstimate(null);
        setEstimateFingerprint(null);
        return;
      }

      if (data) {
        const res = Array.isArray(data) ? data[0] : data;
        if (res) {
          setPriceEstimate({
            minPrice: Number(res.estimated_min_price),
            maxPrice: Number(res.estimated_max_price),
            sizeLabel: res.size_label,
            colorLabel: res.color_label,
            workTypeLabel: res.work_type_label,
          });
          setEstimateFingerprint({
            artistId,
            width,
            height,
          });
        }
      }
    } catch (err: any) {
      console.error('Price estimation error:', err);
      setEstimateError(translateEstimateRpcError(err?.message || ''));
      setPriceEstimate(null);
      setEstimateFingerprint(null);
    } finally {
      setIsEstimating(false);
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
        style,
        size_label,
        price,
        deposit_amount,
        estimated_duration_minutes,
        image_url,
        image_url_2,
        status,
        is_visible,
        artists (
          id,
          name,
          nickname,
          avatar_url,
          specialties
        )
      `)
      .eq('id', flashId)
      .single()
      .then(({ data, error: fetchErr }: any) => {
        if (!isMounted) return;
        setLoadingFlash(false);
        if (fetchErr || !data) {
          setFlashError('ไม่พบข้อมูลลาย Flash ที่ระบุในระบบ หรือลายนี้อาจถูกลบไปแล้ว');
          return;
        }

        setFlashData(data);
        if (data.artist_id) setArtistId(data.artist_id);
        if (data.style) setStyle(data.style);
        if (data.image_url) setReferenceImage(data.image_url);
      });

    return () => {
      isMounted = false;
    };
  }, [flashId, supabase]);

  // 2. Sync from Draft on mount if draft exists (Normal Mode)
  useEffect(() => {
    if (!flashId && estimateDraft) {
      if (estimateDraft.artistId) setArtistId(estimateDraft.artistId);
      if (estimateDraft.referenceImages && estimateDraft.referenceImages.length > 0) {
        setReferenceImages(estimateDraft.referenceImages);
        setReferenceImage(estimateDraft.referenceImages[0]);
      } else if (estimateDraft.referenceImage) {
        setReferenceImage(estimateDraft.referenceImage);
        setReferenceImages([estimateDraft.referenceImage]);
      }
      if (estimateDraft.width) setWidth(estimateDraft.width);
      if (estimateDraft.height) setHeight(estimateDraft.height);
      if (estimateDraft.placement) setPlacement(estimateDraft.placement);
      if (estimateDraft.style) setStyle(estimateDraft.style);
      if (estimateDraft.description) setDescription(estimateDraft.description);
      if (estimateDraft.preferredDate) setPreferredDate(estimateDraft.preferredDate);
      if ((estimateDraft as any).preferredTime) setPreferredTime((estimateDraft as any).preferredTime);
      
      setEstimateDraft(null);
    }
  }, [flashId, estimateDraft, setEstimateDraft]);

  // Sync preselected artist/style (Normal Mode)
  useEffect(() => {
    if (!flashId && preselectedArtistId) {
      setArtistId(preselectedArtistId);
      const targetArtist = artists.find((a) => a.id === preselectedArtistId);
      const availableStyles = getArtistSpecialties(targetArtist);
      if (preselectedStyle && availableStyles.includes(preselectedStyle)) {
        setStyle(preselectedStyle);
      } else {
        setStyle('');
      }
    }
  }, [flashId, preselectedArtistId, preselectedStyle, artists]);

  // 3. Silently Prefill Returning Customer's Health Disclosure from Latest Request
  const prefilledHealthRef = useRef(false);

  useEffect(() => {
    if (!user?.id || prefilledHealthRef.current) return;

    const currentUserId = user.id;
    let isMounted = true;

    async function prefillHealthData() {
      try {
        const { data, error: fetchErr } = await supabase
          .from('estimate_requests')
          .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
          .eq('customer_user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!isMounted) return;

        if (fetchErr) {
          prefilledHealthRef.current = true;
          return;
        }

        if (data && !prefilledHealthRef.current) {
          prefilledHealthRef.current = true;
          if (data.has_medical_condition === true) {
            setHasMedicalCondition(true);
            setMedicalConditionNote(data.medical_condition_note || '');
          } else {
            setHasMedicalCondition(false);
            setMedicalConditionNote('');
          }

          if (data.has_allergy === true) {
            setHasAllergy(true);
            setAllergyNote(data.allergy_note || '');
          } else {
            setHasAllergy(false);
            setAllergyNote('');
          }
        } else {
          prefilledHealthRef.current = true;
        }
      } catch {
        if (isMounted) prefilledHealthRef.current = true;
      }
    }

    prefillHealthData();

    return () => {
      isMounted = false;
    };
  }, [user?.id, supabase]);

  const handleArtistSelect = (selectedId: string) => {
    if (flashId) return; // Locked in Flash Mode
    if (selectedId === artistId) return;
    setArtistId(selectedId);
    const targetArtist = artists.find((a) => a.id === selectedId);
    const availableStyles = getArtistSpecialties(targetArtist);
    if (!style || !availableStyles.includes(style)) {
      setStyle('');
    }
    setError('');
  };

  const saveDraft = () => {
    setEstimateDraft({
      artistId,
      referenceImage: referenceImages[0] || referenceImage,
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
    // =========================================================================
    // CUSTOMER ESTIMATE REQUEST SUBMISSION
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

    const artistName = selectedArtistObj ? selectedArtistObj.name : 'ช่างประจำร้าน';

    try {
      const resId = await addEstimateRequest({
        artistId,
        artistName,
        referenceImage: referenceImages[0] || referenceImage || '',
        referenceImages: referenceImages.length > 0 ? referenceImages : (referenceImage ? [referenceImage] : []),
        width,
        height,
        placement: placement.trim(),
        style: style.trim(),
        work_type: null,
        description: preferredTime ? `${description ? description.trim() + '\n' : ''}[เวลาสะดวก: ${preferredTime} น.]` : (description ? description.trim() : ''),
        preferredDate: preferredDate || undefined,
        hasMedicalCondition,
        medicalConditionNote: hasMedicalCondition ? medicalConditionNote.trim() : null,
        hasAllergy,
        allergyNote: hasAllergy ? allergyNote.trim() : null,
      });

      setNewRequestId(resId);
      setIsFlashSubmission(false);
      setIsDirectBookingSubmission(false);
      setSubmitted(true);
      if (onSuccess) onSuccess(resId);
    } catch (err: any) {
      console.error('Error submitting estimate request:', err);
      setError(translateRpcError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอประเมินราคา'));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  // --- SUBMITTED SUCCESS SCREEN ---
  if (submitted) {
    if (isDirectBookingSubmission) {
      return (
        <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={28} />
          </div>
          <div className="inline-flex items-center space-x-1.5 bg-amber-950/60 border border-amber-700/60 px-3 py-1 rounded text-amber-300 text-[11px] uppercase font-bold tracking-widest">
            <Sparkles size={12} />
            <span>DIRECT BOOKING CREATED</span>
          </div>
          <h3 className="text-xl font-bold text-studio-primary">สร้างคิวจองสำเร็จแล้ว! (สถานะ: รอมัดจำ)</h3>
          
          <div className="bg-studio-main border border-amber-900/40 p-4 rounded-[6px] max-w-md mx-auto text-left space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-studio-border/60">
              <span className="text-studio-muted">รหัสคิวงาน:</span>
              <strong className="text-amber-300 font-mono">#{newBookingId ? newBookingId.slice(0, 8).toUpperCase() : newRequestId.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">สถานะคิวงาน:</span>
              <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-bold">
                รอมัดจำ (WAITING_DEPOSIT)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">เงินมัดจำเพื่อล็อกคิว:</span>
              <strong className="text-amber-300 font-mono font-bold">฿500</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ราคางานสัก:</span>
              <span className="text-studio-secondary italic">ยังไม่กำหนดราคา (กำหนดภายหลัง)</span>
            </div>
          </div>

          <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto font-light">
            ระบบได้สร้างรายการคิวของคุณเรียบร้อยแล้ว กรุณาชำระเงินมัดจำ 500 บาทและแนบสลิปโอนเงิน เพื่อให้ทางร้านอนุมัติและยืนยันคิวของคุณอย่างสมบูรณ์
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/portal?tab=bookings';
                }
              }}
              className="min-h-[44px] flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-amber-600 flex items-center justify-center cursor-pointer shadow-lg"
            >
              ไปที่หน้าแนบสลิปมัดจำ (Portal)
            </button>
          </div>
        </div>
      );
    }

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
              <span className="text-studio-muted">รหัสคำขอจอง:</span>
              <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ลายที่จอง:</span>
              <strong className="text-studio-primary">{flashData?.title}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ช่างสักเจ้าของลาย:</span>
              <strong className="text-studio-primary">{flashArtistName}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ราคาค่าสัก (Fixed):</span>
              <strong className="text-studio-red">฿{Number(flashData?.price || 0).toLocaleString()}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">เงินมัดจำ:</span>
              <strong className="text-studio-primary">฿{Number(flashData?.deposit_amount || 0).toLocaleString()}</strong>
            </div>
          </div>

          <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto font-light">
            ร้านได้บันทึกคำขอจองลาย Flash ของท่านไว้แล้ว และได้ล็อกสถานะลายเป็น <strong>รอการยืนยัน (HELD)</strong> เพื่อป้องกันผู้อื่นจองซ้ำ โดยร้านจะติดต่อเพื่อยืนยันรอบนัดหมายและแจ้งชำระมัดจำ
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <Link
              href="/portal?tab=flash"
              className="min-h-[44px] flex-1 bg-studio-red hover:bg-tattoo-red-dark text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center justify-center"
            >
              ไปที่หน้ารายการจองลาย Flash (Portal)
            </Link>
            <Link
              href="/"
              className="min-h-[44px] flex-1 bg-transparent hover:bg-studio-sec border border-studio-border text-studio-primary text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] flex items-center justify-center"
            >
              กลับสู่หน้าแรก
            </Link>
          </div>
        </div>
      );
    }

    // Normal Booking Request Success
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
        <div className="w-12 h-12 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="text-lg font-bold text-studio-primary">ส่งคำขอจองเรียบร้อยแล้ว</h3>
        <p className="text-xs text-studio-secondary leading-relaxed">
          รหัสคำขอจอง: <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
        </p>
        <p className="text-xs text-studio-secondary mb-6 leading-relaxed">
          ร้านหรือช่างสักจะตรวจสอบรายละเอียดและติดต่อกลับตามขั้นตอนของร้าน โดยคุณสามารถตรวจสอบสถานะคิวได้ที่หน้าบริการลูกค้า
        </p>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=estimates';
            }
          }}
          className="min-h-[44px] w-full bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red"
        >
          ไปที่หน้ารายการคำขอจอง (Portal)
        </button>
      </div>
    );
  }

  // --- LOADING FLASH STATE ---
  if (flashId && loadingFlash) {
    return (
      <div className="py-20 text-center space-y-3 font-prompt">
        <Loader2 size={28} className="animate-spin text-studio-red mx-auto" />
        <p className="text-xs text-studio-secondary">กำลังโหลดข้อมูลแบบลายสัก Flash...</p>
      </div>
    );
  }

  // --- FLASH ERROR STATE ---
  if (flashId && flashError) {
    return (
      <div className="bg-studio-card border border-studio-border p-8 rounded-[8px] text-center space-y-4 font-prompt">
        <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-base font-bold text-studio-primary">{flashError}</h3>
        <p className="text-xs text-studio-secondary">กรุณาเลือกลายสัก Flash จากแคตตาล็อกของทางร้าน</p>
        <div className="pt-2">
          <Link
            href="/flash"
            className="inline-flex items-center space-x-2 text-xs bg-studio-red text-studio-paper py-2.5 px-5 rounded-[4px] font-semibold"
          >
            <ArrowLeft size={14} />
            <span>ไปที่หน้าแคตตาล็อก Flash</span>
          </Link>
        </div>
      </div>
    );
  }

  // --- FLASH UNAVAILABLE STATE (HELD, RESERVED, SOLD) ---
  if (flashId && flashData && flashData.status !== 'AVAILABLE') {
    const statusLabel = 
      flashData.status === 'HELD' ? 'กำลังรอการยืนยัน (HELD)' :
      flashData.status === 'RESERVED' ? 'มีผู้จองแล้ว (RESERVED)' :
      'สักแล้ว / ปิดการจอง (SOLD)';

    return (
      <div className="bg-studio-card border border-amber-900/40 p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt">
        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <div className="inline-flex items-center space-x-1.5 bg-amber-950/60 border border-amber-700/50 px-3 py-1 rounded text-amber-300 text-xs font-bold uppercase tracking-wider">
          <span>{statusLabel}</span>
        </div>
        <h3 className="text-lg font-bold text-studio-primary">ลาย Flash นี้ไม่พร้อมสำหรับการจอง</h3>
        <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto">
          ขออภัย แบบลายสัก <strong>“{flashData.title}”</strong> ไม่สามารถส่งคำขอจองใหม่ได้ในขณะนี้ เนื่องจากมีสถานะ {statusLabel}
        </p>
        <div className="pt-3">
          <Link
            href="/flash"
            className="inline-flex items-center space-x-2 text-xs bg-studio-red hover:bg-tattoo-red-dark text-studio-paper py-3 px-6 rounded-[4px] font-semibold transition-all shadow-md"
          >
            <ArrowLeft size={14} />
            <span>กลับไปเลือกแบบลายสัก Flash อื่น</span>
          </Link>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FLASH BOOKING MODE (AVAILABLE FLASH)
  // =========================================================================
  if (flashId && flashData) {
    const flashArtist = flashData.artists;
    const flashImages = [flashData.image_url, flashData.image_url_2].filter(Boolean) as string[];
    const activeFlashImg = flashImages[activeImageIndex] || flashData.image_url;

    return (
      <div className="w-full mx-auto space-y-6 animate-fadeIn font-prompt max-w-4xl">
        {/* Banner Header */}
        <div className="bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px]">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div className="flex items-center space-x-2 text-studio-red text-xs uppercase tracking-widest font-heading font-normal">
              <Sparkles size={14} />
              <span>Flash Design Booking Mode</span>
            </div>
            <span className="text-[10px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 px-2.5 py-0.5 rounded font-bold">
              ● ลายว่าง พร้อมจอง
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            จองแบบลายสัก Flash — {flashData.title}
          </h2>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            แบบลายสักพร้อมสักราคาคงที่ (Fixed Price) ระบุตำแหน่งและวันที่สะดวกเพื่อส่งคำขอจองคิวงานกับช่างเจ้าของลาย
          </p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-8 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Flash Design Image & Spec Preview */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon size={14} className="text-studio-red" />
                    <span>แบบลายสัก Flash ที่เลือก</span>
                  </span>
                  {flashImages.length > 1 && (
                    <span className="text-[10px] text-studio-muted font-mono">
                      {activeImageIndex + 1} / {flashImages.length}
                    </span>
                  )}
                </label>

                <div className="relative aspect-[4/5] rounded-[6px] border border-studio-border overflow-hidden bg-studio-main group">
                  <img
                    src={activeFlashImg}
                    alt={flashData.title}
                    className="w-full h-full object-cover select-none"
                  />

                  {flashImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveImageIndex((prev) => (prev === 0 ? flashImages.length - 1 : prev - 1))}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveImageIndex((prev) => (prev + 1) % flashImages.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Flash Info Specs Box */}
              <div className="bg-studio-main/70 border border-studio-border p-3.5 rounded-[6px] space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-studio-muted">ชื่อลายสัก:</span>
                  <strong className="text-studio-primary font-heading text-sm">{flashData.title}</strong>
                </div>
                {flashData.size_label && (
                  <div className="flex justify-between items-center">
                    <span className="text-studio-muted">ขนาดแนะนำ:</span>
                    <strong className="text-studio-primary">{flashData.size_label}</strong>
                  </div>
                )}
                {flashData.estimated_duration_minutes && (
                  <div className="flex justify-between items-center">
                    <span className="text-studio-muted">เวลาสักโดยประมาณ:</span>
                    <strong className="text-studio-primary">{flashData.estimated_duration_minutes} นาที</strong>
                  </div>
                )}
                {flashData.description && (
                  <p className="text-[11px] text-studio-secondary font-light pt-1 border-t border-studio-border/50 leading-relaxed">
                    {flashData.description}
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Locked Fields & Customer Inputs */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* 1. Artist (LOCKED) */}
              <div>
                <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User size={14} className="text-studio-red" />
                    <span>1. ช่างสักเจ้าของลาย (ล็อกตามแบบ Flash)</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-studio-muted bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                    <Lock size={10} /> ล็อกอัตโนมัติ
                  </span>
                </label>

                <div className="p-3 rounded-[6px] border border-studio-border bg-studio-main/70 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <img
                      src={flashArtist?.avatar_url || flashArtist?.avatar || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=200'}
                      alt={flashArtist?.name || 'ช่างสัก'}
                      className="w-10 h-10 object-cover rounded-full border border-studio-border shrink-0"
                    />
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-studio-primary">
                        {flashArtist?.name || 'ช่างประจำร้าน'}
                        {flashArtist?.nickname && <span className="text-studio-secondary font-normal ml-1">({flashArtist.nickname})</span>}
                      </h4>
                      <p className="text-[10px] text-studio-secondary">
                        {flashArtist?.specialties?.join(' / ') || 'ช่างสักประจำ 157 TATTOO'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-studio-red font-semibold bg-studio-red/10 px-2 py-1 rounded">
                    เจ้าของลาย
                  </span>
                </div>
              </div>

              {/* 2. Style (LOCKED) & Price/Deposit Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center justify-between">
                    <span>2. สไตล์งานสัก</span>
                    <span className="text-[10px] text-studio-muted flex items-center gap-0.5"><Lock size={9} /> ล็อก</span>
                  </label>
                  <div className="min-h-[44px] bg-studio-main/70 border border-studio-border text-xs text-studio-primary px-3.5 py-2.5 rounded-[4px] flex items-center justify-between">
                    <span className="font-semibold">{flashData.style}</span>
                    <span className="text-[10px] text-studio-muted">ตามแบบ Flash</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                    ราคาและเงินมัดจำ (Fixed)
                  </label>
                  <div className="min-h-[44px] bg-studio-main/70 border border-studio-border text-xs px-3.5 py-2 rounded-[4px] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-studio-muted block">ราคาสัก:</span>
                      <strong className="text-studio-red text-xs sm:text-sm">฿{flashData.price.toLocaleString()}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-studio-muted block">มัดจำ:</span>
                      <strong className="text-studio-primary text-xs sm:text-sm">฿{flashData.deposit_amount.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Placement on Body */}
              <div>
                <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                  3. ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span>
                </label>
                <PlacementSelector
                  value={placement}
                  onChange={setPlacement}
                />
              </div>

              {/* 4. Preferred Date & Time */}
              <div className="grid grid-cols-[3fr_2fr] gap-2 sm:gap-3 items-end">
                <div>
                  <DatePickerPopover
                    value={preferredDate}
                    onChange={(dateStr) => setPreferredDate(dateStr)}
                    artistId={flashArtist?.id || flashData?.artist_id}
                    artistWorkingDays={flashArtist?.working_days || []}
                    label="4. วันที่สะดวก (ทางเลือก)"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1">
                    <Clock size={12} className="text-studio-red shrink-0" />
                    <span className="truncate">เวลาที่สะดวก</span>
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

              {/* 5. Additional Notes */}
              <div>
                <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                  5. ข้อความหรือหมายเหตุเพิ่มเติมถึงช่างสัก (ไม่บังคับ)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น ระบุตำแหน่งที่แน่นอน, มีรอยแผลเป็นเดิม, หรือช่วงเวลาที่สะดวกเพิ่มเติม..."
                  rows={2}
                  className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary p-3 outline-none rounded-[4px] resize-none"
                />
              </div>

            </div>

          </div>

          {/* Bottom Summary Bar */}
          <div className="border-t border-studio-border pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-studio-sec p-4 rounded-[6px] border border-studio-border/60">
            <div className="text-xs text-studio-secondary space-y-0.5">
              <div>ลาย: <strong className="text-studio-primary">{flashData.title}</strong> • ช่าง: <strong className="text-studio-primary">{flashArtist?.name || 'ช่างประจำร้าน'}</strong></div>
              <div className="text-[11px]">
                ราคา: <strong className="text-studio-red">฿{flashData.price.toLocaleString()}</strong> • 
                มัดจำ: <strong className="text-studio-primary">฿{flashData.deposit_amount.toLocaleString()}</strong> • 
                ตำแหน่ง: <strong className="text-studio-primary">{placement || 'ยังไม่ระบุตำแหน่ง'}</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto min-h-[48px] bg-studio-red hover:bg-tattoo-red-dark text-studio-paper text-xs uppercase tracking-wider font-semibold py-3.5 px-8 rounded-[4px] transition-all border border-studio-red flex items-center justify-center space-x-2 disabled:opacity-50 shadow-lg shadow-studio-red/20"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="mr-2 animate-spin" />
                  กำลังส่งคำขอจอง...
                </>
              ) : (
                <>
                  <Send size={14} className="mr-2" />
                  <span>ยืนยันส่งคำขอจองลายนี้ (มัดจำ ฿{flashData.deposit_amount.toLocaleString()})</span>
                </>
              )}
            </button>
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

  // =========================================================================
  // NORMAL BOOKING MODE (ESTIMATE VS DIRECT BOOKING)
  // =========================================================================

  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div className={`w-full mx-auto space-y-5 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* Header Banner */}
      {compact ? (
        <div className="border-b border-studio-border pb-3 mb-2">
          <div className="flex items-center space-x-1.5 text-studio-red text-[10px] uppercase tracking-widest font-bold mb-0.5">
            <Sparkles size={12} />
            <span>TATTOO ESTIMATE REQUEST</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold tracking-wide text-studio-primary">
            คำขอประเมินราคางานสัก
          </h3>
          <p className="text-xs text-studio-secondary mt-0.5 font-light">
            กรอกรายละเอียดงาน เลือกวันเวลาที่สะดวก และส่งคำขอให้ช่างประเมินราคา
          </p>
        </div>
      ) : (
        <div className="bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px]">
          <div className="flex items-center space-x-2 text-studio-red text-xs uppercase tracking-widest font-heading font-normal mb-1">
            <Sparkles size={14} />
            <span>TATTOO ESTIMATE REQUEST</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            คำขอประเมินราคางานสัก
          </h2>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            กรอกรายละเอียดงาน เลือกวันเวลาที่สะดวก และส่งคำขอให้ช่างประเมินราคา
          </p>
        </div>
      )}

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
                <span className="text-[10px] text-amber-400 block">
                  ยังไม่มีข้อมูลสไตล์งานของช่างคนนี้
                </span>
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

          {/* 3. Preferred Date & Time (MOVED UP) */}
          <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-2 sm:gap-3 items-end">
            <div>
              <DatePickerPopover
                value={preferredDate}
                onChange={(dateStr) => setPreferredDate(dateStr)}
                artistId={artistId}
                artistWorkingDays={getArtistSpecialties(selectedArtist)}
                label={requestType === 'DIRECT_BOOKING' ? '3. วันที่ต้องการจองคิว *' : '3. วันที่สะดวก (ทางเลือก)'}
                disabled={!artistId}
                placeholder={
                  !artistId 
                    ? 'เลือกช่างสักก่อน' 
                    : requestType === 'DIRECT_BOOKING' 
                    ? 'เลือกวันที่ต้องการจองคิว *' 
                    : 'เลือกวันที่สะดวก (วว/ดด/ปปปป)'
                }
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
              values={flashId ? (referenceImage ? [referenceImage] : []) : referenceImages}
              onChange={setReferenceImage}
              onValuesChange={(paths) => {
                setReferenceImages(paths);
                setReferenceImage(paths[0] || '');
              }}
              maxImages={flashId ? 1 : 5}
            />
          </div>

          {/* 7. Description */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              7. รายละเอียดงานสักเพิ่มเติม
            </label>
            <p className="text-[11px] text-studio-secondary mb-1 font-light">
              อธิบายรายละเอียดลายที่ต้องการเพิ่มเติม
            </p>
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
            <p className="text-[11px] text-studio-secondary font-light">
              ข้อมูลสุขภาพนี้จะถูกใช้เพื่อการประเมินงานสักอย่างปลอดภัย และจะแสดงเฉพาะต่อ Admin และช่างสักผู้รับผิดชอบงานเท่านั้น
            </p>

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

          {/* 9. Steps After Submit Notice Box */}
          <div className="p-4 bg-[#171512] border border-[#4A443A] rounded-[6px] space-y-1.5 text-xs text-[#ECE4D3] font-prompt">
            <div className="flex items-center space-x-2 font-bold text-amber-300">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <span>9. ขั้นตอนถัดไปหลังส่งคำขอ</span>
            </div>
            <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
              ช่างจะตรวจสอบรายละเอียด รูปอ้างอิง และขนาดงาน ก่อนเสนอราคากลับมาให้คุณ เมื่อได้รับราคาแล้ว คุณสามารถกดยืนยันและชำระค่าจองคิว 500 บาทเพื่อล็อกวันนัดหมาย
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
              ขนาด: <strong className="text-studio-red">{width}×{height} ซม.</strong> • ตำแหน่ง: <strong className="text-studio-primary">{placement || 'ยังไม่ระบุตำแหน่ง'}</strong>
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
                  <span>กำลังส่งคำขอ...</span>
                </>
              ) : (
                <>
                  <Send size={14} className="mr-2" />
                  <span>ส่งคำขอให้ช่างประเมิน</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-[#A89F91] font-light text-center sm:text-right">
              ช่างจะตรวจสอบรายละเอียด รูปอ้างอิง และขนาดงาน ก่อนเสนอราคางานสักกลับมาให้คุณ
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
