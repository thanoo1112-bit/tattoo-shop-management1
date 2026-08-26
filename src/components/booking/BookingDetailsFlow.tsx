'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, UploadCloud } from 'lucide-react';
import { useBookingState } from './BookingStateProvider';
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization';
import { calculateTattooEstimate, getSizeBasedBookingBuffer } from '@/lib/bookingCalculations';

interface BookingDetailsFlowProps {
  shopSlug: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function BookingDetailsFlow({ shopSlug }: BookingDetailsFlowProps) {
  const router = useRouter();
  
  const { 
    formData, setFormData, 
    realAreaPhotos, setRealAreaPhotos,
    designReferencePhotos, setDesignReferencePhotos 
  } = useBookingState();
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isOptimizing, setIsOptimizing] = useState(false);
  const realFileInputRef = useRef<HTMLInputElement>(null);
  const designFileInputRef = useRef<HTMLInputElement>(null);

  const requiresRealPhoto = ['extension', 'touch_up', 'cover_up', 'scar_cover'].includes(formData.workType);

  useEffect(() => {
    if (!requiresRealPhoto && realAreaPhotos.length > 0) {
      setRealAreaPhotos([]);
    }
  }, [requiresRealPhoto, realAreaPhotos.length, setRealAreaPhotos]);

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

    setErrors(newErrors);
    
