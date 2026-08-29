'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BookingCalendar from './BookingCalendar';
import { DailyAvailability } from './BookingCalendarFlow';
import { formatThaiDate, formatThaiNumericDate } from '@/lib/dateUtils';
import { X, Calendar as CalendarIcon, Clock, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

interface FlashDesign {
  id: string;
  shop_id: string;
  flash_code: string;
  artist_id: string;
  style_id: string;
  image_path: string;
  size: string;
  price: number;
  status: string;
  held_by_session_id: string | null;
  held_expires_at: string | null;
}

interface FlashVariant {
  id: string;
  size_name: string;
  min_size_cm: number | null;
  max_size_cm: number | null;
  price: number;
  is_enabled: boolean;
}

interface FlashBookingClientProps {
  shop: { id: string; name: string; slug: string; logo_url: string | null };
  flash: FlashDesign;
  artist: { artist_id: string; display_name: string; avatar_url: string | null };
  styleName: string;
  variants: FlashVariant[];
  initialVariantId: string;
  settings: any;
  acceptsColor: boolean;
  acceptsBlackGrey: boolean;
}

export default function FlashBookingClient({
  shop,
  flash,
  artist,
  styleName,
  variants,
  initialVariantId,
  settings,
  acceptsColor,
  acceptsBlackGrey
}: FlashBookingClientProps) {
  const router = useRouter();
  const supabase = createClient();

  // Form State (Isolated from Custom Booking)
  const [selectedVariantId, setSelectedVariantId] = useState<string>(() => {
    if (initialVariantId && variants.some(v => v.id === initialVariantId)) {
      return initialVariantId;
    }
    return variants.length > 0 ? variants[0].id : '';
  });

  const selectedVariant = useMemo(() => {
    return variants.find(v => v.id === selectedVariantId) || null;
  }, [variants, selectedVariantId]);

  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [placement, setPlacement] = useState('');
  const [placementTouched, setPlacementTouched] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [isFirstTattoo, setIsFirstTattoo] = useState(false);
  const [safetyNoticeAcknowledged, setSafetyNoticeAcknowledged] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Availability & Hold count-down states
  const [availability, setAvailability] = useState<DailyAvailability[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [initError, setInitError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Submit states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Get Flash Image URL
  const flashImageUrl = useMemo(() => {
    const { data } = supabase.storage.from('flash-images').getPublicUrl(flash.image_path);
    return data.publicUrl;
  }, [flash.image_path, supabase]);

  // Load Artist Availability
  useEffect(() => {
    const fetchAvailability = async () => {
      setLoadingAvailability(true);
      setInitError(false);
      try {
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
          p_artist_id: artist.artist_id,
          p_start_date: startDateStr,
          p_end_date: endDateStr
        });

        if (error) throw error;

        if (data) {
          setAvailability(data);
        }
      } catch (err) {
        console.error('Failed to load availability:', err);
        setInitError(true);
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchAvailability();
  }, [shop.id, artist.artist_id, supabase, retryCount]);

  const availabilityMap = useMemo(() => {
    const map = new Map<string, DailyAvailability>();
    availability.forEach(item => {
      map.set(item.date, item);
    });
    return map;
  }, [availability]);

  const handleDateSelect = (dateKey: string) => {
    setSelectedDate(dateKey);
    setPreferredTime(''); // reset time on date change
  };

  const selectedData = selectedDate ? availabilityMap.get(selectedDate) : null;
  const isDateValid = selectedData && selectedData.can_request;

  const timeOptions = [...Array.from({ length: 14 }, (_, i) => `${i + 10}:00`), '00:00'];

  // Prices and Deposits
  const price = useMemo(() => {
    if (selectedVariant) return Number(selectedVariant.price);
    return Number(flash.price);
  }, [selectedVariant, flash]);

  const deposit = useMemo(() => {
    if (settings && settings.deposit_required) {
      return Number(settings.default_deposit_amount);
    }
    return 0;
  }, [settings]);

  // Validation
  const isFormValid = useMemo(() => {
    if (variants.length > 0 && !selectedVariantId) return false;

    // Width & height validation
    const w = parseFloat(widthCm);
    const h = parseFloat(heightCm);
    if (!selectedVariant && (isNaN(w) || w <= 0 || isNaN(h) || h <= 0)) return false;

    // Check min/max constraint for selected variant
    if (selectedVariant) {
      const minVal = selectedVariant.min_size_cm;
      const maxVal = selectedVariant.max_size_cm;
      const inputW = parseFloat(widthCm);
      const inputH = parseFloat(heightCm);

      if (minVal !== null || maxVal !== null) {
        if (isNaN(inputW) || isNaN(inputH) || inputW <= 0 || inputH <= 0) return false;
        if (minVal !== null && (inputW < minVal || inputH < minVal)) return false;
        if (maxVal !== null && (inputW > maxVal || inputH > maxVal)) return false;
      }
    }

    return (
      placement.trim().length > 0 &&
      selectedDate.trim().length > 0 &&
      preferredTime.trim().length > 0 &&
      fullName.trim().length > 0 &&
      phone.replace(/\D/g, '').length >= 9 &&
      safetyNoticeAcknowledged &&
      termsAccepted
    );
  }, [
    variants,
    selectedVariantId,
    selectedVariant,
    widthCm,
    heightCm,
    placement,
    selectedDate,
    preferredTime,
    fullName,
    phone,
    safetyNoticeAcknowledged,
    termsAccepted
  ]);

  // Cancel Hold and release
  const handleCancelBooking = async () => {
    setSubmitError(null);
    router.replace(`/shop/${shop.slug}`);
  };

  // Submit Booking
  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const normPhone = phone.replace(/\D/g, '');

    try {
      // 1. Determine color mode to use based on artist settings
      const colorMode = acceptsColor ? 'color' : 'black_grey';

      // 2. Create public booking upload session (no upload files required)
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_booking_upload_session', {
        p_shop_slug: shop.slug,
        p_artist_id: artist.artist_id,
        p_style_id: flash.style_id,
        p_color_mode: colorMode,
        p_work_type: 'new_work',
        p_flash_design_id: flash.id,
        p_hold_session_id: null
      });

      if (sessionError || !sessionData || sessionData.length === 0) {
        console.error('create_public_booking_upload_session failed', sessionError);
        throw new Error(sessionError?.message || 'ไม่สามารถจองคิวสักนี้ได้ในขณะนี้');
      }

      const { session_id } = sessionData[0];

      // Resolve final dimensions
      const finalWidth = parseFloat(widthCm) || (selectedVariant?.min_size_cm ?? 10);
      const finalHeight = parseFloat(heightCm) || (selectedVariant?.max_size_cm ?? 10);

      // 3. Finalize booking request
      const { data: publicToken, error: finalError } = await supabase.rpc('finalize_public_booking', {
        p_session_id: session_id,
        p_width_cm: finalWidth,
        p_height_cm: finalHeight,
        p_placement: placement,
        p_description: description || null,
        p_full_name: fullName,
        p_phone: normPhone,
        p_email: email || null,
        p_health_note: null,
        p_requested_date: selectedDate,
        p_requested_time: preferredTime,
        p_real_area_paths: null,
        p_design_ref_paths: null,
        p_terms_accepted: true,
        p_is_first_tattoo: isFirstTattoo,
        p_safety_notice_acknowledged: safetyNoticeAcknowledged,
        p_flash_design_id: flash.id,
        p_hold_session_id: null,
        p_flash_variant_id: selectedVariantId || null
      });

      if (finalError) {
        console.error('finalize_public_booking failed', finalError);
        throw new Error(finalError.message || 'ส่งคำขอจองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }

      // Success
      setSuccessData({
        flashCode: flash.flash_code,
        artistName: artist.display_name,
        date: selectedDate,
        time: preferredTime,
        phone: normPhone,
        publicToken
      });
    } catch (err: any) {
      setSubmitError(err.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองคิวสัก');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success Screen
  if (successData) {
    return (
      <div className="w-full max-w-lg mx-auto bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
          <Check size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white">ส่งคำขอจองงาน Flash เรียบร้อยแล้ว</h2>
          <p className="text-sm text-[#A3A3A3]">
            ร้านจะตรวจสอบวัน เวลา และรายละเอียดการจองของคุณ จากนั้นจะติดต่อกลับเพื่อแจ้งผลการยืนยัน
          </p>
        </div>

        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 text-left space-y-4 text-sm">
          <div className="flex justify-between border-b border-[#262626] pb-2.5">
            <span className="text-[#737373]">งาน Flash</span>
            <span className="text-white font-medium">{successData.flashCode}</span>
          </div>
          <div className="flex justify-between border-b border-[#262626] pb-2.5">
            <span className="text-[#737373]">ช่างสัก</span>
            <span className="text-white font-medium">{successData.artistName}</span>
          </div>
          <div className="flex justify-between border-b border-[#262626] pb-2.5">
            <span className="text-[#737373]">วันจองคิว</span>
            <span className="text-white font-medium">{formatThaiDate(successData.date, { longMonth: true })}</span>
          </div>
          <div className="flex justify-between border-b border-[#262626] pb-2.5">
            <span className="text-[#737373]">เวลา</span>
            <span className="text-white font-medium">{successData.time} น.</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#737373]">เบอร์โทรศัพท์</span>
            <span className="text-white font-medium">{successData.phone}</span>
          </div>
        </div>

        <div className="pt-4 space-y-3">
          <button
            onClick={() => router.replace(`/track?phone=${successData.phone}`)}
            className="w-full py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 active:scale-95 transition-all"
          >
            ติดตามสถานะการจอง
          </button>
          <button
            onClick={() => router.replace(`/shop/${shop.slug}`)}
            className="w-full py-3.5 bg-[#171717] border border-[#262626] text-[#A3A3A3] font-medium rounded-xl hover:text-white hover:bg-[#222] transition-colors"
          >
            กลับสู่หน้าร้านหลัก
          </button>
        </div>
      </div>
    );
  }



  // Load Fail / Query Error Fallback UI
  if (initError) {
    return (
      <div className="w-full max-w-md mx-auto bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-xl font-bold tracking-tight text-white uppercase">157 TATTOO</h2>
        <div className="space-y-2">
          <p className="text-sm text-red-400 font-semibold">ไม่สามารถโหลดหน้าจอง Flash ได้</p>
          <p className="text-xs text-[#A3A3A3]">
            เกิดข้อผิดพลาดในการโหลดข้อมูลของแบบสักหรือคิวของช่างสัก กรุณาลองใหม่อีกครั้ง หรือยกเลิกเพื่อกลับหน้าร้านหลัก
          </p>
        </div>
        <div className="pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setRetryCount(prev => prev + 1)}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-200 active:scale-95 transition-all"
          >
            ลองใหม่
          </button>
          <button
            type="button"
            onClick={handleCancelBooking}
            className="w-full py-3 bg-[#171717] border border-[#262626] text-[#A3A3A3] font-medium rounded-xl text-sm hover:text-white hover:bg-[#222] transition-colors"
          >
            ยกเลิกการจอง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="text-center space-y-2 py-4">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white uppercase">Flash Booking</h1>
        <p className="text-sm sm:text-base text-[#A3A3A3]">จองแบบสักลายนี่ง่าย ๆ จบครบในหน้าเดียว</p>
      </div>

      <form onSubmit={handleSubmitBooking} className="bg-[#121212] border border-[#262626] rounded-2xl p-6 lg:p-8 space-y-8 shadow-xl">
        
        {/* The 3-column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Selected Flash (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2 uppercase tracking-wide">Selected Flash</h3>
            
            <div className="relative aspect-square w-full bg-[#0A0A0A] flex items-center justify-center p-4 rounded-xl border border-[#262626]">
              <img
                src={flashImageUrl}
                alt={flash.flash_code}
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            {/* BLOCK 1: CODE / ARTIST / STYLE — 3-column info bar */}
            <div className="border border-[#262626] rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-[#262626]">
                <div className="px-3 py-3 text-center">
                  <span className="block text-[9px] uppercase tracking-widest text-amber-500 font-semibold mb-1">Code</span>
                  <span className="block text-sm font-bold text-white leading-tight">{flash.flash_code}</span>
                </div>
                <div className="px-3 py-3 text-center">
                  <span className="block text-[9px] uppercase tracking-widest text-amber-500 font-semibold mb-1">Artist</span>
                  <span className="block text-sm font-bold text-white leading-tight truncate">{artist.display_name}</span>
                </div>
                <div className="px-3 py-3 text-center">
                  <span className="block text-[9px] uppercase tracking-widest text-amber-500 font-semibold mb-1">Style</span>
                  <span className="block text-sm font-bold text-white leading-tight truncate">{styleName || '-'}</span>
                </div>
              </div>
            </div>

            {/* BLOCK 1.5: VARIANT SIZE CARDS — moved here from center column */}
            {variants.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest text-[#737373] font-semibold block">ขนาดงานสัก</span>
                <div className="grid grid-cols-2 gap-2">
                  {variants.map(variant => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariantId(variant.id);
                        if (variant.min_size_cm) setWidthCm(String(variant.min_size_cm));
                        if (variant.max_size_cm) setHeightCm(String(variant.max_size_cm));
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedVariantId === variant.id
                          ? 'border-white bg-[#1a1a1a] text-white'
                          : 'border-[#262626] bg-[#0A0A0A] text-[#A3A3A3] hover:border-[#404040]'
                      }`}
                    >
                      <div className="font-semibold text-xs">{variant.size_name}</div>
                      <div className="text-[10px] text-[#737373] mt-0.5">
                        {variant.min_size_cm && variant.max_size_cm
                          ? `${variant.min_size_cm}–${variant.max_size_cm} ซม.`
                          : 'ขนาดคงตัว'}
                      </div>
                      <div className="text-xs font-bold text-white mt-1">฿{Number(variant.price).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size Inputs — moved from center column to left column, shown under size card */}
            {variants.length > 0 ? (
              selectedVariant && (selectedVariant.min_size_cm || selectedVariant.max_size_cm) && (
                <div className="space-y-2 bg-[#0A0A0A] p-4 rounded-xl border border-[#262626]">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#737373] mb-1">ความกว้าง (ซม.) *</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={widthCm}
                        onChange={e => setWidthCm(e.target.value)}
                        className="w-full bg-[#121212] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
                        placeholder="กว้าง"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#737373] mb-1">ความสูง (ซม.) *</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={heightCm}
                        onChange={e => setHeightCm(e.target.value)}
                        className="w-full bg-[#121212] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
                        placeholder="สูง"
                      />
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <span className="text-[9px] uppercase tracking-widest text-[#737373] font-semibold block">ขนาดงานสัก</span>
                <div className="grid grid-cols-2 gap-4 bg-[#0A0A0A] p-4 rounded-xl border border-[#262626]">
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1">ความกว้าง (ซม.) *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={widthCm}
                      onChange={e => setWidthCm(e.target.value)}
                      className="w-full bg-[#121212] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
                      placeholder="กว้าง"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1">ความสูง (ซม.) *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={heightCm}
                      onChange={e => setHeightCm(e.target.value)}
                      className="w-full bg-[#121212] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
                      placeholder="สูง"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CENTER COLUMN: Size, Placement, Date, Time (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-4 lg:border-l lg:border-r lg:border-[#262626] lg:px-8">
            

            {/* Placement Section */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2">ตำแหน่งที่จะสัก</h3>
              <div>
                <label className="block text-xs text-[#737373] mb-1">ตำแหน่งที่จะสัก *</label>
                <input
                  type="text"
                  required
                  value={placement}
                  onChange={e => {
                    setPlacement(e.target.value);
                    setPlacementTouched(true);
                  }}
                  onBlur={() => setPlacementTouched(true)}
                  placeholder="เช่น ต้นแขนด้านในข้างซ้าย, หลังใบหู, ซี่โครงขวา"
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-white"
                />
                {placementTouched && placement.trim() === '' && (
                  <p className="text-xs text-red-400 mt-1">กรุณาระบุตำแหน่งที่ต้องการสัก</p>
                )}
              </div>
            </div>

            {/* Date & Time Section */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2">วันที่และเวลา</h3>

              {loadingAvailability ? (
                <div className="text-center py-6 text-xs text-[#737373]">กำลังโหลดข้อมูลตารางคิว...</div>
              ) : (
                <div className="space-y-3">
                  {/* Full Monthly Calendar — always visible */}
                  <BookingCalendar
                    availabilityMap={availabilityMap}
                    selectedDateKey={selectedDate}
                    onSelectDate={handleDateSelect}
                  />

                  {/* Time Slots */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">ช่วงเวลาที่สะดวก *</h4>
                    <p className="text-[10px] text-[#737373]">เลือกเวลาที่คุณสะดวก</p>

                    {!selectedDate ? (
                      <p className="text-xs text-[#737373] py-1">กรุณาเลือกวันที่ก่อน</p>
                    ) : !isDateValid ? (
                      <p className="text-xs text-amber-500 py-1">วันที่เลือกไม่สามารถจองได้ กรุณาเลือกวันอื่น</p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto pr-1">
                        <div className="grid grid-cols-3 gap-1.5">
                          {timeOptions.map(time => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => setPreferredTime(time)}
                              className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                preferredTime === time
                                  ? 'border-white bg-white text-[#0A0A0A]'
                                  : 'border-[#262626] bg-[#0A0A0A] text-[#A3A3A3] hover:border-[#404040] hover:text-white'
                              }`}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Customer Details, Summary & Consent (lg:col-span-3) */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Customer Details */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2">ข้อมูลผู้ติดต่อ</h3>
              
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs text-[#737373] mb-1">ชื่อ-นามสกุล *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-white"
                    placeholder="กรอกชื่อของคุณ"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#737373] mb-1">เบอร์โทรศัพท์ *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-white"
                    placeholder="เช่น 08XXXXXXXX"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#737373] mb-1">อีเมล (ถ้ามี)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-white"
                    placeholder="name@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#737373] mb-1">หมายเหตุเพิ่มเติม</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-white resize-none"
                    placeholder="ระบุข้อความถึงช่างสัก (ถ้ามี)"
                  />
                </div>
              </div>
            </div>

            {/* Booking Summary */}
            <div className="space-y-4 pt-2">
              <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2">สรุปการจอง</h3>
              
              <div className="space-y-3 text-xs text-[#A3A3A3]">
                <div className="flex justify-between">
                  <span>งาน Flash</span>
                  <span className="text-white font-medium">{flash.flash_code}</span>
                </div>
                <div className="flex justify-between">
                  <span>ช่างสัก</span>
                  <span className="text-white font-medium">{artist.display_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>ขนาดจริง</span>
                  <span className="text-white font-medium">
                    {widthCm && heightCm ? `${widthCm} × ${heightCm} ซม.` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>ตำแหน่ง</span>
                  <span className="text-white font-medium">{placement || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>วันจองคิว</span>
                  <span className="text-white font-medium">
                    {selectedDate ? formatThaiDate(selectedDate, { longMonth: true }) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>เวลา</span>
                  <span className="text-white font-medium">{preferredTime ? `${preferredTime} น.` : '-'}</span>
                </div>

                <div className="border-t border-[#1a1a1a] pt-3.5 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#A3A3A3]">ราคางานสัก</span>
                    <span className="text-white font-bold">฿{price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#A3A3A3]">ยอดมัดจำ</span>
                    <span className="text-amber-500 font-bold">
                      {settings ? (
                        settings.deposit_required ? (
                          `฿${deposit.toLocaleString()}`
                        ) : (
                          'ไม่เรียกเก็บมัดจำ'
                        )
                      ) : (
                        '-'
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Consent Box */}
            <div className="border-t border-[#1a1a1a] pt-4 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer text-[11px] leading-relaxed text-[#737373] hover:text-[#A3A3A3] select-none">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted && safetyNoticeAcknowledged}
                  onChange={e => {
                    setTermsAccepted(e.target.checked);
                    setSafetyNoticeAcknowledged(e.target.checked);
                  }}
                  className="mt-0.5 rounded border-[#262626] bg-[#0A0A0A] text-white focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-[#A3A3A3]">ข้าพเจ้านินยอมให้ทางร้านเก็บข้อมูลเพื่อใช้ติดต่อจองคิวและตรวจสอบการชำระเงิน *</span>
              </label>
            </div>

            {submitError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs leading-relaxed text-left flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="flex flex-col sm:flex-row-reverse justify-end gap-3 pt-6 border-t border-[#262626]">
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full sm:w-auto py-3 px-8 bg-white hover:bg-neutral-200 text-black font-semibold rounded-xl text-sm transition-all active:scale-[0.98] disabled:bg-[#1a1a1a] disabled:text-[#404040] disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอจองคิวสัก'}
          </button>
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            className="w-full sm:w-auto py-3 px-6 border border-[#262626] text-[#737373] hover:text-white hover:bg-[#171717] text-sm rounded-xl transition-all active:scale-[0.98]"
          >
            ยกเลิกการจอง
          </button>
        </div>
      </form>

      {/* CANCEL CONFIRM DIALOG */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm bg-[#121212] border border-[#262626] rounded-2xl p-6 text-center space-y-6">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-500">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">ยกเลิกการจองลายสัก Flash?</h3>
              <p className="text-xs text-[#A3A3A3] leading-relaxed">
                การกดยืนยันจะล้างข้อมูลที่คุณกรอกทั้งหมดและคืนสิทธิ์การจองลายสักนี้นี้กลับเข้าสู่คลังแบบสักของร้านทันที
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 bg-[#171717] border border-[#262626] text-[#A3A3A3] text-xs font-semibold rounded-lg hover:text-white transition-all"
              >
                กลับไปกรอกต่อ
              </button>
              <button
                onClick={handleCancelBooking}
                className="flex-1 py-2.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-all"
              >
                ยืนยันการยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
