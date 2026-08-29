'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function FlashBookingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isReleasing, setIsReleasing] = useState(false);

  // Extract from URL
  const [flashId, setFlashId] = useState('');
  const [holdId, setHoldId] = useState('');
  const [shopSlug, setShopSlug] = useState('157-tattoo');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathParts = window.location.pathname.split('/');
      // Path pattern: /shop/[slug]/flash/[flashId]/book
      const slugIndex = pathParts.indexOf('shop') + 1;
      const flashIndex = pathParts.indexOf('flash') + 1;
      
      if (slugIndex > 0 && slugIndex < pathParts.length) {
        setShopSlug(pathParts[slugIndex]);
      }
      if (flashIndex > 0 && flashIndex < pathParts.length) {
        setFlashId(pathParts[flashIndex]);
      }
      
      const searchParams = new URLSearchParams(window.location.search);
      setHoldId(searchParams.get('hold_id') || '');
    }
  }, []);

  const handleCancelAndRelease = async () => {
    setIsReleasing(true);
    try {
      if (flashId && holdId) {
        await supabase.rpc('release_public_flash_hold', {
          p_flash_id: flashId,
          p_session_id: holdId
        });
      }
    } catch (err) {
      console.error('Failed to release hold in error page:', err);
    } finally {
      router.replace(`/shop/${shopSlug}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 text-center space-y-6">
        <h2 className="text-xl font-bold tracking-tight text-white uppercase">157 TATTOO</h2>
        <div className="space-y-2">
          <p className="text-sm text-red-400 font-semibold">ไม่สามารถโหลดหน้าจอง Flash ได้</p>
          <p className="text-xs text-[#A3A3A3]">
            เกิดข้อผิดพลาดในการโหลดข้อมูลของแบบสักหรือคิวของช่างสัก กรุณาลองใหม่อีกครั้ง หรือยกเลิกเพื่อกลับหน้าร้านหลัก
          </p>
        </div>
        <div className="pt-4 space-y-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl text-sm hover:bg-neutral-200 active:scale-95 transition-all"
          >
            ลองใหม่
          </button>
          <button
            onClick={handleCancelAndRelease}
            disabled={isReleasing}
            className="w-full py-3 bg-[#171717] border border-[#262626] text-[#A3A3A3] font-medium rounded-xl text-sm hover:text-white hover:bg-[#222] transition-colors"
          >
            {isReleasing ? 'กำลังยกเลิกการจอง...' : 'ยกเลิกการจอง'}
          </button>
        </div>
      </div>
    </main>
  );
}
