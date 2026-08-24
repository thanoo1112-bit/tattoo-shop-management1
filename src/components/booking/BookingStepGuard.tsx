'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookingState } from './BookingStateProvider';
import { calculateTattooEstimate, getLatestPreferredStartTime } from '@/lib/bookingCalculations';
import { Loader2 } from 'lucide-react';

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

    let targetStep = currentStep;

    let newFormData = { ...formData };
    let shouldUpdateFormData = false;

    let currentArtistId = artistId;
    let currentStyleId = styleId;

    // 1. Revalidate artist and style if they exist in URL
    if (artistId && formData.__artistId && artistId !== formData.__artistId) {
      // Artist changed! Reset draft related to artist
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

    const isStep2Complete = 
      isStep1Complete &&
      (newFormData.placement || '').trim() !== '' &&
      (newFormData.widthCm || '').trim() !== '' &&
      (newFormData.heightCm || '').trim() !== '' &&
      (newFormData.description || '').trim() !== '' &&
      Number(newFormData.widthCm) > 0 &&
      Number(newFormData.heightCm) > 0 &&
      isPhotoValid;

    // Step 3 check (Date and Time)
    let isStep3Complete = false;
    let validPreferredTime = false;
    
    if (isStep2Complete && (newFormData.selectedDate || '').trim() !== '' && (newFormData.preferredTime || '').trim() !== '') {
      // Revalidate preferredTime against size category logic
      const { sizeCategory } = calculateTattooEstimate(newFormData.widthCm, newFormData.heightCm);
      const latestStartDecimal = getLatestPreferredStartTime(sizeCategory, 23.5);
      
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
      if (targetStep > 1) {
        const queryParams = new URLSearchParams();
        queryParams.set('step', targetStep.toString());
        if (currentArtistId) queryParams.set('artist', currentArtistId);
        if (currentStyleId) queryParams.set('style', currentStyleId);
        
        redirectUrl += `?${queryParams.toString()}`;
      }
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