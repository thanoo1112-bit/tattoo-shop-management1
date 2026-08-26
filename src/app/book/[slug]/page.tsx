import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import ShopHero from '@/components/booking/ShopHero';
import BookingProgress from '@/components/booking/BookingProgress';
import ArtistSelectionList from '@/components/booking/ArtistSelectionList';
import { BookingErrorState } from '@/components/booking/BookingStates';
import BookingCalendarFlow from '@/components/booking/BookingCalendarFlow';
import BookingDetailsFlow from '@/components/booking/BookingDetailsFlow';
import BookingSuccessState from '@/components/booking/BookingSuccessState';
import { BookingStateProvider } from '@/components/booking/BookingStateProvider';
import BookingSummaryFlow from '@/components/booking/BookingSummaryFlow';
import BookingStepGuard from '@/components/booking/BookingStepGuard';

// Using Supabase directly without Auth
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PublicBookingPage({ params, searchParams }: PageProps) {
  // Await params and searchParams for Next.js App Router conventions
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const flashIdParam = resolvedSearchParams.flash_id as string;
  const holdIdParam = resolvedSearchParams.hold_id as string;

  let flashDesign = null;
  if (flashIdParam) {
    const { data: flashData } = await supabase
      .from('flash_designs')
      .select('*')
      .eq('id', flashIdParam)
      .maybeSingle();
    if (flashData) {
      flashDesign = flashData;
    }
  }
  
  const stepParam = resolvedSearchParams.step as string;
  const artistParam = (flashDesign ? flashDesign.artist_id : resolvedSearchParams.artist) as string;
  const styleParam = (flashDesign ? flashDesign.style_id : resolvedSearchParams.style) as string;
  const timeParam = resolvedSearchParams.time as string;
  const slotParam = resolvedSearchParams.slot as string;

  // Validate step
  let currentStep = parseInt(stepParam || '1', 10);
  if (isNaN(currentStep) || currentStep < 1 || currentStep > 5) {
    currentStep = 1;
  }

  // 1. Fetch Shop
  const { data: shopData, error: shopError } = await supabase.rpc('get_public_shop_by_slug', { p_slug: slug });

  if (shopError || !shopData || shopData.length === 0) {
    console.error('Failed to load shop:', shopError);
    return <BookingErrorState />;
  }

  // Define proper type for shop
  const shop = shopData[0] as { id: string; name: string; slug: string; logo_url: string | null };

  // Step 1: Loading Artists (Always load active artists for shop, needed for validation anyway)
  const { data: artistsDataRaw, error: artistsError } = await supabase.rpc('get_public_artists_by_shop_slug', { p_slug: slug });

  if (artistsError) {
    console.error('Failed to load artists:', artistsError);
    return <BookingErrorState />;
  }

  // Fetch styles for all artists for Step 1
  const artistsData = await Promise.all((artistsDataRaw || []).map(async (artist: any) => {
    const { data: stylesData } = await supabase.rpc('get_public_artist_tattoo_styles', {
      p_shop_slug: slug,
      p_artist_id: artist.artist_id
    });
    return {
      ...artist,
      styles: stylesData || []
    };
  }));

  // 2. Artist Validation (For Step > 1)
  let selectedArtist = null;
  if (currentStep > 1 && currentStep !== 5) {
    if (!artistParam) {
      redirect(`/book/${slug}?step=1`);
    }
    
    selectedArtist = artistsData.find((a: any) => a.artist_id === artistParam);
    if (!selectedArtist) {
      // Invalid artist or no longer active
      redirect(`/book/${slug}?step=1`);
    }
  }

  // 3. Availability Fetching & Date Validation (For Step 3)
  let availability: any[] = [];
  let selectedDateObj = null;
  let artistStyles: any[] = [];
  const dateParam = resolvedSearchParams.date as string;
  
  if (currentStep === 3) {
    const today = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(today);
    const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
    const startDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    const endBkkDate = new Date(y, m, d + 90);
    const endDateStr = `${endBkkDate.getFullYear()}-${String(endBkkDate.getMonth() + 1).padStart(2, '0')}-${String(endBkkDate.getDate()).padStart(2, '0')}`;

    const { data: availabilityData, error: availabilityError } = await supabase.rpc('get_public_daily_availability', {
      p_shop_id: shop.id,
      p_artist_id: selectedArtist!.artist_id,
      p_start_date: startDateStr,
      p_end_date: endDateStr
    });

    if (availabilityError) {
      console.error('Failed to load availability:', availabilityError);
      return (
        <div className="text-center py-20">
          <p className="text-[#A3A3A3] mb-4">ไม่สามารถโหลดตารางเวลาของช่างได้<br/>กรุณาลองใหม่อีกครั้ง</p>
          <button 
            className="px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200"
          >
            <a href={`/book/${slug}?step=1`}>ลองใหม่</a>
          </button>
        </div>
      );
    }
    
    availability = availabilityData || [];
    
    if (selectedArtist && selectedArtist.styles) {
      artistStyles = selectedArtist.styles;
    }
  }

  // Allow Step 4 and 5 to have selectedArtist rehydrated from url if possible
  if ((currentStep === 4 || currentStep === 5) && !selectedArtist && artistParam) {
     selectedArtist = artistsData.find((a: any) => a.artist_id === artistParam);
     if (selectedArtist && selectedArtist.styles) {
       artistStyles = selectedArtist.styles;
     }
  }

  // Fetch color and work types for revalidation in Step Guard
  let artistColorModes: string[] = [];
  let artistWorkTypes: string[] = [];
  
  if (selectedArtist) {
    const [{ data: colorData }, { data: workData }] = await Promise.all([
      supabase.rpc('get_public_artist_color_options', { 
        p_shop_slug: slug, 
        p_artist_id: selectedArtist.artist_id 
      }),
      supabase.rpc('get_public_artist_work_types', { 
        p_shop_slug: slug, 
        p_artist_id: selectedArtist.artist_id 
      })
    ]);
    
    if (colorData) artistColorModes = colorData.map((c: any) => c.value);
    if (workData) artistWorkTypes = workData.map((w: any) => w.value);
  }

  return (
    <BookingStateProvider>
      <BookingStepGuard 
        currentStep={currentStep} 
        shopSlug={slug}
        artistId={artistParam}
        styleId={styleParam}
        artistStyles={artistStyles}
        artistColorModes={artistColorModes}
        artistWorkTypes={artistWorkTypes}
      >
        <div className="w-full relative">
          {/* Booking Page Intro */}
          <div className="pt-6 md:pt-10 pb-6 md:pb-8 text-center md:text-left">
            <span className="text-[10px] md:text-[11px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3 block">
              BOOKING REQUEST
            </span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F5F5F5] mb-4">
              ส่งคำขอจองคิวสัก
            </h1>
            <p className="text-sm md:text-base text-[#A3A3A3] max-w-[600px] leading-relaxed mx-auto md:mx-0">
              กรอกรายละเอียดงานและช่วงเวลาที่คุณสะดวก จากนั้นช่างจะตรวจสอบก่อนยืนยันวัน เวลา ราคา และยอดมัดจำ
            </p>
          </div>

          {/* Progress Indicator */}
          <BookingProgress currentStep={currentStep} />

          {/* Main Content Area */}
          {currentStep === 1 && (
            <ArtistSelectionList 
              artists={artistsData} 
              shopSlug={slug} 
              initialArtistId={artistParam} 
              initialStyleId={styleParam} 
            />
          )}

          {currentStep === 2 && selectedArtist && (
            <BookingDetailsFlow shopSlug={slug} />
          )}

          {currentStep === 3 && selectedArtist && (
            <BookingCalendarFlow 
              artist={selectedArtist} 
              shopSlug={slug} 
              availability={availability} 
            />
          )}

          {currentStep === 4 && selectedArtist && (
            <BookingSummaryFlow 
              artist={selectedArtist}
              shopSlug={slug}
              artistStyles={selectedArtist.styles || []}
              selectedStyleId={styleParam}
            />
          )}

          {currentStep === 5 && (
            <BookingSuccessState shopSlug={slug} />
          )}
        </div>
      </BookingStepGuard>
    </BookingStateProvider>
  );
}
