'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { Booking } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { formatTattooSize } from '@/lib/utils/formatters';
import { calculateDurationTextFromTimes } from './calendar/calendarUtils';
import { formatCustomerAgeDisplay, formatCustomerHealthInfo } from '@/lib/customerUtils';
import {
  Search,
  User,
  Users,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  ChevronDown,
  Check,
  FileText,
  X,
  Sparkles,
  ArrowUpDown,
  Phone,
  Mail,
  History,
  Image as ImageIcon,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Shield,
  ZoomIn,
  Eye,
} from 'lucide-react';

interface CustomerRecord {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  isActive?: boolean;
  dateOfBirth?: string | null;
  medicalConditions?: string | null;
  allergies?: string | null;
  eligibilityConfirmedAt?: string | null;
  bookings: Booking[];
  estimates: EstimateRequest[];
  confirmedCount: number;  // CONFIRMED + IN_PROGRESS (งานที่ยืนยันและกำลังดำเนินการ)
  completedCount: number;  // COMPLETED เท่านั้น (ปิดงานแล้ว)
  activeBookings: Booking[];
  completedBookings: Booking[];
  totalSpent: number;
  lastArtistName: string;
  lastArtworkTitle: string;
  lastDate: string;
  nextAppointment: Booking | null;
  statusCategory: 'HAS_NEXT' | 'HAS_PENDING' | 'NO_APPOINTMENT';
}

interface CustomerArchiveReferenceGalleryProps {
  images?: string[];
  singleFallback?: string;
  onOpenLightbox: (images: string[], index: number) => void;
}

