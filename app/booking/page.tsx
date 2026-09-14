'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import EstimateForm from '@/components/estimate/EstimateForm';
import BookingStepper from '@/components/booking/BookingStepper';
import TattooServiceSelector, { TattooServiceType } from '@/components/booking/TattooServiceSelector';
import { useApp } from '@/components/AppContext';
import { ArrowLeft } from 'lucide-react';

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { supabase, isLoggedIn, authLoading, user } = useApp();

  const artistParam = searchParams.get('artist');
  const artworkParam = searchParams.get('artwork');
  const flashParam = searchParams.get('flash');

  const [preselectedArtworkImage, setPreselectedArtworkImage] = useState<string | undefined>(undefined);
  const [preselectedStyle, setPreselectedStyle] = useState<string | undefined>(undefined);
  const [preselectedArtistId, setPreselectedArtistId] = useState<string | undefined>(artistParam || undefined);

  // STEP 1 State: Default to step 1 unless flashParam or artworkParam is present
  const [currentStep, setCurrentStep] = useState<number>(flashParam || artworkParam ? 2 : 1);
  const [selectedService, setSelectedService] = useState<TattooServiceType | null>(null);

  // 1. Mandatory Customer Auth Guard: Redirect unauthenticated users to /login with full return path
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
      <CustomerHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
        {/* Step Progress Indicator */}
        <BookingStepper currentStep={currentStep} />

        <div className="border-b border-studio-border pb-4 mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">157 TATTOO STUDIO</span>
            <h1 className="text-xl md:text-3xl font-bold tracking-wider text-studio-primary mt-0.5">
              {currentStep === 1 
                ? 'เลือกประเภทงานสัก' 
                : flashParam 
                ? 'ส่งคำขอจองแบบลายสัก Flash' 
                : 'จองคิวสัก'}
            </h1>
            <p className="text-xs text-studio-secondary mt-1 font-light">
              {currentStep === 1
                ? 'เลือกบริการที่ใกล้เคียงกับงานที่คุณต้องการมากที่สุด'
                : flashParam 
                ? 'จองแบบลายสักพร้อมสักราคาคงที่ ระบุวันที่และตำแหน่งที่ต้องการสักเพื่อส่งคำขอจองคิวงาน' 
                : 'กรอกรายละเอียดงาน เลือกวันเวลาที่สะดวก และส่งคำขอจองเพื่อดำเนินการชำระมัดจำในขั้นตอนถัดไป'}
            </p>
          </div>

          {currentStep > 1 && !flashParam && !artworkParam && (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-1.5 text-xs text-studio-secondary hover:text-studio-primary transition-colors py-1 px-3 rounded border border-studio-border bg-studio-sec/50 self-start sm:self-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>เปลี่ยนประเภทงานสัก</span>
            </button>
          )}
        </div>

        <div className="bg-studio-card border border-studio-border p-4 sm:p-6 rounded-[8px] shadow-xl">
          {currentStep === 1 ? (
            <TattooServiceSelector
              selectedService={selectedService}
              onSelectService={setSelectedService}
              onNext={() => setCurrentStep(2)}
            />
          ) : (
            <EstimateForm
              flashId={flashParam || undefined}
              preselectedArtistId={preselectedArtistId}
              preselectedArtworkImage={preselectedArtworkImage}
              preselectedStyle={preselectedStyle}
              preselectedType={preselectedType}
              onSuccess={(requestId) => {
                // EstimateForm handles success UI and navigation to portal
              }}
            />
          )}
        </div>
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
