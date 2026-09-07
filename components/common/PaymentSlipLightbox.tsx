'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Loader2, Image as ImageIcon } from 'lucide-react';

interface PaymentSlipLightboxProps {
  src?: string | null;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function PaymentSlipLightbox({
  src,
  isOpen,
  onClose,
  title = 'หลักฐานการชำระเงิน',
}: PaymentSlipLightboxProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Keyboard ESC listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Signed URL Resolution Effect
  useEffect(() => {
    if (!isOpen || !src) {
      setResolvedUrl('');
      setLoading(false);
      setHasError(false);
      return;
    }

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
        console.error('[PaymentSlipLightbox] Failed to resolve signed URL:', err);
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
  }, [src, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fadeIn font-prompt"
      onClick={onClose}
    >
      {/* Container - Stop propagation on inner content click */}
      <div
        className="relative max-w-3xl w-full max-h-[92vh] bg-[#1C1A17] border border-[#4A443A] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-[#4A443A]/60 flex items-center justify-between bg-[#171512]">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-2">
            <ImageIcon size={15} />
            <span>{title}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-[#1C1A17] hover:bg-[#9C2F2F] text-[#A89F91] hover:text-white rounded-full transition-colors cursor-pointer"
            aria-label="Close Lightbox"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 flex-1 flex items-center justify-center bg-black/60 overflow-auto min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 text-amber-400 py-12">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-xs text-[#A89F91]">กำลังโหลดรูปสลิป...</span>
            </div>
          ) : hasError || !resolvedUrl ? (
            <div className="flex flex-col items-center justify-center gap-2 text-[#7A7265] py-12 text-center select-none">
              <ImageIcon size={32} className="opacity-50 text-amber-500/70" />
              <span className="text-xs text-amber-400/90 font-medium">ไม่สามารถโหลดรูปสลิปได้</span>
            </div>
          ) : (
            <img
              src={resolvedUrl}
              alt="Payment Slip Lightbox View"
              className="max-h-[80vh] w-auto max-w-full object-contain rounded shadow-lg"
              onError={() => setHasError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