function CustomerArchiveReferenceGallery({
  images = [],
  singleFallback = '',
  onOpenLightbox,
}: CustomerArchiveReferenceGalleryProps) {
  const activeImages = useMemo(() => {
    if (Array.isArray(images) && images.length > 0) {
      return images.filter(Boolean);
    }
    if (singleFallback && singleFallback.trim()) {
      return [singleFallback.trim()];
    }
    return [];
  }, [images, singleFallback]);

  if (activeImages.length === 0) {
    return (
      <div className="pt-2 border-t border-[#4A443A]/30">
        <span className="text-[10px] text-[#7A7265] italic bg-[#171512] border border-[#38332E] px-2.5 py-1 rounded-[4px] inline-flex items-center gap-1.5 font-prompt">
          <Sparkles size={11} className="text-[#9C2F2F]/80" />
          <span>ไม่มีรูปอ้างอิง</span>
        </span>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-[#4A443A]/30 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
          รูปภาพอ้างอิง ({activeImages.length} รูป):
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 max-w-full">
        {activeImages.slice(0, 5).map((imgSrc, idx) => (
          <div
            key={imgSrc + '-' + idx}
            onClick={() => onOpenLightbox(activeImages, idx)}
            className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-[6px] border border-[#4A443A] hover:border-[#9C2F2F] bg-[#171512] overflow-hidden shrink-0 cursor-pointer group shadow-sm transition-all"
            title={`คลิกเพื่อดูรูปที่ ${idx + 1}`}
          >
            <CustomerReferenceImage
              src={imgSrc}
              alt={`Reference Image ${idx + 1}`}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ZoomIn size={16} className="text-white" />
            </div>
            <span className="absolute bottom-1 left-1 bg-black/80 text-[9px] font-mono text-[#ECE4D3] px-1 py-0.2 rounded border border-white/10 select-none">
              #{idx + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerAvatar({
  name,
  sizeClass = "w-9 h-9",
  textClass = "text-xs"
}: {
  avatar?: string;
  name: string;
  sizeClass?: string;
  textClass?: string;
}) {
  const initials = name && name.trim() ? name.trim().charAt(0).toUpperCase() : 'C';

  return (
    <div className={`${sizeClass} rounded-full bg-[#171512] border border-[#4A443A] flex items-center justify-center font-bold ${textClass} text-[#ECE4D3] shrink-0`}>
      {initials}
    </div>
  );
}

export default function AdminCustomerArchive() {
  const { bookings: appBookings, estimateRequests: appEstimates, artists: appArtists, supabase } = useApp();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'latest' | 'alphabetical'>('latest');

  // Custom Dropdowns
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Active Drawer State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'requests' | 'active' | 'tattoos'>('overview');

  // Lightbox Zoom Gallery State
  const [lightboxGallery, setLightboxGallery] = useState<{ images: string[]; index: number } | null>(null);

  // Direct Supabase Hydration State
  const [masterCustomers, setMasterCustomers] = useState<{
    id: string;
    user_id: string;
    display_name: string;
    email: string;
    phone: string;
    avatar_url?: string;
    is_active: boolean;
    date_of_birth?: string | null;
    eligibility_confirmed_at?: string | null;
  }[]>([]);
  const [fetchedBookings, setFetchedBookings] = useState<Booking[]>([]);
  const [fetchedEstimates, setFetchedEstimates] = useState<EstimateRequest[]>([]);
  const [approvedSubmissions, setApprovedSubmissions] = useState<any[]>([]);
  const [recordedPayments, setRecordedPayments] = useState<any[]>([]);
  const [flashReservations, setFlashReservations] = useState<any[]>([]);
  const [flashDesigns, setFlashDesigns] = useState<any[]>([]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        artistDropdownRef.current &&
        !artistDropdownRef.current.contains(event.target as Node)
      ) {
        setIsArtistDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hydrate Master Data from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadMasterData() {
      if (!supabase) return;
      try {
        // 1. Customers, Profiles & Artists
        const { data: custs } = await supabase
          .from('customers')
          .select('id, user_id, display_name, email, phone, avatar_url, date_of_birth, eligibility_confirmed_at');

        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, email, phone, role, is_active');

        const { data: aData } = await supabase.from('artists').select('*');

        // Exclude staff & artist accounts
        const staffUserIds = new Set<string>();
        profs?.forEach((p: any) => {
          if (p.role === 'admin' || p.role === 'artist') {
            if (p.user_id) staffUserIds.add(p.user_id);
          }
        });
        aData?.forEach((a: any) => {
          if (a.user_id) staffUserIds.add(a.user_id);
        });

        let joinedCusts: any[] = [];
        if (custs) {
          joinedCusts = custs
            .filter((c: any) => !c.user_id || !staffUserIds.has(c.user_id))
            .map((c: any) => {
              const p = profs?.find((pr: any) => pr.user_id === c.user_id);
              return {
                id: c.id,
                user_id: c.user_id,
                display_name: c.display_name || p?.display_name || 'ลูกค้าประจำ',
                email: c.email || p?.email || '-',
                phone: c.phone || p?.phone || '-',
                avatar_url: c.avatar_url || undefined,
                is_active: p?.is_active ?? true,
                date_of_birth: c.date_of_birth || null,
                eligibility_confirmed_at: c.eligibility_confirmed_at || c.profile_completed_at || null,
              };
            });
        }

        if (profs) {
          profs
            .filter((p: any) => p.role === 'customer' && (!p.user_id || !staffUserIds.has(p.user_id)))
            .forEach((p: any) => {
              if (!joinedCusts.some((jc) => jc.user_id === p.user_id)) {
                joinedCusts.push({
                  id: `prof-${p.user_id}`,
                  user_id: p.user_id,
                  display_name: p.display_name || 'ลูกค้าประจำ',
                  email: p.email || '-',
                  phone: p.phone || '-',
                  avatar_url: undefined,
                  is_active: p.is_active ?? true,
                  date_of_birth: null,
                });
              }
            });
        }

        if (isMounted) {
          setMasterCustomers(joinedCusts);
        }

        // 2. Fetch Estimates for joining (including health disclosure fields)
        const { data: eData } = await supabase.from('estimate_requests').select('id, customer_id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note');

        // Map estimates
        if (eData && isMounted) {
          const mappedEstimates: EstimateRequest[] = eData.map((e: any) => {
            const matchedCust = joinedCusts.find((mc) => (e.customer_id && mc.id === e.customer_id) || (e.customer_user_id && mc.user_id === e.customer_user_id));
            return {
              id: e.id,
              customerId: e.customer_id,
              customerUserId: e.customer_user_id,
              customerName: matchedCust?.display_name || 'ลูกค้า',
              customerEmail: matchedCust?.email || '',
              customerPhone: matchedCust?.phone || '',
              artistId: e.artist_id,
              artistName: e.artist_name || 'ช่างประจำร้าน',
              style: e.style || 'Custom',
              width: e.width_cm || e.width || 0,
              height: e.height_cm || e.height || 0,
              placement: e.placement || 'ตามตกลง',
              referenceImage: e.reference_images?.[0] || e.reference_image_url || undefined,
              referenceImages: e.reference_images && Array.isArray(e.reference_images) && e.reference_images.length > 0
                ? e.reference_images
                : (e.reference_images?.[0] || e.reference_image_url ? [e.reference_images?.[0] || e.reference_image_url] : []),
              status: e.status,
              quotedPrice: e.quoted_price,
              quotedDeposit: e.deposit_required || e.quoted_deposit,
              submittedDate: e.created_at ? e.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
              has_medical_condition: e.has_medical_condition,
              medical_condition_note: e.medical_condition_note,
              has_allergy: e.has_allergy,
              allergy_note: e.allergy_note,
              hasMedicalCondition: Boolean(e.has_medical_condition),
              medicalConditionNote: e.medical_condition_note || null,
              hasAllergy: Boolean(e.has_allergy),
              allergyNote: e.allergy_note || null,
            } as any;
          });
          setFetchedEstimates(mappedEstimates);
        }

        // 3. Direct Bookings (Valid Column Query)
        const { data: bData, error: errB } = await supabase
          .from('bookings')
          .select('*, booking_sessions(*), flash_reservation_id');


        if (bData && isMounted) {
          const mappedBookings: Booking[] = bData.map((b: any) => {
            const matchedCust = joinedCusts.find((mc) => (b.customer_id && mc.id === b.customer_id) || (b.customer_user_id && mc.user_id === b.customer_user_id));
            const est = eData?.find((e: any) => e.id === b.estimate_request_id);
            const art = aData?.find((a: any) => a.id === b.artist_id);
            const firstSession = b.booking_sessions && b.booking_sessions.length > 0
              ? b.booking_sessions[0]
              : null;

            return {
              id: b.id,
              bookingNumber: b.id.slice(0, 8),
              customerId: b.customer_id,
              customerUserId: b.customer_user_id,
              customerName: matchedCust?.display_name || 'ลูกค้า',
              customerEmail: matchedCust?.email || '',
              customerPhone: matchedCust?.phone || '',
              artistId: b.artist_id || '',
              artistName: art?.name || art?.nickname || 'ช่างสักประจำร้าน',
              artworkTitle: est ? `งานสไตล์ ${est.style}` : 'Custom Tattoo',
              artworkImage: est?.reference_images?.[0] || b.reference_images?.[0] || undefined,
              referenceImages: est?.reference_images && Array.isArray(est.reference_images) && est.reference_images.length > 0
                ? est.reference_images
                : (b.reference_images && Array.isArray(b.reference_images) && b.reference_images.length > 0
                  ? b.reference_images
                  : (est?.reference_images?.[0] || b.reference_images?.[0] || b.artwork_image_url ? [est?.reference_images?.[0] || b.reference_images?.[0] || b.artwork_image_url] : [])),
              placement: b.placement || est?.placement || 'ตามตกลง',
              width_cm: b.width_cm ?? est?.width_cm ?? est?.width ?? null,
              height_cm: b.height_cm ?? est?.height_cm ?? est?.height ?? null,
              date: b.requested_date || (firstSession?.start_at ? firstSession.start_at.split('T')[0] : new Date().toISOString().split('T')[0]),
              startTime: b.requested_start_time ? b.requested_start_time.slice(0, 5) : '13:00',
              endTime: '17:00',
              duration: 4,
              status: b.status as Booking['status'],
              price: est?.quoted_price || 0,
              deposit: est?.deposit_required || 0,
              depositPaid: (est?.deposit_required || 0) > 0,
              sessions: b.booking_sessions || [],
              approved_at: b.approved_at,
              approvedAt: b.approved_at,
              artist_id: b.artist_id,
              flash_reservation_id: b.flash_reservation_id || null,
              estimate_request_id: b.estimate_request_id || null,
            } as any;
          });
          setFetchedBookings(mappedBookings);
        }

        // 4. Approved Payment Submissions & Recorded Payments for Archive Membership
        const { data: appSubs } = await supabase
          .from('booking_payment_submissions')
          .select('id, booking_id, customer_user_id, status')
          .eq('status', 'APPROVED');

        const { data: recPays } = await supabase
          .from('booking_payments')
          .select('id, booking_id, amount, status')
          .neq('status', 'VOIDED');

        if (isMounted) {
          if (appSubs) setApprovedSubmissions(appSubs);
          if (recPays) setRecordedPayments(recPays);
        }

        // 5. Flash Reservations & Designs (Admin has broader RLS access)
        const { data: flashResData } = await supabase
          .from('flash_reservations')
          .select('*');

        const { data: flashDesData } = await supabase
          .from('flash_designs')
          .select('*');

        if (isMounted) {
          if (flashResData) setFlashReservations(flashResData);
          if (flashDesData) setFlashDesigns(flashDesData);
        }
      } catch (err) {
        console.error('Error hydrating customer archive:', err);
      }
    }
    loadMasterData();

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['customers', 'profiles', 'bookings', 'estimate_requests', 'booking_payment_submissions', 'booking_payments'].includes(detail?.table)) {
        loadMasterData();
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);

    return () => {
      isMounted = false;
      window.removeEventListener('admin:realtime', handleRealtime);
    };
  }, [supabase]);

  // Combine AppContext data and Direct Supabase fetched data
  const combinedBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    appBookings.forEach((b) => map.set(b.id, b));
    fetchedBookings.forEach((b) => map.set(b.id, b));
    return Array.from(map.values());
  }, [appBookings, fetchedBookings]);

  const combinedEstimates = useMemo(() => {
    const map = new Map<string, EstimateRequest>();
    appEstimates.forEach((e) => map.set(e.id, e));
    fetchedEstimates.forEach((e) => map.set(e.id, e));
    return Array.from(map.values());
  }, [appEstimates, fetchedEstimates]);

  // Compile CANONICAL Customer Records with robust Resolution Logic
  const customerRecords: CustomerRecord[] = useMemo(() => {
    interface CustomerHolder {
      id: string;
      userId?: string;
      name: string;
      email: string;
      phone: string;
      avatar?: string;
      isActive?: boolean;
      dateOfBirth?: string | null;
      eligibilityConfirmedAt?: string | null;
      bookings: Booking[];
      estimates: EstimateRequest[];
    }

    const holders: CustomerHolder[] = [];

    // Helper: resolve flash booking details from bookings.flash_reservation_id → flash_reservations.id → flash_designs
    const getFlashDetails = (booking: any) => {
      // bookings.flash_reservation_id → flash_reservations.id
      const flashResId = booking?.flash_reservation_id;
      if (!flashResId) return null;
      const fr = flashReservations.find((r: any) => r.id === flashResId);
      if (!fr) return null;
      const fd = flashDesigns.find((d: any) => d.id === fr.flash_design_id);
      return {
        title: fd?.title || fr?.flash_design_title || null,
        style: fd?.style || 'Flash',
        placement: fd?.placement || fr?.placement || null,
        widthCm: fd?.width_cm ?? fr?.width_cm ?? null,
        heightCm: fd?.height_cm ?? fr?.height_cm ?? null,
        imageUrl: fd?.image_url || fr?.flash_design_image_url || null,
        deposit: fd?.deposit_required ?? fd?.deposit_amount ?? fr?.deposit_required ?? 500,
        reservationId: fr.id,
        designId: fd?.id || fr.flash_design_id,
      };
    };

    // 1. Seed from Master Customers
    masterCustomers.forEach((mc) => {
      holders.push({
        id: mc.id,
        userId: mc.user_id,
        name: mc.display_name,
        email: mc.email !== '-' ? mc.email : '',
        phone: mc.phone !== '-' ? mc.phone : '',
        avatar: mc.avatar_url,
        isActive: mc.is_active,
        dateOfBirth: mc.date_of_birth,
        eligibilityConfirmedAt: mc.eligibility_confirmed_at,
        bookings: [],
        estimates: [],
      });
    });

    // Helper: Find matching customer holder by userId -> email -> phone -> name
    const findHolder = (userId?: string, email?: string, phone?: string, name?: string) => {
      if (userId) {
        const h = holders.find((item) => item.userId === userId);
        if (h) return h;
      }
      if (email && email !== '-' && email.trim() !== '') {
        const cleanEmail = email.trim().toLowerCase();
        const h = holders.find((item) => item.email.trim().toLowerCase() === cleanEmail);
        if (h) return h;
      }
      if (phone && phone !== '-' && phone.trim() !== '') {
        const cleanPhone = phone.trim();
        const h = holders.find((item) => item.phone.trim() === cleanPhone);
        if (h) return h;
      }
      if (name && name !== 'ลูกค้า' && name !== 'ลูกค้าประจำ' && name.trim() !== '') {
        const cleanName = name.trim().toLowerCase();
        const h = holders.find((item) => item.name.trim().toLowerCase() === cleanName);
        if (h) return h;
      }
      return null;
    };

    // 2. Associate Bookings to Holders
    combinedBookings.forEach((b: any) => {
      const uId = b.customerUserId || b.customer_user_id || b.customer_id;
      const email = b.customerEmail || b.customer_email;
      const phone = b.customerPhone || b.customer_phone;
      const name = b.customerName || b.customer_name;

      let target = findHolder(uId, email, phone, name);

      if (!target) {
        if (email || phone || (name && name !== 'ลูกค้า' && name !== 'ลูกค้าประจำ')) {
          target = {
            id: `cust-fallback-${uId || email || name}`,
            userId: uId,
            name: name || 'ลูกค้า',
            email: email || '-',
            phone: phone || '-',
            bookings: [],
            estimates: [],
          };
          holders.push(target);
        } else if (holders.length > 0) {
          target = holders[0];
        }
      }

      if (target) {
        if (!target.bookings.some((existing) => existing.id === b.id)) {
          target.bookings.push(b);
        }
      }
    });

    // 3. Associate Estimate Requests to Holders
    combinedEstimates.forEach((e: any) => {
      const uId = e.customerUserId || e.customer_user_id;
      const email = e.customerEmail || e.customer_email;
      const phone = e.customerPhone || e.customer_phone;
      const name = e.customerName || e.customer_name;

      let target = findHolder(uId, email, phone, name);

      if (!target) {
        if (email || phone || (name && name !== 'ลูกค้า' && name !== 'ลูกค้าประจำ')) {
          target = {
            id: `cust-fallback-est-${uId || email || name}`,
            userId: uId,
            name: name || 'ลูกค้า',
            email: email || '-',
            phone: phone || '-',
            bookings: [],
            estimates: [],
          };
          holders.push(target);
        } else if (holders.length > 0) {
          target = holders[0];
        }
      }

      if (target) {
        if (!target.estimates.some((existing) => existing.id === e.id)) {
          target.estimates.push(e);
        }
      }
    });

    // Convert holders into CustomerRecord objects
    const records: CustomerRecord[] = [];

    holders.forEach((h) => {
      // Enrich Flash and Custom bookings with real flash details, approved deposit amounts, and actual recorded payments sum
      const enrichedBookings = [...h.bookings].map((b: any) => {
        const flash = getFlashDetails(b);

        // Check real recorded payment / approved submission for this booking ID
        const bookingPayment = recordedPayments.find(
          (p: any) => p.booking_id === b.id && (p.status || '').toUpperCase() !== 'VOIDED'
        );
        const approvedSub = approvedSubmissions.find(
          (s: any) => s.booking_id === b.id && (s.status || '').toUpperCase() === 'APPROVED'
        );
        const realDeposit = bookingPayment?.amount ?? (approvedSub ? (b.deposit || flash?.deposit || 500) : (b.deposit || (flash?.deposit ?? (b.status === 'CONFIRMED' ? 500 : 0))));

        // Total recorded payments sum for this specific booking ID
        const bRecordedPayments = recordedPayments.filter(
          (p: any) => p.booking_id === b.id && String(p.status || '').toUpperCase() === 'RECORDED'
        );
        const actualPaidSum = bRecordedPayments.reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0
        );

        if (!flash) {
          const est = combinedEstimates.find(
            (e: any) => e.id === b.estimate_request_id || e.id === b.id
          );
          return {
            ...b,
            placement: (b as any).placement || (est as any)?.placement || 'ตามตกลง',
            width_cm: (b as any).width_cm ?? (est as any)?.width_cm ?? est?.width ?? null,
            height_cm: (b as any).height_cm ?? (est as any)?.height_cm ?? est?.height ?? null,
            deposit: realDeposit,
            depositPaid: realDeposit > 0,
            actualPaidSum,
          };
        }

        const titleText = flash.title
          ? (flash.title.startsWith('ลาย Flash:') ? flash.title : `ลาย Flash: ${flash.title}`)
          : b.artworkTitle;

        return {
          ...b,
          artworkTitle: titleText,
          artworkImage: flash.imageUrl || b.artworkImage,
          referenceImages: flash.imageUrl ? [flash.imageUrl] : b.referenceImages,
          placement: flash.placement || b.placement || 'หน้าอก',
          width_cm: flash.widthCm ?? b.width_cm ?? 10,
          height_cm: flash.heightCm ?? b.height_cm ?? 15,
          deposit: realDeposit,
          depositPaid: realDeposit > 0,
          actualPaidSum,
          flashReservationId: flash.reservationId,
          flashDesignId: flash.designId,
          _flashStyle: flash.style,
          _isFlash: true,
        };
      });

      const sortedBookings = [...enrichedBookings].sort((a, b) => b.date.localeCompare(a.date));
      const sortedEstimates = [...h.estimates].sort((a, b) =>
        b.submittedDate.localeCompare(a.submittedDate)
      );

      const hBookingIds = new Set(h.bookings.map((b) => b.id));

      // CANONICAL BUSINESS RULE: Customer Archive = Payment Deposit Slip Approved Clients ONLY
      // Entry Milestone Requirement:
      // Customer MUST have at least 1 approved deposit payment submission (booking_payment_submissions.status = 'APPROVED')
      // linked via customer_user_id or booking_id.
      // Booking status (CONFIRMED, IN_PROGRESS, COMPLETED) alone DOES NOT grant entry to the archive!
      const approvedBookingIds = new Set<string>();

      approvedSubmissions.forEach((sub: any) => {
        if (sub.booking_id) approvedBookingIds.add(sub.booking_id);
      });

      const hasApprovedDepositSubmission = Boolean(
        (h.userId && approvedSubmissions.some((sub: any) => sub.customer_user_id === h.userId)) ||
        h.bookings.some((b: any) => approvedBookingIds.has(b.id))
      );

      if (!hasApprovedDepositSubmission) {
        return; // Skip accounts that have NEVER had a deposit payment slip approved
      }

      // Valid jobs associated with confirmed deposit slip / confirmed bookings for history display
      const isConfirmedWork = (b: any) => {
        const bStatus = (b.status || '').toUpperCase();
        const isConfirmedStatus = bStatus === 'CONFIRMED' || bStatus === 'IN_PROGRESS' || bStatus === 'COMPLETED';
        const hasApprovedSubmission = approvedBookingIds.has(b.id);
        return isConfirmedStatus || hasApprovedSubmission;
      };

      const confirmedJobBookings = sortedBookings.filter(isConfirmedWork);
      const completedBookings = sortedBookings.filter((b) => (b.status || '').toUpperCase() === 'COMPLETED');

      // Completed count — เฉพาะงานที่ COMPLETED จริงเท่านั้น
      const completedCount = completedBookings.length;

      // Active Bookings (CONFIRMED, IN_PROGRESS, WAITING_DEPOSIT)
      const activeBookings = sortedBookings.filter(
        (b) => b.status === 'WAITING_DEPOSIT' || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS'
      );

      // confirmedCount — จำนวนงานทั้งหมดที่ยืนยัน/ดำเนินการ/เสร็จสิ้นแล้ว (CONFIRMED + IN_PROGRESS + COMPLETED + approved slip)
      const confirmedCount = confirmedJobBookings.length;

      // Total spent — นับเฉพาะงาน COMPLETED จริงเท่านั้น จากยอดรับเงินจริง (actualPaidSum)
      const totalSpent = completedBookings.reduce((sum, b: any) => sum + (b.actualPaidSum || b.price || 0), 0);

      // Most recent COMPLETED job only
      const latestCompletedBooking = completedBookings[0] || null;
      const lastArtistName = latestCompletedBooking?.artistName || '—';
      const lastArtworkTitle = latestCompletedBooking?.artworkTitle || '—';
      const lastDate = latestCompletedBooking?.date || '-';

      // Next upcoming appointment — เฉพาะอนาคตจริง (date > now)
      const nowDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const activeUpcoming = sortedBookings.find(
        (b) =>
          (b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS') &&
          (b.date || '') >= nowDateStr
      );
      const pendingAppointment = sortedBookings.find(
        (b) =>
          (b.status === 'WAITING_DEPOSIT' || b.status === 'PENDING') &&
          (b.date || '') >= nowDateStr
      );
      const nextAppointment = activeUpcoming || pendingAppointment || null;

      let statusCategory: CustomerRecord['statusCategory'] = 'NO_APPOINTMENT';
      if (activeUpcoming) {
        statusCategory = 'HAS_NEXT';
      } else if (pendingAppointment || sortedEstimates.some((e) => e.status === 'PENDING')) {
        statusCategory = 'HAS_PENDING';
      }

      records.push({
        id: h.id,
        userId: h.userId,
        name: h.name,
        email: h.email || '-',
        phone: h.phone || '-',
        avatar: h.avatar,
        isActive: h.isActive,
        dateOfBirth: h.dateOfBirth,
        eligibilityConfirmedAt: h.eligibilityConfirmedAt,
        bookings: sortedBookings,
        estimates: sortedEstimates,
        confirmedCount,
        completedCount,
        activeBookings,
        completedBookings,
        totalSpent,
        lastArtistName,
        lastArtworkTitle,
        lastDate,
        nextAppointment,
        statusCategory,
      });
    });

    return records;
  }, [combinedBookings, combinedEstimates, masterCustomers, approvedSubmissions, recordedPayments, flashReservations, flashDesigns]);

  // Filtered & Sorted Customer Records
  const filteredCustomers = useMemo(() => {
    return customerRecords
      .filter((c) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastArtworkTitle.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' ||
          c.bookings.some((b) => b.artistId === selectedArtistFilter) ||
          c.estimates.some((e) => e.artistId === selectedArtistFilter);

        const matchesStatus =
          selectedStatusFilter === 'ALL' || c.statusCategory === selectedStatusFilter;

        return matchesSearch && matchesArtist && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'alphabetical') {
          return a.name.localeCompare(b.name, 'th');
        }
        return b.lastDate.localeCompare(a.lastDate);
      });
  }, [customerRecords, searchQuery, selectedArtistFilter, selectedStatusFilter, sortOrder]);

  // Helper Thai Date Formatter
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-') return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${
      parseInt(parts[0], 10) + 543
    }`;
  };

  // Helper Initials Avatar
  const getInitials = (name: string) => {
    if (!name) return 'C';
    return name.trim().charAt(0).toUpperCase();
  };

  // Status Badge Presentation
  const getBookingStatusBadge = (status?: string | null) => {
    const st = (status || '').toUpperCase();
    switch (st) {
      case 'CONFIRMED':
        return { label: 'นัดหมายแล้ว', dot: 'bg-blue-400', badge: 'text-blue-300 bg-blue-950/60 border-blue-800' };
      case 'IN_PROGRESS':
        return { label: 'กำลังสัก', dot: 'bg-[#9C2F2F]', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'WAITING_DEPOSIT':
        return { label: 'รอมัดจำ', dot: 'bg-amber-400', badge: 'text-amber-300 bg-amber-950/60 border-amber-800' };
      case 'PENDING':
        return { label: 'รอตรวจสอบ', dot: 'bg-[#9C2F2F] animate-pulse', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'COMPLETED':
        return { label: 'เสร็จสิ้น', dot: 'bg-emerald-500', badge: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
      case 'CANCELLED':
      case 'REJECTED':
        return { label: 'ยกเลิก', dot: 'bg-red-500', badge: 'text-red-400 bg-red-950/60 border-red-800' };
      case 'EXPIRED':
        return { label: 'หมดเวลาชำระมัดจำ', dot: 'bg-zinc-500', badge: 'text-zinc-400 bg-zinc-900/90 border-zinc-700' };
      default:
        return { label: status, dot: 'bg-[#7A7265]', badge: 'text-[#A89F91] bg-[#171512] border-[#4A443A]' };
    }
  };

  return (
    <div className="space-y-6 font-prompt text-[#ECE4D3] pb-24 md:pb-12">
      {/* 1. TOP PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#4A443A] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Users size={12} className="text-[#9C2F2F]" />
            <span>CLIENT ARCHIVE • แฟ้มข้อมูลลูกค้า</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            ข้อมูลลูกค้า
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5 font-light">
            ดูข้อมูลและประวัติการใช้บริการของลูกค้าร้าน
          </p>
        </div>

        {/* Right Total Count Badge */}
        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-2 bg-[#171512] border border-[#4A443A] rounded-[6px] flex items-center space-x-2">
            <User size={14} className="text-[#9C2F2F]" />
            <span className="text-xs font-semibold text-[#ECE4D3] font-mono">
              ลูกค้าทั้งหมด {customerRecords.length} คน
            </span>
          </div>
        </div>
      </div>

      {/* 2. CUSTOMER TOOLBAR (SEARCH + FILTERS + SORT) */}
      <div className="bg-[#171512] border border-[#4A443A] p-3 rounded-[8px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 shadow-md">
        {/* Search Box */}
        <div className="relative w-full sm:w-80">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร..."
            className="w-full h-[38px] pl-9 pr-8 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7265] hover:text-[#ECE4D3]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Custom Artist Filter */}
          <div ref={artistDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsArtistDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <User size={13} className="text-[#9C2F2F]" />
              <span className="truncate max-w-[120px]">
                {selectedArtistFilter === 'ALL'
                  ? 'ช่างที่เคยดูแลทั้งหมด'
                  : appArtists.find((a) => a.id === selectedArtistFilter)?.name || 'ช่างสัก'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isArtistDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[190px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtistFilter('ALL');
                    setIsArtistDropdownOpen(false);
                  }}
                  className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                    selectedArtistFilter === 'ALL'
                      ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                      : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                  }`}
                >
                  <span>ช่างที่เคยดูแลทั้งหมด</span>
                  {selectedArtistFilter === 'ALL' && (
                    <Check size={13} className="text-[#9C2F2F]" />
                  )}
                </button>
                {appArtists.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => {
                      setSelectedArtistFilter(artist.id);
                      setIsArtistDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedArtistFilter === artist.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span className="truncate">{artist.name}</span>
                    {selectedArtistFilter === artist.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom Status Filter */}
          <div ref={statusDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#9C2F2F]" />
              <span>
                {selectedStatusFilter === 'ALL' && 'สถานะทั้งหมด'}
                {selectedStatusFilter === 'HAS_NEXT' && 'มีคิวถัดไป'}
                {selectedStatusFilter === 'HAS_PENDING' && 'มีคำขอรออยู่'}
                {selectedStatusFilter === 'NO_APPOINTMENT' && 'ไม่มีคิว'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[170px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                {[
                  { id: 'ALL', label: 'สถานะทั้งหมด' },
                  { id: 'HAS_NEXT', label: 'มีคิวถัดไป' },
                  { id: 'HAS_PENDING', label: 'มีคำขอรออยู่' },
                  { id: 'NO_APPOINTMENT', label: 'ไม่มีคิว' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedStatusFilter(item.id);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedStatusFilter === item.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {selectedStatusFilter === item.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Order Toggle */}
          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) => (prev === 'latest' ? 'alphabetical' : 'latest'))
            }
            className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-1.5 transition-colors"
            title="เรียงตาม"
          >
            <ArrowUpDown size={12} className="text-[#9C2F2F]" />
            <span>{sortOrder === 'latest' ? 'ล่าสุด' : 'ชื่อ A–Z'}</span>
          </button>
        </div>
      </div>

      {/* 3. DESKTOP CUSTOMER TABLE */}
      <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
              <th className="py-3 px-4">ลูกค้า</th>
              <th className="py-3 px-4">ข้อมูลติดต่อ</th>
              <th className="py-3 px-4">ช่างของนัดถัดไป</th>
              <th className="py-3 px-4">งานนัดถัดไป</th>
              <th className="py-3 px-4">นัดหมายถัดไป</th>
              <th className="py-3 px-4 text-center">จำนวนงาน</th>
              <th className="py-3 px-4 text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#4A443A]/50">
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#7A7265]">
                  {searchQuery ? 'ไม่พบลูกค้าที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = selectedCustomer?.id === cust.id;

                return (
                  <tr
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setActiveDetailTab('overview');
                    }}
                    className={`h-[68px] cursor-pointer transition-colors group ${
                      isSelected
                        ? 'bg-[#1C1A16] ring-1 ring-[#9C2F2F]'
                        : 'hover:bg-[#1C1A16]'
                    }`}
                  >
                    {/* Customer Name & Initial Avatar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <CustomerAvatar avatar={cust.avatar} name={cust.name} sizeClass="w-9 h-9" textClass="text-xs" />
                        <div>
                          <strong className="text-[#ECE4D3] font-medium block">
                            {cust.name}
                          </strong>
                          {cust.isActive === false && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border inline-block mt-0.5 text-red-400 bg-red-950/40 border-red-800/60">
                              ระงับการใช้งาน
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-4">
                      <span className="text-[#A89F91] font-mono text-[11px] block">
                        {cust.email}
                      </span>
                      <span className="text-[#7A7265] font-mono text-[10px] block">
                        {cust.phone}
                      </span>
                    </td>

                    {/* Next Appointment Artist */}
                    <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                      {cust.nextAppointment ? cust.nextAppointment.artistName : '—'}
                    </td>

                    {/* Next Appointment Artwork */}
                    <td className="py-3 px-4">
                      <span className="text-[#ECE4D3] font-medium block truncate max-w-[160px]">
                        {cust.nextAppointment ? (cust.nextAppointment.artworkTitle || 'Custom Tattoo') : '—'}
                      </span>
                      {cust.nextAppointment?.date && (
                        <span className="text-[10px] text-[#7A7265] font-mono block">
                          {formatThaiDate(cust.nextAppointment.date)}
                        </span>
                      )}
                    </td>

                    {/* Next Appointment */}
                    <td className="py-3 px-4">
                      {cust.nextAppointment ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9C2F2F]" />
                          <div>
                            <span className="font-mono text-[#ECE4D3] block font-semibold">
                              {formatThaiDate(cust.nextAppointment.date)}
                            </span>
                            <span className="text-[10px] text-[#A89F91] font-mono block">
                              {cust.nextAppointment.startTime} • {cust.nextAppointment.artistName}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#7A7265] text-xs">-</span>
                      )}
                    </td>

                    {/* Total Confirmed Jobs */}
                    <td className="py-3 px-4 text-center font-mono font-semibold text-[#ECE4D3]">
                      {cust.confirmedCount} งาน
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(cust);
                          setActiveDetailTab('overview');
                        }}
                        className="px-3 py-1.5 bg-[#0E0D0C] hover:bg-[#9C2F2F] border border-[#4A443A] hover:border-[#9C2F2F] text-[#ECE4D3] rounded-[4px] text-xs font-semibold transition-colors"
                      >
                        ดูข้อมูล
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. MOBILE CUSTOMER CARD LIST */}
      <div className="md:hidden space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
            {searchQuery ? 'ไม่พบลูกค้าที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
          </div>
        ) : (
          filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              onClick={() => {
                setSelectedCustomer(cust);
                setActiveDetailTab('overview');
              }}
              className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CustomerAvatar avatar={cust.avatar} name={cust.name} sizeClass="w-10 h-10" textClass="text-sm" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#ECE4D3]">
                      {cust.name}
                    </h4>
                    <span className="text-[11px] text-[#7A7265] font-mono block">
                      {cust.phone}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] text-[#ECE4D3] font-semibold">
                  {cust.confirmedCount} งาน
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#4A443A]/40 pt-2 text-[#A89F91]">
                <div>
                  <span className="text-[10px] text-[#7A7265] block">งานนัดถัดไป:</span>
                  <span className="text-[#ECE4D3] truncate block">
                    {cust.nextAppointment ? (cust.nextAppointment.artworkTitle || 'Custom Tattoo') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7A7265] block">ช่างของนัดถัดไป:</span>
                  <span className="text-[#ECE4D3] block">
                    {cust.nextAppointment ? cust.nextAppointment.artistName : '—'}
                  </span>
                </div>
              </div>

              {cust.nextAppointment && (
                <div className="p-2 bg-[#0E0D0C] border-l-2 border-[#9C2F2F] rounded text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#9C2F2F] font-bold block uppercase">
                      นัดหมายถัดไป:
                    </span>
                    <span className="font-mono text-[#ECE4D3] text-xs">
                      {formatThaiDate(cust.nextAppointment.date)} • {cust.nextAppointment.startTime}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#A89F91]">
                    {cust.nextAppointment.artistName}
                  </span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(cust);
                    setActiveDetailTab('overview');
                  }}
                  className="px-3 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] text-xs font-semibold rounded-[4px]"
                >
                  ดูข้อมูลลูกค้า
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. CUSTOMER DETAIL DRAWER */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setSelectedCustomer(null)} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    CLIENT ARCHIVE • แฟ้มข้อมูลลูกค้า
                  </span>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center space-x-4">
                <CustomerAvatar avatar={selectedCustomer.avatar} name={selectedCustomer.name} sizeClass="w-16 h-16" textClass="text-2xl" />
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                    {selectedCustomer.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A89F91] mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Mail size={11} className="text-[#7A7265]" />
                      <span className="font-mono">{selectedCustomer.email}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Phone size={11} className="text-[#7A7265]" />
                      <span className="font-mono">{selectedCustomer.phone}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Calendar size={11} className="text-[#7A7265]" />
                      <span className="font-mono">
                        {`อายุ: ${formatCustomerAgeDisplay(selectedCustomer.dateOfBirth)}`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] font-mono text-[#ECE4D3] font-semibold">
                      ใช้บริการ {selectedCustomer.completedCount} ครั้ง
                    </span>
                    {selectedCustomer.totalSpent > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-green-950/60 border border-green-800 text-green-300 font-mono font-semibold">
                        ยอดสะสม ฿{selectedCustomer.totalSpent.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Navigation Tabs */}
              <div className="flex border-b border-[#4A443A]/60 space-x-4 text-xs pt-2">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('overview')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'overview'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  ภาพรวม
                  {activeDetailTab === 'overview' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('requests')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'requests'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  คำขอจอง ({(() => {
                    const handled = new Set();
                    let count = 0;
                    selectedCustomer.estimates.forEach((e) => {
                      const mb = selectedCustomer.bookings.find((b: any) => b.estimate_request_id === e.id || b.id === e.id);
                      if (mb) {
                        handled.add(mb.id);
                        const bStatus = (mb.status || '').toUpperCase();
                        if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(bStatus)) return;
                      }
                      count++;
                    });
                    selectedCustomer.bookings.forEach((b: any) => {
                      if (!handled.has(b.id) && ['EXPIRED', 'WAITING_DEPOSIT', 'PENDING', 'REJECTED'].includes((b.status || '').toUpperCase())) {
                        count++;
                      }
                    });
                    return count;
                  })()})
                  {activeDetailTab === 'requests' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('active')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'active'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  คิวงาน ({selectedCustomer.activeBookings.length})
                  {activeDetailTab === 'active' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('tattoos')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'tattoos'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  ประวัติงานสัก ({selectedCustomer.completedBookings.length})
                  {activeDetailTab === 'tattoos' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs overflow-y-auto">
              {/* TAB 1: OVERVIEW */}
              {activeDetailTab === 'overview' && (
                <div className="space-y-4">
                  {/* NEXT APPOINTMENT */}
                  {selectedCustomer.nextAppointment ? (
                    <div className="bg-[#171512] border-l-4 border-l-[#9C2F2F] border border-[#4A443A] p-4 rounded-[6px] space-y-3 shadow-lg">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-1.5 text-xs text-[#ECE4D3] font-bold">
                          <Clock3 size={14} className="text-[#9C2F2F]" />
                          <span>นัดหมายถัดไป (NEXT APPOINTMENT)</span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${
                            getBookingStatusBadge(selectedCustomer.nextAppointment.status).badge
                          }`}
                        >
                          {getBookingStatusBadge(selectedCustomer.nextAppointment.status).label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[#A89F91]">
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ผลงาน / ลายสัก:</span>
                          <strong className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.artworkTitle || 'Custom Tattoo'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ช่างสัก:</span>
                          <strong className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.artistName}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">วันและเวลา:</span>
                          <span className="font-mono text-[#ECE4D3]">
                            {formatThaiDate(selectedCustomer.nextAppointment.date)} •{' '}
                            {selectedCustomer.nextAppointment.startTime}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ตำแหน่งและขนาด:</span>
                          <span className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.placement || 'ตามที่ตกลง'}
                            {formatTattooSize(
                              (selectedCustomer.nextAppointment as any).width_cm,
                              (selectedCustomer.nextAppointment as any).height_cm
                            )
                              ? ` (${formatTattooSize(
                                  (selectedCustomer.nextAppointment as any).width_cm,
                                  (selectedCustomer.nextAppointment as any).height_cm
                                )})`
                              : ''}
                          </span>
                        </div>
                      </div>

                      {/* Payment Status Row — Styled identical to Artist Drawer */}
                      <div className="pt-2 border-t border-[#4A443A]/40 flex justify-between items-center text-xs">
                        <span className="text-[#A89F91]">สถานะการชำระ:</span>
                        {selectedCustomer.nextAppointment.deposit && selectedCustomer.nextAppointment.deposit > 0 ? (
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded">
                            มัดจำแล้ว (฿{selectedCustomer.nextAppointment.deposit.toLocaleString()})
                          </span>
                        ) : (
                          <span className="font-mono text-[#7A7265] italic text-xs">
                            ยังไม่ชำระมัดจำ
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] text-center text-xs text-[#7A7265]">
                      ไม่มีนัดหมายถัดไปในขณะนี้
                    </div>
                  )}

                  {/* Client Summary Specs */}
                  <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                      ข้อมูลสรุปการใช้บริการ:
                    </span>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">ช่างที่เคยดูแล:</span>
                        <span className="text-[#ECE4D3] font-medium">
                          {selectedCustomer.lastArtistName}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">งานล่าสุด:</span>
                        <span className="text-[#ECE4D3] font-medium truncate block">
                          {selectedCustomer.lastArtworkTitle}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">
                          วันที่ใช้บริการล่าสุด:
                        </span>
                        <span className="text-[#ECE4D3] font-mono">
                          {formatThaiDate(selectedCustomer.lastDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">ยอดใช้จ่ายรวม:</span>
                        <span className={`font-mono font-semibold ${selectedCustomer.totalSpent > 0 ? 'text-green-400' : 'text-[#A89F91]'}`}>
                          {selectedCustomer.totalSpent > 0 ? `฿${selectedCustomer.totalSpent.toLocaleString()}` : '—'}
                        </span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-[#4A443A]/40 space-y-2">
                        <span className="text-[#7A7265] text-[10px] uppercase font-bold tracking-wider block">
                          ข้อมูลสุขภาพ (สำหรับ Admin/ช่างเท่านั้น):
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/50 space-y-0.5">
                            <span className="text-[10px] text-[#7A7265] block font-medium">โรคประจำตัว:</span>
                            <span className="text-[#ECE4D3] font-medium block">
                              {formatCustomerHealthInfo({ estimates: selectedCustomer.estimates }).medicalCondition}
                            </span>
                          </div>
                          <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/50 space-y-0.5">
                            <span className="text-[10px] text-[#7A7265] block font-medium">อาการแพ้ (เช่น ยา, โลหะ, ยาชา):</span>
                            <span className="text-[#ECE4D3] font-medium block">
                              {formatCustomerHealthInfo({ estimates: selectedCustomer.estimates }).allergy}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Note Section */}
                  <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                      บันทึกเกี่ยวกับลูกค้า (Client Notes):
                    </span>
                    <p className="text-[#7A7265] text-xs italic">
                      ยังไม่มีบันทึกสำหรับลูกค้ารายนี้
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: BOOKING REQUESTS (คำขอจอง) */}
              {activeDetailTab === 'requests' && (() => {
                // Deduplicate & unify estimate_requests and bookings
                const handledBookingIds = new Set<string>();
                const unifiedRequests: any[] = [];

                // 1. Estimate requests
                selectedCustomer.estimates.forEach((e) => {
                  const matchingBooking = selectedCustomer.bookings.find(
                    (b: any) => b.estimate_request_id === e.id || b.id === e.id
                  );

                  if (matchingBooking) {
                    handledBookingIds.add(matchingBooking.id);
                    const bStatus = (matchingBooking.status || '').toUpperCase();
                    const effectiveStatus = bStatus || (e.status || 'PENDING').toUpperCase();

                    // If the request has become a CONFIRMED, IN_PROGRESS, or COMPLETED job,
                    // it belongs in the Queue or History tabs, NOT the Requests tab!
                    if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(effectiveStatus)) {
                      return;
                    }

                    unifiedRequests.push({
                      id: `unified-${e.id}-${matchingBooking.id}`,
                      title: `สไตล์ ${e.style || 'Custom'}${formatTattooSize(e.width, e.height) ? ` • ${formatTattooSize(e.width, e.height)}` : ''}`,
                      placement: matchingBooking.placement || e.placement || 'ตามที่ตกลง',
                      artistName: matchingBooking.artistName || e.artistName || 'ช่างประจำร้าน',
                      submittedDate: e.submittedDate || matchingBooking.date,
                      status: effectiveStatus,
                      depositRequired: (matchingBooking as any).deposit || e.quotedDeposit || (e as any).deposit_required || 500,
                      quotedPrice: e.quotedPrice,
                      quotedDeposit: e.quotedDeposit,
                      referenceImages: (e as any).referenceImages?.length
                        ? (e as any).referenceImages
                        : ((matchingBooking as any).referenceImages?.length ? (matchingBooking as any).referenceImages : (e.referenceImage ? [e.referenceImage] : [])),
                      artworkImage: (matchingBooking as any).artworkImage || e.referenceImage,
                    });
                  } else {
                    unifiedRequests.push({
                      id: `est-${e.id}`,
                      title: `สไตล์ ${e.style || 'Custom'}${formatTattooSize(e.width, e.height) ? ` • ${formatTattooSize(e.width, e.height)}` : ''}`,
                      placement: e.placement || 'ตามที่ตกลง',
                      artistName: e.artistName || 'ช่างประจำร้าน',
                      submittedDate: e.submittedDate,
                      status: (e.status || 'PENDING').toUpperCase(),
                      depositRequired: e.quotedDeposit || 500,
                      quotedPrice: e.quotedPrice,
                      quotedDeposit: e.quotedDeposit,
                      referenceImages: (e as any).referenceImages?.length ? (e as any).referenceImages : (e.referenceImage ? [e.referenceImage] : []),
                      artworkImage: e.referenceImage,
                    });
                  }
                });

                // 2. Standalone request bookings (Flash EXPIRED / WAITING_DEPOSIT / etc. without linked estimate_request)
                selectedCustomer.bookings.forEach((b: any) => {
                  if (handledBookingIds.has(b.id)) return;
                  const bStatus = (b.status || '').toUpperCase();
                  if (['EXPIRED', 'WAITING_DEPOSIT', 'PENDING', 'REJECTED'].includes(bStatus)) {
                    const sizeText = formatTattooSize((b as any).width_cm, (b as any).height_cm);
                    const titleText = b.artworkTitle
                      ? `${b.artworkTitle}${sizeText ? ` · ${sizeText}` : ''}`
                      : 'Custom Tattoo';

                    unifiedRequests.push({
                      id: `book-${b.id}`,
                      title: titleText,
                      placement: b.placement || 'ตามที่ตกลง',
                      artistName: b.artistName || 'ช่างประจำร้าน',
                      submittedDate: b.date,
                      status: bStatus,
                      depositRequired: b.deposit || 500,
                      referenceImages: (b as any).referenceImages?.length ? (b as any).referenceImages : (b.artworkImage ? [b.artworkImage] : []),
                      artworkImage: b.artworkImage,
                    });
                  }
                });

                return (
                  <div className="space-y-3">
                    {unifiedRequests.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#7A7265]">
                        ยังไม่มีประวัติคำขอจองคิว
                      </div>
                    ) : (
                      unifiedRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-2">
                              <strong className="text-xs text-[#ECE4D3] block">
                                {req.title}
                              </strong>
                              <span className="text-[10px] text-[#A89F91] block mt-0.5">
                                ตำแหน่ง: {req.placement} • ช่าง: {req.artistName}
                              </span>
                              <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                                {req.status === 'EXPIRED'
                                  ? `วันที่จอง: ${formatThaiDate(req.submittedDate)}`
                                  : `ส่งคำขอเมื่อ: ${formatThaiDate(req.submittedDate)}`}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${
                                req.status === 'EXPIRED'
                                  ? 'text-zinc-400 bg-zinc-900/90 border-zinc-700'
                                  : req.status === 'QUOTED'
                                  ? 'text-amber-300 bg-amber-950/60 border-amber-800'
                                  : req.status === 'ACCEPTED' || req.status === 'CONFIRMED'
                                  ? 'text-green-300 bg-green-950/60 border-green-800'
                                  : req.status === 'PENDING'
                                  ? 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]'
                                  : 'text-red-400 bg-red-950/60 border-red-800'
                              }`}
                            >
                              {req.status === 'EXPIRED' && 'หมดเวลาชำระมัดจำ'}
                              {req.status === 'QUOTED' && 'เสนอราคาแล้ว'}
                              {(req.status === 'ACCEPTED' || req.status === 'CONFIRMED') && 'ตอบรับราคาแล้ว'}
                              {req.status === 'PENDING' && 'รอเสนอราคา'}
                              {req.status === 'REJECTED' && 'ปฏิเสธ'}
                            </span>
                          </div>

                          {req.status === 'EXPIRED' ? (
                            <div className="flex items-center justify-between p-2 bg-[#171512] rounded border border-[#4A443A]/60 text-[11px]">
                              <span className="text-[#A89F91]">มัดจำที่กำหนด</span>
                              <span className="font-mono font-semibold text-[#ECE4D3]">
                                ฿{(req.depositRequired || 500).toLocaleString()}
                              </span>
                            </div>
                          ) : req.quotedPrice ? (
                            <div className="p-2 bg-[#171512] rounded border border-amber-800/40 text-[11px] flex justify-between items-center">
                              <span className="text-[#A89F91]">ราคาที่เสนอ:</span>
                              <span className="font-mono font-semibold text-[#ECE4D3]">
                                ฿{req.quotedPrice.toLocaleString()} (มัดจำ ฿
                                {(req.quotedDeposit || 500).toLocaleString()})
                              </span>
                            </div>
                          ) : null}

                          <CustomerArchiveReferenceGallery
                            images={req.referenceImages}
                            singleFallback={req.artworkImage}
                            onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                          />
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}


              {/* TAB 3: ACTIVE BOOKINGS (คิวงาน) */}
              {activeDetailTab === 'active' && (
                <div className="space-y-3">
                  {selectedCustomer.activeBookings.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ไม่มีรายการคิวงานที่กำลังดำเนินการในขณะนี้
                    </div>
                  ) : (
                    selectedCustomer.activeBookings.map((b) => {
                      const statusInfo = getBookingStatusBadge(b.status);
                      const sizeText = formatTattooSize((b as any).width_cm, (b as any).height_cm);
                      const titleLine = `${b.artworkTitle || 'Custom Tattoo'}${sizeText ? ` · ${sizeText}` : ''}`;

                      return (
                        <div
                          key={b.id}
                          className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-2">
                              <strong className="text-xs text-[#ECE4D3] block">
                                {titleLine}
                              </strong>
                              <span className="text-[10px] text-[#A89F91] block mt-0.5">
                                ตำแหน่ง: {b.placement || 'ตามที่ตกลง'} • ช่าง: {b.artistName}
                              </span>
                              <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                                {formatThaiDate(b.date)} • {b.startTime}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${statusInfo.badge}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-[#4A443A]/30 text-[11px]">
                            <span className="font-semibold text-green-400">ชำระมัดจำแล้ว</span>
                            <span className="font-mono font-semibold text-green-400">
                              ฿{(b.deposit || 0).toLocaleString()}
                            </span>
                          </div>

                          <CustomerArchiveReferenceGallery
                            images={(b as any).referenceImages}
                            singleFallback={b.artworkImage}
                            onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 4: COMPLETED TATTOO HISTORY (ประวัติงานสัก) */}
              {activeDetailTab === 'tattoos' && (
                <div className="space-y-3">
                  {selectedCustomer.completedBookings.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ยังไม่มีประวัติงานสักที่เสร็จสิ้น
                    </div>
                  ) : (
                    selectedCustomer.completedBookings.map((b) => (
                      <div
                        key={b.id}
                        className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1 pr-2">
                            <strong className="text-xs text-[#ECE4D3] block">
                              {b.artworkTitle || 'Custom Tattoo Piece'}{formatTattooSize((b as any).width_cm, (b as any).height_cm) ? ` • ${formatTattooSize((b as any).width_cm, (b as any).height_cm)}` : ''}
                            </strong>
                            <span className="text-[10px] text-[#A89F91] block mt-0.5">
                              ช่างสัก: {b.artistName || 'ช่างสักประจำร้าน'} • {formatThaiDate(b.date)}
                            </span>
                            <span className="text-[10px] text-[#7A7265] block mt-0.5">
                              ตำแหน่ง: {b.placement || 'ตามกำหนด'} • {calculateDurationTextFromTimes(b.startTime, b.endTime) || `${b.duration} ชม.`}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-emerald-400 block">
                              {((b as any).actualPaidSum || 0) > 0
                                ? `ยอดรับจริง ฿${((b as any).actualPaidSum).toLocaleString('th-TH')}`
                                : 'ยอดรับจริง —'}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono inline-block mt-0.5">
                              ✓ เสร็จสิ้น
                            </span>
                          </div>
                        </div>

                        <CustomerArchiveReferenceGallery
                          images={(b as any).referenceImages}
                          singleFallback={b.artworkImage}
                          onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-full min-h-[44px] bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX ZOOM GALLERY MODAL */}
      {lightboxGallery && lightboxGallery.images.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
          onClick={() => setLightboxGallery(null)}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setLightboxGallery(null)}
            className="absolute top-4 right-4 text-white hover:text-[#9C2F2F] bg-black/60 hover:bg-black/90 border border-white/20 p-2 rounded-full transition-colors z-20"
            title="ปิด"
          >
            <X size={20} />
          </button>

          {/* Main Image Container */}
          <div
            className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerReferenceImage
              src={lightboxGallery.images[lightboxGallery.index]}
              alt={`Reference View ${lightboxGallery.index + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
              showSkeleton={true}
            />
          </div>

          {/* Next / Previous Navigation */}
          {lightboxGallery.images.length > 1 && (
            <div
              className="flex items-center space-x-4 mt-4 text-[#ECE4D3] z-20 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setLightboxGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: prev.index > 0 ? prev.index - 1 : prev.images.length - 1,
                        }
                      : null
                  )
                }
                className="p-2 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] hover:bg-[#9C2F2F] text-white rounded-full transition-colors shadow-lg"
                title="รูปก่อนหน้า"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-mono font-semibold bg-[#171512] px-3 py-1 rounded border border-[#4A443A]">
                {lightboxGallery.index + 1} / {lightboxGallery.images.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLightboxGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: prev.index < prev.images.length - 1 ? prev.index + 1 : 0,
                        }
                      : null
                  )
                }
                className="p-2 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] hover:bg-[#9C2F2F] text-white rounded-full transition-colors shadow-lg"
                title="รูปถัดไป"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
