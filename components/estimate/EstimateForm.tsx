'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../AppContext';
import ReferenceUploader from './ReferenceUploader';
import TattooSizeInput from './TattooSizeInput';
import PlacementSelector from './PlacementSelector';
import DatePickerPopover from '../booking/DatePickerPopover';
import DualTimePicker from './DualTimePicker';
import CustomerLoginModal from '../auth/CustomerLoginModal';
import { getThailandTodayStr } from '../portal/portalUtils';
import {
  getTattooSizeCategory,
  getTattooDurationInfo,
  isStartTimeAllowedForSize,
  calculateBlockingEndTime,
} from '@/lib/utils/tattooDuration';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  User, 
  Calendar, 
  Image as ImageIcon, 
  Send,
  Clock,
  AlertTriangle,
  Check,
  HeartPulse
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const HOURLY_TIME_OPTIONS = [
  { value: '', label: '-- เลือกเวลา (10:00 - 23:00) --' },
  { value: '10:00', label: '10:00 น.' },
  { value: '11:00', label: '11:00 น.' },
  { value: '12:00', label: '12:00 น.' },
  { value: '13:00', label: '13:00 น.' },
  { value: '14:00', label: '14:00 น.' },
  { value: '15:00', label: '15:00 น.' },
  { value: '16:00', label: '16:00 น.' },
  { value: '17:00', label: '17:00 น.' },
  { value: '18:00', label: '18:00 น.' },
  { value: '19:00', label: '19:00 น.' },
  { value: '20:00', label: '20:00 น.' },
  { value: '21:00', label: '21:00 น.' },
  { value: '22:00', label: '22:00 น.' },
  { value: '23:00', label: '23:00 น.' },
];

export interface EstimateFormInitialData {
  targetId: string;
  artistId?: string | null;
  style?: string | null;
  placement?: string | null;
  width?: number | null;
  height?: number | null;
  sizeTier?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  referenceImages?: string[];
  description?: string | null;
  hasMedicalCondition?: boolean | null;
  medicalConditionNote?: string | null;
  hasAllergy?: boolean | null;
  allergyNote?: string | null;
  workType?: string | null;
  status?: string | null;
}

interface EstimateFormProps {
  mode?: 'create' | 'edit';
  initialData?: EstimateFormInitialData | null;
  initialArtistId?: string;
  preselectedArtistId?: string;
  preselectedArtworkImage?: string;
  preselectedStyle?: string;
  preselectedType?: 'ESTIMATE' | 'DIRECT_BOOKING';
  serviceType?: string | null;
  flashId?: string;
  compact?: boolean;
  onSuccess?: (requestId: string, bookingId?: string) => void;
  onCancel?: () => void;
}

const getArtistSpecialties = (artistObj?: any): string[] => {
  if (!artistObj) return [];
  return Array.isArray(artistObj.specialties) && artistObj.specialties.length > 0
    ? artistObj.specialties.map((s: string) => s.trim()).filter(Boolean)
    : [];
};

