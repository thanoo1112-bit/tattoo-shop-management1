'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Loader2, AlertCircle } from 'lucide-react';

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
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn font-prompt select-none cursor-pointer"
      onClick={onClose}
    >
      {/* Prominent Floating Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[10000] p-2.5 bg-black/70 hover:bg-studio-red text-white rounded-full border border-white/20 shadow-2xl transition-all cursor-pointer hover:scale-105"
        aria-label="Close Lightbox"
        title="ปิด (Esc)"
      >
        <X size={22} />
      </button>

      {/* Main Content Area (No Header, No Surrounding Box) */}
      <div
        className="relative w-full h-full flex items-center justify-center cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 text-white py-12">
            <Loader2 size={36} className="animate-spin text-studio-red" />
            <span className="text-xs text-zinc-400 font-light">กำลังโหลดรูปหลักฐานการชำระเงิน...</span>
          </div>
        ) : hasError || !resolvedUrl ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center p-6 bg-zinc-900/95 border border-zinc-800 rounded-2xl max-w-sm shadow-2xl">
            <AlertCircle size={40} className="text-amber-400 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">ไม่สามารถเปิดรูปสลิปหลักฐานได้</h4>
              <p className="text-xs text-zinc-400 leading-relaxed font-light">
                ไม่พบไฟล์รูปภาพสลิป หรือเกิดข้อผิดพลาดในการดึงข้อมูลจากระบบ
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-white rounded-xl border border-zinc-700 font-medium transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        ) : (
          <img
            src={resolvedUrl}
            alt="หลักฐานการชำระเงิน"
            className="max-h-[85vh] sm:max-h-[90vh] max-w-full w-auto h-auto object-contain rounded-lg shadow-2xl transition-transform duration-200"
            decoding="async"
            onError={() => setHasError(true)}
          />
        )}
      </div>
    </div>
  );
}
