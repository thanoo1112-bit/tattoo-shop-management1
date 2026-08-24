'use client';
import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';

export interface BookingFormData {
  fullName: string;
  phone: string;
  email: string;
  workType: string;
  placement: string;
  widthCm: string;
  heightCm: string;
  description: string;
  colorMode: string;
  selectedDate: string;
  preferredTime: string;
  __artistId?: string;
  __styleId?: string;
}

interface ImageObject {
  file: File;
  preview: string;
}

interface BookingStateContextType {
  formData: BookingFormData;
  setFormData: React.Dispatch<React.SetStateAction<BookingFormData>>;
  isFirstTattoo: boolean;
  setIsFirstTattoo: React.Dispatch<React.SetStateAction<boolean>>;
  safetyNoticeAcknowledged: boolean;
  setSafetyNoticeAcknowledged: React.Dispatch<React.SetStateAction<boolean>>;
  realAreaPhotos: ImageObject[];
  setRealAreaPhotos: React.Dispatch<React.SetStateAction<ImageObject[]>>;
  designReferencePhotos: ImageObject[];
  setDesignReferencePhotos: React.Dispatch<React.SetStateAction<ImageObject[]>>;
  isHydrated: boolean;
  clearBookingDraft: () => void;
  // Transient success flag — NOT persisted to sessionStorage.
  // Set true after finalize_public_booking succeeds so BookingStepGuard
  // bypasses step-validation redirect while the success UI is shown.
  submissionComplete: boolean;
  setSubmissionComplete: React.Dispatch<React.SetStateAction<boolean>>;
}

const BookingStateContext = createContext<BookingStateContextType | null>(null);

const STORAGE_KEY = '157tattoo_booking_draft';

export function BookingStateProvider({ children }: { children: ReactNode }) {
  const [formData, setFormData] = useState<BookingFormData>({
    fullName: '',
    phone: '',
    email: '',
    workType: '',
    placement: '',
    widthCm: '',
    heightCm: '',
    description: '',
    colorMode: '',
    selectedDate: '',
    preferredTime: ''
  });
  const [isFirstTattoo, setIsFirstTattoo] = useState<boolean>(false);
  const [safetyNoticeAcknowledged, setSafetyNoticeAcknowledged] = useState<boolean>(false);
  const [realAreaPhotos, setRealAreaPhotos] = useState<ImageObject[]>([]);
  const [designReferencePhotos, setDesignReferencePhotos] = useState<ImageObject[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  // Transient success mode — in-memory only, never written to sessionStorage.
  const [submissionComplete, setSubmissionComplete] = useState(false);


  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only merge specific fields to avoid prototype pollution or legacy fields
        setFormData(prev => ({
          ...prev,
          fullName: parsed.fullName || '',
          phone: parsed.phone || '',
          email: parsed.email || '',
          workType: parsed.workType || '',
          placement: parsed.placement || '',
          widthCm: parsed.widthCm || '',
          heightCm: parsed.heightCm || '',
          description: parsed.description || '',
          colorMode: parsed.colorMode || '',
          selectedDate: parsed.selectedDate || '',
          preferredTime: parsed.preferredTime || '',
          // Also persist artist/style metadata to validate if artist changed
          __artistId: parsed.__artistId || '',
          __styleId: parsed.__styleId || ''
        }));
      }
    } catch (e) {
      console.error('Failed to parse booking draft from sessionStorage', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save to sessionStorage when formData changes (only if hydrated)
  useEffect(() => {
    if (isHydrated) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }
  }, [formData, isHydrated]);

  const clearBookingDraft = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      workType: '',
      placement: '',
      widthCm: '',
      heightCm: '',
      description: '',
      colorMode: '',
      selectedDate: '',
      preferredTime: ''
    });
    setIsFirstTattoo(false);
    setSafetyNoticeAcknowledged(false);
    realAreaPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    designReferencePhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setRealAreaPhotos([]);
    setDesignReferencePhotos([]);
  };

  const photosRef = useRef({ real: realAreaPhotos, design: designReferencePhotos });
  useEffect(() => {
    photosRef.current = { real: realAreaPhotos, design: designReferencePhotos };
  }, [realAreaPhotos, designReferencePhotos]);

  useEffect(() => {
    return () => {
      photosRef.current.real.forEach(p => URL.revokeObjectURL(p.preview));
      photosRef.current.design.forEach(p => URL.revokeObjectURL(p.preview));
    };
  }, []);

  return (
    <BookingStateContext.Provider value={{ 
      formData, 
      setFormData, 
      isFirstTattoo,
      setIsFirstTattoo,
      safetyNoticeAcknowledged,
      setSafetyNoticeAcknowledged,
      realAreaPhotos, 
      setRealAreaPhotos,
      designReferencePhotos,
      setDesignReferencePhotos,
      isHydrated, 
      clearBookingDraft,
      submissionComplete,
      setSubmissionComplete
    }}>
      {children}
    </BookingStateContext.Provider>
  );
}

export function useBookingState() {
  const context = useContext(BookingStateContext);
  if (!context) {
    throw new Error('useBookingState must be used within a BookingStateProvider');
  }
  return context;
}