export default function EstimateForm({ 
  mode = 'create',
  initialData = null,
  initialArtistId = '', 
  preselectedArtistId,
  preselectedArtworkImage,
  preselectedStyle,
  preselectedType,
  serviceType,
  flashId,
  compact = false,
  onSuccess,
  onCancel,
}: EstimateFormProps) {
  const isEditMode = mode === 'edit';
  const router = useRouter();
  const formTopRef = useRef<HTMLDivElement>(null);

  const { 
    artists, 
    isLoggedIn, 
    isCustomerProfileComplete,
    user,
    supabase,
    addEstimateRequest,
    estimateDraft, 
    setEstimateDraft 
  } = useApp();

  // Flash Design State
  const [flashData, setFlashData] = useState<any | null>(null);
  const [loadingFlash, setLoadingFlash] = useState(!!flashId);
  const [flashError, setFlashError] = useState('');

  // Single-Page Booking Form State
  const [artistId, setArtistId] = useState(preselectedArtistId || initialArtistId || '');
  const [referenceImage, setReferenceImage] = useState(preselectedArtworkImage || '');
  const [referenceImages, setReferenceImages] = useState<string[]>(preselectedArtworkImage ? [preselectedArtworkImage] : []);
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [placement, setPlacement] = useState('');
  const [style, setStyle] = useState(preselectedStyle || '');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('10:00');

  // Work Type (internal, default NEW_TATTOO or original workType in edit mode)
  const workType = isEditMode && initialData && initialData.workType ? initialData.workType : 'NEW_TATTOO';

  // Health Disclosure State
  const [hasMedicalCondition, setHasMedicalCondition] = useState<boolean | null>(() => {
    if (isEditMode && initialData && initialData.hasMedicalCondition !== undefined && initialData.hasMedicalCondition !== null) {
      return Boolean(initialData.hasMedicalCondition);
    }
    return null;
  });

  const [medicalConditionNote, setMedicalConditionNote] = useState<string>(() => {
    if (isEditMode && initialData && initialData.medicalConditionNote) {
      return initialData.medicalConditionNote;
    }
    return '';
  });

  const [hasAllergy, setHasAllergy] = useState<boolean | null>(() => {
    if (isEditMode && initialData && initialData.hasAllergy !== undefined && initialData.hasAllergy !== null) {
      return Boolean(initialData.hasAllergy);
    }
    return null;
  });

  const [allergyNote, setAllergyNote] = useState<string>(() => {
    if (isEditMode && initialData && initialData.allergyNote) {
      return initialData.allergyNote;
    }
    return '';
  });

  // Submission State
  const [submitted, setSubmitted] = useState(false);
  const [isFlashSubmission, setIsFlashSubmission] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollToTop = () => {
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Prefill Data in Edit Mode
  useEffect(() => {
    if (isEditMode && initialData) {
      const currentStatus = (initialData.status || '').toUpperCase();
      if (currentStatus === 'ACCEPTED' || currentStatus === 'WAITING_DEPOSIT') {
        setError('ไม่สามารถแก้ไขคำขอได้หลังจากทางร้านรับคำขอแล้ว');
        return;
      }

      if (initialData.artistId) setArtistId(initialData.artistId);
      if (initialData.style) setStyle(initialData.style);
      if (initialData.placement) setPlacement(initialData.placement);

      let w = initialData.width ? Number(initialData.width) : 10;
      let h = initialData.height ? Number(initialData.height) : 10;
      if (
        (w === 21 && h === 30) ||
        initialData.sizeTier === 'XXL' ||
        initialData.sizeTier === 'size-xxl'
      ) {
        w = 21;
        h = 30;
      }
      setWidth(w);
      setHeight(h);

      if (initialData.preferredDate) setPreferredDate(initialData.preferredDate);
      if (initialData.preferredTime) {
        const hhmm = extractHHMM(initialData.preferredTime);
        setPreferredTime(hhmm || initialData.preferredTime);
      }
      if (initialData.referenceImages && initialData.referenceImages.length > 0) {
        setReferenceImages(initialData.referenceImages);
        setReferenceImage(initialData.referenceImages[0]);
      }
      if (initialData.description) {
        const { cleanNote } = parseNoteWithPreferredTime(initialData.description);
        setDescription(cleanNote || initialData.description);
      }

      // Priority 1: Original Request Health Disclosures
      const hasMedExplicit = initialData.hasMedicalCondition !== undefined && initialData.hasMedicalCondition !== null;
      if (hasMedExplicit) {
        setHasMedicalCondition(Boolean(initialData.hasMedicalCondition));
        setMedicalConditionNote(initialData.medicalConditionNote || '');
      }

      const hasAllergyExplicit = initialData.hasAllergy !== undefined && initialData.hasAllergy !== null;
      if (hasAllergyExplicit) {
        setHasAllergy(Boolean(initialData.hasAllergy));
        setAllergyNote(initialData.allergyNote || '');
      }

      // Priority 2: Fallback to customer history if request data is null/undefined
      if ((!hasMedExplicit || !hasAllergyExplicit) && isLoggedIn && user?.id) {
        supabase
          .from('estimate_requests')
          .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
          .eq('customer_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }: any) => {
            if (!data) return;
            if (!hasMedExplicit && data.has_medical_condition !== undefined && data.has_medical_condition !== null) {
              setHasMedicalCondition(Boolean(data.has_medical_condition));
              setMedicalConditionNote(data.medical_condition_note || '');
            }
            if (!hasAllergyExplicit && data.has_allergy !== undefined && data.has_allergy !== null) {
              setHasAllergy(Boolean(data.has_allergy));
              setAllergyNote(data.allergy_note || '');
            }
          });
      }
    }
  }, [isEditMode, initialData, isLoggedIn, user, supabase]);

  // 1. Load Flash Record if flashId is provided
  useEffect(() => {
    if (!flashId) {
      setFlashData(null);
      setLoadingFlash(false);
      return;
    }
    let isMounted = true;
    setLoadingFlash(true);
    setFlashError('');

    supabase
      .from('flash_designs')
      .select('*, artists(*)')
      .eq('id', flashId)
      .single()
      .then(({ data, error: err }: any) => {
        if (!isMounted) return;
        setLoadingFlash(false);
        if (err || !data) {
          console.error('Error fetching flash design:', err);
          setFlashError('ไม่พบข้อมูลลายสัก Flash ที่ระบุ');
          return;
        }
        setFlashData(data);
        if (data.artist_id) setArtistId(data.artist_id);
        if (data.image_url) {
          setReferenceImage(data.image_url);
          setReferenceImages([data.image_url]);
        }
        if (data.size_cm) {
          const parts = data.size_cm.toLowerCase().split('x').map((p: string) => parseFloat(p.trim())).filter((n: number) => !isNaN(n));
          if (parts.length >= 2) {
            setWidth(parts[0]);
            setHeight(parts[1]);
          } else if (parts.length === 1) {
            setWidth(parts[0]);
            setHeight(parts[0]);
          }
        }
        const flashStyle = (data.style_name || data.style || (data.style_id ? String(data.style_id) : '')).trim();
        if (flashStyle) setStyle(flashStyle);
      });

    return () => {
      isMounted = false;
    };
  }, [flashId, supabase]);

  const flashStyleName = useMemo(() => {
    if (!flashData) return '';
    return String(
      flashData.style_name ||
      flashData.style ||
      (flashData.style_id ? flashData.style_id : '')
    ).trim();
  }, [flashData]);

  // Lock style for Flash bookings
  useEffect(() => {
    if (flashId && flashStyleName) {
      setStyle(flashStyleName);
    }
  }, [flashId, flashStyleName]);

  // Case 1 Check: Artwork or Flash specific booking locking
  const isArtworkOrFlash = Boolean(
    flashId ||
    flashData?.artist_id ||
    preselectedArtworkImage
  );

  const ownerArtistId = useMemo(() => {
    if (flashData?.artist_id) return flashData.artist_id;
    if (preselectedArtworkImage && preselectedArtistId) return preselectedArtistId;
    return undefined;
  }, [flashData, preselectedArtworkImage, preselectedArtistId]);

  const isOwnerArtistLocked = Boolean(isArtworkOrFlash && (ownerArtistId || preselectedArtistId));
  const effectiveOwnerArtistId = ownerArtistId || preselectedArtistId || '';

  // Auto pre-select & lock owner artist
  useEffect(() => {
    if (isOwnerArtistLocked && effectiveOwnerArtistId) {
      setArtistId(effectiveOwnerArtistId);
    } else if (preselectedArtistId) {
      setArtistId(preselectedArtistId);
    }
  }, [isOwnerArtistLocked, effectiveOwnerArtistId, preselectedArtistId]);

  // Compute available styles strictly from the selected artist
  const selectedArtistObj = artists.find((a) => a.id === artistId);
  const availableStyles = useMemo(() => {
    if (!selectedArtistObj) return [];
    return getArtistSpecialties(selectedArtistObj);
  }, [selectedArtistObj]);

  // Derived styles list for display (ensures flashStyleName is included and displayable)
  const displayStyles = useMemo(() => {
    if (flashId && flashStyleName) {
      const baseList = availableStyles.length > 0 
        ? [...availableStyles] 
        : ['Fine Line', 'Black & Grey', 'Realism', 'Minimalist', 'Traditional', 'Darkwork', 'Blackwork', 'Chicano', 'Japanese / Irezumi', 'Color Tattoo', 'Cover Up'];
      if (!baseList.includes(flashStyleName)) {
        baseList.unshift(flashStyleName);
      }
      return Array.from(new Set(baseList));
    }
    return availableStyles;
  }, [flashId, flashStyleName, availableStyles]);

  // Handle Artist Card Selection
  const handleArtistSelect = (id: string) => {
    if (isOwnerArtistLocked && effectiveOwnerArtistId && id !== effectiveOwnerArtistId) return;

    const targetArtistObj = artists.find((a) => a.id === id);
    const targetSpecs = getArtistSpecialties(targetArtistObj);

    setArtistId(id);

    // Clear style if not accepted by newly selected artist
    if (style && targetSpecs.length > 0 && !targetSpecs.includes(style)) {
      setStyle('');
    }

    setError('');
  };

  // Auto-clear style if not supported by current artist
  useEffect(() => {
    if (artistId && style) {
      const currentArt = artists.find((a) => a.id === artistId);
      if (currentArt) {
        const specs = getArtistSpecialties(currentArt);
        if (specs.length > 0 && !specs.includes(style)) {
          setStyle('');
        }
      }
    }
  }, [artistId, artists, style]);

  // 3. Draft restoration for guest users returning from login (create mode only)
  useEffect(() => {
    if (!isEditMode && estimateDraft) {
      if (estimateDraft.artistId) setArtistId(estimateDraft.artistId);
      if (estimateDraft.referenceImage) setReferenceImage(estimateDraft.referenceImage);
      if (estimateDraft.referenceImages && estimateDraft.referenceImages.length > 0) {
        setReferenceImages(estimateDraft.referenceImages);
      }
      if (estimateDraft.width) setWidth(estimateDraft.width);
      if (estimateDraft.height) setHeight(estimateDraft.height);
      if (estimateDraft.placement) setPlacement(estimateDraft.placement);
      if (estimateDraft.style) setStyle(estimateDraft.style);
      if (estimateDraft.description) setDescription(estimateDraft.description);
      if (estimateDraft.preferredDate) setPreferredDate(estimateDraft.preferredDate);
      if (estimateDraft.preferredTime) setPreferredTime(estimateDraft.preferredTime);
      if ((estimateDraft as any).hasMedicalCondition !== undefined) setHasMedicalCondition((estimateDraft as any).hasMedicalCondition);
      if ((estimateDraft as any).medicalConditionNote) setMedicalConditionNote((estimateDraft as any).medicalConditionNote);
      if ((estimateDraft as any).hasAllergy !== undefined) setHasAllergy((estimateDraft as any).hasAllergy);
      if ((estimateDraft as any).allergyNote) setAllergyNote((estimateDraft as any).allergyNote);
      setEstimateDraft(null);
    }
  }, [isEditMode, estimateDraft, setEstimateDraft]);

  // 4. Auto-prefill health disclosures from customer master profile (customers table) with fallback to estimate_requests
  useEffect(() => {
    if (isEditMode || !isLoggedIn || !user?.id) return;
    const userId = user.id;
    let isMounted = true;

    async function prefillHealthMaster() {
      try {
        // Try customers master profile first
        const { data: cust } = await supabase
          .from('customers')
          .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note, medical_conditions, allergies')
          .eq('user_id', userId)
          .maybeSingle();

        if (!isMounted) return;

        let hasFoundCustHealth = false;
        if (cust) {
          if (cust.has_medical_condition !== undefined && cust.has_medical_condition !== null) {
            setHasMedicalCondition(Boolean(cust.has_medical_condition));
            setMedicalConditionNote(cust.medical_condition_note || cust.medical_conditions || '');
            hasFoundCustHealth = true;
          } else if (cust.medical_conditions?.trim()) {
            setHasMedicalCondition(true);
            setMedicalConditionNote(cust.medical_conditions.trim());
            hasFoundCustHealth = true;
          }

          if (cust.has_allergy !== undefined && cust.has_allergy !== null) {
            setHasAllergy(Boolean(cust.has_allergy));
            setAllergyNote(cust.allergy_note || cust.allergies || '');
            hasFoundCustHealth = true;
          } else if (cust.allergies?.trim()) {
            setHasAllergy(true);
            setAllergyNote(cust.allergies.trim());
            hasFoundCustHealth = true;
          }
        }

        // Fallback to estimate_requests if master profile is empty/unrecorded
        if (!hasFoundCustHealth) {
          const { data } = await supabase
            .from('estimate_requests')
            .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
            .eq('customer_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!isMounted || !data) return;
          if (data.has_medical_condition !== undefined && data.has_medical_condition !== null) {
            setHasMedicalCondition(Boolean(data.has_medical_condition));
            setMedicalConditionNote(data.medical_condition_note || '');
          }
          if (data.has_allergy !== undefined && data.has_allergy !== null) {
            setHasAllergy(Boolean(data.has_allergy));
            setAllergyNote(data.allergy_note || '');
          }
        }
      } catch (err) {
        console.error('Error prefilling health disclosures in EstimateForm:', err);
      }
    }

    prefillHealthMaster();

    return () => {
      isMounted = false;
    };
  }, [isEditMode, isLoggedIn, user, supabase]);

  // Save Draft helper for guest users
  const saveDraft = () => {
    setEstimateDraft({
      artistId,
      artistName: artists.find((a) => a.id === artistId)?.name || '',
      referenceImage: referenceImages[0] || referenceImage || '',
      referenceImages: referenceImages.length > 0 ? referenceImages : (referenceImage ? [referenceImage] : []),
      width,
      height,
      placement,
      style,
      work_type: null,
      description,
      preferredDate: preferredDate || undefined,
      preferredTime: preferredTime || undefined,
      hasMedicalCondition,
      medicalConditionNote,
      hasAllergy,
      allergyNote,
    } as any);
  };

  // Validation for all single-page fields before submit
  const validateForm = async (): Promise<boolean> => {
    setError('');

    // 1. Artist Selection
    if (!artistId) {
      setError('กรุณาเลือกช่างสักที่ต้องการ');
      return false;
    }

    // Case 1 Validation: Owner Artist Lock
    if (isOwnerArtistLocked && effectiveOwnerArtistId) {
      if (artistId !== effectiveOwnerArtistId) {
        const ownerArt = artists.find((a) => a.id === effectiveOwnerArtistId);
        const ownerName = ownerArt?.name || 'ช่างเจ้าของผลงาน';
        setError(`ไม่สามารถเลือกช่างท่านอื่นได้ เนื่องจากผลงานนี้จองกับ ${ownerName} เท่านั้น`);
        return false;
      }
    }

    // Case 2 Validation: Style Support Check (for non-flash custom bookings)
    if (artistId && style && !flashId) {
      const selectedArtistObj = artists.find((a) => a.id === artistId);
      const specs = getArtistSpecialties(selectedArtistObj);
      if (specs.length > 0 && !specs.includes(style)) {
        setError(`ช่าง${selectedArtistObj?.name || 'ที่เลือก'} ไม่รับงานสักสไตล์ "${style}" กรุณาเลือกช่างท่านอื่นหรือเปลี่ยนสไตล์งานสัก`);
        return false;
      }
    }

    // 2. Artwork Details
    if (flashId) {
      if (!loadingFlash && !flashStyleName) {
        setError('ลาย Flash นี้ยังไม่ได้กำหนดสไตล์');
        return false;
      }
      if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ' || placement.trim() === 'อื่น ๆ:') {
        setError('กรุณาเลือกตำแหน่งที่ต้องการสักอย่างน้อย 1 ตำแหน่ง');
        return false;
      }
    } else {
      if (!style) {
        setError('กรุณาเลือกสไตล์งานสัก');
        return false;
      }

      if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ' || placement.trim() === 'อื่น ๆ:') {
        setError('กรุณาเลือกตำแหน่งที่ต้องการสักอย่างน้อย 1 ตำแหน่ง');
        return false;
      }

      if (!width || Number(width) <= 0 || !height || Number(height) <= 0) {
        setError('กรุณาเลือกขนาดของงานสัก');
        return false;
      }

      const hasRefImage = Boolean(referenceImage || (referenceImages && referenceImages.length > 0));
      if (!hasRefImage) {
        setError('กรุณาอัปโหลดรูปภาพอ้างอิงอย่างน้อย 1 รูป');
        return false;
      }
    }

    // 3. Preferred Date & Time
    if (!preferredDate) {
      setError('กรุณาเลือกวันที่ต้องการจองคิว');
      return false;
    }

    if (preferredDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return false;
    }

    if (!preferredTime || !preferredTime.trim() || !preferredTime.includes(':')) {
      setError('กรุณาเลือกเวลาที่สะดวก');
      return false;
    }

    const t = preferredTime.trim();
    const [hStr, mStr] = t.split(':');
    const hNum = parseInt(hStr, 10);
    const validMinutes = ['00', '10', '20', '30', '40', '50'];
    if (isNaN(hNum) || hNum < 10 || hNum > 23 || !validMinutes.includes(mStr)) {
      setError('กรุณาเลือกเวลาที่สะดวก');
      return false;
    }

    const sizeCategory = getTattooSizeCategory(initialData?.sizeTier, Number(width), Number(height), description || style);
    if (!sizeCategory && !isEditMode) {
      setError('กรุณาเลือกขนาดงานสักก่อนจึงจะเลือกเวลาและส่งคำขอได้');
      return false;
    }

    const isAllowed = isStartTimeAllowedForSize(
      t,
      initialData?.sizeTier,
      Number(width),
      Number(height),
      description || style
    );
    if (!isAllowed) {
      setError('เวลาเริ่มนัดหมายต้องอยู่ระหว่าง 10:00 น. ถึง 23:00 น.');
      return false;
    }

    // Busy range check against confirmed booking slots (create mode or date changed)
    if (preferredDate && artistId && (!isEditMode || preferredDate !== initialData?.preferredDate)) {
      try {
        const { data: busyCheck } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: artistId,
          p_start_date: preferredDate,
          p_end_date: preferredDate,
        });
        if (Array.isArray(busyCheck) && busyCheck.length > 0) {
          setError('วันที่นี้มีคำขอหรือคิวของช่างที่เลือกอยู่แล้ว กรุณาเลือกวันอื่น');
          return false;
        }
      } catch (err: any) {
        console.warn('Busy check warning:', err);
      }
    }

    // 4. Health Disclosures
    if (hasMedicalCondition && (!medicalConditionNote || !medicalConditionNote.trim())) {
      setError('กรุณาระบุรายละเอียดโรคประจำตัวที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return false;
    }

    if (hasAllergy && (!allergyNote || !allergyNote.trim())) {
      setError('กรุณาระบุรายละเอียดประวัติภูมิแพ้ที่ควรแจ้งช่าง (หรือยกเลิกการเลือก)');
      return false;
    }

    return true;
  };

  // MAIN FORM SUBMIT HANDLER
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const isFormValid = await validateForm();
    if (!isFormValid) {
      scrollToTop();
      return;
    }

    // =========================================================================
    // EDIT MODE SUBMISSION (customer_edit_booking_or_estimate RPC)
    // =========================================================================
    if (isEditMode) {
      if (!isLoggedIn || !user || !initialData?.targetId) {
        setError('ไม่พบข้อมูลคำขอที่ต้องการแก้ไข');
        return;
      }

      const currentStatus = (initialData.status || '').toUpperCase();
      if (currentStatus === 'ACCEPTED' || currentStatus === 'WAITING_DEPOSIT') {
        setError('ไม่สามารถแก้ไขคำขอได้หลังจากทางร้านรับคำขอแล้ว');
        if (onCancel) {
          setTimeout(() => {
            onCancel();
          }, 1500);
        }
        return;
      }

      setLoading(true);

      try {
        const finalRefImages = referenceImages.length > 0 
          ? referenceImages 
          : (referenceImage ? [referenceImage] : []);

        const { error: rpcErr } = await supabase.rpc(
          'customer_edit_booking_or_estimate',
          {
            p_target_id: initialData.targetId,
            p_artist_id: artistId || null,
            p_style: style ? style.trim() : null,
            p_placement: placement ? placement.trim() : null,
            p_width_cm: Number(width) || 10,
            p_height_cm: Number(height) || 10,
            p_preferred_date: preferredDate,
            p_preferred_time: preferredTime.length === 5 ? `${preferredTime}:00` : preferredTime,
            p_reference_images: finalRefImages,
            p_description: description ? description.trim() : null,
            p_has_medical_condition: hasMedicalCondition,
            p_medical_condition_note: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
            p_has_allergy: hasAllergy,
            p_allergy_note: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
            p_work_type: workType || 'NEW_TATTOO',
          }
        );

        if (rpcErr) {
          if (rpcErr.message && rpcErr.message.includes('วันที่เลือกไม่ว่าง')) {
            setError('วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่');
          } else {
            setError(rpcErr.message || 'ไม่สามารถแก้ไขคำขอได้');
          }
          setLoading(false);
          return;
        }

        // If the original item status was REJECTED, invoke customer_resubmit_rejected_request RPC
        if (initialData.status === 'REJECTED') {
          const { error: resubmitErr } = await supabase.rpc('customer_resubmit_rejected_request', {
            p_estimate_request_id: initialData.targetId,
          });

          if (resubmitErr) {
            console.error('Error resubmitting rejected request:', resubmitErr);
            setError(resubmitErr.message || 'ไม่สามารถส่งคำขอใหม่ได้ กรุณาติดต่อร้าน');
            setLoading(false);
            return;
          }
        }

        setSubmitted(true);
        if (onSuccess) onSuccess(initialData.targetId);
      } catch (err: any) {
        console.error('Error submitting edit request:', err);
        setError(err?.message ? `ไม่สามารถแก้ไขคำขอได้ (${err.message})` : 'ไม่สามารถแก้ไขคำขอได้');
      } finally {
        setLoading(false);
      }
      return;
    }

    // =========================================================================
    // FLASH BOOKING SUBMISSION
    // =========================================================================
    if (flashId && flashData) {
      if (flashData.status !== 'AVAILABLE') {
        setError('ลาย Flash นี้ไม่พร้อมสำหรับการจองในขณะนี้ (สถานะ: ' + flashData.status + ')');
        return;
      }

      if (!isLoggedIn || !user) {
        saveDraft();
        setShowLogin(true);
        return;
      }

      setLoading(true);

      try {
        const noteWithPlacement = placement 
          ? `[ตำแหน่ง: ${placement.trim()}] ${description || ''}`.trim()
          : description;

        // Update customer master health profile
        try {
          await supabase
            .from('customers')
            .update({
              has_medical_condition: hasMedicalCondition,
              medical_condition_note: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
              has_allergy: hasAllergy,
              allergy_note: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
              medical_conditions: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
              allergies: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);
        } catch (custErr) {
          console.warn('Could not update customer health master profile directly:', custErr);
        }

        const { data, error: rpcErr } = await supabase.rpc('create_flash_reservation', {
          p_flash_design_id: flashData.id,
          p_requested_date: preferredDate || null,
          p_requested_start_time: preferredTime ? `${preferredTime}:00` : '13:00:00',
          p_customer_note: description || null,
          p_placement: placement ? placement.trim() : null,
          p_width_cm: width || null,
          p_height_cm: height || null,
          p_has_medical_condition: hasMedicalCondition,
          p_medical_condition_note: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
          p_has_allergy: hasAllergy,
          p_allergy_note: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
        });

        if (rpcErr) throw rpcErr;

        const resId = data?.reservation_id || (typeof data === 'string' ? data : flashData.id);
        setNewRequestId(resId);
        setIsFlashSubmission(true);
        setSubmitted(true);
        if (onSuccess) onSuccess(resId);
      } catch (err: any) {
        console.error('Error creating flash reservation:', err);
        setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองลาย Flash กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
      return;
    }

    // =========================================================================
    // ESTIMATE-FIRST CUSTOMER BOOKING SUBMISSION (CREATE MODE)
    // =========================================================================
    if (!isLoggedIn || !user) {
      saveDraft();
      setShowLogin(true);
      return;
    }

    setLoading(true);

    try {
      const finalRefImages = referenceImages.length > 0 
        ? referenceImages 
        : (referenceImage ? [referenceImage] : []);

      // Update customer master health profile on custom estimate creation
      try {
        await supabase
          .from('customers')
          .update({
            has_medical_condition: hasMedicalCondition,
            medical_condition_note: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
            has_allergy: hasAllergy,
            allergy_note: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
            medical_conditions: hasMedicalCondition ? (medicalConditionNote ? medicalConditionNote.trim() : null) : null,
            allergies: hasAllergy ? (allergyNote ? allergyNote.trim() : null) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (custErr) {
        console.warn('Could not update customer health master profile on custom submit:', custErr);
      }

      const reqId = await addEstimateRequest({
        artistId,
        placement: placement.trim(),
        width: Number(width),
        height: Number(height),
        style: style.trim(),
        description: description ? description.trim() : '',
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
        referenceImages: finalRefImages.slice(0, 5),
        hasMedicalCondition,
        medicalConditionNote: hasMedicalCondition ? medicalConditionNote.trim() : undefined,
        hasAllergy,
        allergyNote: hasAllergy ? allergyNote.trim() : undefined,
        work_type: workType || 'NEW_TATTOO',
      } as any);

      setEstimateDraft(null);
      setNewRequestId(reqId);
      setIsFlashSubmission(false);
      setSubmitted(true);

      if (onSuccess) onSuccess(reqId);
    } catch (err: any) {
      console.error('Error submitting customer estimate request:', err);
      setError(err?.message ? `ไม่สามารถส่งคำขอจองคิวได้ กรุณาลองใหม่อีกครั้ง (${err.message})` : 'ไม่สามารถส่งคำขอจองคิวได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // SUBMITTED SUCCESS SCREEN
  // =========================================================================
  if (submitted) {
    if (isEditMode) {
      return (
        <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-1">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-3 py-1 rounded text-[11px] font-semibold">
              สถานะ: รอตรวจสอบ
            </span>
            <h3 className="text-xl font-bold text-studio-primary mt-2">
              {initialData?.status === 'REJECTED' ? 'ส่งคำขอใหม่สำเร็จแล้ว' : 'บันทึกการแก้ไขคำขอสำเร็จแล้ว'}
            </h3>
            <p className="text-xs text-studio-secondary mt-1">
              ระบบได้บันทึกการแก้ไขและส่งคำขอให้ทางร้านตรวจสอบเรียบร้อยแล้ว
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (onSuccess && initialData?.targetId) {
                  onSuccess(initialData.targetId);
                }
              }}
              className="min-h-[44px] bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-8 font-semibold transition-all rounded-[4px] border border-studio-red cursor-pointer shadow-lg"
            >
              ตกลง
            </button>
          </div>
        </div>
      );
    }

    if (isFlashSubmission) {
      const flashArtistName = flashData?.artists?.name || 'ช่างประจำสตูดิโอ';
      return (
        <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt animate-fadeIn">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={28} />
          </div>
          <div className="inline-flex items-center space-x-1.5 bg-emerald-950/50 border border-emerald-800/60 px-3 py-1 rounded text-emerald-300 text-[11px] uppercase font-bold tracking-widest">
            <Sparkles size={12} />
            <span>FLASH RESERVATION SUBMITTED</span>
          </div>
          <h3 className="text-xl font-bold text-studio-primary">ส่งคำขอจองแบบลายสัก Flash สำเร็จแล้ว!</h3>
          
          <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] max-w-md mx-auto text-left space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-studio-border/60">
              <span className="text-studio-muted">รหัสรายการ:</span>
              <strong className="text-studio-primary font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">แบบลายสัก:</span>
              <strong className="text-studio-primary">{flashData?.title}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-studio-muted">ช่างสัก:</span>
              <span className="text-studio-primary">{flashArtistName}</span>
            </div>
          </div>

          <p className="text-xs text-studio-secondary leading-relaxed max-w-md mx-auto font-light">
            ทางร้านได้รับคำขอจองลาย Flash ของคุณเรียบร้อยแล้ว กรุณาตรวจสอบสถานะและขั้นตอนถัดไปใน Customer Portal
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/portal?tab=bookings';
                }
              }}
              className="min-h-[44px] flex-1 bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red flex items-center justify-center cursor-pointer shadow-lg"
            >
              ดูสถานะการจองใน Customer Portal
            </button>
          </div>
        </div>
      );
    }

    // Normal Customer Booking Submission Success Screen (Create Mode)
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-5 font-prompt animate-fadeIn">
        <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-1">
          <CheckCircle2 size={28} />
        </div>
        
        <div>
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-3 py-1 rounded text-[11px] font-semibold">
            สถานะ: รอตรวจสอบ
          </span>
          <h3 className="text-xl font-bold text-studio-primary mt-2">ส่งคำขอจองคิวเรียบร้อยแล้ว</h3>
          <p className="text-xs text-studio-secondary mt-1">
            รหัสคำขอ: <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
          </p>
        </div>

        <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] max-w-md mx-auto text-left space-y-3 text-xs">
          <p className="text-xs text-[#ECE4D3] leading-relaxed">
            ร้านได้รับคำขอของคุณแล้ว กรุณารอทางร้านตรวจสอบรายละเอียด และติดตามผลผ่านหน้า การจองของฉัน
          </p>
          <div className="pt-2 border-t border-[#4A443A]/40 text-[11px] text-amber-300/90 italic">
            * การส่งคำขอนี้ยังไม่ถือเป็นการยืนยันคิว ทางร้านจะตรวจสอบรายละเอียดและแจ้งผลผ่านหน้า ‘การจองของฉัน’
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=estimates';
            }
          }}
          className="min-h-[44px] w-full max-w-md bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red cursor-pointer shadow-lg mx-auto block"
        >
          ดูสถานะคำขอ
        </button>
      </div>
    );
  }

  // Selected Artist Helper
  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div ref={formTopRef} className={`w-full mx-auto space-y-6 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* Notice Banner */}
      <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-[8px] flex items-start space-x-3 shadow-md">
        <Sparkles className="text-studio-red shrink-0 mt-0.5" size={18} />
        <div className="text-xs space-y-1">
          <h3 className="font-bold text-studio-primary">
            {isEditMode ? 'แก้ไขคำขอจองคิว' : 'ประเมินรายละเอียดก่อนจองคิว'}
          </h3>
          <p className="text-studio-secondary font-light">
            {isEditMode
              ? 'ปรับรายละเอียดคำขอของคุณ แล้วบันทึกเพื่อส่งให้ร้านตรวจสอบอีกครั้ง'
              : 'ส่งรายละเอียดงานที่ต้องการ พร้อมขนาด ตำแหน่ง และรูปอ้างอิง ทางร้านจะตรวจสอบและแจ้งราคาประเมินให้คุณก่อนยืนยันการจองคิว'}
          </p>
          {!isEditMode && (
            <p className="text-[11px] text-studio-red font-medium pt-0.5">* ขั้นตอนนี้ยังไม่มีการชำระเงินหรือมัดจำ</p>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400 animate-fadeIn">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Single-Page Form */}
      <form onSubmit={handleSubmit} className="bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-8 shadow-xl">
        
        {/* SECTION 1 — เลือกช่างสัก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <User className="text-studio-red shrink-0" size={18} />
              <span>1. เลือกช่างสักที่ต้องการ <span className="text-studio-red">*</span></span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              เลือกช่างที่คุณต้องการจองคิวรับบริการ
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {artists.map((art) => {
              const specs = getArtistSpecialties(art);
              const specsLabel = specs.length > 0 ? specs.join(' / ') : 'ช่างประจำร้าน';
              const isSelected = artistId === art.id;
              const isDisabled = Boolean(isOwnerArtistLocked && effectiveOwnerArtistId && art.id !== effectiveOwnerArtistId);

              return (
                <button
                  key={art.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) {
                      handleArtistSelect(art.id);
                    }
                  }}
                  className={`p-3.5 rounded-[6px] border text-left flex items-center space-x-3 transition-all min-w-0 ${
                    isDisabled
                      ? 'opacity-40 filter grayscale cursor-not-allowed pointer-events-none bg-studio-main/30 border-studio-border/40'
                      : isSelected 
                      ? 'border-studio-red bg-studio-sec shadow-inner ring-1 ring-studio-red/40 cursor-pointer' 
                      : 'border-studio-border hover:border-studio-border/80 bg-studio-main/60 cursor-pointer'
                  }`}
                >
                  <img src={art.avatar} alt={art.name} className="w-12 h-12 object-cover rounded-full shrink-0 border border-studio-border" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-studio-primary truncate">{art.name}</h4>
                    <p className="text-[10px] text-studio-secondary truncate mt-0.5">{specsLabel}</p>
                  </div>
                  {isSelected && !isDisabled && (
                    <div className="w-5 h-5 bg-studio-red rounded-full flex items-center justify-center text-white shrink-0">
                      <Check size={12} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 2 — รายละเอียดงานสัก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <ImageIcon className="text-studio-red shrink-0" size={18} />
              <span>2. รายละเอียดงานสัก</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              ระบุสไตล์ ตำแหน่ง ขนาด และแนบรูปภาพอ้างอิง
            </p>
          </div>

          {/* 2.1 Style */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              สไตล์งานสัก <span className="text-studio-red">*</span>
            </label>
            {flashId && loadingFlash ? (
              <div className="flex items-center space-x-2 text-xs text-studio-secondary py-2 animate-pulse">
                <Loader2 size={14} className="animate-spin text-studio-red" />
                <span>กำลังโหลดสไตล์ของลาย Flash...</span>
              </div>
            ) : flashId && !flashStyleName ? (
              <div className="bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-[6px] flex items-center space-x-2 text-xs text-amber-300">
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                <span className="font-semibold">ลาย Flash นี้ยังไม่ได้กำหนดสไตล์</span>
              </div>
            ) : !artistId ? (
              <p className="text-xs text-studio-secondary italic py-1">
                * กรุณาเลือกช่างสักก่อนเพื่อเลือกสไตล์งานสัก
              </p>
            ) : displayStyles.length === 0 ? (
              <p className="text-xs text-studio-secondary italic py-1">
                ช่างท่านนี้ยังไม่ได้ระบุสไตล์งานสัก
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {displayStyles.map((st: string) => {
                  const isSelected = style === st;
                  const isDisabled = Boolean(flashId && st !== flashStyleName);

                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          setStyle(st);
                          setError('');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-[4px] text-xs transition-all border ${
                        isSelected
                          ? 'bg-studio-red border-studio-red text-white font-semibold shadow-md cursor-default'
                          : isDisabled
                          ? 'bg-studio-main/30 border-studio-border/30 text-studio-muted opacity-40 filter grayscale cursor-not-allowed pointer-events-none'
                          : 'bg-studio-main border-studio-border text-studio-secondary hover:border-studio-border/80 cursor-pointer'
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2.2 Placement */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span>
            </label>
            <PlacementSelector
              value={placement}
              onChange={(val) => {
                setPlacement(val);
                setError('');
              }}
            />
          </div>

          {/* 2.3 Size Input */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              ขนาดของงานสัก (ราคาประเมินเบื้องต้น) <span className="text-studio-red">*</span>
            </label>
            <TattooSizeInput
              width={width}
              height={height}
              onWidthChange={(w) => {
                setWidth(w);
                setError('');
              }}
              onHeightChange={(h) => {
                setHeight(h);
                setError('');
              }}
            />
          </div>

          {/* 2.4 Reference Image Upload */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1 font-semibold flex items-center gap-1.5">
              <ImageIcon size={14} className="text-studio-red" />
              <span>รูปภาพอ้างอิง <span className="text-studio-red">*</span></span>
            </label>
            <p className="text-[11px] text-studio-secondary/80 mb-2">
              อัปโหลดได้สูงสุด 5 รูป • รูปละไม่เกิน 10 MB
            </p>
            <ReferenceUploader
              values={referenceImages}
              maxImages={5}
              onValuesChange={(imgs) => {
                setReferenceImages(imgs);
                if (imgs.length > 0) setReferenceImage(imgs[0]);
                setError('');
              }}
              onChange={(img) => {
                setReferenceImage(img);
              }}
            />
          </div>

          {/* 2.5 Description */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
              รายละเอียดงานสักเพิ่มเติม
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น รายละเอียดแนวคิด สีที่ต้องการ เรื่องราวของภาพ หรือจุดที่เน้นพิเศษ..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-3 outline-none rounded-[4px] font-prompt leading-relaxed resize-y"
            />
          </div>
        </section>

        {/* SECTION 3 — วันและเวลาที่สะดวก */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <Calendar className="text-studio-red shrink-0" size={18} />
              <span>3. วันและเวลาที่สะดวก</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              เลือกวันที่และเวลาที่สะดวกเข้ารับบริการ
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-3 items-end">
            <div>
              <DatePickerPopover
                value={preferredDate}
                onChange={(dateStr) => {
                  setPreferredDate(dateStr);
                  setError('');
                }}
                artistId={artistId}
                artistWorkingDays={getArtistSpecialties(selectedArtist)}
                label="วันที่ต้องการจองคิว *"
                disabled={!artistId}
                placeholder={!artistId ? 'เลือกช่างสักก่อน' : 'เลือกวันที่ต้องการจองคิว *'}
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1">
                <Clock size={12} className="text-studio-red shrink-0" />
                <span className="truncate">เวลาที่สะดวก <span className="text-studio-red">*</span></span>
              </label>
              <DualTimePicker
                value={preferredTime}
                onChange={(timeStr) => {
                  setPreferredTime(timeStr);
                  setError('');
                }}
              />
            </div>
          </div>
        </section>

        {/* SECTION 4 — ข้อมูลสุขภาพ */}
        <section className="space-y-4">
          <div className="border-b border-studio-border pb-3">
            <h3 className="text-base font-bold text-studio-primary flex items-center gap-2">
              <HeartPulse className="text-studio-red shrink-0" size={18} />
              <span>4. ข้อมูลสุขภาพและการยินยอม</span>
            </h3>
            <p className="text-xs text-studio-secondary mt-0.5">
              กรอกข้อมูลสุขภาพและประวัติการแพ้เพื่อความปลอดภัยของคุณในการรับบริการ
            </p>
          </div>

          <div className="bg-[#171512] border border-[#4A443A] p-5 rounded-[8px] space-y-4 font-prompt">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-xs font-semibold pb-2 border-b border-[#4A443A]/60">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>ข้อระวังทางสุขภาพที่ควรแจ้งช่างสัก</span>
            </div>

            {/* Medical Condition */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                <input
                  type="checkbox"
                  checked={Boolean(hasMedicalCondition)}
                  onChange={(e) => {
                    setHasMedicalCondition(e.target.checked);
                    if (!e.target.checked) setMedicalConditionNote('');
                    setError('');
                  }}
                  className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-[#9C2F2F] bg-[#0E0D0C] w-4 h-4"
                />
                <span>มีโรคประจำตัว หรือสภาวะทางสุขภาพที่ต้องแจ้งช่างสัก</span>
              </label>

              {hasMedicalCondition && (
                <textarea
                  rows={2}
                  value={medicalConditionNote}
                  onChange={(e) => {
                    setMedicalConditionNote(e.target.value);
                    setError('');
                  }}
                  placeholder="เช่น โรคเบาหวาน, ความดันโลหิต, โรคหัวใจ, กำลังรับประทานยาสลายลิ่มเลือด ฯลฯ"
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded font-prompt"
                />
              )}
            </div>

            {/* Allergy History */}
            <div className="space-y-2 pt-2 border-t border-[#4A443A]/40">
              <label className="flex items-center space-x-2 cursor-pointer text-xs text-[#ECE4D3]">
                <input
                  type="checkbox"
                  checked={Boolean(hasAllergy)}
                  onChange={(e) => {
                    setHasAllergy(e.target.checked);
                    if (!e.target.checked) setAllergyNote('');
                    setError('');
                  }}
                  className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-[#9C2F2F] bg-[#0E0D0C] w-4 h-4"
                />
                <span>มีประวัติการแพ้ยา สารเคมี แอลกอฮอล์ หรือน้ำยาทำความสะอาด</span>
              </label>

              {hasAllergy && (
                <textarea
                  rows={2}
                  value={allergyNote}
                  onChange={(e) => {
                    setAllergyNote(e.target.value);
                    setError('');
                  }}
                  placeholder="เช่น แพ้ยาฆ่าเชื้อ, แพ้พลาสเตอร์ยา, แพ้น้ำยาล้างแผล ฯลฯ"
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] p-2.5 outline-none rounded font-prompt"
                />
              )}
            </div>
          </div>
        </section>

        {/* SECTION 5 — ตรวจสอบและส่งคำขอ */}
        <section className="space-y-4 pt-2 border-t border-studio-border">
          {!isEditMode && (
            <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[6px] space-y-2 text-xs text-studio-secondary font-prompt">
              <div className="flex items-center space-x-2 text-amber-400 font-semibold">
                <Sparkles size={16} className="shrink-0" />
                <span>การประเมินราคาและการยืนยันคิวงาน</span>
              </div>
              <p className="leading-relaxed">
                ร้านจะตรวจสอบรายละเอียดงานและแจ้งราคาประเมินให้คุณภายหลังผ่านระบบ Customer Portal (ราคางานจะประเมินจากรายละเอียด ขนาด ความซับซ้อน และรูปอ้างอิง)
              </p>
            </div>
          )}

          <div className="flex justify-end items-center space-x-3 pt-2">
            {isEditMode && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="min-h-[44px] px-6 py-2.5 bg-studio-main border border-studio-border text-studio-secondary hover:text-studio-primary rounded-[4px] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
            )}
            <button
              type="submit"
              disabled={loading || Boolean(flashId && !loadingFlash && !flashStyleName)}
              className="w-full sm:w-auto min-h-[48px] bg-studio-red hover:bg-tattoo-red-dark text-white text-xs uppercase tracking-wider py-3 px-10 font-bold transition-all rounded-[4px] border border-studio-red flex items-center justify-center space-x-2 cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isEditMode ? (
                <span>{initialData?.status === 'REJECTED' ? 'ส่งคำขอใหม่' : 'บันทึกการแก้ไข'}</span>
              ) : (
                <>
                  <Send size={15} />
                  <span>ส่งคำขอประเมินงานสัก</span>
                </>
              )}
            </button>
          </div>
        </section>

      </form>

      {/* Guest Login Modal */}
      {showLogin && (
        <CustomerLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => {
            setShowLogin(false);
          }}
        />
      )}

    </div>
  );
}
