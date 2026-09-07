'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Loader2, 
  AlertCircle, 
  X, 
  Plus, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { uploadCustomerReference, getCustomerReferenceSignedUrl } from '@/lib/utils/storageUploader';

interface ReferenceUploaderProps {
  value?: string; // Legacy single image path or URL
  values?: string[]; // Array of image paths or URLs
  onChange?: (storagePathOrUrl: string) => void;
  onValuesChange?: (pathsOrUrls: string[]) => void;
  maxImages?: number; // 5 for Custom Tattoo (default), 1 for Flash
  disabled?: boolean;
}

const isDirectUrl = (str: string) =>
  Boolean(
    str &&
      (str.startsWith('http://') ||
        str.startsWith('https://') ||
        str.startsWith('data:') ||
        str.startsWith('blob:'))
  );

export default function ReferenceUploader({
  value = '',
  values,
  onChange,
  onValuesChange,
  maxImages = 5,
  disabled = false,
}: ReferenceUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewSignedUrls, setPreviewSignedUrls] = useState<Record<string, string>>({});
  const [localBlobUrls, setLocalBlobUrls] = useState<Record<string, string>>({});
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [failedImagePaths, setFailedImagePaths] = useState<Record<string, boolean>>({});

  // Carousel Active Slide Index
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Touch Swipe Gesture References
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalize active list of image paths/urls
  const activePaths: string[] = React.useMemo(() => {
    if (Array.isArray(values)) {
      return values.filter(Boolean);
    }
    if (value && value.trim()) {
      return [value.trim()];
    }
    return [];
  }, [values, value]);

  // Total slides count available to navigate
  // If activePaths.length < maxImages, we add +1 slide for the Upload Placeholder
  // If activePaths.length === maxImages, totalSlides = maxImages
  const totalSlides = React.useMemo(() => {
    if (maxImages <= 1) return 1;
    return activePaths.length < maxImages ? activePaths.length + 1 : maxImages;
  }, [activePaths.length, maxImages]);

  // Ensure activeSlideIndex stays safely within valid bounds
  useEffect(() => {
    if (activeSlideIndex >= totalSlides && totalSlides > 0) {
      setActiveSlideIndex(totalSlides - 1);
    }
  }, [totalSlides, activeSlideIndex]);

  // Resolve Signed Preview URLs for all active paths simultaneously
  useEffect(() => {
    let isMounted = true;

    async function resolveAllPreviews() {
      if (activePaths.length === 0) {
        if (isMounted) {
          setPreviewSignedUrls({});
          setLoadingPreviews(false);
        }
        return;
      }

      setLoadingPreviews(true);
      const urlMap: Record<string, string> = {};

      try {
        await Promise.all(
          activePaths.map(async (pathStr) => {
            if (!pathStr) return;
            if (isDirectUrl(pathStr)) {
              urlMap[pathStr] = pathStr;
              return;
            }
            // Check if we already have a resolved signed URL or local blob preview
            if (previewSignedUrls[pathStr] && isDirectUrl(previewSignedUrls[pathStr])) {
              urlMap[pathStr] = previewSignedUrls[pathStr];
              return;
            }
            try {
              const signedUrl = await getCustomerReferenceSignedUrl(pathStr, 3600);
              urlMap[pathStr] = signedUrl || '';
            } catch (err) {
              console.error('[ReferenceUploader] Error resolving signed URL for path:', pathStr, err);
              urlMap[pathStr] = '';
            }
          })
        );

        if (isMounted) {
          setPreviewSignedUrls((prev) => ({ ...prev, ...urlMap }));
        }
      } finally {
        if (isMounted) {
          setLoadingPreviews(false);
        }
      }
    }

    resolveAllPreviews();

    return () => {
      isMounted = false;
    };
  }, [activePaths]);

  const notifyChange = (newPaths: string[]) => {
    if (onValuesChange) {
      onValuesChange(newPaths);
    }
    if (onChange) {
      onChange(newPaths[0] || '');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Reset error state
    setUploadError(null);

    // 1. Check total count limit
    const currentCount = activePaths.length;
    if (currentCount + selectedFiles.length > maxImages) {
      const limitMsg =
        maxImages === 1
          ? 'สามารถอัปโหลดรูปภาพอ้างอิงได้สูงสุด 1 รูป'
          : 'สามารถอัปโหลดรูปภาพอ้างอิงได้สูงสุด 5 รูป';
      setUploadError(limitMsg);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Validate file types & sizes
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB per file

    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isTypeValid =
        allowedTypes.includes(file.type.toLowerCase()) ||
        ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

      if (!isTypeValid) {
        setUploadError('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (file.size > maxSizeBytes) {
        setUploadError('รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 10 MB');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // 3. Generate instant local blob Object URLs for zero-latency preview
    const tempBlobMap: Record<string, string> = {};
    const newBlobUrls: string[] = [];

    selectedFiles.forEach((file) => {
      const blobUrl = URL.createObjectURL(file);
      tempBlobMap[blobUrl] = blobUrl;
      newBlobUrls.push(blobUrl);
    });

    setLocalBlobUrls((prev) => ({ ...prev, ...tempBlobMap }));

    // 4. Upload valid files sequentially and maintain order
    setIsUploading(true);
    const uploadedPaths: string[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const blobUrl = newBlobUrls[i];
        const result = await uploadCustomerReference(file);
        uploadedPaths.push(result.path);

        // Pre-cache local blob URL for storage path until signed URL resolves
        if (blobUrl) {
          setPreviewSignedUrls((prev) => ({ ...prev, [result.path]: blobUrl }));
        }
      }

      const updatedList = [...activePaths, ...uploadedPaths];
      notifyChange(updatedList);

      // Auto-advance to the next available slide (e.g. next upload slot or last filled image)
      if (maxImages > 1) {
        const targetSlide = Math.min(updatedList.length, maxImages - 1);
        setActiveSlideIndex(targetSlide);
      }
    } catch (err: any) {
      console.error('[ReferenceUploader] Upload error:', err);
      setUploadError(err?.message || 'ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (indexToRemove: number) => {
    setUploadError(null);
    const targetPath = activePaths[indexToRemove];
    if (targetPath && localBlobUrls[targetPath]) {
      try {
        URL.revokeObjectURL(localBlobUrls[targetPath]);
      } catch (_) {}
    }

    const updatedList = activePaths.filter((_, idx) => idx !== indexToRemove);
    notifyChange(updatedList);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Safe active slide index transition
    if (maxImages > 1) {
      const newTotal = updatedList.length < maxImages ? updatedList.length + 1 : maxImages;
      setActiveSlideIndex((prev) => Math.min(prev, newTotal - 1));
    }
  };

  const handleImageError = (pathStr: string) => {
    setFailedImagePaths((prev) => ({ ...prev, [pathStr]: true }));
  };

  // Carousel Navigation Handlers
  const handlePrevSlide = () => {
    setActiveSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextSlide = () => {
    setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
  };

  // Touch Swipe Handlers for Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const diffX = touchStartXRef.current - touchEndXRef.current;
      const swipeThreshold = 40;

      if (diffX > swipeThreshold && activeSlideIndex < totalSlides - 1) {
        handleNextSlide();
      } else if (diffX < -swipeThreshold && activeSlideIndex > 0) {
        handlePrevSlide();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const isLimitReached = activePaths.length >= maxImages;
  const titleText =
    maxImages === 1
      ? 'รูปภาพอ้างอิง (สูงสุด 1 รูป)'
      : 'รูปภาพอ้างอิง (สูงสุด 5 รูป)';

  // Determine current slide content
  const hasImageOnCurrentSlide = activeSlideIndex < activePaths.length;
  const currentPathStr = hasImageOnCurrentSlide ? activePaths[activeSlideIndex] : null;

  return (
    <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex flex-col space-y-3 font-prompt">
      {/* Header & Counter */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider text-[#ECE4D3] font-bold block">
            {titleText}
          </span>
          <span className="text-[10px] text-[#A89F91] block mt-0.5">
            รองรับ JPG, PNG, WEBP สูงสุด 10 MB
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold text-[#ECE4D3] bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]">
            {activePaths.length} / {maxImages} รูป
          </span>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={maxImages > 1}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={isUploading || disabled || isLimitReached}
        className="hidden"
      />

      {/* Uploading Spinner Banner */}
      {isUploading && (
        <div className="p-3 bg-[#171512] border border-dashed border-[#9C2F2F] rounded-[6px] flex items-center justify-center gap-2 text-xs text-[#ECE4D3] animate-pulse">
          <Loader2 size={16} className="animate-spin text-[#9C2F2F]" />
          <span>กำลังอัปโหลดรูปภาพอ้างอิง...</span>
        </div>
      )}

      {/* Main Single Slide Frame (Viewport) */}
      <div
        className="relative w-full h-56 sm:h-64 rounded-[6px] border border-[#4A443A] bg-[#0E0D0C] overflow-hidden group shadow-inner flex items-center justify-center select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Navigation Arrow: Previous (Desktop) */}
        {maxImages > 1 && totalSlides > 1 && activeSlideIndex > 0 && (
          <button
            type="button"
            onClick={handlePrevSlide}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/80 hover:bg-[#9C2F2F] text-white border border-white/20 flex items-center justify-center transition-all z-20 shadow-lg"
            title="รูปก่อนหน้า (Previous Slide)"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {/* Navigation Arrow: Next (Desktop) */}
        {maxImages > 1 && totalSlides > 1 && activeSlideIndex < totalSlides - 1 && (
          <button
            type="button"
            onClick={handleNextSlide}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/80 hover:bg-[#9C2F2F] text-white border border-white/20 flex items-center justify-center transition-all z-20 shadow-lg"
            title="รูปถัดไป (Next Slide)"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Slide Content: 1. Uploaded Image Preview */}
        {hasImageOnCurrentSlide && currentPathStr ? (
          (() => {
            const signedUrl = previewSignedUrls[currentPathStr];
            const directUrl = isDirectUrl(currentPathStr) ? currentPathStr : null;
            const displayUrl = signedUrl || directUrl;
            const isFailed = Boolean(failedImagePaths[currentPathStr]);
            const isPendingUrl = !displayUrl && !isFailed;

            return (
              <div className="relative w-full h-full flex items-center justify-center bg-[#0E0D0C]">
                {isPendingUrl ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#171512] text-[#A89F91]">
                    <Loader2 size={22} className="animate-spin text-[#9C2F2F] mb-1.5" />
                    <span className="text-xs font-medium">กำลังโหลดรูปภาพ #{activeSlideIndex + 1}...</span>
                  </div>
                ) : isFailed || !displayUrl ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#171512] text-[#A89F91] p-4 text-center">
                    <ImageIcon size={28} className="text-[#4A443A] mb-2" />
                    <span className="text-xs text-[#A89F91]">ไม่สามารถแสดงรูปภาพ #{activeSlideIndex + 1}</span>
                  </div>
                ) : (
                  <img
                    src={displayUrl}
                    alt={`Reference Slide ${activeSlideIndex + 1}`}
                    className="w-full h-full object-contain bg-black/40"
                    onError={() => handleImageError(currentPathStr)}
                  />
                )}

                {/* Index Badge */}
                <span className="absolute top-2.5 left-2.5 bg-black/85 text-[10px] font-mono font-bold text-[#ECE4D3] px-2 py-0.5 rounded border border-white/15 shadow-md">
                  Slide {activeSlideIndex + 1} / {maxImages} (รูปภาพ #{activeSlideIndex + 1})
                </span>

                {/* Remove Button (×) */}
                {!disabled && !isUploading && (
                  <button
                    type="button"
                    onClick={() => handleRemove(activeSlideIndex)}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/85 hover:bg-[#9C2F2F] text-white border border-white/20 flex items-center justify-center transition-colors shadow-lg z-10"
                    title="ลบรูปภาพนี้"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            );
          })()
        ) : (
          /* Slide Content: 2. Upload Placeholder Slide */
          <button
            type="button"
            disabled={isUploading || disabled || isLimitReached}
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer bg-[#171512]/60 hover:bg-[#171512] focus:outline-none group"
          >
            <div className="w-12 h-12 rounded-full bg-[#0E0D0C] border border-[#4A443A] group-hover:border-[#9C2F2F] flex items-center justify-center mb-3 transition-colors shadow-md">
              {activePaths.length > 0 ? (
                <Plus size={24} className="text-[#A89F91] group-hover:text-[#9C2F2F] transition-colors" />
              ) : (
                <Upload size={24} className="text-[#A89F91] group-hover:text-[#9C2F2F] transition-colors" />
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#ECE4D3] font-semibold mb-1 group-hover:text-[#9C2F2F] transition-colors">
              {activePaths.length > 0
                ? `คลิกเพื่อเพิ่มรูปภาพอ้างอิง (รูปที่ ${activeSlideIndex + 1})`
                : 'คลิกเพื่อเลือกรูปภาพอ้างอิง'}
            </p>
            <span className="text-[10px] text-[#A89F91] font-light max-w-xs leading-relaxed">
              รองรับ JPG, PNG, WEBP สูงสุด 10 MB
            </span>
          </button>
        )}
      </div>

      {/* Footer Carousel Indicators & Slide Counter (Custom Booking: maxImages > 1) */}
      {maxImages > 1 && (
        <div className="flex items-center justify-between pt-1">
          {/* Dots Indicator (5 slots) */}
          <div className="flex items-center space-x-1.5">
            {Array.from({ length: maxImages }).map((_, idx) => {
              const isSlotFilled = idx < activePaths.length;
              const isCurrentSlide = idx === activeSlideIndex;
              const isClickable = idx < totalSlides;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!isClickable || disabled || isUploading}
                  onClick={() => isClickable && setActiveSlideIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    isCurrentSlide
                      ? 'w-5 bg-studio-red border border-studio-red'
                      : isSlotFilled
                      ? 'w-2 bg-[#A89F91] hover:bg-[#ECE4D3] border border-[#4A443A] cursor-pointer'
                      : isClickable
                      ? 'w-2 bg-[#26221D] hover:bg-[#A89F91] border border-[#4A443A] cursor-pointer'
                      : 'w-2 bg-[#171512] border border-[#332E27] opacity-40 cursor-not-allowed'
                  }`}
                  title={
                    isSlotFilled
                      ? `รูปภาพที่ ${idx + 1}`
                      : idx === activePaths.length
                      ? `เพิ่มรูปภาพที่ ${idx + 1}`
                      : `ช่องอัปโหลดที่ ${idx + 1}`
                  }
                />
              );
            })}
          </div>

          {/* Text Counter Badge */}
          <div className="text-[11px] font-mono font-semibold text-[#ECE4D3] bg-[#171512] px-2.5 py-0.5 rounded border border-[#4A443A]">
            Slide {activeSlideIndex + 1} / {maxImages}
          </div>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="bg-red-950/60 border border-red-800/80 p-2.5 rounded-[4px] flex items-start space-x-2 text-xs text-red-300">
          <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
          <span className="font-medium">{uploadError}</span>
        </div>
      )}
    </div>
  );
}
