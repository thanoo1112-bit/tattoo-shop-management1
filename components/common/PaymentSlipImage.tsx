'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

interface PaymentSlipImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  showSkeleton?: boolean;
}

export default function PaymentSlipImage({
  src,
  alt = 'Payment Slip',
  className = 'w-full h-full object-cover',
  showSkeleton = true,
}: PaymentSlipImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function resolve() {
      if (!src) {
        setResolvedUrl('');
        setLoading(false);
        return;
      }

      // If already a full URL or Data URL
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        setResolvedUrl(src);
        setLoading(false);
        return;
      }

      setLoading(true);
      setHasError(false);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.storage
          .from('booking-payment-slips')
          .createSignedUrl(src, 3600);

        if (isMounted) {
          if (error || !data?.signedUrl) {
            setHasError(true);
            setResolvedUrl('');
          } else {
            setResolvedUrl(data.signedUrl);
          }
        }
      } catch (err) {
        console.error('[PaymentSlipImage] Failed to resolve signed URL:', err);
        if (isMounted) {
          setHasError(true);
          setResolvedUrl('');
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
  }, [src]);

  if (loading && showSkeleton) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#171512] text-[#7A7265] animate-pulse">
        <Loader2 size={16} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (!src || hasError || !resolvedUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#171512] text-[#7A7265] p-1.5 text-center select-none border border-studio-border/40">
        <ImageIcon size={18} className="mb-0.5 opacity-60 text-amber-500/70" />
        <span className="text-[10px] font-sans leading-tight">ไม่สามารถโหลดหลักฐานการชำระเงิน</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      className={className}
      onError={() => {
        setHasError(true);
      }}
    />
  );
}
