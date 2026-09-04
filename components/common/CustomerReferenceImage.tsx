'use client';

import React, { useState, useEffect } from 'react';
import { getCustomerReferenceSignedUrl } from '@/lib/utils/storageUploader';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

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
  fallbackSrc = 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500',
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
        setResolvedUrl(fallbackSrc);
        setLoading(false);
        if (onResolvedUrl) onResolvedUrl(fallbackSrc);
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
          const finalUrl = signedUrl || fallbackSrc;
          setResolvedUrl(finalUrl);
          if (!signedUrl) setHasError(true);
          if (onResolvedUrl) onResolvedUrl(finalUrl);
        }
      } catch (err) {
        console.error('[CustomerReferenceImage] Failed to resolve signed URL:', err);
        if (isMounted) {
          setResolvedUrl(fallbackSrc);
          setHasError(true);
          if (onResolvedUrl) onResolvedUrl(fallbackSrc);
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

  if (hasError && !resolvedUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#171512] text-[#7A7265] text-[10px] p-2 text-center">
        <ImageIcon size={16} className="mb-1 block opacity-60" />
        <span>ไม่สามารถโหลดรูปได้</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl || fallbackSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (resolvedUrl !== fallbackSrc) {
          setResolvedUrl(fallbackSrc);
        }
      }}
    />
  );
}
