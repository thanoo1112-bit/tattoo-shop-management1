'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, MapPin, Tag, Type, Palette, Scissors, Save, X, Calendar as CalendarIcon, Phone } from 'lucide-react';
import { useBookingState } from './BookingStateProvider';
import { calculateTattooEstimate, getSizeBasedBookingBuffer } from '@/lib/bookingCalculations';
import { createClient } from '@/lib/supabase/client';
import { formatThaiDate } from '@/lib/dateUtils';
import BookingSuccessState from './BookingSuccessState';

export default function BookingSummaryFlow({ artist, shopSlug, artistStyles, selectedStyleId }: any) {
  const { formData, setFormData, isFirstTattoo, setIsFirstTattoo, safetyNoticeAcknowledged, setSafetyNoticeAcknowledged, realAreaPhotos, designReferencePhotos, clearBookingDraft, submissionComplete, setSubmissionComplete } = useBookingState();
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const inputClassName = "w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-3 text-[#F5F5F5] placeholder:text-[#737373] focus:outline-none focus:border-[#737373] transition-colors min-h-[46px]";
  const selectedStyleName = formData.flashId
    ? (formData.flashStyle || 'ไม่ระบุ')
    : (artistStyles.find((s: any) => s.style_id === selectedStyleId)?.name || 'ไม่ระบุ');

  const {
    area,
    sizeCategory
  } = formData.flashId
    ? { area: 0, sizeCategory: '' }
    : calculateTattooEstimate(formData.widthCm, formData.heightCm);

  const workTypeLabels: Record<string, string> = {
    new_work: 'งานใหม่',
    extension: 'ต่อเติมลายเดิม',
    touch_up: 'เก็บงาน/เติมสี',
    cover_up: 'แก้/ทับลายเดิม',
    scar_cover: 'สักทับรอยแผลเป็น'
  };
  const workTypeLabel = workTypeLabels[formData.workType] || formData.workType;

  const estimatedDuration = (sizeCategory && !formData.flashId) ? getSizeBasedBookingBuffer(sizeCategory) : null;
  const colorStr = formData.colorMode === 'black_grey' ? 'Black & Grey' : formData.colorMode === 'color' ? 'Color' : '';
  const combinedWorkStyle = [selectedStyleName, colorStr, workTypeLabel].filter(Boolean).join(' • ');


  const handleSubmit = async () => {
    if (!termsAccepted || isSubmitting) return;
    
    // Contact info validation
    const newErrors: Record<string, string> = {};
    if (!(formData.fullName || '').trim()) newErrors.fullName = 'กรุณาระบุชื่อ-นามสกุล';
    if (!(formData.phone || '').trim()) newErrors.phone = 'กรุณาระบุเบอร์โทรศัพท์';
    else if (!/^[0-9-]{9,12}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitError('กรุณากรอกข้อมูลติดต่อให้ครบถ้วนและถูกต้อง');
      return;
    }

    if (!safetyNoticeAcknowledged) {
      setSubmitError('กรุณารับทราบข้อมูลด้านความปลอดภัยก่อนส่งคำขอ');
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    const supabase = createClient();
    
    try {
      // 1. Create upload session
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_booking_upload_session', {
        p_shop_slug: shopSlug,
        p_artist_id: artist.artist_id,
        p_style_id: selectedStyleId || null,
        p_color_mode: formData.colorMode,
        p_work_type: formData.workType,
        p_flash_design_id: formData.flashId || null,
        p_hold_session_id: formData.holdId || null
      });

      if (sessionError || !sessionData || sessionData.length === 0) {
        console.error('create_public_booking_upload_session failed', {
          code: sessionError?.code,
          message: sessionError?.message,
          details: sessionError?.details,
          hint: sessionError?.hint
        });
        throw new Error(
          sessionError?.message?.includes('rejects') || sessionError?.message?.includes('not active') || sessionError?.message?.includes('Style not supported') || sessionError?.message?.includes('Flash')
            ? sessionError.message
            : 'ไม่สามารถเตรียมคำขอจองได้ กรุณาลองใหม่อีกครั้ง'
        );
      }

      const { session_id } = sessionData[0];

      // 2. Upload images
      const realAreaPaths: string[] = [];
      const designReferencePaths: string[] = [];

      const uploadFiles = async (photos: any[], pathsArr: string[]) => {
        if (!photos || photos.length === 0) return;
        for (const photo of photos) {
          const fileUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
          const filePath = `temp/${session_id}/${fileUuid}.webp`;

          const { error: uploadError } = await supabase.storage
            .from('tattoo-references')
            .upload(filePath, photo.file, {
              upsert: false,
              contentType: 'image/webp'
            });

          if (uploadError) {
            throw new Error('อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
          }

          pathsArr.push(filePath);
        }
      };

      await uploadFiles(realAreaPhotos, realAreaPaths);
      await uploadFiles(designReferencePhotos, designReferencePaths);

      // 3. Finalize booking
      const { data: publicToken, error: finalError } = await supabase.rpc('finalize_public_booking', {
        p_session_id: session_id,
        p_width_cm: formData.flashId ? null : (parseFloat(formData.widthCm) || 0),
        p_height_cm: formData.flashId ? null : (parseFloat(formData.heightCm) || 0),
        p_placement: formData.placement,
        p_description: formData.description,
        p_full_name: formData.fullName,
        p_phone: formData.phone,
        p_email: formData.email || null,
        p_health_note: null,
        p_requested_date: formData.selectedDate,
        p_requested_time: formData.preferredTime,
        p_real_area_paths: realAreaPaths,
        p_design_ref_paths: designReferencePaths,
        p_terms_accepted: true,
        p_is_first_tattoo: isFirstTattoo,
        p_safety_notice_acknowledged: safetyNoticeAcknowledged,
        p_flash_design_id: formData.flashId || null,
        p_hold_session_id: formData.holdId || null,
        p_flash_variant_id: formData.flashVariantId || null
      });

      if (finalError) {
        let msg = 'ไม่สามารถส่งคำขอจองได้ กรุณาลองอีกครั้ง';
        const raw = finalError.message || '';
        if (raw.includes('FULL') || raw.includes('closed') || raw.includes('capacity')) msg = 'วันที่เลือกไม่สามารถรับคำขอเพิ่มเติมได้ กรุณาเลือกวันใหม่';
        else if (raw.includes('expired') || raw.includes('not active') || raw.includes('consumed') || raw.includes('session expired') || raw.includes('timeout')) msg = 'การส่งคำขอใช้เวลานานเกินไป กรุณาลองส่งอีกครั้ง';
        else if (raw.includes('rejects') || raw.includes('Style not supported')) msg = 'ข้อมูลที่เลือกมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง';
        else if (raw.includes('photo') || raw.includes('Max') || raw.includes('real area') || raw.includes('Duplicate')) msg = 'ข้อมูลรูปประกอบไม่ถูกต้อง กรุณาเลือกรูปใหม่';
        throw new Error(msg);
      }

      // 4. Success — set provider-level flag FIRST so BookingStepGuard bypasses
      // redirect before clearBookingDraft() empties formData.
      // Order is critical: submissionComplete=true → guard silent → draft cleared safely.
      setSubmissionComplete(true);
      clearBookingDraft();

      if (publicToken) {
        router.replace(`/book/${shopSlug}/booking/${publicToken}`);
      }

    } catch (err: any) {
      setSubmitError(err.message || 'ไม่สามารถส่งคำขอจองได้ กรุณาลองอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Early return: render success UI inline without navigation.
  // submissionComplete is owned by BookingStateProvider, visible to
  // BookingStepGuard, which bypasses redirect when it is true.
  if (submissionComplete) {
    return <BookingSuccessState shopSlug={shopSlug} />;
  }


  return (
    <div className="max-w-2xl mx-auto w-full pt-4 pb-8 flex flex-col gap-6">
      <div className="mb-2 px-1">
        <h2 className="text-2xl font-semibold text-[#F5F5F5] mb-2">ข้อมูลติดต่อ & สรุปคำขอ</h2>
        <p className="text-[#A3A3A3] text-sm">กรอกข้อมูลติดต่อให้ครบถ้วนและตรวจสอบรายละเอียดก่อนส่งคำขอ</p>
      </div>

      {/* ข้อมูลติดต่อ */}
      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6">
        <h3 className="text-lg font-medium text-[#F5F5F5] mb-6">ข้อมูลติดต่อ</h3>
        <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-[#A3A3A3] mb-2">
                ชื่อ-นามสกุล / ชื่อเล่น <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className={inputClassName}
              />
              {errors.fullName && <p className="text-red-400 text-xs mt-1.5">{errors.fullName}</p>}
            </div>
            
            <div>
              <label htmlFor="phone" className="block text-xs font-medium text-[#A3A3A3] mb-2">
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
              <label htmlFor="email" className="block text-xs font-medium text-[#A3A3A3] mb-2">
                อีเมล
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="example@email.com"
                value={formData.email}
                onChange={handleChange}
                className={inputClassName}
              />
              {errors.email && <p className="text-red-400 text-xs mt-1.5">{errors.email}</p>}
            </div>

            {/* Checkbox 1 — First Timer */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer group bg-[#0B0B0B] border border-[#2A2A2A] rounded-xl p-4 transition-colors hover:border-[#404040]">
                <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={isFirstTattoo}
                    onChange={(e) => setIsFirstTattoo(e.target.checked)}
                    className="peer appearance-none w-[22px] h-[22px] border-2 border-[#404040] rounded-md bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
                  />
                  <svg
                    className="absolute w-3.5 h-3.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-[#F5F5F5] text-[13px] leading-tight mt-0.5">นี่เป็นการสักครั้งแรกของฉัน</span>
                  <span className="text-[#A3A3A3] text-xs leading-relaxed mt-1.5">
                    เพื่อให้ช่างทราบล่วงหน้าและสามารถแนะนำการเตรียมตัว ขั้นตอน และการพักระหว่างทำได้เหมาะสม
                  </span>
                </div>
              </label>
            </div>

            {/* Checkbox 2 — Safety Acknowledgement */}
            <div className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer group bg-[#0B0B0B] border border-[#2A2A2A] rounded-xl p-4 transition-colors hover:border-[#404040]">
                <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={safetyNoticeAcknowledged}
                    onChange={(e) => setSafetyNoticeAcknowledged(e.target.checked)}
                    className="peer appearance-none w-[22px] h-[22px] border-2 border-[#404040] rounded-md bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
                  />
                  <svg
                    className="absolute w-3.5 h-3.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-[#F5F5F5] text-[13px] leading-tight mt-0.5">ฉันรับทราบข้อมูลด้านความปลอดภัยก่อนการสัก</span>
                  <span className="text-[#A3A3A3] text-xs leading-relaxed mt-1.5">
                    หากมีภาวะเลือดออกง่ายหรือความผิดปกติของการแข็งตัวของเลือด ใช้ยาที่มีผลต่อการแข็งตัวของเลือดหรือเพิ่มความเสี่ยงต่อการเลือดออก หรืออยู่ระหว่างตั้งครรภ์ กรุณาแจ้งร้านก่อนเข้ารับบริการ
                  </span>
                </div>
              </label>
            </div>
        </div>
      </div>

      {/* สรุปคำขอจอง */}
      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-5 sm:p-6 flex flex-col">
        <h3 className="text-lg font-medium text-[#F5F5F5] mb-4 sm:mb-5">สรุปคำขอจอง</h3>
        
        {/* GROUP 1: Artist + Work Format */}
        <div className="flex flex-col gap-3.5 sm:gap-4">
            <div className="flex flex-row justify-between items-start gap-4">
                <span className="text-[#A3A3A3] text-sm shrink-0">ช่างสัก</span>
                <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{artist.display_name}</span>
            </div>
            <div className="flex flex-row justify-between items-start gap-4">
                <span className="text-[#A3A3A3] text-sm shrink-0">รูปแบบงาน</span>
                <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{combinedWorkStyle}</span>
            </div>
        </div>

        <div className="my-4 sm:my-5 border-t border-[#262626]"></div>

        {/* GROUP 2: Placement + Dimensions + Duration */}
        <div className="flex flex-col gap-3.5 sm:gap-4">
            <div className="flex flex-row justify-between items-start gap-4">
                <span className="text-[#A3A3A3] text-sm shrink-0">ตำแหน่ง</span>
                <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{formData.placement}</span>
            </div>
            {formData.flashId ? (
              <div className="flex flex-row justify-between items-start gap-4">
                  <span className="text-[#A3A3A3] text-sm shrink-0">ขนาดงาน</span>
                  <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">
                    {formData.flashSize}
                    {(formData.flashMinSize !== null && formData.flashMinSize !== undefined) && (
                      <span className="text-[#737373] text-xs ml-1">
                        ({formData.flashMinSize}
                        {(formData.flashMaxSize !== null && formData.flashMaxSize !== undefined)
                          ? `–${formData.flashMaxSize} ซม.`
                          : ' ซม. ขึ้นไป'}
                        )
                      </span>
                    )}
                  </span>
              </div>
            ) : (
              <>
                <div className="flex flex-row justify-between items-start gap-4">
                    <span className="text-[#A3A3A3] text-sm shrink-0">ความกว้าง</span>
                    <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{formData.widthCm} ซม.</span>
                </div>
                <div className="flex flex-row justify-between items-start gap-4">
                    <span className="text-[#A3A3A3] text-sm shrink-0">ความยาว</span>
                    <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{formData.heightCm} ซม.</span>
                </div>
                <div className="flex flex-row justify-between items-start gap-4">
                    <span className="text-[#A3A3A3] text-sm shrink-0">ระยะเวลาเข้ารับบริการโดยประมาณ</span>
                    <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{estimatedDuration ? `${estimatedDuration} ชั่วโมง` : '-'}</span>
                </div>
              </>
            )}
        </div>

        <div className="my-4 sm:my-5 border-t border-[#262626]"></div>

        {/* GROUP 3: Date + Time */}
        <div className="flex flex-col gap-3.5 sm:gap-4">
            <div className="flex flex-row justify-between items-start gap-4">
                <span className="text-[#A3A3A3] text-sm shrink-0">วันที่สะดวก</span>
                <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{formatThaiDate(formData.selectedDate)}</span>
            </div>
            <div className="flex flex-row justify-between items-start gap-4">
                <span className="text-[#A3A3A3] text-sm shrink-0">เวลาที่สะดวก</span>
                <span className="text-[#F5F5F5] text-sm font-medium text-right min-w-0">{formData.preferredTime} น.</span>
            </div>
        </div>

        {(formData.workType !== 'new_work' && realAreaPhotos.length > 0) || (designReferencePhotos.length > 0) ? (
          <div className="my-4 sm:my-5 border-t border-[#262626]"></div>
        ) : null}

        {/* IMAGES */}
        <div className="flex flex-col gap-4 sm:gap-5">
            {formData.workType !== 'new_work' && realAreaPhotos.length > 0 && (
              <div className="flex flex-col gap-2">
                 <span className="text-[#A3A3A3] text-sm">รูปพื้นที่จริง</span>
                 <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                   {realAreaPhotos.map((img: any, idx: number) => (
                     <img key={idx} src={img.preview} alt={`Real Area ${idx + 1}`} className="w-full aspect-square sm:w-[96px] sm:h-[96px] object-cover rounded-md border border-[#262626]" />
                   ))}
                 </div>
              </div>
            )}
            
            {designReferencePhotos.length > 0 && (
              <div className="flex flex-col gap-2">
                 <span className="text-[#A3A3A3] text-sm">รูปอ้างอิงดีไซน์</span>
                 <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                   {designReferencePhotos.map((img: any, idx: number) => (
                     <img key={idx} src={img.preview} alt={`Design Ref ${idx + 1}`} className="w-full aspect-square sm:w-[96px] sm:h-[96px] object-cover rounded-md border border-[#262626]" />
                   ))}
                 </div>
              </div>
            )}
        </div>

        {/* Deposit/Price Message */}
        <div className="mt-4 sm:mt-5 bg-transparent border-t border-[#262626] pt-4 sm:pt-5 text-left">
          {formData.flashId ? (
            <>
              <p className="text-[15px] sm:text-[14px] font-medium text-[#F5F5F5] flex justify-between">
                <span>ราคา Flash (ราคาเน็ต)</span>
                <span className="text-white font-bold">฿{Number(formData.flashPrice || 0).toLocaleString()}</span>
              </p>
              <p className="text-[13px] sm:text-[13px] text-[#A3A3A3] mt-1">
                ราคาเป็นราคาสุดท้ายของแบบสักชิ้นนี้ (ไม่รวมค่ามัดจำซึ่งช่างจะแจ้งหลังตรวจสอบรายละเอียดคำขอ)
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] sm:text-[14px] font-medium text-[#F5F5F5]">
                ราคางานและยอดมัดจำ
              </p>
              <p className="text-[13px] sm:text-[13px] text-[#A3A3A3] mt-1">
                ช่างจะแจ้งหลังตรวจสอบรายละเอียดคำขอ
              </p>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626]">
          <label className="flex items-start gap-4 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-1">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="peer appearance-none w-5 h-5 border-2 border-[#404040] rounded bg-transparent checked:bg-[#FFFFFF] checked:border-[#FFFFFF] transition-colors cursor-pointer"
              />
              <svg
                className="absolute w-3 h-3 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 mt-0.5">
              <span className="text-sm text-[#F5F5F5] leading-relaxed">
                ข้าพเจ้ายินยอมให้ทางร้านเก็บข้อมูลเพื่อใช้ติดต่อจองคิวและตรวจสอบการชำระเงิน
              </span>
            </div>
          </label>
        </div>

        {submitError && (
          <div className="bg-red-500/10 border border-red-500/20 text-[#F5F5F5] p-4 rounded-xl text-sm mb-4">
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-4">
          <button 
            type="button"
            onClick={() => {
              const currentUrl = new URL(window.location.href);
              const styleParam = currentUrl.searchParams.get('style');
              let url = `/book/${shopSlug}?step=3&artist=${artist.artist_id}${styleParam ? '&style=' + styleParam : ''}`;
              if (formData.flashId) {
                url += `&flash_id=${formData.flashId}`;
                if (formData.holdId) url += `&hold_id=${formData.holdId}`;
                if (formData.flashVariantId) url += `&variant_id=${formData.flashVariantId}`;
              }
              router.push(url);
            }}
            className="flex-1 py-4 text-center rounded-md border border-[#404040] text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors font-medium"
          >
            ย้อนกลับ
          </button>
          <button
            onClick={handleSubmit}
            disabled={!termsAccepted || isSubmitting}
            className="flex-1 py-4 text-center rounded-md bg-[#FFFFFF] text-[#000000] hover:bg-[#E5E5E5] transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center flex-col"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>กำลังส่งคำขอ...</span>
              </div>
            ) : (
              <span>ส่งคำขอจอง</span>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
