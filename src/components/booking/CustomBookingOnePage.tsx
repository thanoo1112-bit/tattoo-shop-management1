'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { X, UploadCloud, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { useBookingState } from './BookingStateProvider';
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization';
import { calculateTattooEstimate, getSizeBasedBookingBuffer, getLatestPreferredStartTime } from '@/lib/bookingCalculations';
import { createClient } from '@/lib/supabase/client';
import { formatThaiDate } from '@/lib/dateUtils';
import BookingCalendar from './BookingCalendar';
import BookingSuccessState from './BookingSuccessState';

interface Props {
  artists: any[];
  shop: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function CustomBookingOnePage({ artists, shop }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const {
    formData,
    setFormData,
    isFirstTattoo,
    setIsFirstTattoo,
    safetyNoticeAcknowledged,
    setSafetyNoticeAcknowledged,
    realAreaPhotos,
    setRealAreaPhotos,
    designReferencePhotos,
    setDesignReferencePhotos,
    clearBookingDraft,
    submissionComplete,
    setSubmissionComplete
  } = useBookingState();

  // Selected artist & style states derived from query parameters or formData
  const artistParam = searchParams.get('artist') || formData.__artistId || '';
  const styleParam = searchParams.get('style') || formData.__styleId || '';

  const selectedArtist = useMemo(() => {
    return artists.find(a => a.artist_id === artistParam) || null;
  }, [artists, artistParam]);

  const [isListExpanded, setIsListExpanded] = useState(!artistParam);
  const [colorOptions, setColorOptions] = useState<{value: string, label: string}[]>([]);
  const [isFetchingColors, setIsFetchingColors] = useState(false);
  const [workTypes, setWorkTypes] = useState<{value: string, label: string}[]>([]);
  const [isFetchingWorkTypes, setIsFetchingWorkTypes] = useState(false);

  // Availability calendar state
  const [availability, setAvailability] = useState<any[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

  // File Upload states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isOptimizing, setIsOptimizing] = useState(false);
  const realFileInputRef = useRef<HTMLInputElement>(null);
  const designFileInputRef = useRef<HTMLInputElement>(null);

  // Submit and terms states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const requiresRealPhoto = ['extension', 'touch_up', 'cover_up', 'scar_cover'].includes(formData.workType);

  // Update query params helper
  const updateUrlParams = (artistId: string | null, styleId: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (artistId) params.set('artist', artistId);
    else params.delete('artist');
    if (styleId) params.set('style', styleId);
    else params.delete('style');
    router.replace(`/book/${shop.slug}?${params.toString()}`);
  };

  // Fetch color/work types options for selected artist
  useEffect(() => {
    if (artistParam) {
      const fetchArtistOptions = async () => {
        setIsFetchingColors(true);
        setIsFetchingWorkTypes(true);
        const [colorRes, workTypeRes] = await Promise.all([
          supabase.rpc('get_public_artist_color_options', { p_shop_slug: shop.slug, p_artist_id: artistParam }),
          supabase.rpc('get_public_artist_work_types', { p_shop_slug: shop.slug, p_artist_id: artistParam })
        ]);
        setIsFetchingColors(false);
        setIsFetchingWorkTypes(false);

        if (!colorRes.error && colorRes.data) {
          setColorOptions(colorRes.data);
        }
        if (!workTypeRes.error && workTypeRes.data) {
          setWorkTypes(workTypeRes.data);
        }
      };
      fetchArtistOptions();
    }
  }, [artistParam, shop.slug]);

  // Fetch availability for selected artist
  useEffect(() => {
    if (!artistParam) {
      setAvailability([]);
      return;
    }

    const fetchAvailability = async () => {
      setIsLoadingAvailability(true);
      const today = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(today);
      const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
      const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
      const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
      const startDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      const endBkkDate = new Date(y, m, d + 90);
      const endDateStr = `${endBkkDate.getFullYear()}-${String(endBkkDate.getMonth() + 1).padStart(2, '0')}-${String(endBkkDate.getDate()).padStart(2, '0')}`;

      const { data, error } = await supabase.rpc('get_public_daily_availability', {
        p_shop_id: shop.id,
        p_artist_id: artistParam,
        p_start_date: startDateStr,
        p_end_date: endDateStr
      });

      setIsLoadingAvailability(false);
      if (!error && data) {
        setAvailability(data);
      }
    };

    fetchAvailability();
  }, [artistParam, shop.id]);

  // Sync internal form parameters when query parameters change
  useEffect(() => {
    if (artistParam && artistParam !== formData.__artistId) {
      setFormData(prev => ({ ...prev, __artistId: artistParam }));
    }
    if (styleParam && styleParam !== formData.__styleId) {
      setFormData(prev => ({ ...prev, __styleId: styleParam }));
    }

    // Isolate flash states: if flash_id is NOT in the URL, ensure no flash fields remain in formData
    const urlFlashId = searchParams.get('flash_id') || '';
    const urlHoldId = searchParams.get('hold_id') || '';
    if (!urlFlashId) {
      if (formData.flashId || formData.holdId) {
        setFormData(prev => ({
          ...prev,
          flashId: '',
          holdId: '',
          flashVariantId: '',
          flashCode: '',
          flashPrice: '',
          flashSize: '',
          flashStyle: '',
          flashMinSize: null,
          flashMaxSize: null,
          flashImagePath: ''
        }));
      }
    } else {
      if (formData.flashId !== urlFlashId || formData.holdId !== urlHoldId) {
        setFormData(prev => ({
          ...prev,
          flashId: urlFlashId,
          holdId: urlHoldId
        }));
      }
    }
  }, [artistParam, styleParam, searchParams, formData.__artistId, formData.__styleId, formData.flashId, formData.holdId, setFormData]);

  // Clear real area photos if work type changes to new_work
  useEffect(() => {
    if (!requiresRealPhoto && realAreaPhotos.length > 0) {
      setRealAreaPhotos([]);
    }
  }, [requiresRealPhoto, realAreaPhotos.length, setRealAreaPhotos]);

  // ----------------------------------------------------
  // Timezone-aware date calculations & same-day check
  // ----------------------------------------------------
  const todayStr = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', { 
      timeZone: 'Asia/Bangkok', 
      year: 'numeric', month: '2-digit', day: '2-digit' 
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year')!.value;
    const m = parts.find(p => p.type === 'month')!.value;
    const d = parts.find(p => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  }, []);

  // Clear stale date state if it violates same-day booking rules
  useEffect(() => {
    if (formData.selectedDate && formData.selectedDate <= todayStr) {
      setFormData(prev => ({ ...prev, selectedDate: '', preferredTime: '' }));
    }
  }, [formData.selectedDate, todayStr, setFormData]);

  // ----------------------------------------------------
  // Calendar Maps and Availability Details
  // ----------------------------------------------------
  const availabilityMap = useMemo(() => {
    const map = new Map<string, any>();
    availability.forEach(item => {
      map.set(item.date, item);
    });
    return map;
  }, [availability]);

  const handleDateSelect = (dateKey: string) => {
    if (dateKey > todayStr) {
      setFormData(prev => ({ ...prev, selectedDate: dateKey, preferredTime: '' }));
    }
  };

  const selectedDateData = formData.selectedDate ? availabilityMap.get(formData.selectedDate) : null;
  const isDateValid = selectedDateData && selectedDateData.can_request && formData.selectedDate > todayStr;

  const { area: estimatedArea, sizeCategory } = useMemo(() => {
    return calculateTattooEstimate(formData.widthCm || '0', formData.heightCm || '0');
  }, [formData.widthCm, formData.heightCm]);

  const estimatedDuration = useMemo(() => {
    return sizeCategory ? getSizeBasedBookingBuffer(sizeCategory) : null;
  }, [sizeCategory]);

  const sizeInfo = useMemo(() => {
    if (!sizeCategory) return null;
    switch (sizeCategory) {
      case 'จิ๋ว':
      case 'เล็ก':
        return {
          title: 'เล็ก',
          range: '1–5 ซม.',
          desc: 'งานมินิมอล / ตัวอักษรเล็ก / งานขนาดเล็ก',
          price: 500
        };
      case 'กลาง':
        return {
          title: 'กลาง',
          range: '6–10 ซม.',
          desc: 'ประมาณขนาดฝ่ามือ',
          price: 1000
        };
      case 'ใหญ่':
        return {
          title: 'ใหญ่',
          range: '11–20 ซม.',
          desc: 'ประมาณครึ่งท่อนแขน / งานชิ้นใหญ่',
          price: 3000
        };
      case 'ใหญ่มาก':
        return {
          title: 'ใหญ่พิเศษ',
          range: '21 ซม. ขึ้นไป',
          desc: 'เต็มท่อนแขน / หน้าอก / งานเหมาส่วน',
          price: 6000
        };
      default:
        return null;
    }
  }, [sizeCategory]);

  const timeOptions = useMemo(() => {
    return [
      '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
      '22:00', '23:00', '00:00'
    ];
  }, []);

  // Invalidate selected preferredTime if it's outside range of timeOptions
  useEffect(() => {
    if (formData.preferredTime && !timeOptions.includes(formData.preferredTime)) {
      setFormData(prev => ({ ...prev, preferredTime: '' }));
    }
  }, [timeOptions, formData.preferredTime, setFormData]);

  // ----------------------------------------------------
  // File and input change handlers
  // ----------------------------------------------------
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'real' | 'design') => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const newFiles = Array.from(e.target.files);
    const newErrors = { ...errors };
    const errorKey = type === 'real' ? 'realFile' : 'designFile';
    
