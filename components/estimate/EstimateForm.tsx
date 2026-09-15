'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import ReferenceUploader from './ReferenceUploader';
import TattooSizeInput from './TattooSizeInput';
import PlacementSelector from './PlacementSelector';
import DatePickerPopover from '../booking/DatePickerPopover';
import CustomerLoginModal from '../auth/CustomerLoginModal';
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
  AlertTriangle,
  Check,
  HeartPulse
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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
    addEstimateRequest,
    estimateDraft, 
    setEstimateDraft 
  } = useApp();

  // Flash Design State
  const [flashData, setFlashData] = useState<any | null>(null);
  const [loadingFlash, setLoadingFlash] = useState(!!flashId);
  const [flashError, setFlashError] = useState('');

  // Single-Page Booking Form State
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
      .select('*, artists(*)')
      .eq('id', flashId)
      .single()
      .then(({ data, error: err }: any) => {
        if (!isMounted) return;
        setLoadingFlash(false);
        if (err || !data) {
          console.error('Error fetching flash design:', err);
          setFlashError('ไม่พบข้อมูลลายสัก Flash ที่ระบุ');
          return;
        }
        setFlashData(data);
        if (data.artist_id) setArtistId(data.artist_id);
        if (data.image_url) {
          setReferenceImage(data.image_url);
          setReferenceImages([data.image_url]);
        }
        if (data.size_cm) {
          const parts = data.size_cm.toLowerCase().split('x').map((p: string) => parseFloat(p.trim())).filter((n: number) => !isNaN(n));
          if (parts.length >= 2) {
            setWidth(parts[0]);
            setHeight(parts[1]);
          } else if (parts.length === 1) {
            setWidth(parts[0]);
            setHeight(parts[0]);
          }
        }
        if (data.style) setStyle(data.style);
      });

    return () => {
      isMounted = false;
    };
  }, [flashId, supabase]);

  // 2. Preselect Artist Helper
  useEffect(() => {
    if (preselectedArtistId) {
      setArtistId(preselectedArtistId);
    }
  }, [preselectedArtistId]);

  // Handle Artist Card Selection
  const handleArtistSelect = (id: string) => {
    setArtistId(id);
    setError('');
    const targetArtistObj = artists.find((a) => a.id === id);
    const specialties = getArtistSpecialties(targetArtistObj);
    if (style && style !== 'ตามที่ช่างแนะนำ' && specialties.length > 0 && !specialties.includes(style)) {
      setStyle('');
    }
  };

  // 3. Draft restoration for guest users returning from login
  useEffect(() => {
    if (estimateDraft) {
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
  }, [estimateDraft, setEstimateDraft]);

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

  // Validation for all single-page fields before submit
  const validateForm = async (): Promise<boolean> => {
    setError('');

    // 1. Artist Selection
    if (!artistId) {
      setError('กรุณาเลือกช่างสักที่ต้องการ');
      return false;
    }

    // 2. Artwork Details
    if (flashId && flashData) {
      if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ (Others)' || placement.trim().toLowerCase() === 'others') {
        setError('กรุณาระบุตำแหน่งบนร่างกายให้ครบถ้วน');
        return false;
      }
    } else {
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
    }

    // 3. Preferred Date & Time
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

    // Busy range check against confirmed booking slots
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

    // 4. Health Disclosures
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

  // MAIN FORM SUBMIT HANDLER (ESTIMATE-FIRST SUBMISSION)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const isFormValid = await validateForm();
    if (!isFormValid) {
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
    // ESTIMATE-FIRST CUSTOMER BOOKING SUBMISSION (SINGLE-PAGE FORM -> addEstimateRequest)
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

      // Canonical Estimate Request Submission (quoted_price = NULL, status = PENDING, NO booking created yet)
      const reqId = await addEstimateRequest({
        artistId,
        placement: placement.trim(),
        width: Number(width),
        height: Number(height),
        style: style.trim(),
        description: description ? description.trim() : '',
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
        referenceImages: finalRefImages.slice(0, 5),
        hasMedicalCondition,
        medicalConditionNote: hasMedicalCondition ? medicalConditionNote.trim() : undefined,
        hasAllergy,
        allergyNote: hasAllergy ? allergyNote.trim() : undefined,
        work_type: null,
      } as any);

      setEstimateDraft(null);
      setNewRequestId(reqId);
      setIsFlashSubmission(false);
      setSubmitted(true);

      if (onSuccess) onSuccess(reqId);
    } catch (err: any) {
      console.error('Error submitting customer estimate request:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
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

    // Normal Customer Booking Submission Success Screen (Estimate-First)
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-5 font-prompt animate-fadeIn">
        <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-1">
          <CheckCircle2 size={28} />
        </div>
        
        <div>
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-3 py-1 rounded text-[11px] font-semibold">
            สถานะ: รอตรวจสอบ
          </span>
          <h3 className="text-xl font-bold text-studio-primary mt-2">ส่งคำขอเรียบร้อยแล้ว</h3>
          <p className="text-xs text-studio-secondary mt-1">
            รหัสคำขอ: <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
          </p>
        </div>

        <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] max-w-md mx-auto text-left space-y-3 text-xs">
          <p className="text-xs text-[#ECE4D3] leading-relaxed">
            ร้านได้รับรายละเอียดงานของคุณแล้ว กรุณารอร้านตรวจสอบและประเมินราคา
          </p>
          <div className="pt-2 border-t border-[#4A443A]/40 text-[11px] text-amber-300/90 italic">
            * ราคางานจะประเมินจากรายละเอียด ขนาด ความซับซ้อน และรูปอ้างอิง
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=estimates';
            }
          }}
          className="min-h-[44px] w-full max-w-md bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red cursor-pointer shadow-lg mx-auto block"
        >
          ดูสถานะคำขอ
        </button>
      </div>
    );
  }

  // Selected Artist Helper
  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div ref={formTopRef} className={`w-full mx-auto space-y-6 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* Notice Banner */}
      <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-[8px] flex items-start space-x-3 shadow-md">
        <Sparkles className="text-studio-red shrink-0 mt-0.5" size={18} />
        <div className="text-xs space-y-1">
          <h3 className="font-bold text-studio-primary">คำขอประเมินราคาและจองคิว</h3>
          <p className="text-studio-secondary font-light">
            กรอกรายละเอียดงาน เลือกวันเวลาที่สะดวก และส่งคำขอเพื่อรับราคาประเมินจากทางร้าน (ราคางานจะประเมินจากรายละเอียด ขนาด ความซับซ้อน และรูปอ้างอิง)
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400 animate-fadeIn">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Single-Page Form */}
      <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-8 shadow-xl">
        
        {/* SECTION 1 — เลือกช่างสัก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <User className="text-studio-red shrink-0" size={18} />
              <span>1. เลือกช่างสักที่ต้องการ <span className="text-studio-red">*</span></span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              เลือกช่างที่คุณต้องการจองคิวรับบริการ
            </p>
          </div>

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
        </section>

        {/* SECTION 2 — รายละเอียดงานสัก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <ImageIcon className="text-studio-red shrink-0" size={18} />
              <span>2. รายละเอียดงานสัก</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              ระบุสไตล์ ตำแหน่ง ขนาด และแนบรูปภาพอ้างอิง
            </p>
          </div>

          {/* 2.1 Style */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              สไตล์งานสัก <span className="text-studio-red">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {['ตามที่ช่างแนะนำ', ...artistSpecialties].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStyle(st);
                    setError('');
                  }}
                  className={`px-3 py-1.5 rounded-[4px] text-xs transition-all cursor-pointer border ${
                    style === st
                      ? 'bg-studio-red border-studio-red text-white font-semibold shadow-md'
                      : 'bg-studio-main border-studio-border text-studio-secondary hover:border-studio-border/80'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* 2.2 Placement */}
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

          {/* 2.3 Size Input */}
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

          {/* 2.4 Reference Image Upload */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
              <ImageIcon size={14} className="text-studio-red" />
              <span>รูปภาพอ้างอิง (สูงสุด 5 รูป) <span className="text-studio-red">*</span></span>
            </label>
            <ReferenceUploader
              values={referenceImages}
              maxImages={5}
              onValuesChange={(imgs) => {
                setReferenceImages(imgs);
                if (imgs.length > 0) setReferenceImage(imgs[0]);
                setError('');
              }}
              onChange={(img) => {
                setReferenceImage(img);
              }}
            />
          </div>

          {/* 2.5 Description */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              รายละเอียดงานสักเพิ่มเติม
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น รายละเอียดแนวคิด สีที่ต้องการ เรื่องราวของภาพ หรือจุดที่เน้นพิเศษ..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-3 outline-none rounded-[4px] font-prompt leading-relaxed resize-y"
            />
          </div>
        </section>

        {/* SECTION 3 — วันและเวลาที่สะดวก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <Calendar className="text-studio-red shrink-0" size={18} />
              <span>3. วันและเวลาที่สะดวก</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              เลือกวันที่และเวลาที่สะดวกเข้ารับบริการ (ช่าง: <strong className="text-studio-primary">{selectedArtist?.name || 'ช่างประจำร้าน'}</strong>)
            </p>
          </div>

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
        </section>

        {/* SECTION 4 — ข้อมูลสุขภาพ */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <HeartPulse className="text-studio-red shrink-0" size={18} />
              <span>4. ข้อมูลสุขภาพและการยินยอม</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              กรอกข้อมูลสุขภาพและประวัติการแพ้เพื่อความปลอดภัยของคุณในการรับบริการ
            </p>
          </div>

          <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 font-prompt">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs font-semibold pb-2 border-b border-[#4A443A]/60">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>ข้อระวังทางสุขภาพที่ควรแจ้งช่างสัก</span>
            </div>

            {/* Medical Condition */}
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
                  className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-[#9C2F2F] bg-[#0E0D0C] w-4 h-4"
                />
                <span>มีโรคประจำตัว หรือสภาวะทางสุขภาพที่ต้องแจ้งช่างสัก</span>
              </label>

              {hasMedicalCondition && (
                <textarea
                  rows={2}
                  value={medicalConditionNote}
                  onChange={(e) => {
                    setMedicalConditionNote(e.target.value);
                    setError('');
                  }}
                  placeholder="เช่น โรคเบาหวาน, ความดันโลหิต, โรคหัวใจ, กำลังรับประทานยาสลายลิ่มเลือด ฯลฯ"
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded font-prompt"
                />
              )}
            </div>

            {/* Allergy History */}
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
                  className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-[#9C2F2F] bg-[#0E0D0C] w-4 h-4"
                />
                <span>มีประวัติการแพ้ยา สารเคมี แอลกอฮอล์ หรือน้ำยาทำความสะอาด</span>
              </label>

              {hasAllergy && (
                <textarea
                  rows={2}
                  value={allergyNote}
                  onChange={(e) => {
                    setAllergyNote(e.target.value);
                    setError('');
                  }}
                  placeholder="เช่น แพ้ยาฆ่าเชื้อ, แพ้พลาสเตอร์ยา, แพ้น้ำยาล้างแผล ฯลฯ"
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded font-prompt"
                />
              )}
            </div>
          </div>
        </section>

        {/* SECTION 5 — ตรวจสอบและส่งคำขอ */}
        <section className="space-y-4 pt-2 border-t border-studio-border">
          <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[6px] space-y-2 text-xs text-studio-secondary font-prompt">
            <div className="flex items-center space-x-2 text-amber-400 font-semibold">
              <Sparkles size={16} className="shrink-0" />
              <span>การประเมินราคาและการยืนยันคิวงาน</span>
            </div>
            <p className="leading-relaxed">
              ร้านจะตรวจสอบรายละเอียดงานและแจ้งราคาประเมินให้คุณภายหลังผ่านระบบ Customer Portal (ราคางานจะประเมินจากรายละเอียด ขนาด ความซับซ้อน และรูปอ้างอิง)
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto min-h-[48px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-10 font-bold transition-all rounded-[4px] border border-studio-red flex items-center justify-center space-x-2 cursor-pointer shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Send size={15} />
                  <span>ส่งคำขอจองคิว</span>
                </>
              )}
            </button>
          </div>
        </section>

      </form>

      {/* Guest Login Modal */}
      {showLogin && (
        <CustomerLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => {
            setShowLogin(false);
          }}
        />
      )}

    </div>
  );
}
