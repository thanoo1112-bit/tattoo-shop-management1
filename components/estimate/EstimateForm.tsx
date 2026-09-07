'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import ReferenceUploader from './ReferenceUploader';
import TattooSizeInput from './TattooSizeInput';
import PlacementSelector from './PlacementSelector';
import DatePickerPopover from '../booking/DatePickerPopover';
import CustomerLoginModal from '../auth/CustomerLoginModal';
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
  flashId?: string;
  compact?: boolean;
  onSuccess?: (requestId: string) => void;
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

export default function EstimateForm({ 
  initialArtistId = '', 
  preselectedArtistId,
  preselectedArtworkImage,
  preselectedStyle,
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
  const [placement, setPlacement] = useState('ท่อนแขน (Forearm)');
  const [style, setStyle] = useState(preselectedStyle || '');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('13:00');

  // Submission State
  const [submitted, setSubmitted] = useState(false);
  const [isFlashSubmission, setIsFlashSubmission] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
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
      description,
      preferredDate: preferredDate || undefined,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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

      if (preferredDate && preferredDate <= getThailandTodayStr()) {
        setError('กรุณาเลือกวันนัดหมายตั้งแต่วันพรุ่งนี้เป็นต้นไป');
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
    // NORMAL ESTIMATE SUBMISSION
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
      setError('กรุณาระบุตำแหน่งบนร่างกายให้ครบถ้วน');
      return;
    }

    if (preferredDate && preferredDate <= getThailandTodayStr()) {
      setError('กรุณาเลือกวันนัดหมายตั้งแต่วันพรุ่งนี้เป็นต้นไป');
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

    if (!isLoggedIn) {
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
        referenceImage: referenceImages[0] || referenceImage || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800',
        referenceImages: referenceImages.length > 0 ? referenceImages : (referenceImage ? [referenceImage] : []),
        width,
        height,
        placement,
        style,
        description,
        preferredDate: preferredDate || undefined,
      });

      setNewRequestId(resId);
      setIsFlashSubmission(false);
      setSubmitted(true);
      if (onSuccess) onSuccess(resId);
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  // --- SUBMITTED SUCCESS SCREEN ---
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
                  3. ตำแหน่งบนร่างกาย <span className="text-studio-red">*</span>
                </label>
                <PlacementSelector
                  value={placement}
                  onChange={setPlacement}
                />
              </div>

              {/* 4. Preferred Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DatePickerPopover
                    value={preferredDate}
                    onChange={(dateStr) => setPreferredDate(dateStr)}
                    artistId={flashArtist?.id || flashData?.artist_id}
                    artistWorkingDays={flashArtist?.working_days || []}
                    label="4. วันที่สะดวกเข้ารับบริการ (ทางเลือก)"
                  />
                </div>

                <div>
                  <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1.5">
                    <Clock size={13} className="text-studio-red" />
                    <span>เวลาที่สะดวกเริ่มสัก (ทางเลือก)</span>
                  </label>
                  <select
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2 outline-none rounded-[4px] cursor-pointer"
                  >
                    <option value="10:00">10:00 น. (ช่วงเช้า)</option>
                    <option value="11:00">11:00 น. (ช่วงสาย)</option>
                    <option value="13:00">13:00 น. (ช่วงบ่าย)</option>
                    <option value="14:00">14:00 น. (ช่วงบ่าย)</option>
                    <option value="15:00">15:00 น. (ช่วงบ่ายแก่)</option>
                    <option value="16:00">16:00 น. (ช่วงเย็น)</option>
                    <option value="17:00">17:00 น. (ช่วงค่ำ)</option>
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
  // NORMAL BOOKING MODE (CUSTOM TATTOO ESTIMATE)
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
            <span>BOOKING REQUEST</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold tracking-wide text-studio-primary">
            ส่งคำขอจองคิวงานสัก
          </h3>
          <p className="text-xs text-studio-secondary mt-0.5 font-light">
            ส่งรายละเอียดงาน รูปอ้างอิง ขนาด และตำแหน่ง เพื่อส่งคำขอจองกับช่างที่คุณเลือก
          </p>
        </div>
      ) : (
        <div className="bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px]">
          <div className="flex items-center space-x-2 text-studio-red text-xs uppercase tracking-widest font-heading font-normal mb-1">
            <Sparkles size={14} />
            <span>CUSTOM TATTOO BOOKING REQUEST</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            ส่งคำขอจองคิวงานสัก (BOOKING REQUEST)
          </h2>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            ส่งรายละเอียดงาน รูปอ้างอิง ขนาด ตำแหน่ง และช่างสักที่ต้องการ เพื่อส่งคำขอจองคิวงานสัก
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
        
        <div className={compact ? "space-y-6 w-full" : "grid grid-cols-1 lg:grid-cols-12 gap-8"}>
          
          {/* Reference Image Upload */}
          <div className={compact ? "space-y-4 w-full" : "lg:col-span-5 space-y-4"}>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
                <ImageIcon size={14} className="text-studio-red" />
                <span>ภาพตัวอย่าง / ลายที่สนใจ (Reference)</span>
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
          </div>

          {/* Artist Selection, Details, Size */}
          <div className={compact ? "space-y-5 w-full" : "lg:col-span-7 space-y-6"}>
            
            {/* 1. Artist Selection */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
                <User size={14} className="text-studio-red" />
                <span>1. เลือกช่างสักที่ต้องการ</span>
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

            {/* 3. Placement */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                3. ตำแหน่งบนร่างกาย
              </label>
              <PlacementSelector
                value={placement}
                onChange={setPlacement}
              />
            </div>

            {/* 4. Size Input */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                4. ขนาดของงานสัก (เซนติเมตร)
              </label>
              <TattooSizeInput
                width={width}
                height={height}
                onWidthChange={setWidth}
                onHeightChange={setHeight}
              />
            </div>

            {/* 5. Description */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                5. รายละเอียดเพิ่มเติมที่ต้องการบอกช่าง
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="เช่น ต้องการปรับเพิ่มดอกไม้, มีรอยสักเดิมทับ, ต้องการโทนเงาเข้ม..."
                rows={3}
                className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary p-3 outline-none rounded-[4px] resize-none"
              />
            </div>

            {/* 6. Preferred Date */}
            <div>
              <DatePickerPopover
                value={preferredDate}
                onChange={(dateStr) => setPreferredDate(dateStr)}
                artistId={artistId}
                artistWorkingDays={getArtistSpecialties(selectedArtist)}
                label="6. วันที่สนใจเข้ารับบริการ (ทางเลือก / Optional)"
                disabled={!artistId}
                placeholder={artistId ? 'เลือกวันที่สะดวก (วว/ดด/ปปปป)' : 'กรุณาเลือกช่างสักในขั้นตอนที่ 1 ก่อน'}
              />
            </div>

          </div>

        </div>

        {/* Bottom Sticky / Summary Bar */}
        <div className="border-t border-studio-border pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-studio-sec p-3.5 rounded-[6px] border border-studio-border/60">
          <div className="text-xs text-studio-secondary space-y-0.5">
            <div>ช่าง: <strong className="text-studio-primary">{selectedArtist?.name || 'ยังไม่เลือกช่าง'}</strong> • สไตล์: <strong className="text-studio-primary">{style || 'ยังไม่เลือกสไตล์'}</strong></div>
            <div className="text-[11px]">ขนาด: <strong className="text-studio-red">{width}×{height} ซม.</strong> • ตำแหน่ง: <strong className="text-studio-primary">{placement || 'ยังไม่ระบุตำแหน่ง'}</strong></div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto min-h-[48px] bg-studio-red hover:bg-tattoo-red-dark text-studio-paper text-xs uppercase tracking-wider font-semibold py-3.5 px-8 rounded-[4px] transition-all border border-studio-red flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                กำลังส่งคำขอ...
              </>
            ) : (
              <>
                <Send size={14} className="mr-2" />
                <span>ส่งคำขอจองคิว</span>
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