    if (e.target) e.target.value = '';
  };

  const removeImage = (index: number, type: 'real' | 'design') => {
    const setPhotos = type === 'real' ? setRealAreaPhotos : setDesignReferencePhotos;
    setPhotos(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  // Form validity check for button disabling
  const isFormValid = 
    (formData.placement || '').trim() !== '' &&
    (formData.flashId ? true : (
      (formData.widthCm || '').trim() !== '' &&
      (formData.heightCm || '').trim() !== '' &&
      Number(formData.widthCm) > 0 &&
      Number(formData.heightCm) > 0
    )) &&
    (formData.flashId ? true : (formData.description || '').trim() !== '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    // We need to preserve artist and style
    const artistId = formData.__artistId;
    const styleId = formData.__styleId;
    
    let url = `/book/${shopSlug}?step=3`;
    if (artistId) url += `&artist=${artistId}`;
    if (styleId) url += `&style=${styleId}`;
    
    router.push(url);
  };

  const inputClassName = "w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-3 text-[#F5F5F5] placeholder:text-[#737373] focus:outline-none focus:border-[#737373] transition-colors min-h-[46px]";

  const { area: estimatedArea, sizeCategory } = formData.flashId
    ? { area: 0, sizeCategory: '' }
    : calculateTattooEstimate(formData.widthCm || '0', formData.heightCm || '0');
  const estimatedDuration = (sizeCategory && !formData.flashId) ? getSizeBasedBookingBuffer(sizeCategory) : null;

  return (
    <div className="max-w-4xl mx-auto w-full pt-4">
      {formData.flashId && (
        <div className="mb-6 bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-[#F5F5F5]">คุณกำลังจองลาย Flash: {formData.flashCode}</h4>
            <p className="text-xs text-[#A3A3A3] mt-1">ขนาดลายสัก ({formData.flashSize}) และราคาถูกกำหนดไว้แล้วตามแบบพร้อมสัก</p>
          </div>
          <div className="shrink-0 text-sm font-bold text-[#F5F5F5] border border-[#262626] bg-[#0A0A0A] px-3.5 py-1.5 rounded-xl">
            ราคา ฿{Number(formData.flashPrice || 0).toLocaleString()}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* รายละเอียดงานสัก */}
        <div className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626]">
          <h2 className="text-xl font-medium text-[#F5F5F5] mb-2">รายละเอียดงานสัก</h2>
          <p className="text-[#A3A3A3] text-sm mb-6 leading-relaxed">
            บอกรายละเอียดงานที่คุณต้องการ รวมถึงตำแหน่งและขนาด
          </p>
          <div className="space-y-6">
            <div className="p-4 md:p-5 rounded-xl border border-[#262626] bg-[#121212]/50">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-5 sm:gap-6">
                {/* Width Control */}
                <div className="flex flex-col w-full">
                  <label htmlFor="widthCm" className="block text-[13px] font-medium text-[#A3A3A3] mb-3">
                    ความกว้าง <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input 
                      type="range" 
                      name="widthCm"
                      min="1" 
                      max={Math.max(50, Math.ceil(Number(formData.widthCm) || 0))}
                      step="0.1"
                      value={Number(formData.widthCm) || 1}
                      onChange={handleChange}
                      disabled={!!formData.flashId}
                      aria-label="ความกว้างของลายสัก"
                      className="w-full sm:flex-1 h-1.5 bg-[#262626] rounded-lg cursor-pointer accent-[#F5F5F5] disabled:opacity-40"
                    />
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <input
                        type="number"
                        id="widthCm"
                        name="widthCm"
                        min="1"
                        step="0.1"
                        value={formData.widthCm}
                        onChange={handleChange}
                        disabled={!!formData.flashId}
                        className={`${inputClassName} w-[76px] !min-h-[40px] !py-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed`}
                      />
                      <span className="text-[#A3A3A3] text-[13px] w-6">ซม.</span>
                    </div>
                  </div>
                </div>

                {/* Cross Multiplier */}
                <div className="hidden sm:flex text-[#525252] text-xl font-light self-end mb-2.5">
                  ×
                </div>

                {/* Height Control */}
                <div className="flex flex-col w-full">
                  <label htmlFor="heightCm" className="block text-[13px] font-medium text-[#A3A3A3] mb-3">
                    ความสูง <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input 
                      type="range" 
                      name="heightCm"
                      min="1" 
                      max={Math.max(50, Math.ceil(Number(formData.heightCm) || 0))}
                      step="0.1"
                      value={Number(formData.heightCm) || 1}
                      onChange={handleChange}
                      disabled={!!formData.flashId}
                      aria-label="ความสูงของลายสัก"
                      className="w-full sm:flex-1 h-1.5 bg-[#262626] rounded-lg cursor-pointer accent-[#F5F5F5] disabled:opacity-40"
                    />
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <input
                        type="number"
                        id="heightCm"
                        name="heightCm"
                        min="1"
                        step="0.1"
                        value={formData.heightCm}
                        onChange={handleChange}
                        disabled={!!formData.flashId}
                        className={`${inputClassName} w-[76px] !min-h-[40px] !py-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed`}
                      />
                      <span className="text-[#A3A3A3] text-[13px] w-6">ซม.</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-5 pt-4 border-t border-[#262626] flex flex-col md:flex-row md:items-center justify-between gap-3">
                {formData.flashId ? (
                  <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
                    <span className="text-[#A3A3A3] text-[13px]">ขนาดงานพร้อมสัก:</span>
                    <span className="text-white font-medium text-[13px]">
                      {formData.flashSize}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
                      <span className="text-[#A3A3A3] text-[13px]">พื้นที่โดยประมาณ:</span>
                      <span className="text-[#F5F5F5] font-medium text-[13px]">
                        {estimatedArea > 0 ? `${estimatedArea.toLocaleString('en-US', { maximumFractionDigits: 2 })} ตร.ซม.` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
                      <span className="text-[#A3A3A3] text-[13px]">ขนาดงาน:</span>
                      <span className="text-[#F5F5F5] font-medium text-[13px]">
                        {sizeCategory ? `ขนาด${sizeCategory}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
                      <span className="text-[#A3A3A3] text-[13px]">เวลาที่ใช้โดยประมาณ:</span>
                      <span className="text-[#F5F5F5] font-medium text-[13px]">
                        {estimatedDuration ? `${estimatedDuration} ชั่วโมง` : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-[#262626]">
              <label htmlFor="placement" className="block text-xs font-medium text-[#A3A3A3] mb-1">
                ตำแหน่งที่ต้องการสัก <span className="text-red-500">*</span>
              </label>
              <p className="text-[#737373] text-xs mb-2">กรุณาระบุตำแหน่งให้ละเอียด เช่น ด้านนอกต้นแขนขวา, หลังหัวไหล่ซ้าย หรือเหนือข้อเท้าด้านใน</p>
              <textarea
                id="placement"
                name="placement"
                rows={2}
                placeholder="เช่น ด้านในท่อนแขนซ้าย ใกล้ข้อพับ"
                value={formData.placement}
                onChange={handleChange}
                className={inputClassName + " resize-none min-h-[64px] sm:min-h-[72px] py-2 sm:py-3"}
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-xs font-medium text-[#A3A3A3] mb-1">
                Story / Concept {formData.flashId ? '(ไม่บังคับ)' : <span className="text-red-500">*</span>}
              </label>
              <p className="text-[#737373] text-xs mb-2">บอกไอเดีย ความหมาย อารมณ์ หรือรายละเอียดที่ต้องการ เพื่อช่วยให้ช่างเข้าใจงานของคุณมากขึ้น</p>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="เช่น อยากได้ลายที่สื่อถึงครอบครัว โทนเข้ม มีดอกไม้ประกอบ และไม่ต้องการสี..."
                value={formData.description}
                onChange={handleChange}
                className={inputClassName + " resize-none"}
              />
            </div>
          </div>
        </div>

        {/* รูปประกอบงาน */}
        {(!formData.flashId || requiresRealPhoto) && (
          <div className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626] flex flex-col gap-5">
            <div>
              <h2 className="text-xl font-medium text-[#F5F5F5]">รูปประกอบงาน</h2>
            </div>
          
          <div className={`grid gap-4 md:gap-5 grid-cols-1 ${requiresRealPhoto ? 'md:grid-cols-2' : ''}`}>
            {/* รูปพื้นที่จริง */}
            {requiresRealPhoto && (
              <div className="bg-[#121212] p-4 md:p-5 rounded-xl border border-[#262626] flex flex-col h-full">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-medium text-[#F5F5F5]">รูปพื้นที่จริง</span>
                  <span className="text-xs text-[#737373]">{realAreaPhotos.length} / {MAX_FILES}</span>
                </div>
                <p className="text-[#A3A3A3] text-xs mb-4 leading-relaxed flex-1">
                  กรุณาแนบรูปรอยสักเดิม หรือ บริเวณที่ต้องการสัก
                  <br/><span className="text-[#737373] mt-1 block">ควรถ่ายในที่สว่างและให้เห็นบริเวณที่ต้องการทำงานชัดเจน</span>
                </p>

                {realAreaPhotos.length === 0 ? (
                  <button
                    type="button"
                    disabled={isOptimizing}
                    onClick={() => realFileInputRef.current?.click()}
                    className={`w-full h-[96px] md:h-[104px] rounded-xl border border-dashed border-[#404040] bg-transparent flex flex-col items-center justify-center transition-colors mt-auto ${isOptimizing ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#737373] cursor-pointer group'}`}
                  >
                    {isOptimizing ? (
                      <span className="text-xs text-[#A3A3A3] animate-pulse">กำลังเตรียมรูป...</span>
                    ) : (
                      <>
                        <UploadCloud className="text-[#737373] group-hover:text-[#A3A3A3] mb-1.5 w-5 h-5 transition-colors" />
                        <span className="text-xs text-[#737373] group-hover:text-[#A3A3A3] transition-colors">อัปโหลดรูป</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2 md:gap-3 mt-auto">
                    {realAreaPhotos.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-[#262626]">
                        <img src={img.preview} alt={`Real Area ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx, 'real')}
                          className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full backdrop-blur-sm md:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {realAreaPhotos.length < MAX_FILES && (
                      <button
                        type="button"
                        disabled={isOptimizing}
                        onClick={() => realFileInputRef.current?.click()}
                        className={`aspect-square rounded-lg border border-dashed border-[#404040] bg-transparent flex flex-col items-center justify-center transition-colors ${isOptimizing ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#737373] cursor-pointer group'}`}
                      >
                        {isOptimizing ? (
                          <span className="text-xs text-[#A3A3A3] animate-pulse">...</span>
                        ) : (
                          <span className="text-lg text-[#737373] group-hover:text-[#A3A3A3] transition-colors">+</span>
                        )}
                      </button>
                    )}
                  </div>
                )}
                
                <input type="file" ref={realFileInputRef} onChange={(e) => handleFileChange(e, 'real')} accept="image/jpeg, image/png, image/webp" multiple className="hidden" />
                {errors.realFile && <p className="text-red-500 text-xs mt-2">{errors.realFile}</p>}
              </div>
            )}

            {/* รูปอ้างอิงดีไซน์ */}
            <div className="bg-[#121212] p-4 md:p-5 rounded-xl border border-[#262626] flex flex-col h-full">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-medium text-[#F5F5F5]">รูปอ้างอิงดีไซน์</span>
                <span className="text-xs text-[#737373]">{designReferencePhotos.length} / {MAX_FILES}</span>
              </div>
              <p className="text-[#A3A3A3] text-xs mb-4 leading-relaxed flex-1">
                แนบรูปตัวอย่างลาย สไตล์ องค์ประกอบ หรือแนวทางที่ต้องการ (ไม่บังคับ)
              </p>

              {designReferencePhotos.length === 0 ? (
                <button
                  type="button"
                  disabled={isOptimizing}
                  onClick={() => designFileInputRef.current?.click()}
                  className={`w-full h-[96px] md:h-[104px] rounded-xl border border-dashed border-[#404040] bg-transparent flex flex-col items-center justify-center transition-colors mt-auto ${isOptimizing ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#737373] cursor-pointer group'}`}
                >
                  {isOptimizing ? (
                    <span className="text-xs text-[#A3A3A3] animate-pulse">กำลังเตรียมรูป...</span>
                  ) : (
                    <>
                      <UploadCloud className="text-[#737373] group-hover:text-[#A3A3A3] mb-1.5 w-5 h-5 transition-colors" />
                      <span className="text-xs text-[#737373] group-hover:text-[#A3A3A3] transition-colors">อัปโหลดรูป</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2 md:gap-3 mt-auto">
                  {designReferencePhotos.map((img, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-[#262626]">
                      <img src={img.preview} alt={`Design Ref ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx, 'design')}
                        className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full backdrop-blur-sm md:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {designReferencePhotos.length < MAX_FILES && (
                    <button
                      type="button"
                      disabled={isOptimizing}
                      onClick={() => designFileInputRef.current?.click()}
                      className={`aspect-square rounded-lg border border-dashed border-[#404040] bg-transparent flex flex-col items-center justify-center transition-colors ${isOptimizing ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#737373] cursor-pointer group'}`}
                    >
                      {isOptimizing ? (
                        <span className="text-xs text-[#A3A3A3] animate-pulse">...</span>
                      ) : (
                        <span className="text-lg text-[#737373] group-hover:text-[#A3A3A3] transition-colors">+</span>
                      )}
                    </button>
                  )}
                </div>
              )}

              <input type="file" ref={designFileInputRef} onChange={(e) => handleFileChange(e, 'design')} accept="image/jpeg, image/png, image/webp" multiple className="hidden" />
              {errors.designFile && <p className="text-red-500 text-xs mt-2">{errors.designFile}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-[#262626] pt-4 mt-1">
            <p className="text-xs text-[#737373]">
              JPG, PNG, WEBP · สูงสุด 10 MB/รูป · หมวดละ 5 รูป
            </p>
            <p className="text-xs text-[#525252]">
              * รูปอาจต้องเลือกใหม่หากมีการรีเฟรชหน้า
            </p>
          </div>
        </div>
      )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4">
          <button
            type="button"
            onClick={() => {
              const artistId = formData.__artistId;
              const styleId = formData.__styleId;
              let url = `/book/${shopSlug}?step=1`;
              if (artistId) url += `&artist=${artistId}`;
              if (styleId) url += `&style=${styleId}`;
              router.push(url);
            }}
            className="flex-1 py-4 text-center rounded-xl border border-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors font-medium"
          >
            ย้อนกลับ
          </button>
          <button
            type="submit"
            disabled={!isFormValid}
            className="flex-1 py-4 text-center rounded-xl bg-[#F5F5F5] text-black hover:bg-[#E5E5E5] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            เลือกวันและเวลา
          </button>
        </div>

      </form>
    </div>
  );
}
