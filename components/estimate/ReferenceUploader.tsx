'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  X,
  Plus,
  ZoomIn,
} from 'lucide-react';
import { uploadCustomerReference, getCustomerReferenceSignedUrl } from '@/lib/utils/storageUploader';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ReferenceUploaderProps {
  value?: string;          // Legacy single image path or URL
  values?: string[];       // Array of image paths or URLs
  onChange?: (storagePathOrUrl: string) => void;
  onValuesChange?: (pathsOrUrls: string[]) => void;
  maxImages?: number;      // 5 for Custom Tattoo (default), 1 for Flash
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const isDirectUrl = (str: string) =>
  Boolean(
    str &&
      (str.startsWith('http://') ||
        str.startsWith('https://') ||
        str.startsWith('data:') ||
        str.startsWith('blob:'))
  );

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ReferenceUploader({
  value = '',
  values,
  onChange,
  onValuesChange,
  maxImages = 5,
  disabled = false,
}: ReferenceUploaderProps) {
  const [mounted, setMounted]             = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isUploading, setIsUploading]     = useState(false);
  const [uploadError, setUploadError]     = useState<string | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [previewSignedUrls, setPreviewSignedUrls] = useState<Record<string, string>>({});
  const [loadingPreviews, setLoadingPreviews]     = useState(false);
  const [failedImagePaths, setFailedImagePaths]   = useState<Record<string, boolean>>({});

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const dropZoneRef     = useRef<HTMLDivElement>(null);

  // ── Normalize active list ────────────────────────────────────────────────
  const activePaths: string[] = React.useMemo(() => {
    if (Array.isArray(values)) return values.filter(Boolean);
    if (value && value.trim()) return [value.trim()];
    return [];
  }, [values, value]);

  const isLimitReached = activePaths.length >= maxImages;
  const canAddMore     = !isLimitReached && !disabled && !isUploading;

  // ── Resolve signed URLs ──────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function resolveAll() {
      if (activePaths.length === 0) {
        if (isMounted) { setPreviewSignedUrls({}); setLoadingPreviews(false); }
        return;
      }
      setLoadingPreviews(true);
      const urlMap: Record<string, string> = {};
      try {
        await Promise.all(
          activePaths.map(async (pathStr) => {
            if (!pathStr) return;
            if (isDirectUrl(pathStr)) { urlMap[pathStr] = pathStr; return; }
            if (previewSignedUrls[pathStr] && isDirectUrl(previewSignedUrls[pathStr])) {
              urlMap[pathStr] = previewSignedUrls[pathStr];
              return;
            }
            try {
              const signed = await getCustomerReferenceSignedUrl(pathStr, 3600);
              urlMap[pathStr] = signed || '';
            } catch {
              urlMap[pathStr] = '';
            }
          })
        );
        if (isMounted) setPreviewSignedUrls((prev) => ({ ...prev, ...urlMap }));
      } finally {
        if (isMounted) setLoadingPreviews(false);
      }
    }

    resolveAll();
    return () => { isMounted = false; };
  }, [activePaths]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent ────────────────────────────────────────────────────────
  const notifyChange = (newPaths: string[]) => {
    onValuesChange?.(newPaths);
    onChange?.(newPaths[0] || '');
  };

  // ── Process files (shared by input change + drop) ────────────────────────
  const processFiles = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setUploadError(null);

    const remaining = maxImages - activePaths.length;
    const filesToProcess = selectedFiles.slice(0, remaining);

    if (selectedFiles.length > remaining) {
      setUploadError(
        `สามารถเพิ่มได้อีก ${remaining} รูป (สูงสุด ${maxImages} รูป)`
      );
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSizeBytes = 10 * 1024 * 1024;

    for (const file of filesToProcess) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isTypeValid =
        allowedTypes.includes(file.type.toLowerCase()) ||
        ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      if (!isTypeValid) {
        setUploadError('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
        return;
      }
      if (file.size > maxSizeBytes) {
        setUploadError('รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 10 MB');
        return;
      }
    }

    // Instant blob preview
    const blobMap: Record<string, string> = {};
    const newBlobUrls: string[] = [];
    filesToProcess.forEach((file) => {
      const blobUrl = URL.createObjectURL(file);
      blobMap[blobUrl] = blobUrl;
      newBlobUrls.push(blobUrl);
    });

    setIsUploading(true);
    const uploadedPaths: string[] = [];

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file   = filesToProcess[i];
        const blobUrl = newBlobUrls[i];
        const result = await uploadCustomerReference(file);
        uploadedPaths.push(result.path);
        if (blobUrl) {
          setPreviewSignedUrls((prev) => ({ ...prev, [result.path]: blobUrl }));
        }
      }
      notifyChange([...activePaths, ...uploadedPaths]);
    } catch (err: any) {
      setUploadError(err?.message || 'ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [activePaths, maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File input change ─────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files || []));
  };

  // ── Remove ────────────────────────────────────────────────────────────────
  const handleRemove = (indexToRemove: number) => {
    setUploadError(null);
    const updatedList = activePaths.filter((_, idx) => idx !== indexToRemove);
    notifyChange(updatedList);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (lightboxIndex !== null) setLightboxIndex(null);
  };

  // ── Image error ───────────────────────────────────────────────────────────
  const handleImageError = (pathStr: string) => {
    setFailedImagePaths((prev) => ({ ...prev, [pathStr]: true }));
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canAddMore) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canAddMore) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(f.type)
    );
    processFiles(files);
  };

  // ── Lightbox navigation ───────────────────────────────────────────────────
  const openLightbox  = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);

  // ── Resolve display URL for a given path ─────────────────────────────────
  const getDisplayUrl = (pathStr: string) => {
    if (isDirectUrl(pathStr)) return pathStr;
    return previewSignedUrls[pathStr] || '';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex flex-col space-y-3 font-prompt">

      {/* ── Hidden File Input ─────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={maxImages > 1}
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={isUploading || disabled || isLimitReached}
        className="hidden"
      />



      {/* ── Dynamic Compact Grid Layout (Active Thumbnails + Single Upload Card) ──── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-3 w-full">
        {/* Render uploaded image thumbnails */}
        {activePaths.map((pathStr, idx) => {
          const displayUrl = getDisplayUrl(pathStr);
          const isFailed   = Boolean(failedImagePaths[pathStr]);
          const isPending  = !displayUrl && !isFailed;

          return (
            <div
              key={pathStr + idx}
              onClick={() => {
                if (displayUrl && !isFailed) {
                  openLightbox(idx);
                }
              }}
              className="relative w-full h-[85px] sm:h-[95px] rounded-[6px] overflow-hidden border border-[#4A443A] bg-[#0E0D0C] group cursor-pointer hover:border-[#9C2F2F] transition-colors"
            >
              {/* Image / Loading / Error */}
              {isPending || loadingPreviews ? (
                <div className="w-full h-full flex items-center justify-center bg-[#171512]">
                  <Loader2 size={16} className="animate-spin text-[#9C2F2F]" />
                </div>
              ) : isFailed || !displayUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#171512] p-1 text-center">
                  <ImageIcon size={18} className="text-[#4A443A] mb-0.5" />
                  <span className="text-[8px] text-[#A89F91]">โหลดไม่ได้</span>
                </div>
              ) : (
                <img
                  src={displayUrl}
                  alt={`Reference ${idx + 1}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onError={() => handleImageError(pathStr)}
                />
              )}

              {/* Index badge */}
              <span className="absolute bottom-1 left-1 bg-black/80 text-[9px] font-mono text-[#ECE4D3] px-1.5 py-0.5 rounded border border-white/10 pointer-events-none">
                {idx + 1}
              </span>

              {/* Zoom hint on hover */}
              {displayUrl && !isFailed && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all pointer-events-none"
                >
                  <ZoomIn size={18} className="text-white drop-shadow" />
                </div>
              )}

              {/* Remove button (× circle button top-right) */}
              {!disabled && !isUploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-[#9C2F2F] text-white border border-white/20 flex items-center justify-center transition-colors shadow z-10 text-xs font-bold leading-none cursor-pointer"
                  title="ลบรูปนี้"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Single Dynamic Upload Card (Rendered if limit not reached) */}
        {canAddMore && (
          <div
            key="dynamic-upload-card"
            ref={dropZoneRef}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              w-full h-[85px] sm:h-[95px] rounded-[6px] border border-dashed
              flex flex-col items-center justify-center gap-1 p-2
              cursor-pointer select-none transition-all duration-200 text-center group
              ${isDragging
                ? 'border-[#9C2F2F] bg-[#9C2F2F]/10'
                : 'border-[#4A443A] bg-[#0E0D0C] hover:border-[#9C2F2F] hover:bg-[#171512]'
              }
            `}
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="animate-spin text-[#9C2F2F]" />
                <span className="text-[10px] text-[#A89F91]">กำลังอัปโหลด...</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-xs font-semibold text-[#ECE4D3] group-hover:text-white transition-colors">
                  <Plus size={14} className="text-[#9C2F2F]" />
                  <span>เพิ่มรูปภาพ</span>
                </div>
                <span className="text-[9px] text-[#A89F91] group-hover:text-[#ECE4D3] transition-colors leading-tight font-mono">
                  ({activePaths.length}/{maxImages})
                </span>
              </>
            )}
          </div>
        )}
      </div>


      {/* ── Upload Error Banner ──────────────────────────────────────────── */}
      {uploadError && (
        <div className="bg-red-950/60 border border-red-800/80 p-2.5 rounded-[4px] flex items-start space-x-2 text-xs text-red-300">
          <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
          <span className="font-medium">{uploadError}</span>
        </div>
      )}

      {/* ── Customer Reference Lightbox Modal ───────────────────────────── */}
      {lightboxIndex !== null && activePaths[lightboxIndex] && (() => {
        const modalContent = (
          <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn font-prompt"
            onClick={closeLightbox}
          >
            <div
              className="relative flex flex-col items-center max-w-[calc(100vw-24px)] sm:max-w-[90vw] max-h-[calc(100vh-24px)] sm:max-h-[90vh] w-fit h-fit bg-[#0E0D0C] border border-[#4A443A] rounded-[8px] p-2.5 sm:p-3.5 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="ปิดรูปภาพ"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-[#9C2F2F] text-white border border-white/20 flex items-center justify-center transition-colors z-20 cursor-pointer shadow"
              >
                <X size={16} />
              </button>

              {/* Image Preview Container */}
              <div className="relative max-w-[calc(100vw-44px)] sm:max-w-[85vw] max-h-[calc(100vh-140px)] sm:max-h-[78vh] flex items-center justify-center rounded-[6px] overflow-hidden bg-black/40">
                {(() => {
                  const pathStr    = activePaths[lightboxIndex];
                  const displayUrl = getDisplayUrl(pathStr);
                  const isFailed   = Boolean(failedImagePaths[pathStr]);
                  if (!displayUrl || isFailed) {
                    return (
                      <div className="w-48 h-48 flex flex-col items-center justify-center text-[#A89F91]">
                        <ImageIcon size={32} className="mb-2 text-[#4A443A]" />
                        <span className="text-xs">ไม่สามารถโหลดรูปภาพได้</span>
                      </div>
                    );
                  }
                  return (
                    <img
                      src={displayUrl}
                      alt={`Reference ${lightboxIndex + 1}`}
                      className="w-auto h-auto max-w-[calc(100vw-44px)] sm:max-w-[85vw] max-h-[calc(100vh-140px)] sm:max-h-[78vh] object-contain block rounded-[6px]"
                      onError={() => handleImageError(pathStr)}
                    />
                  );
                })()}
              </div>

              {/* Footer Bar: Caption + Delete Button */}
              <div className="flex items-center justify-between w-full pt-2.5 px-1 border-t border-[#4A443A]/40 mt-2 shrink-0">
                <span className="text-[11px] font-mono text-[#ECE4D3]">
                  รูปที่ {lightboxIndex + 1} / {activePaths.length}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const idxToRemove = lightboxIndex;
                      closeLightbox();
                      handleRemove(idxToRemove);
                    }}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors font-medium cursor-pointer"
                  >
                    <X size={12} />
                    <span>ลบรูปนี้</span>
                  </button>
                )}
              </div>

              {/* Dot nav if multiple */}
              {activePaths.length > 1 && (
                <div className="flex gap-1.5 pt-2 justify-center shrink-0">
                  {activePaths.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === lightboxIndex
                          ? 'w-5 bg-[#9C2F2F]'
                          : 'w-1.5 bg-[#4A443A] hover:bg-[#A89F91]'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
        return mounted && typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
      })()}
    </div>
  );
}
