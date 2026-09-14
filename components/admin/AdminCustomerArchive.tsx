'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { Booking } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
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
  eligibilityConfirmedAt?: string | null;
  bookings: Booking[];
  estimates: EstimateRequest[];
  completedCount: number;
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
    eligibility_confirmed_at?: string | null;
  }[]>([]);
  const [fetchedBookings, setFetchedBookings] = useState<Booking[]>([]);
  const [fetchedEstimates, setFetchedEstimates] = useState<EstimateRequest[]>([]);

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
          .select('id, user_id, display_name, email, phone, avatar_url, eligibility_confirmed_at');

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
                });
              }
            });
        }

        if (isMounted) {
          setMasterCustomers(joinedCusts);
        }

        // 2. Fetch Estimates for joining (excluding health disclosure fields)
        const { data: eData } = await supabase.from('estimate_requests').select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at');

        // Map estimates
        if (eData && isMounted) {
          const mappedEstimates: EstimateRequest[] = eData.map((e: any) => {
            const matchedCust = joinedCusts.find((mc) => mc.user_id === e.customer_user_id);
            return {
              id: e.id,
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
            } as any;
          });
          setFetchedEstimates(mappedEstimates);
        }

        // 3. Direct Bookings (Valid Column Query)
        const { data: bData, error: errB } = await supabase
          .from('bookings')
          .select('*, booking_sessions(*)');

        if (bData && isMounted) {
          const mappedBookings: Booking[] = bData.map((b: any) => {
            const matchedCust = joinedCusts.find((mc) => mc.user_id === b.customer_user_id);
            const est = eData?.find((e: any) => e.id === b.estimate_request_id);
            const art = aData?.find((a: any) => a.id === b.artist_id);
            const firstSession = b.booking_sessions && b.booking_sessions.length > 0
              ? b.booking_sessions[0]
              : null;

            return {
              id: b.id,
              bookingNumber: b.id.slice(0, 8),
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
              placement: est?.placement || 'ตามตกลง',
              date: b.requested_date || (firstSession?.start_at ? firstSession.start_at.split('T')[0] : new Date().toISOString().split('T')[0]),
              startTime: b.requested_start_time ? b.requested_start_time.slice(0, 5) : '13:00',
              endTime: '17:00',
              duration: 4,
              status: b.status as Booking['status'],
              price: est?.quoted_price || 0,
              deposit: est?.deposit_required || 0,
              depositPaid: (est?.deposit_required || 0) > 0,
              sessions: b.booking_sessions || [],
            } as any;
          });
          setFetchedBookings(mappedBookings);
        }
      } catch (err) {
        console.error('Error hydrating customer archive:', err);
      }
    }
    loadMasterData();
    return () => {
      isMounted = false;
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
      eligibilityConfirmedAt?: string | null;
      bookings: Booking[];
      estimates: EstimateRequest[];
    }

    const holders: CustomerHolder[] = [];

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
      const sortedBookings = [...h.bookings].sort((a, b) => b.date.localeCompare(a.date));
      const sortedEstimates = [...h.estimates].sort((a, b) =>
        b.submittedDate.localeCompare(a.submittedDate)
      );

      // Completed Bookings ONLY for completedCount (1 Booking = 1 Job)
      const completedBookings = sortedBookings.filter((b) => b.status === 'COMPLETED');
      const completedCount = completedBookings.length;

      // Active Bookings (WAITING_DEPOSIT, CONFIRMED, IN_PROGRESS)
      const activeBookings = sortedBookings.filter(
        (b) => b.status === 'WAITING_DEPOSIT' || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS'
      );

      // Total spent
      const totalSpent = sortedBookings
        .filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'IN_PROGRESS')
        .reduce((sum, b) => sum + (b.price || 0), 0);

      // Most recent artist & artwork
      const lastBooking = sortedBookings[0];
      const lastEstimate = sortedEstimates[0];
      const lastArtistName = lastBooking?.artistName || lastEstimate?.artistName || 'ช่างสักประจำร้าน';
      const lastArtworkTitle = lastBooking?.artworkTitle || (lastEstimate ? `งานสไตล์ ${lastEstimate.style}` : 'งานสัก');
      const lastDate = lastBooking?.date || lastEstimate?.submittedDate || '-';

      // Next upcoming appointment
      const activeUpcoming = sortedBookings.find(
        (b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'WAITING_DEPOSIT'
      );
      const pendingAppointment = sortedBookings.find((b) => b.status === 'PENDING');
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
        eligibilityConfirmedAt: h.eligibilityConfirmedAt,
        bookings: sortedBookings,
        estimates: sortedEstimates,
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
  }, [combinedBookings, combinedEstimates, masterCustomers]);

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
  const getBookingStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return { label: 'ยืนยันคิวแล้ว', dot: 'bg-green-400', badge: 'text-green-300 bg-green-950/60 border-green-800' };
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
              <th className="py-3 px-4">ช่างล่าสุด</th>
              <th className="py-3 px-4">งานล่าสุด</th>
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
                        {cust.avatar ? (
                          <img
                            src={cust.avatar}
                            alt={cust.name}
                            className="w-9 h-9 rounded-full object-cover border border-[#4A443A] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#171512] border border-[#4A443A] flex items-center justify-center font-bold text-xs text-[#ECE4D3] shrink-0">
                            {getInitials(cust.name)}
                          </div>
                        )}
                        <div>
                          <strong className="text-[#ECE4D3] font-medium block">
                            {cust.name}
                          </strong>
                          {cust.isActive !== undefined && (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border inline-block mt-0.5 ${
                                cust.isActive
                                  ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'
                                  : 'text-red-400 bg-red-950/40 border-red-800/60'
                              }`}
                            >
                              {cust.isActive ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
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

                    {/* Last Artist */}
                    <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                      {cust.lastArtistName}
                    </td>

                    {/* Last Artwork */}
                    <td className="py-3 px-4">
                      <span className="text-[#ECE4D3] font-medium block truncate max-w-[160px]">
                        {cust.lastArtworkTitle}
                      </span>
                      <span className="text-[10px] text-[#7A7265] font-mono block">
                        {formatThaiDate(cust.lastDate)}
                      </span>
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

                    {/* Total Completed Jobs */}
                    <td className="py-3 px-4 text-center font-mono font-semibold text-[#ECE4D3]">
                      {cust.completedCount} งาน
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
                  <div className="w-10 h-10 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center font-bold text-sm text-[#ECE4D3] shrink-0">
                    {getInitials(cust.name)}
                  </div>
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
                  {cust.completedCount} งาน
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#4A443A]/40 pt-2 text-[#A89F91]">
                <div>
                  <span className="text-[10px] text-[#7A7265] block">งานล่าสุด:</span>
                  <span className="text-[#ECE4D3] truncate block">
                    {cust.lastArtworkTitle}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7A7265] block">ช่างล่าสุด:</span>
                  <span className="text-[#ECE4D3] block">{cust.lastArtistName}</span>
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
                <div className="w-16 h-16 rounded-full bg-[#0E0D0C] border-2 border-[#4A443A] flex items-center justify-center font-bold text-2xl text-[#ECE4D3] shrink-0">
                  {getInitials(selectedCustomer.name)}
                </div>
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
                  คำขอจอง ({selectedCustomer.estimates.length})
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
                            {formatThaiDate(selectedCustomer.nextAppointment.date)}{' '}
                            {selectedCustomer.nextAppointment.startTime}–
                            {selectedCustomer.nextAppointment.endTime} (
                            {selectedCustomer.nextAppointment.duration} ชม.)
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ตำแหน่งและขนาด:</span>
                          <span className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.placement || 'ตามที่ตกลง'}
                          </span>
                        </div>
                      </div>

                      {/* Pricing Breakdown */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#4A443A]/40 text-center">
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">ราคาค่าสัก:</span>
                          <strong className="text-xs font-mono text-[#ECE4D3]">
                            ฿{selectedCustomer.nextAppointment.price?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">มัดจำแล้ว:</span>
                          <strong className="text-xs font-mono text-green-400">
                            ฿{selectedCustomer.nextAppointment.deposit?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">คงเหลือ:</span>
                          <strong className="text-xs font-mono text-[#A89F91]">
                            ฿{(
                              (selectedCustomer.nextAppointment.price || 0) -
                              (selectedCustomer.nextAppointment.deposit || 0)
                            ).toLocaleString()}
                          </strong>
                        </div>
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
                        <span className="text-green-400 font-mono font-semibold">
                          ฿{selectedCustomer.totalSpent.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">
                          การยืนยันอายุและเงื่อนไข:
                        </span>
                        {selectedCustomer.eligibilityConfirmedAt ||
                        selectedCustomer.bookings.some((b) => (b as any).is_age_confirmed) ||
                        selectedCustomer.estimates.some((e) => (e as any).is_age_confirmed) ? (
                          <span className="text-emerald-400 font-semibold text-[11px]">✓ ยืนยันแล้ว</span>
                        ) : (
                          <span className="text-amber-400 font-semibold text-[11px]">ยังไม่ยืนยัน</span>
                        )}
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
              {activeDetailTab === 'requests' && (
                <div className="space-y-3">
                  {selectedCustomer.estimates.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ยังไม่มีประวัติคำขอจองคิว
                    </div>
                  ) : (
                    selectedCustomer.estimates.map((e) => (
                      <div
                        key={e.id}
                        className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1 pr-2">
                            <strong className="text-xs text-[#ECE4D3] block">
                              สไตล์ {e.style} • ขนาด {e.width}×{e.height} cm
                            </strong>
                            <span className="text-[10px] text-[#A89F91] block mt-0.5">
                              ตำแหน่ง: {e.placement} • ช่าง: {e.artistName || 'ช่างประจำร้าน'}
                            </span>
                            <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                              ส่งคำขอเมื่อ: {formatThaiDate(e.submittedDate)}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${
                              e.status === 'QUOTED'
                                ? 'text-amber-300 bg-amber-950/60 border-amber-800'
                                : e.status === 'ACCEPTED'
                                ? 'text-green-300 bg-green-950/60 border-green-800'
                                : e.status === 'PENDING'
                                ? 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]'
                                : 'text-red-400 bg-red-950/60 border-red-800'
                            }`}
                          >
                            {e.status === 'QUOTED' && 'เสนอราคาแล้ว'}
                            {e.status === 'ACCEPTED' && 'ตอบรับราคาแล้ว'}
                            {e.status === 'PENDING' && 'รอเสนอราคา'}
                            {e.status === 'REJECTED' && 'ปฏิเสธ'}
                          </span>
                        </div>

                        {e.quotedPrice && (
                          <div className="p-2 bg-[#171512] rounded border border-amber-800/40 text-[11px] flex justify-between items-center">
                            <span className="text-[#A89F91]">ราคาที่เสนอ:</span>
                            <span className="font-mono font-semibold text-[#ECE4D3]">
                              ฿{e.quotedPrice.toLocaleString()} (มัดจำ ฿
                              {e.quotedDeposit?.toLocaleString() || 0})
                            </span>
                          </div>
                        )}

                        <CustomerArchiveReferenceGallery
                          images={(e as any).referenceImages}
                          singleFallback={e.referenceImage}
                          onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

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

                      return (
                        <div
                          key={b.id}
                          className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-2">
                              <strong className="text-xs text-[#ECE4D3] block">
                                {b.artworkTitle || 'Custom Tattoo'}
                              </strong>
                              <span className="text-[10px] text-[#A89F91] block mt-0.5">
                                ช่างสัก: {b.artistName}
                              </span>
                              <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                                {formatThaiDate(b.date)} • {b.startTime} ({b.duration}h)
                              </span>
                            </div>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${statusInfo.badge}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-[#4A443A]/30 text-[11px]">
                            <span className="text-[#A89F91]">
                              ตำแหน่ง: <span className="text-[#ECE4D3]">{b.placement}</span>
                            </span>
                            <span className="font-mono font-semibold text-[#ECE4D3]">
                              ฿{b.price?.toLocaleString()} (มัดจำ ฿{b.deposit?.toLocaleString() || 0})
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
                              {b.artworkTitle || 'Custom Tattoo Piece'}
                            </strong>
                            <span className="text-[10px] text-[#A89F91] block mt-0.5">
                              ช่างสัก: {b.artistName} • {formatThaiDate(b.date)}
                            </span>
                            <span className="text-[10px] text-[#7A7265] block mt-0.5">
                              ตำแหน่ง: {b.placement || 'ตามกำหนด'} • {b.duration} ชม.
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-[#ECE4D3] block">
                              ฿{b.price?.toLocaleString()}
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
