'use client';

import React, { useState, useEffect } from 'react';
import { getCustomerReferenceSignedUrl } from '@/lib/utils/storageUploader';
import { Image as ImageIcon, Sparkles, Loader2 } from 'lucide-react';

interface CustomerReferenceImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackSrc?: string;
  onResolvedUrl?: (url: string) => void;
  showSkeleton?: boolean;
}

export default function CustomerReferenceImage({
  src,
  alt = 'Reference Image',
  className = 'w-full h-full object-cover',
  fallbackSrc = '',
  onResolvedUrl,
  showSkeleton = true,
}: CustomerReferenceImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function resolve() {
      if (!src) {
        setResolvedUrl(fallbackSrc || '');
        setLoading(false);
        if (onResolvedUrl) onResolvedUrl(fallbackSrc || '');
        return;
      }

      // If already a full URL or Base64 data URL
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        setResolvedUrl(src);
        setLoading(false);
        if (onResolvedUrl) onResolvedUrl(src);
        return;
      }

      // Object Path in private customer-references bucket -> create signed URL
      setLoading(true);
      setHasError(false);
      try {
        const signedUrl = await getCustomerReferenceSignedUrl(src, 3600);
        if (isMounted) {
          const finalUrl = signedUrl || fallbackSrc || '';
          setResolvedUrl(finalUrl);
          if (!signedUrl) setHasError(true);
          if (onResolvedUrl) onResolvedUrl(finalUrl);
        }
      } catch (err) {
        console.error('[CustomerReferenceImage] Failed to resolve signed URL:', err);
        if (isMounted) {
          setResolvedUrl(fallbackSrc || '');
          setHasError(true);
          if (onResolvedUrl) onResolvedUrl(fallbackSrc || '');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    resolve();

    return () => {
      isMounted = false;
    };
  }, [src, fallbackSrc, onResolvedUrl]);

  if (loading && showSkeleton) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#171512] text-[#7A7265] animate-pulse">
        <Loader2 size={16} className="animate-spin text-[#9C2F2F]" />
      </div>
    );
  }

  // Dark Charcoal Minimal Tattoo Icon Placeholder when no reference image exists
  if (!src || hasError || (!resolvedUrl && !fallbackSrc)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#181614] border border-[#38332E]/60 text-[#8C8275] p-1 text-center select-none rounded-[4px] font-prompt">
        <div className="flex items-center justify-center space-x-1 opacity-70 mb-0.5">
          <Sparkles size={11} className="text-studio-red/80" />
          <ImageIcon size={13} className="text-[#A3998E]" />
        </div>
        <span className="text-[9px] font-medium tracking-tight text-[#8C8275] leading-none">
          {!src ? 'ไม่มีรูปอ้างอิง' : 'ไม่สามารถโหลดรูปภาพอ้างอิง'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl || fallbackSrc}
      alt={alt}
      className={className}
      onError={() => {
        setHasError(true);
      }}
    />
  );
}
