'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import EstimateForm from '@/components/estimate/EstimateForm';
import FlashDesignPicker from '@/components/booking/FlashDesignPicker';
import { useApp } from '@/components/AppContext';

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { supabase, isLoggedIn, authLoading, user } = useApp();

  const artistParam = searchParams.get('artist');
  const artworkParam = searchParams.get('artwork');
  const flashParam = searchParams.get('flash') || searchParams.get('flash_id') || searchParams.get('flash_design_id');

  const [preselectedArtworkImage, setPreselectedArtworkImage] = useState<string | undefined>(undefined);
  const [preselectedStyle, setPreselectedStyle] = useState<string | undefined>(undefined);
  const [preselectedArtistId, setPreselectedArtistId] = useState<string | undefined>(artistParam || undefined);

  // Booking type switcher: default = general (custom) booking; a flash id in the URL opens flash mode.
  const [bookingMode, setBookingMode] = useState<'CUSTOM' | 'FLASH'>(
    flashParam || searchParams.get('mode') === 'flash' ? 'FLASH' : 'CUSTOM'
  );

  useEffect(() => {
    if (flashParam) setBookingMode('FLASH');
  }, [flashParam]);

  // Same URL shape the /flash page already links to (/booking?flash=<id>)
  const clearFlashParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    ['flash', 'flash_id', 'flash_design_id', 'mode'].forEach((k) => params.delete(k));
    const qs = params.toString();
    router.replace(qs ? `/booking?${qs}` : '/booking', { scroll: false });
  };

  const handleSelectMode = (mode: 'CUSTOM' | 'FLASH') => {
    setBookingMode(mode);
    if (mode === 'CUSTOM' && flashParam) clearFlashParams();
  };

  // Mandatory Customer Auth Guard: Redirect unauthenticated users to /login with full return path
  useEffect(() => {
    if (!authLoading) {
      if (!isLoggedIn || !user) {
        const fullPath = typeof window !== 'undefined' 
          ? window.location.pathname + window.location.search
          : '/booking';
        router.replace(`/login?next=${encodeURIComponent(fullPath)}`);
      }
    }
  }, [authLoading, isLoggedIn, user, router]);

  useEffect(() => {
    if (artistParam) {
      setPreselectedArtistId(artistParam);
    }
  }, [artistParam]);

  useEffect(() => {
    if (!artworkParam) return;
    let isMounted = true;
    supabase
      .from('portfolio_artworks')
      .select('id, title, style, image_url, size_label, artist_id')
      .eq('id', artworkParam)
      .single()
      .then(({ data }: any) => {
        if (data && isMounted) {
          setPreselectedArtworkImage(data.image_url);
          if (data.style) setPreselectedStyle(data.style);
          if (data.artist_id) setPreselectedArtistId(data.artist_id);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [artworkParam, supabase]);

  // If loading auth state or unauthenticated, show clean loading spinner while redirecting
  if (authLoading || !isLoggedIn || !user) {
    return (
      <div className="min-h-screen bg-studio-main flex flex-col items-center justify-center font-prompt text-studio-secondary text-xs space-y-3">
        <div className="w-6 h-6 border-2 border-studio-red border-t-transparent rounded-full animate-spin" />
        <p>กำลังตรวจสอบสิทธิ์การเข้าสู่ระบบ...</p>
      </div>
    );
  }

  const typeParam = searchParams.get('type');
  const preselectedType = (typeParam === 'ESTIMATE' || typeParam === 'DIRECT_BOOKING') ? typeParam : 'DIRECT_BOOKING';

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      <CustomerHeader showLogo />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
        <div className="border-b border-studio-border pb-4 mb-4 md:mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="w-full">
            <span className="text-[10px] uppercase tracking-widest text-studio-red-bright font-bold">157 TATTOO STUDIO</span>
            <h1 className="text-xl md:text-3xl font-bold tracking-wider text-studio-primary mt-0.5">
              {bookingMode === 'FLASH'
                ? (flashParam ? 'ส่งคำขอจองแบบลายสัก Flash' : 'เลือกลายสักสำเร็จรูป')
                : 'ส่งคำขอจองคิว'}
            </h1>
            <p className="text-xs text-studio-secondary mt-1 font-light">
              {bookingMode === 'FLASH'
                ? (flashParam
                    ? 'จองแบบลายสักพร้อมสัก ชำระเงินมัดจำ 500 บาทเพื่อยืนยันคำขอจองคิวงาน'
                    : 'เลือกลายสักที่ว่างพร้อมจองจากช่างประจำร้าน แล้วส่งคำขอจองคิวได้ทันที')
                : 'กรอกรายละเอียดงาน เลือกช่างและวันเวลาที่สะดวก เพื่อส่งคำขอให้ร้านตรวจสอบและแจ้งผลผ่าน Customer Portal'}
            </p>

            {/* Booking type selector (compact segmented control, left-aligned under heading) */}
            <div
              role="tablist"
              aria-label="เลือกประเภทการจอง"
              className="mt-3 grid grid-cols-2 gap-1 w-full sm:w-fit bg-studio-card border border-studio-border p-1 rounded-[8px]"
            >
              {([
                { key: 'CUSTOM', label: 'จองสักทั่วไป' },
                { key: 'FLASH', label: 'ลายสักสำเร็จรูป' },
              ] as const).map((opt) => {
                const active = bookingMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectMode(opt.key)}
                    className={`py-2 px-3 sm:w-[240px] rounded-[6px] text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-studio-red text-white shadow'
                        : 'text-studio-secondary hover:text-studio-primary hover:bg-studio-main/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {bookingMode === 'FLASH' && flashParam && (
            <button
              type="button"
              onClick={clearFlashParams}
              className="text-xs text-studio-red-bright hover:underline font-semibold shrink-0 cursor-pointer"
            >
              ← เลือกลายอื่น
            </button>
          )}
        </div>

        {bookingMode === 'FLASH' && !flashParam ? (
          <FlashDesignPicker
            onSelect={(id) => {
              // Reuse the exact entry the /flash page uses for "จองลายนี้": /booking?flash=<id>
              router.push(`/booking?flash=${id}`);
            }}
          />
        ) : (
          <div className="bg-studio-card border border-studio-border p-4 sm:p-6 rounded-[8px] shadow-xl">
            <EstimateForm
              key={bookingMode === 'FLASH' ? `flash-${flashParam}` : 'custom'}
              flashId={bookingMode === 'FLASH' ? (flashParam || undefined) : undefined}
              preselectedArtistId={bookingMode === 'FLASH' ? (artistParam || undefined) : preselectedArtistId}
              preselectedArtworkImage={preselectedArtworkImage}
              preselectedStyle={preselectedStyle}
              preselectedType={preselectedType}
              onSuccess={(requestId) => {
                // EstimateForm handles success UI and navigation to portal
              }}
            />
          </div>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-studio-secondary text-xs">กำลังโหลดระบบส่งคำขอจองคิว...</div>}>
      <BookingContent />
    </Suspense>
  );
}

