'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingState } from './BookingStateProvider';
import { calculateTattooEstimate, getLatestPreferredStartTime } from '@/lib/bookingCalculations';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface BookingStepGuardProps {
  children: React.ReactNode;
  currentStep: number;
  shopSlug: string;
  artistId?: string;
  styleId?: string;
  artistStyles?: any[];
  artistColorModes?: string[];
  artistWorkTypes?: string[];
}

export default function BookingStepGuard({ 
  children, 
  currentStep, 
  shopSlug, 
  artistId, 
  styleId,
  artistStyles,
  artistColorModes,
  artistWorkTypes
}: BookingStepGuardProps) {
  const { formData, isHydrated, setFormData, realAreaPhotos, submissionComplete } = useBookingState();

  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;

    // SUCCESS MODE: submission confirmed — bypass all step validation.
    // clearBookingDraft() will empty formData, but the guard must not redirect
    // to step=1 while the success UI is visible. BookingSummaryFlow owns the
    // reset of submissionComplete (via BookingSuccessState's return action).
    if (submissionComplete) {
      setIsReady(true);
      return;
    }

    const loadCustomerData = async () => {
      const supabaseClient = createClient();
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) return;
      const { data: customer } = await supabaseClient
        .from('customers')
        .select('full_name, phone_normalized, email')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (customer) {
        setFormData(prev => {
          if (prev.fullName) return prev;
          return {
            ...prev,
            fullName: customer.full_name,
            phone: customer.phone_normalized,
            email: customer.email || user.email || ''
          };
        });
      }
    };
    loadCustomerData();

    let targetStep = currentStep;

    let newFormData = { ...formData };
    let shouldUpdateFormData = false;

    // Detect Flash booking parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlFlashId = urlParams.get('flash_id');
    const urlHoldId = urlParams.get('hold_id');

     if (!urlFlashId && formData.flashId) {
      setFormData(prev => ({
        ...prev,
        flashId: '',
        holdId: '',
        flashCode: '',
        flashPrice: '',
        flashSize: '',
        flashStyle: '',
        flashVariantId: '',
        flashMinSize: null,
        flashMaxSize: null,
        workType: '',
        colorMode: '',
      }));
      return;
    }

    const urlVariantId = urlParams.get('variant_id');

    if (urlFlashId && (formData.flashId !== urlFlashId || formData.flashVariantId !== (urlVariantId || ''))) {
      setIsReady(false);
      const supabaseClient = createClient();
      
      const executeHoldAndLoad = async () => {
        let holdId = urlHoldId;
        if (!holdId) {
          const generatedId = window.crypto?.randomUUID ? window.crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36));
          const { data: held, error: holdErr } = await supabaseClient.rpc('hold_public_flash', {
            p_flash_id: urlFlashId,
            p_session_id: generatedId
          });
          if (holdErr || !held) {
            alert('ขออภัย ลายสักนี้หมดอายุการจองหรือถูกผู้อื่นเลือกไปแล้ว');
            router.replace(`/shop/${shopSlug}`);
            return;
          }
          holdId = generatedId;
          // Update URL params
          const url = new URL(window.location.href);
          url.searchParams.set('hold_id', holdId);
          window.history.replaceState({}, '', url.toString());
        }

        const [{ data: flash }, { data: variant }] = await Promise.all([
          supabaseClient
            .from('flash_designs')
            .select('*')
            .eq('id', urlFlashId)
            .maybeSingle(),
          urlVariantId
            ? supabaseClient
                .from('flash_design_variants')
                .select('*')
                .eq('id', urlVariantId)
                .eq('flash_design_id', urlFlashId)
                .maybeSingle()
            : Promise.resolve({ data: null })
        ]);

        if (flash) {
          setFormData(prev => ({
            ...prev,
            flashId: urlFlashId,
            flashVariantId: urlVariantId || '',
            holdId: holdId || '',
            flashCode: flash.flash_code,
            flashSize: variant ? variant.size_name : flash.size,
            flashPrice: variant ? variant.price.toString() : flash.price.toString(),
            flashStyle: flash.style_name,
            flashMinSize: variant ? Number(variant.min_size_cm) : null,
            flashMaxSize: variant ? (variant.max_size_cm ? Number(variant.max_size_cm) : null) : null,
            widthCm: '',
            heightCm: '',
            workType: 'new_work',
            colorMode: prev.colorMode || 'black_grey',
            __artistId: flash.artist_id,
            __styleId: flash.style_id
          }));
          setIsReady(true);
        } else {
          alert('ขออภัย ไม่พบลายสักที่เลือกหรือลายสักนี้ถูกลบแล้ว');
          router.replace(`/book/${shopSlug}?step=1`);
        }
      };

      executeHoldAndLoad();
      return;
    }

    let currentArtistId = artistId || formData.__artistId;
    let currentStyleId = styleId || formData.__styleId;

    // 1. Revalidate artist and style if they exist in URL
    if (artistId && formData.__artistId && artistId !== formData.__artistId && !newFormData.flashId) {
      // Artist changed! Reset draft related to artist (only if not a locked Flash flow)
      newFormData = {
        ...newFormData,
        workType: '',
        colorMode: '',
        selectedDate: '',
        preferredTime: '',
        __artistId: artistId,
        __styleId: styleId || ''
      };
      shouldUpdateFormData = true;
    } else if (artistId && !formData.__artistId) {
      newFormData.__artistId = artistId;
      shouldUpdateFormData = true;
    } else if (!artistId && formData.__artistId) {
      currentArtistId = formData.__artistId;
    }

    if (styleId && !formData.__styleId) {
      newFormData.__styleId = styleId;
      shouldUpdateFormData = true;
    } else if (!styleId && formData.__styleId) {
      currentStyleId = formData.__styleId;
    }

    // 2. Validate style against artist specialties
    if (currentStyleId && artistStyles && artistStyles.length > 0) {
      const isValidStyle = artistStyles.some(s => s.style_id === currentStyleId);
      if (!isValidStyle) {
        newFormData.workType = '';
        newFormData.colorMode = '';
        shouldUpdateFormData = true;
      }
    }

    // 3. Validate colorMode
    if (newFormData.colorMode && artistColorModes && artistColorModes.length > 0) {
      if (!artistColorModes.includes(newFormData.colorMode)) {
        newFormData.colorMode = '';
        shouldUpdateFormData = true;
      }
    }

    // 4. Validate workType
    if (newFormData.workType && artistWorkTypes && artistWorkTypes.length > 0) {
      if (!artistWorkTypes.includes(newFormData.workType)) {
        newFormData.workType = '';
        shouldUpdateFormData = true;
      }
    }

    // Step 1 check (Artist, Style, Color, WorkType)
    const isStep1Complete = 
      !!currentArtistId && 
      !!currentStyleId && 
      !!newFormData.colorMode && 
      !!newFormData.workType;

    // Step 2 check (Tattoo Details and Photos if required)
    const requiresRealPhoto = ['extension', 'touch_up', 'cover_up', 'scar_cover'].includes(newFormData.workType);
    const isPhotoValid = requiresRealPhoto ? realAreaPhotos.length >= 1 : true;

    const isDimensionsValid = newFormData.flashId ? true : (
      (newFormData.widthCm || '').trim() !== '' &&
      (newFormData.heightCm || '').trim() !== '' &&
      Number(newFormData.widthCm) > 0 &&
      Number(newFormData.heightCm) > 0
    );

    const isStep2Complete = 
      isStep1Complete &&
      (newFormData.placement || '').trim() !== '' &&
      isDimensionsValid &&
      (newFormData.description || '').trim() !== '' &&
      isPhotoValid;

    // Step 3 check (Date and Time)
    let isStep3Complete = false;
    let validPreferredTime = false;
    
    if (isStep2Complete && (newFormData.selectedDate || '').trim() !== '' && (newFormData.preferredTime || '').trim() !== '') {
      // Revalidate preferredTime against size category logic
      const { sizeCategory } = newFormData.flashId 
        ? { sizeCategory: '' }
        : calculateTattooEstimate(newFormData.widthCm, newFormData.heightCm);
      const latestStartDecimal = getLatestPreferredStartTime(sizeCategory || '', 23.5);
      
      const [hours, minutes] = newFormData.preferredTime.split(':').map(Number);
      const timeDecimal = hours + (minutes / 60);
      
      if (timeDecimal >= 10 && timeDecimal <= latestStartDecimal) {
        validPreferredTime = true;
      }
      
      if (validPreferredTime) {
        isStep3Complete = true;
      } else {
        newFormData.preferredTime = '';
        shouldUpdateFormData = true;
      }
    }

    // Calculate highest allowed step
    let highestAllowedStep = 1;
    if (isStep1Complete) highestAllowedStep = 2;
    if (isStep2Complete) highestAllowedStep = 3;
    if (isStep3Complete) highestAllowedStep = 4;

    // Exception for success step (5)
    if (currentStep === 5) {
      highestAllowedStep = 5;
    }

    if (targetStep > highestAllowedStep) {
      targetStep = highestAllowedStep;
    }

    if (shouldUpdateFormData) {
      setFormData(newFormData);
    }

    // Artist and Style are required in URL for Step 2, 3, and 4
    const urlNeedsParams = targetStep > 1 && (!artistId || !styleId);
    
    if (targetStep !== currentStep || (urlNeedsParams && currentStep !== 5)) {
      let redirectUrl = `/book/${shopSlug}`;
      const queryParams = new URLSearchParams();
      queryParams.set('step', targetStep.toString());
      if (currentArtistId) queryParams.set('artist', currentArtistId);
      if (currentStyleId) queryParams.set('style', currentStyleId);
      
      if (newFormData.flashId) {
        queryParams.set('flash_id', newFormData.flashId);
        if (newFormData.holdId) queryParams.set('hold_id', newFormData.holdId);
        if (newFormData.flashCode) queryParams.set('flash_code', newFormData.flashCode);
        if (newFormData.flashSize) queryParams.set('size', newFormData.flashSize);
        if (newFormData.flashPrice) queryParams.set('price', newFormData.flashPrice);
        if (newFormData.flashVariantId) queryParams.set('variant_id', newFormData.flashVariantId);
      }
      
      redirectUrl += `?${queryParams.toString()}`;
      router.replace(redirectUrl);
    } else {
      setIsReady(true);
    }
    
  }, [isHydrated, currentStep, shopSlug, artistId, styleId, formData, router, artistStyles, setFormData, submissionComplete]);


  if (!isHydrated || !isReady) {
    return (
      <div className="flex justify-center items-center h-[50vh] w-full">
        <Loader2 className="w-8 h-8 text-[#A3A3A3] animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}