    const validFiles = newFiles.filter(file => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        newErrors[errorKey] = 'รูปภาพต้องเป็น JPG, PNG หรือ WEBP';
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        newErrors[errorKey] = 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB';
        return false;
      }
      return true;
    });

    const currentPhotos = type === 'real' ? realAreaPhotos : designReferencePhotos;
    const setPhotos = type === 'real' ? setRealAreaPhotos : setDesignReferencePhotos;

    if (currentPhotos.length + validFiles.length > MAX_FILES) {
      newErrors[errorKey] = `เลือกได้สูงสุด ${MAX_FILES} รูป`;
      validFiles.splice(MAX_FILES - currentPhotos.length);
    } else {
      newErrors[errorKey] = '';
    }

    if (validFiles.length > 0) {
      setIsOptimizing(true);
      try {
        const optimizedFiles = await Promise.all(
          validFiles.map(file => optimizeBookingReferenceImage(file))
        );
        
        const newImageObjects = optimizedFiles.map(file => ({
          file,
          preview: URL.createObjectURL(file)
        }));

        setPhotos(prev => [...prev, ...newImageObjects]);
      } catch (err: any) {
        newErrors[errorKey] = err.message || 'เกิดข้อผิดพลาดในการประมวลผลรูปภาพ';
      } finally {
        setIsOptimizing(false);
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
    }
  };

  const removePhoto = (index: number, type: 'real' | 'design') => {
    const photos = type === 'real' ? realAreaPhotos : designReferencePhotos;
    const setPhotos = type === 'real' ? setRealAreaPhotos : setDesignReferencePhotos;
    
    URL.revokeObjectURL(photos[index].preview);
    setPhotos(prev => prev.filter((_, idx) => idx !== index));
  };

  // ----------------------------------------------------
  // Form submission handler
  // ----------------------------------------------------
  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Run validations
    const newErrors: Record<string, string> = {};
    if (!artistParam) newErrors.artist = 'กรุณาเลือกช่างสัก';
    if (!styleParam) newErrors.style = 'กรุณาเลือกสไตล์งานสัก';
    if (!formData.colorMode) newErrors.colorMode = 'กรุณาเลือกโทนสี';
    if (!formData.workType) newErrors.workType = 'กรุณาเลือกประเภทงาน';

    if (!formData.flashId) {
      if (!(formData.widthCm || '').trim() || Number(formData.widthCm) <= 0) newErrors.widthCm = 'กรุณาระบุความกว้าง';
      if (!(formData.heightCm || '').trim() || Number(formData.heightCm) <= 0) newErrors.heightCm = 'กรุณาระบุความสูง';
    }

    if (!(formData.placement || '').trim()) newErrors.placement = 'กรุณาระบุตำแหน่งที่ต้องการสัก';
    if (!(formData.description || '').trim()) newErrors.description = 'กรุณาระบุรายละเอียดไอเดียหรือ Concept';

    if (requiresRealPhoto && realAreaPhotos.length === 0) {
      newErrors.realAreaPhotos = 'กรุณาอัปโหลดรูปภาพพื้นที่จริงอย่างน้อย 1 รูป';
    }

    if (!formData.selectedDate) newErrors.selectedDate = 'กรุณาเลือกวันที่ต้องการจอง';
    if (!formData.preferredTime) newErrors.preferredTime = 'กรุณาเลือกเวลาที่สะดวก';

    if (!(formData.fullName || '').trim()) newErrors.fullName = 'กรุณาระบุชื่อ-นามสกุล';
    if (!(formData.phone || '').trim()) newErrors.phone = 'กรุณาระบุเบอร์โทรศัพท์';
    else if (!/^[0-9-]{9,12}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง';
    }



    if (!safetyNoticeAcknowledged) {
      setSubmitError('กรุณารับทราบข้อมูลด้านความปลอดภัยก่อนส่งคำขอ');
      return;
    }

    if (!termsAccepted) {
      setSubmitError('กรุณายินยอมให้ทางร้านเก็บรวบรวมข้อมูลก่อนส่งคำขอ');
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitError('กรุณากรอกข้อมูลและเลือกตัวเลือกที่จำเป็นทั้งหมดให้ครบถ้วน');
      // Scroll to the first error element if possible
      const firstErrorKey = Object.keys(newErrors)[0];
      const errEl = document.getElementById(firstErrorKey);
      if (errEl) {
        errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Create upload session
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_booking_upload_session', {
        p_shop_slug: shop.slug,
        p_artist_id: artistParam,
        p_style_id: styleParam || null,
        p_color_mode: formData.colorMode,
        p_work_type: formData.workType,
        p_flash_design_id: formData.flashId || null,
        p_hold_session_id: formData.holdId || null
      });

      if (sessionError || !sessionData || sessionData.length === 0) {
        console.error('create_public_booking_upload_session failed', sessionError);
        throw new Error(
          sessionError?.message?.includes('rejects') || 
          sessionError?.message?.includes('not active') || 
          sessionError?.message?.includes('Style not supported')
            ? sessionError.message
            : 'ไม่สามารถเตรียมส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
        );
      }

      const { session_id } = sessionData[0];

      // 2. Upload reference pictures
      const realAreaPaths: string[] = [];
      const designReferencePaths: string[] = [];

      const uploadFiles = async (photos: any[], pathsArr: string[]) => {
        if (!photos || photos.length === 0) return;
        for (const photo of photos) {
          const fileUuid = window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
          const filePath = `temp/${session_id}/${fileUuid}.webp`;

          const { error: uploadError } = await supabase.storage
            .from('tattoo-references')
            .upload(filePath, photo.file, {
              upsert: false,
              contentType: 'image/webp'
            });

          if (uploadError) {
            throw new Error('อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
          }
          pathsArr.push(filePath);
        }
      };

      await uploadFiles(realAreaPhotos, realAreaPaths);
      await uploadFiles(designReferencePhotos, designReferencePaths);

      const finalizedDescription = formData.contactInfoAdditional
        ? `ช่องทางติดต่อเพิ่มเติม: ${formData.contactInfoAdditional}\n\n${formData.description}`
        : formData.description;

      // 3. Finalize custom booking
      const { data: publicToken, error: finalError } = await supabase.rpc('finalize_public_booking', {
        p_session_id: session_id,
        p_width_cm: parseFloat(formData.widthCm) || 0,
        p_height_cm: parseFloat(formData.heightCm) || 0,
        p_placement: formData.placement,
        p_description: finalizedDescription,
        p_full_name: formData.fullName,
        p_phone: formData.phone,
        p_email: null,
        p_health_note: null,
        p_requested_date: formData.selectedDate,
        p_requested_time: formData.preferredTime,
        p_real_area_paths: realAreaPaths,
        p_design_ref_paths: designReferencePaths,
        p_terms_accepted: true,
        p_is_first_tattoo: isFirstTattoo,
        p_safety_notice_acknowledged: safetyNoticeAcknowledged,
        p_flash_design_id: null,
        p_hold_session_id: null,
        p_flash_variant_id: null,
        p_flash_booking_mode: null
      });

      if (finalError) {
        console.error('finalize_public_booking failed', finalError);
        let msg = finalError.message || 'ไม่สามารถจองคิวได้สำเร็จ กรุณาลองใหม่อีกครั้ง';
        if (msg.includes('FULL') || msg.includes('closed') || msg.includes('capacity')) {
          msg = 'วันที่เลือกไม่สามารถรับคำขอเพิ่มเติมได้ กรุณาเลือกวันจองวันอื่น';
        } else if (msg.includes('กรุณาเลือกวันจองตั้งแต่วันพรุ่งนี้เป็นต้นไป')) {
          msg = 'กรุณาเลือกวันจองตั้งแต่วันพรุ่งนี้เป็นต้นไป';
        }
        throw new Error(msg);
      }

      setSubmissionComplete(true);
      clearBookingDraft();

      if (publicToken) {
        router.replace(`/book/${shop.slug}/booking/${publicToken}`);
      }

    } catch (err: any) {
      setSubmitError(err.message || 'เกิดข้อผิดพลาดขึ้น กรุณาตรวจสอบข้อมูลและลองอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch artist helper
  const handleArtistClick = async (artistId: string) => {
    setSelectedArtistIdState(artistId);
  };

  const setSelectedArtistIdState = async (artistId: string) => {
    setIsListExpanded(false);
    setColorOptions([]);
    setWorkTypes([]);
    setFormData(prev => ({
      ...prev,
      __artistId: artistId,
      __styleId: '',
      colorMode: '',
      workType: '',
      selectedDate: '',
      preferredTime: ''
    }));
    updateUrlParams(artistId, null);
  };

  const setStyleIdState = (styleId: string) => {
    setFormData(prev => ({ ...prev, __styleId: styleId }));
    updateUrlParams(artistParam, styleId);
  };

  // If already successfully submitted, render success component inline
  if (submissionComplete) {
    return <BookingSuccessState shopSlug={shop.slug} />;
  }

  const selectedStyleName = selectedArtist?.styles?.find((s: any) => s.style_id === styleParam)?.name || 'ไม่ระบุ';
  const colorStr = formData.colorMode === 'black_grey' ? 'Black & Grey' : formData.colorMode === 'color' ? 'Color' : '';
  const workTypeLabels: Record<string, string> = {
    new_work: 'งานใหม่',
    extension: 'ต่อเติมลายเดิม',
    touch_up: 'เก็บงาน/เติมสี',
    cover_up: 'แก้/ทับลายเดิม',
    scar_cover: 'สักทับรอยแผลเป็น'
  };
  const workTypeLabel = workTypeLabels[formData.workType] || formData.workType || 'ไม่ระบุ';
  const combinedWorkStyle = [selectedStyleName, colorStr, workTypeLabel].filter(s => s && s !== 'ไม่ระบุ').join(' • ');

  const inputClassName = "w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-3 text-[#F5F5F5] placeholder:text-[#737373] focus:outline-none focus:border-[#737373] transition-colors min-h-[46px]";

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 pb-16">
      
      {/* SECTION A: เลือกช่างสัก */}
      <div id="artist" className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-medium text-[#F5F5F5]">A. เลือกช่างสัก และรูปแบบงาน</h2>
            <p className="text-xs text-[#A3A3A3] mt-1">เลือกช่างสักประจำร้านและรูปแบบงานศิลปะที่คุณชื่นชอบ</p>
          </div>
          {selectedArtist && !isListExpanded && artists.length > 1 && (
            <button
              type="button"
              onClick={() => setIsListExpanded(true)}
              className="text-xs text-[#F5F5F5] border border-[#404040] bg-[#171717] hover:bg-[#262626] px-3.5 py-1.5 rounded-xl font-medium transition-all"
            >
              เปลี่ยนช่างสัก
            </button>
          )}
        </div>

        {isListExpanded ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {artists.map((artist) => {
              const isSelected = artistParam === artist.artist_id;
              return (
                <button
                  key={artist.artist_id}
                  type="button"
                  onClick={() => handleArtistClick(artist.artist_id)}
                  className={`group flex items-center p-4 min-h-[88px] rounded-2xl border transition-all ${
                    isSelected ? 'border-[#F5F5F5] bg-[#171717]' : 'border-[#262626] bg-[#121212] hover:bg-[#1a1a1a] hover:border-[#404040]'
                  }`}
                >
                  <div className="w-16 h-16 rounded-[10px] overflow-hidden bg-[#121212] flex-shrink-0 border border-[#262626] relative">
                    {artist.avatar_url ? (
                      <Image src={artist.avatar_url} alt={artist.display_name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-bold text-lg">
                        {artist.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-1 text-left min-w-0">
                    <h3 className="text-sm font-semibold text-[#F5F5F5] group-hover:text-white truncate">
                      {artist.display_name}
                    </h3>
                    <p className="text-xs text-[#737373] mt-0.5">ช่างสัก</p>
                    {artist.styles && artist.styles.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {artist.styles.slice(0, 2).map((s: any) => (
                          <span key={s.style_id} className="text-[10px] text-[#A3A3A3] bg-[#171717] border border-[#2A2A2A] px-2 py-0.5 rounded-md truncate">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : selectedArtist ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-[#262626] bg-[#121212]">
              <div className="w-16 h-16 rounded-[10px] overflow-hidden bg-[#171717] border border-[#262626] relative flex-shrink-0">
                {selectedArtist.avatar_url ? (
                  <Image src={selectedArtist.avatar_url} alt={selectedArtist.display_name} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-bold text-lg">
                    {selectedArtist.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-sm font-semibold text-[#F5F5F5]">{selectedArtist.display_name}</h3>
                <p className="text-xs text-[#A3A3A3] mt-0.5">ช่างสัก</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-3 border-t border-[#262626]">
              {/* Style Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#A3A3A3] mb-3.5">สไตล์งานสัก *</label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedArtist.styles && selectedArtist.styles.map((s: any) => {
                    const isSelected = styleParam === s.style_id;
                    return (
                      <button
                        key={s.style_id}
                        type="button"
                        onClick={() => setStyleIdState(s.style_id)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                          isSelected ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5]' : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040]'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                {errors.style && <p className="text-red-400 text-xs mt-1.5">{errors.style}</p>}
              </div>

              {/* Color Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#A3A3A3] mb-3.5">โทนสี *</label>
                {isFetchingColors ? (
                  <p className="text-xs text-[#737373] animate-pulse">กำลังโหลด...</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {colorOptions.map(opt => {
                      const isSelected = formData.colorMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, colorMode: opt.value }))}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                            isSelected ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5]' : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.colorMode && <p className="text-red-400 text-xs mt-1.5">{errors.colorMode}</p>}
              </div>

              {/* Work Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#A3A3A3] mb-3.5">ประเภทงาน *</label>
                {isFetchingWorkTypes ? (
                  <p className="text-xs text-[#737373] animate-pulse">กำลังโหลด...</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {workTypes.map(opt => {
                      const isSelected = formData.workType === opt.value;
                      const mappedLabel = 
                        opt.value === 'new_work' ? 'งานใหม่' :
                        opt.value === 'extension' ? 'ต่อเติมลายเดิม' :
                        opt.value === 'touch_up' ? 'เก็บงาน/เติมสี' :
                        opt.value === 'cover_up' ? 'แก้/ทับลายเดิม' :
                        opt.value === 'scar_cover' ? 'สักทับรอยแผลเป็น' :
                        opt.label;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, workType: opt.value }))}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                            isSelected ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5]' : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040]'
                          }`}
                        >
                          {mappedLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.workType && <p className="text-red-400 text-xs mt-1.5">{errors.workType}</p>}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* SECTION B: รายละเอียดรอยสัก */}
      <div id="details" className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-medium text-[#F5F5F5]">B. รายละเอียดรอยสัก</h2>
          <p className="text-xs text-[#A3A3A3] mt-1">ระบุขนาด ตำแหน่ง และส่งรูปอ้างอิงให้ช่างประเมิน</p>
        </div>

        {(!selectedArtist || !styleParam || !formData.colorMode || !formData.workType) ? (
          <div className="py-8 text-center bg-[#121212]/30 border border-dashed border-[#262626] rounded-xl text-[#737373] text-sm">
            กรุณาเลือกช่างสัก สไตล์ โทนสี และประเภทงานในหัวข้อ A ก่อนกรอกรายละเอียด
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Dimensions Control */}
            <div className="p-4 rounded-xl border border-[#262626] bg-[#121212]/50">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-5 sm:gap-6">
                
                {/* Width */}
                <div className="flex flex-col w-full">
                  <label htmlFor="widthCm" className="block text-[13px] font-medium text-[#A3A3A3] mb-3">
                    ความกว้าง <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id="widthCm"
                      name="widthCm"
                      min="1"
                      step="0.1"
                      value={formData.widthCm}
                      onChange={handleChange}
                      className={`${inputClassName} w-[76px] !min-h-[40px] !py-1.5 text-center`}
                    />
                    <span className="text-[#A3A3A3] text-[13px] w-6">ซม.</span>
                  </div>
                </div>

                <div className="hidden sm:flex text-[#525252] text-xl font-light self-end mb-2.5">
                  ×
                </div>

                {/* Height */}
                <div className="flex flex-col w-full">
                  <label htmlFor="heightCm" className="block text-[13px] font-medium text-[#A3A3A3] mb-3">
                    ความสูง <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id="heightCm"
                      name="heightCm"
                      min="1"
                      step="0.1"
                      value={formData.heightCm}
                      onChange={handleChange}
                      className={`${inputClassName} w-[76px] !min-h-[40px] !py-1.5 text-center`}
                    />
                    <span className="text-[#A3A3A3] text-[13px] w-6">ซม.</span>
                  </div>
                </div>
              </div>

              {sizeInfo ? (
                <div className="mt-4 pt-4 border-t border-[#262626] flex flex-col gap-4 text-sm text-[#A3A3A3]">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="space-y-1 text-left">
                      <span className="text-xs text-[#737373] block font-semibold tracking-wider">ขนาดงานสัก</span>
                      <span className="text-white font-semibold block text-base">{sizeInfo.title}</span>
                      <span className="text-xs text-[#F5F5F5] font-semibold block">{sizeInfo.range}</span>
                      <span className="text-xs text-[#A3A3A3] block">{sizeInfo.desc}</span>
                    </div>
                    <div className="space-y-1 sm:text-right text-left shrink-0">
                      <span className="text-xs text-[#737373] block font-semibold tracking-wider">ราคาเริ่มต้น</span>
                      <span className="text-[#F5F5F5] text-lg font-bold block">฿{sizeInfo.price.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#737373] border-t border-[#1F1F1F] pt-2">
                    <div>พื้นที่โดยประมาณ: <span className="text-[#A3A3A3] font-medium">{estimatedArea.toLocaleString('en-US', { maximumFractionDigits: 1 })} ตร.ซม.</span></div>
                    <div>เวลาที่ใช้ประเมิน: <span className="text-[#A3A3A3] font-medium">{estimatedDuration} ชั่วโมง</span></div>
                  </div>
                  <p className="text-[11px] text-[#737373] leading-normal pt-1 text-left">
                    * ราคาจริงขึ้นอยู่กับรายละเอียดลาย ตำแหน่ง และการประเมินของช่าง
                  </p>
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-[#262626] text-xs text-[#737373] italic text-left">
                  กรุณากรอกความกว้างและส่วนสูงเพื่อประเมินขนาดและราคาเริ่มต้น
                </div>
              )}
            </div>

            {/* Placement */}
            <div>
              <label htmlFor="placement" className="block text-xs font-semibold text-[#A3A3A3] mb-1.5">
                ตำแหน่งที่ต้องการสัก <span className="text-red-500">*</span>
              </label>
              <textarea
                id="placement"
                name="placement"
                rows={2}
                placeholder="เช่น ต้นแขนขวาด้านนอก, บริเวณน่องขาซ้าย"
                value={formData.placement}
                onChange={handleChange}
                className={inputClassName + " resize-none min-h-[56px] py-2"}
              />
              {errors.placement && <p className="text-red-400 text-xs mt-1.5">{errors.placement}</p>}
            </div>

            {/* Concept / Story Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-semibold text-[#A3A3A3] mb-1.5">
                Story / Concept / รายละเอียดที่ต้องการ <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="เช่น อยากได้ลายเส้นแบบการ์ตูน ขนาดมินิมอล มีดอกทานตะวันสองดอก..."
                value={formData.description}
                onChange={handleChange}
                className={inputClassName + " resize-none"}
              />
              {errors.description && <p className="text-red-400 text-xs mt-1.5">{errors.description}</p>}
            </div>

            {/* Reference Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Photo Area Real */}
              {requiresRealPhoto && (
                <div className="bg-[#121212] p-4 rounded-xl border border-[#262626] flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-[#F5F5F5]">รูปพื้นที่จริง *</span>
                      <span className="text-xs text-[#737373]">{realAreaPhotos.length} / {MAX_FILES}</span>
                    </div>
                    <p className="text-[#A3A3A3] text-xs mb-3">กรุณาแนบรูปบริเวณผิวหนังที่ต้องการต่อเติม แก้ไข หรือสักทับรอยแผลเป็น</p>
                  </div>

                  <input 
                    type="file" 
                    ref={realFileInputRef} 
                    onChange={(e) => handleFileChange(e, 'real')} 
                    multiple 
                    accept={ALLOWED_TYPES.join(',')}
                    className="hidden" 
                  />

                  {realAreaPhotos.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => realFileInputRef.current?.click()}
                      className="w-full py-5 rounded-lg border border-dashed border-[#404040] hover:border-[#737373] bg-transparent flex flex-col items-center justify-center cursor-pointer transition-colors"
                    >
                      <UploadCloud size={20} className="text-[#737373]" />
                      <span className="text-xs text-[#A3A3A3] mt-1.5">กดอัปโหลดรูปพื้นที่ผิวหนัง</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {realAreaPhotos.map((photo, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded border border-[#262626] overflow-hidden">
                          <img src={photo.preview} alt="Real Area Preview" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(idx, 'real')} className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full hover:bg-black text-white transition-colors">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      {realAreaPhotos.length < MAX_FILES && (
                        <button type="button" onClick={() => realFileInputRef.current?.click()} className="w-16 h-16 rounded border border-dashed border-[#404040] flex items-center justify-center text-[#737373] hover:border-[#737373] transition-colors">
                          +
                        </button>
                      )}
                    </div>
                  )}
                  {errors.realAreaPhotos && <p className="text-red-400 text-xs mt-1.5">{errors.realAreaPhotos}</p>}
                </div>
              )}

              {/* Design Reference Photos */}
              <div className={`bg-[#121212] p-4 rounded-xl border border-[#262626] flex flex-col justify-between ${!requiresRealPhoto ? 'col-span-2' : ''}`}>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-[#F5F5F5]">รูปอ้างอิงดีไซน์ (ถ้ามี)</span>
                    <span className="text-xs text-[#737373]">{designReferencePhotos.length} / {MAX_FILES}</span>
                  </div>
                  <p className="text-[#A3A3A3] text-xs mb-3">แนบตัวอย่างรูปสไตล์หรือแบบที่คุณชื่นชอบเพื่อช่วยอธิบายไอเดียให้ช่างสัก</p>
                </div>

                <input 
                  type="file" 
                  ref={designFileInputRef} 
                  onChange={(e) => handleFileChange(e, 'design')} 
                  multiple 
                  accept={ALLOWED_TYPES.join(',')}
                  className="hidden" 
                />

                {designReferencePhotos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => designFileInputRef.current?.click()}
                    className="w-full py-5 rounded-lg border border-dashed border-[#404040] hover:border-[#737373] bg-transparent flex flex-col items-center justify-center cursor-pointer transition-colors"
                  >
                    <UploadCloud size={20} className="text-[#737373]" />
                    <span className="text-xs text-[#A3A3A3] mt-1.5">กดอัปโหลดรูปภาพอ้างอิง</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {designReferencePhotos.map((photo, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded border border-[#262626] overflow-hidden">
                        <img src={photo.preview} alt="Design Ref Preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removePhoto(idx, 'design')} className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full hover:bg-black text-white transition-colors">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {designReferencePhotos.length < MAX_FILES && (
                      <button type="button" onClick={() => designFileInputRef.current?.click()} className="w-16 h-16 rounded border border-dashed border-[#404040] flex items-center justify-center text-[#737373] hover:border-[#737373] transition-colors">
                        +
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION C: วันและเวลา */}
      <div id="schedule" className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-medium text-[#F5F5F5]">C. วันและเวลา</h2>
          <p className="text-xs text-[#A3A3A3] mt-1">เลือกวันที่ที่ว่างและช่วงเวลาที่คุณสะดวกเข้ารับบริการสัก</p>
        </div>

        {(!selectedArtist || !styleParam || !formData.colorMode || !formData.workType) ? (
          <div className="py-8 text-center bg-[#121212]/30 border border-dashed border-[#262626] rounded-xl text-[#737373] text-sm">
            กรุณากรอกหัวข้อด้านบนก่อนเลือกปฏิทินตารางงานของช่างสัก
          </div>
        ) : isLoadingAvailability ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-8 h-8 text-[#A3A3A3] animate-spin" />
            <span className="text-xs text-[#A3A3A3] ml-2 animate-pulse">กำลังโหลดตารางว่างของช่าง...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* Monthly Calendar View */}
            <div className="w-full">
              <BookingCalendar 
                availabilityMap={availabilityMap}
                selectedDateKey={formData.selectedDate}
                onSelectDate={handleDateSelect}
              />
              {errors.selectedDate && <p className="text-red-400 text-xs mt-2">{errors.selectedDate}</p>}
            </div>

            {/* Selected Date Information Bar (Vertically stacked right below calendar) */}
            {formData.selectedDate && selectedDateData && (
              <div className="bg-[#121212] border border-[#262626] rounded-xl p-4 animate-in fade-in duration-200">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[15px] font-semibold text-[#F5F5F5]">{formatThaiDate(formData.selectedDate, { longMonth: true })}</h4>
                  <div className="text-[12px] font-medium">
                    {selectedDateData.status === 'AVAILABLE' && <span className="text-green-400">สถานะ: ว่าง</span>}
                    {selectedDateData.status === 'LIMITED' && <span className="text-amber-400">สถานะ: คิวเปิดจำกัด</span>}
                    {selectedDateData.status === 'FULL' && <span className="text-red-400">เต็มแล้ว</span>}
                    {selectedDateData.status === 'CLOSED' && <span className="text-[#525252]">ร้านปิดให้บริการวันนี้</span>}
                  </div>
                </div>
                
                {(selectedDateData.status === 'AVAILABLE' || selectedDateData.status === 'LIMITED') && (
                  <div className="flex gap-4 text-xs text-[#A3A3A3]">
                    <div>จองแล้ว: <span className="text-white font-medium">{selectedDateData.occupied} คิว</span></div>
                    <div>ความจุสูงสุด: <span className="text-white font-medium">{selectedDateData.capacity} คิว</span></div>
                    <div>คงเหลือว่าง: <span className="text-white font-medium">{selectedDateData.remaining} คิว</span></div>
                  </div>
                )}
              </div>
            )}

            {/* Time Slot Grid (Vertically stacked right below status information) */}
            {formData.selectedDate && isDateValid && (
              <div className="pt-4 border-t border-[#262626] animate-in fade-in duration-200">
                <h4 className="text-sm font-semibold text-[#F5F5F5] mb-1">เลือกเวลาที่สะดวก *</h4>
                <p className="text-xs text-[#A3A3A3] mb-3">เลือกเวลาเริ่มต้นที่คุณสะดวก ช่างจะตรวจสอบและยืนยันเวลานัดหมายอีกครั้ง</p>
                <div className="bg-[#121212] border border-[#262626] p-4 rounded-xl">
                  {timeOptions.length === 0 ? (
                    <p className="text-xs text-amber-500 py-1">ขนาดงานสักและเวลาประเมินเกินขีดจำกัดเวลาทำการในวันนี้ กรุณาเปลี่ยนวัน</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {timeOptions.map(time => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, preferredTime: time }))}
                          className={`py-2 px-1 text-center text-xs rounded-lg border transition-all ${
                            formData.preferredTime === time 
                              ? 'bg-[#F5F5F5] border-[#F5F5F5] text-[#0A0A0A] font-semibold' 
                              : 'bg-[#0A0A0A] border-[#262626] text-[#A3A3A3] hover:border-[#404040] hover:text-white'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.preferredTime && <p className="text-red-400 text-xs mt-2">{errors.preferredTime}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION D: ข้อมูลของคุณ */}
      <div id="customer" className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-medium text-[#F5F5F5]">D. ข้อมูลติดต่อ และการประเมินเบื้องต้น</h2>
          <p className="text-xs text-[#A3A3A3] mt-1">กรอกข้อมูลผู้จอง โดยทางร้านจะติดต่อผ่านเบอร์โทรศัพท์เป็นหลัก และใช้ช่องทางติดต่อเพิ่มเติมเมื่อจำเป็น</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-xs font-semibold text-[#A3A3A3] mb-2">
              ชื่อ-นามสกุล / ชื่อเล่น <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              placeholder="เช่น นาย สมศักดิ์ สักดี"
              value={formData.fullName}
              onChange={handleChange}
              className={inputClassName}
            />
            {errors.fullName && <p className="text-red-400 text-xs mt-1.5">{errors.fullName}</p>}
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-xs font-semibold text-[#A3A3A3] mb-2">
              เบอร์โทรศัพท์ <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              placeholder="08X-XXX-XXXX"
              value={formData.phone}
              onChange={handleChange}
              className={inputClassName}
            />
            {errors.phone && <p className="text-red-400 text-xs mt-1.5">{errors.phone}</p>}
          </div>
          
          <div>
            <label htmlFor="contactInfoAdditional" className="block text-xs font-semibold text-[#A3A3A3] mb-2">
              ช่องทางติดต่อเพิ่มเติม (ถ้ามี)
            </label>
            <input
              type="text"
              id="contactInfoAdditional"
              name="contactInfoAdditional"
              placeholder="เช่น Line: armmee / IG: tattoo.studio / Facebook: ..."
              value={formData.contactInfoAdditional || ''}
              onChange={handleChange}
              className={inputClassName}
            />
          </div>

          {/* First Timer Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer group bg-[#121212] border border-[#262626] rounded-xl p-4 transition-colors hover:border-[#404040]">
              <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={isFirstTattoo}
                  onChange={(e) => setIsFirstTattoo(e.target.checked)}
                  className="peer appearance-none w-[20px] h-[20px] border-2 border-[#404040] rounded bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
                />
                <svg className="absolute w-3 h-3 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[#F5F5F5] text-xs font-medium mt-0.5">นี่เป็นการสักครั้งแรกของฉัน</span>
                <span className="text-[#737373] text-[11px] leading-relaxed mt-1">เพื่อให้ช่างทราบล่วงหน้าเพื่อเตรียมตัวและขั้นตอนการดูแลที่เหมาะสมให้คุณ</span>
              </div>
            </label>
          </div>

          {/* Safety Acknowledgement Checkbox */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer group bg-[#121212] border border-[#262626] rounded-xl p-4 transition-colors hover:border-[#404040]">
              <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={safetyNoticeAcknowledged}
                  onChange={(e) => setSafetyNoticeAcknowledged(e.target.checked)}
                  className="peer appearance-none w-[20px] h-[20px] border-2 border-[#404040] rounded bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
                />
                <svg className="absolute w-3 h-3 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex flex-col flex-1">
                <span className="text-[#F5F5F5] text-xs font-medium mt-0.5">ฉันรับทราบข้อมูลด้านความปลอดภัยก่อนการสัก *</span>
                <span className="text-[#737373] text-[11px] leading-relaxed mt-1">
                  หากคุณอยู่ระหว่างตั้งครรภ์ มีโรคประจำตัวร้ายแรง หรือมีการใช้ยาต้านการแข็งตัวของเลือด กรุณาปรึกษาแพทย์และช่างก่อนรับคิวสัก
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION E: สรุปและยืนยันคำขอ */}
      <div id="summary" className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-medium text-[#F5F5F5]">E. สรุปรายละเอียดคำขอ</h2>
          <p className="text-xs text-[#A3A3A3] mt-1">โปรดตรวจสอบรายละเอียดที่กรอกด้านล่างก่อนส่งคำขอจองคิว</p>
        </div>

        <div className="bg-[#121212] border border-[#262626] rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-b border-[#262626] pb-4">
            <div className="flex justify-between items-center sm:block">
              <span className="text-[#A3A3A3] text-xs block">ช่างสัก</span>
              <span className="text-[#F5F5F5] font-medium">{selectedArtist?.display_name || '—'}</span>
            </div>
            <div className="flex justify-between items-center sm:block">
              <span className="text-[#A3A3A3] text-xs block">รูปแบบงานสัก</span>
              <span className="text-[#F5F5F5] font-medium truncate max-w-[220px] inline-block align-bottom">{combinedWorkStyle || '—'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-b border-[#262626] pb-4">
            <div>
              <span className="text-[#A3A3A3] text-xs block">ขนาด</span>
              <span className="text-[#F5F5F5] font-medium">
                {formData.widthCm && formData.heightCm ? `${formData.widthCm} × ${formData.heightCm} ซม.` : '—'}
              </span>
            </div>
            <div>
              <span className="text-[#A3A3A3] text-xs block">ตำแหน่งสัก</span>
              <span className="text-[#F5F5F5] font-medium">{formData.placement || '—'}</span>
            </div>
            <div>
              <span className="text-[#A3A3A3] text-xs block">ระยะเวลาประเมิน</span>
              <span className="text-[#F5F5F5] font-medium">{estimatedDuration ? `${estimatedDuration} ชั่วโมง` : '—'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-b border-[#262626] pb-4">
            <div className="flex justify-between items-center sm:block">
              <span className="text-[#A3A3A3] text-xs block">วันที่สะดวก</span>
              <span className="text-[#F5F5F5] font-medium">{formData.selectedDate ? formatThaiDate(formData.selectedDate) : '—'}</span>
            </div>
            <div className="flex justify-between items-center sm:block">
              <span className="text-[#A3A3A3] text-xs block">เวลาที่สะดวก</span>
              <span className="text-[#F5F5F5] font-medium">{formData.preferredTime ? `${formData.preferredTime} น.` : '—'}</span>
            </div>
          </div>

          {/* Uploaded images summaries */}
          {((requiresRealPhoto && realAreaPhotos.length > 0) || designReferencePhotos.length > 0) && (
            <div className="flex flex-col gap-3 pt-1 border-b border-[#262626] pb-4">
              {requiresRealPhoto && realAreaPhotos.length > 0 && (
                <div>
                  <span className="text-[#A3A3A3] text-xs block mb-1.5">รูปพื้นที่จริง</span>
                  <div className="flex flex-wrap gap-2">
                    {realAreaPhotos.map((img, idx) => (
                      <div key={idx} className="relative w-12 h-12 border border-[#262626] rounded overflow-hidden">
                        <img src={img.preview} alt="Real Area Thumb" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {designReferencePhotos.length > 0 && (
                <div>
                  <span className="text-[#A3A3A3] text-xs block mb-1.5">รูปอ้างอิงดีไซน์</span>
                  <div className="flex flex-wrap gap-2">
                    {designReferencePhotos.map((img, idx) => (
                      <div key={idx} className="relative w-12 h-12 border border-[#262626] rounded overflow-hidden">
                        <img src={img.preview} alt="Design Ref Thumb" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pricing Message */}
          <div className="pt-2 text-left">
            <span className="text-[#A3A3A3] text-xs block mb-0.5">ราคางานและยอดมัดจำ</span>
            <span className="text-amber-400 font-medium text-sm">ช่างจะแจ้งผลการประเมินและแจ้งยอดมัดจำหลังจากตรวจสอบรายละเอียดคำขอ</span>
          </div>
        </div>

        {/* SECTION F: CONSENT CHECKBOX */}
        <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="peer appearance-none w-5 h-5 border-2 border-[#404040] rounded bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
              />
              <svg className="absolute w-3 h-3 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 mt-0.5">
              <span className="text-xs text-[#F5F5F5] leading-relaxed">
                ข้าพเจ้ายินยอมให้ทางร้านเก็บรวบรวมและประมวลผลข้อมูลส่วนบุคคล เพื่อใช้ในการติดต่อจองคิว ประเมินลายสัก และยืนยันการชำระเงินตามเงื่อนไขของร้าน *
              </span>
            </div>
          </label>
        </div>

        {submitError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs">
            {submitError}
          </div>
        )}

        {/* SECTION G: ACTION BUTTONS */}
        <div className="flex flex-col-reverse sm:flex-row gap-4 pt-3">
          <button 
            type="button"
            onClick={() => router.push(`/shop/${shop.slug}`)}
            className="flex-1 py-3 text-center rounded-xl border border-[#404040] text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors text-xs font-semibold"
          >
            ยกเลิก
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={!termsAccepted || isSubmitting}
            className="flex-1 py-3 text-center rounded-xl bg-white text-black hover:bg-neutral-200 transition-all text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-black animate-spin" />
                <span>กำลังส่งคำขอ...</span>
              </div>
            ) : (
              <span>ส่งคำขอจองคิว</span>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
