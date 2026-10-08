'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistCustomerDetailDrawer, { ArtistCustomerDetail } from '../../../components/artist/ArtistCustomerDetailDrawer';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';
import { 
  Users, 
  Search, 
  RefreshCw, 
  User, 
  Phone, 
  Mail,
  Calendar as CalendarIcon, 
  Clock, 
  ChevronDown,
  Eye, 
  Inbox, 
  ArrowUpDown,
  Check,
  Sparkles
} from 'lucide-react';
import { formatCustomerAgeDisplay } from '@/lib/customerUtils';

interface FormattedArtistCustomer {
  user_id: string;
  display_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  medical_conditions?: string | null;
  allergies?: string | null;
  is_age_confirmed: boolean;
  
  bookings_count: number;
  pending_deposits_count: number;
  sessions_count: number;
  estimates_count: number;
  last_activity_at: string | null;

  // Derived Fields for Admin-Style Table/Card Layout
  lastArtistName: string;
  lastArtworkTitle: string;
  lastDate: string;
  nextAppointment: {
    date: string;
    startTime: string;
    artistName: string;
  } | null;
  statusCategory: 'HAS_NEXT' | 'HAS_PENDING' | 'NO_APPOINTMENT';

  bookings: any[];
  sessions: any[];
  estimates: any[];
  flashReservations?: any[];
  paymentSubmissions?: any[];
  payments?: any[];
  staffArtistName?: string;
}

function CustomerAvatar({
  name,
  sizeClass = "w-9 h-9",
  textClass = "text-xs"
}: {
  name: string;
  sizeClass?: string;
  textClass?: string;
}) {
  const initials = name && name.trim() ? name.trim().charAt(0).toUpperCase() : 'C';

  return (
    <div className={`${sizeClass} rounded-full bg-studio-sec border border-studio-border flex items-center justify-center font-bold ${textClass} text-studio-primary shrink-0 font-prompt`}>
      {initials}
    </div>
  );
}

export default function ArtistCustomersPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  // Primitive Artist ID string to prevent unnecessary re-fetches on object reference changes
  const currentArtistId = staffArtistId || staffArtistRecord?.id || null;

  // Granular Loading States
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef<Record<string, boolean>>({});
  const lastLoadedArtistIdRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'HAS_NEXT' | 'HAS_PENDING' | 'NO_APPOINTMENT'>('ALL');
  const [sortOrder, setSortOrder] = useState<'latest' | 'alphabetical'>('latest');

  // Dropdown States
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const [customersList, setCustomersList] = useState<FormattedArtistCustomer[]>([]);

  // Drawer State
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<ArtistCustomerDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && currentArtistId))
  );

  // Route protection
  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isAuthorized, authLoading]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch live customers for this specific artist
  const fetchMyCustomers = useCallback(async () => {
    if (!isAuthorized || !currentArtistId) return;

    const hasLoadedBefore = hasLoadedOnceRef.current[currentArtistId];
    if (!hasLoadedBefore) {
      setInitialLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      // 1. Fetch bookings for currentArtistId (excluding CANCELLED)
      const { data: dbBookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, customer_user_id, customer_id, artist_id, status, deposit_required, is_deposit_paid, created_at, requested_date, requested_start_time, artwork_title, style_preference, customer_name, contact_name, customer_phone, customer_email, date_of_birth')
        .eq('artist_id', currentArtistId)
        .neq('status', 'CANCELLED');

      if (bErr) console.error('Error fetching artist bookings for customers:', bErr);

      // 2. Fetch booking_sessions for currentArtistId (excluding CANCELLED)
      const { data: dbSessions, error: sErr } = await supabase
        .from('booking_sessions')
        .select('id, booking_id, artist_id, status, start_at, end_at')
        .eq('artist_id', currentArtistId)
        .neq('status', 'CANCELLED');

      if (sErr) console.error('Error fetching artist sessions for customers:', sErr);

      // 3. Fetch estimate_requests for currentArtistId (excluding CANCELLED)
      const { data: dbEstimates, error: eErr } = await supabase
        .from('estimate_requests')
        .select('id, customer_user_id, customer_id, artist_id, status, deposit_required, request_type, style, created_at, customer_name, contact_name, phone, email, date_of_birth, medical_condition_note, allergy_note')
        .eq('artist_id', currentArtistId)
        .neq('status', 'CANCELLED');

      if (eErr) console.error('Error fetching artist estimates for customers:', eErr);

      // 3.1 Fetch approved payment submissions
      const { data: dbSubmissions } = await supabase
        .from('booking_payment_submissions')
        .select('id, booking_id, status')
        .eq('status', 'APPROVED');

      // 3.3 Fetch valid booking payments
      const { data: dbPayments } = await supabase
        .from('booking_payments')
        .select('id, booking_id, amount, status')
        .neq('status', 'VOIDED');

      // 3.4 Fetch flash_reservations with flash_designs (RPC first to bypass RLS for assigned artist, fallback to direct query)
      let flashReservations: any[] = [];
      try {
        const { data: rpcFlash, error: rpcFlashErr } = await supabase.rpc('artist_get_flash_reservations', {
          p_artist_id: currentArtistId,
        });
        if (!rpcFlashErr && rpcFlash && Array.isArray(rpcFlash)) {
          flashReservations = rpcFlash.map((fr: any) => ({
            ...fr,
            flash_designs: fr.flash_designs || {
              id: fr.flash_design_id,
              title: fr.flash_design_title,
              style: fr.flash_design_style,
              image_url: fr.flash_design_image_url,
              price: fr.flash_design_price,
              deposit_amount: fr.flash_design_deposit_amount,
              size_label: fr.flash_design_size_label,
            },
          }));
        } else {
          const { data: dbFlashRes } = await supabase
            .from('flash_reservations')
            .select('*, flash_designs(*)');
          flashReservations = dbFlashRes || [];
        }
      } catch (e) {
        const { data: dbFlashRes } = await supabase
          .from('flash_reservations')
          .select('*, flash_designs(*)');
        flashReservations = dbFlashRes || [];
      }

      const bookings = dbBookings || [];
      const sessions = dbSessions || [];
      const estimates = dbEstimates || [];
      const paymentSubmissions = dbSubmissions || [];
      const payments = dbPayments || [];

      // Collect all distinct customer user IDs / customer IDs associated with this artist
      const allCustomerUserIds = Array.from(
        new Set([
          ...bookings.map((b: any) => b.customer_user_id || b.customer_id),
          ...estimates.map((e: any) => e.customer_user_id || e.customer_id),
        ].filter(Boolean))
      );

      if (allCustomerUserIds.length === 0) {
        setCustomersList([]);
        hasLoadedOnceRef.current[currentArtistId] = true;
        lastLoadedArtistIdRef.current = currentArtistId;
        return;
      }

      // 4. Fetch customer contact metadata via RPC (bypasses RLS restrictions for assigned artist customers)
      let contactsMap = new Map<string, any>();
      const { data: contactsData, error: cRpcErr } = await supabase
        .rpc('artist_get_customer_contacts', {
          p_customer_user_ids: allCustomerUserIds
        });

      if (cRpcErr) {
        console.error('Error fetching artist customer contacts via RPC:', cRpcErr);
      } else if (contactsData) {
        contactsData.forEach((c: any) => {
          if (c.user_id) contactsMap.set(c.user_id, c);
        });
      }

      // Direct fallback queries for additional fields
      const { data: cData, error: customersError } = await supabase
        .from('customers')
        .select('user_id, id, display_name, phone, email, date_of_birth, eligibility_confirmed_at, profile_completed_at')
        .in('user_id', allCustomerUserIds);

      if (customersError) {
        console.error('[artist/customers] failed to load customer profiles', customersError);
      }

      const { data: pData } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, phone')
        .in('user_id', allCustomerUserIds);

      const cMap = new Map<string, any>();
      (cData || []).forEach((c: any) => {
        if (c.user_id) cMap.set(c.user_id, c);
        if (c.id) cMap.set(c.id, c);
      });

      const pMap = new Map<string, any>();
      (pData || []).forEach((p: any) => {
        if (p.user_id) pMap.set(p.user_id, p);
      });

      const currentArtistName = staffArtistRecord?.name || staffArtistRecord?.nickname || 'ไม่ระบุช่าง';

      // Build customer models
      const formattedCustomers: FormattedArtistCustomer[] = allCustomerUserIds.map((uid: string) => {
        const contact = contactsMap.get(uid);
        const c = cMap.get(uid);
        const p = pMap.get(uid);

        // Filter work history for this customer strictly for this artist
        const custBookings = bookings.filter((b: any) => b.customer_user_id === uid || b.customer_id === uid);
        const custEstimates = estimates.filter((e: any) => e.customer_user_id === uid || e.customer_id === uid);
        const custBookingIds = new Set(custBookings.map((b: any) => b.id));
        const custSessions = sessions.filter((s: any) => custBookingIds.has(s.booking_id));

        // 1. Resolve Display Name in order of fallback
        const rpcName = contact?.display_name;
        const profileName = p?.display_name;
        const customerName = c?.display_name || null;
        const requestName = custEstimates.find((e: any) => e.customer_name || e.contact_name)?.customer_name || custEstimates.find((e: any) => e.contact_name)?.contact_name;
        const bookingName = custBookings.find((b: any) => b.customer_name || b.contact_name)?.customer_name || custBookings.find((b: any) => b.contact_name)?.contact_name;

        let displayName = 'ไม่ระบุชื่อ';
        const candidates = [rpcName, profileName, customerName, requestName, bookingName].filter(Boolean);
        const validCandidate = candidates.find((n) => n !== 'ลูกค้าประจำ' && n !== 'ลูกค้า 157 TATTOO' && n !== 'ลูกค้าทั่วไป' && n !== 'ลูกค้า (ไม่ระบุชื่อ)');

        if (validCandidate) {
          displayName = validCandidate;
        } else {
          const emailCandidate = p?.email || c?.email || custEstimates.find((e: any) => e.email)?.email || custBookings.find((b: any) => b.customer_email)?.customer_email;
          if (emailCandidate && emailCandidate.includes('@')) {
            const prefix = emailCandidate.split('@')[0];
            if (prefix && prefix !== 'ลูกค้าประจำ') {
              displayName = prefix;
            }
          }
        }

        // 2. Resolve Phone in order of fallback
        const rpcPhone = contact?.phone;
        const profilePhone = p?.phone;
        const customerPhone = c?.phone;
        const requestPhone = custEstimates.map((e: any) => e.phone || e.contact_phone || e.customer_phone).find(Boolean);
        const bookingPhone = custBookings.map((b: any) => b.customer_phone || b.contact_phone || b.phone).find(Boolean);
        const sessionPhone = custSessions.map((s: any) => s.customer_phone || s.phone).find(Boolean);

        const phone = rpcPhone || profilePhone || customerPhone || requestPhone || bookingPhone || sessionPhone || null;

        // 3. Resolve Email in order of fallback
        const rpcEmail = contact?.email;
        const estEmail = custEstimates.map((e: any) => e.email || e.customer_email || e.contact_email).find(Boolean);
        const bookEmail = custBookings.map((b: any) => b.customer_email || b.email || b.contact_email).find(Boolean);
        const sessEmail = custSessions.map((s: any) => s.customer_email || s.email).find(Boolean);

        const email = rpcEmail || p?.email || c?.email || estEmail || bookEmail || sessEmail || null;

        // 4. Age / Health confirmation status
        const isAgeConfirmed = Boolean(c?.eligibility_confirmed_at || c?.profile_completed_at);

        // 5. Calculate confirmed/approved jobs matching Admin isConfirmedWork rule
        const approvedBookingIds = new Set<string>();
        paymentSubmissions.forEach((sub: any) => {
          const subStatus = (sub.status || '').toUpperCase();
          if (sub.booking_id && subStatus === 'APPROVED') {
            approvedBookingIds.add(sub.booking_id);
          }
        });

        const confirmedJobBookings = custBookings.filter((b: any) => {
          const bStatus = (b.status || '').toUpperCase();
          const isConfirmedStatus = bStatus === 'CONFIRMED' || bStatus === 'IN_PROGRESS' || bStatus === 'COMPLETED';
          const hasApprovedSubmission = approvedBookingIds.has(b.id);
          return isConfirmedStatus || hasApprovedSubmission;
        });

        // Calculate pending deposits
        const pendingDepositBookings = custBookings.filter((b: any) => {
          const dep = Number(b.deposit_required || 0);
          const isPaid = b.is_deposit_paid || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';
          return (dep > 0 && !isPaid) || b.status === 'PENDING_DEPOSIT' || b.status === 'WAITING_DEPOSIT';
        });
        const pendingDepositEstimates = custEstimates.filter((e: any) => {
          const dep = Number(e.deposit_required || 0);
          return e.status === 'WAITING_DEPOSIT' || (dep > 0 && e.status === 'QUOTED');
        });
        const pendingDepositsCount = pendingDepositBookings.length + pendingDepositEstimates.length;

        // 6. Last Activity & Job Details
        const sortedBookings = [...custBookings].sort((a, b) => new Date(b.created_at || b.requested_date).getTime() - new Date(a.created_at || a.requested_date).getTime());
        const sortedEstimates = [...custEstimates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const latestBooking = sortedBookings[0];
        const latestEstimate = sortedEstimates[0];

        const lastArtistName = currentArtistName;

        let lastArtworkTitle = 'งานสัก';
        if (latestBooking) {
          const rawWork = latestBooking.artwork_title || (latestEstimate?.request_type === 'FLASH' ? 'ลาย Flash' : 'งานสัก');
          const style = latestBooking.style_preference || latestEstimate?.style || '';
          if (style && !rawWork.toLowerCase().includes(style.toLowerCase())) {
            lastArtworkTitle = `งานสไตล์ ${style}`;
          } else {
            lastArtworkTitle = rawWork;
          }
        } else if (latestEstimate) {
          lastArtworkTitle = latestEstimate.style ? `งานสไตล์ ${latestEstimate.style}` : 'งานสัก';
        }

        const dates: string[] = [
          ...custBookings.map((b: any) => b.requested_date || b.created_at),
          ...custSessions.map((s: any) => s.start_at),
          ...custEstimates.map((e: any) => e.created_at),
        ].filter(Boolean);

        dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const lastDate = dates[0] || '-';

        // 7. Next Upcoming Appointment
        const sortedSessions = [...custSessions].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const upcomingSession = sortedSessions.find((s: any) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS' || new Date(s.start_at).getTime() >= Date.now());
        const upcomingBooking = sortedBookings.find((b: any) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');

        let nextAppointment: FormattedArtistCustomer['nextAppointment'] = null;
        if (upcomingSession) {
          nextAppointment = {
            date: upcomingSession.start_at,
            startTime: formatTimeBangkok(upcomingSession.start_at),
            artistName: currentArtistName,
          };
        } else if (upcomingBooking) {
          nextAppointment = {
            date: upcomingBooking.requested_date || upcomingBooking.created_at,
            startTime: upcomingBooking.requested_start_time ? `${upcomingBooking.requested_start_time.slice(0, 5)} น.` : '10:00 น.',
            artistName: currentArtistName,
          };
        }

        // 8. Status Category
        let statusCategory: FormattedArtistCustomer['statusCategory'] = 'NO_APPOINTMENT';
        if (nextAppointment) {
          statusCategory = 'HAS_NEXT';
        } else if (pendingDepositsCount > 0 || sortedEstimates.some((e: any) => e.status === 'QUOTED' || e.status === 'WAITING_DEPOSIT')) {
          statusCategory = 'HAS_PENDING';
        }

        return {
          user_id: uid,
          display_name: displayName,
          phone,
          email,
          date_of_birth: c?.date_of_birth ?? custEstimates.find((e: any) => e.date_of_birth)?.date_of_birth ?? custBookings.find((b: any) => b.date_of_birth)?.date_of_birth ?? null,
          medical_conditions: custEstimates.find((e: any) => e.medical_condition_note)?.medical_condition_note || c?.medical_condition_note || null,
          allergies: custEstimates.find((e: any) => e.allergy_note)?.allergy_note || c?.allergy_note || null,
          is_age_confirmed: isAgeConfirmed,
          bookings_count: confirmedJobBookings.length,
          pending_deposits_count: pendingDepositsCount,
          sessions_count: custSessions.length,
          estimates_count: custEstimates.length,
          last_activity_at: lastDate !== '-' ? lastDate : null,

          lastArtistName,
          lastArtworkTitle,
          lastDate,
          nextAppointment,
          statusCategory,

          bookings: custBookings,
          sessions: custSessions,
          estimates: custEstimates,
          flashReservations: flashReservations.filter((fr: any) => fr.customer_user_id === uid || fr.customer_id === uid),
          paymentSubmissions: paymentSubmissions.filter((sub: any) => custBookingIds.has(sub.booking_id) || sub.customer_user_id === uid),
          payments: payments.filter((p: any) => custBookingIds.has(p.booking_id)),
          staffArtistName: currentArtistName,
        };
      });

      setCustomersList(formattedCustomers);
      hasLoadedOnceRef.current[currentArtistId] = true;
      lastLoadedArtistIdRef.current = currentArtistId;
    } catch (err) {
      console.error('Exception fetching artist customers:', err);
    } finally {
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase, isAuthorized, currentArtistId, staffArtistRecord]);

  useEffect(() => {
    if (isAuthorized && currentArtistId) {
      if (lastLoadedArtistIdRef.current !== currentArtistId && !hasLoadedOnceRef.current[currentArtistId]) {
        setInitialLoading(true);
      }
      fetchMyCustomers();
    }
  }, [isAuthorized, currentArtistId, fetchMyCustomers]);

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    return customersList
      .filter((c) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          query === '' ||
          c.display_name.toLowerCase().includes(query) ||
          (c.email && c.email.toLowerCase().includes(query)) ||
          (c.phone && c.phone.replace(/[^0-9]/g, '').includes(query.replace(/[^0-9]/g, '')));

        const matchesStatus =
          selectedStatusFilter === 'ALL' || c.statusCategory === selectedStatusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'alphabetical') {
          return a.display_name.localeCompare(b.display_name, 'th');
        }
        if (!a.last_activity_at) return 1;
        if (!b.last_activity_at) return -1;
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      });
  }, [customersList, searchQuery, selectedStatusFilter, sortOrder]);

  const handleOpenDetail = (cust: FormattedArtistCustomer) => {
    setSelectedCustomerDetail({
      user_id: cust.user_id,
      display_name: cust.display_name,
      phone: cust.phone,
      email: cust.email,
      date_of_birth: cust.date_of_birth,
      medical_conditions: cust.medical_conditions,
      allergies: cust.allergies,
      is_age_confirmed: cust.is_age_confirmed,
      bookings: cust.bookings,
      sessions: cust.sessions,
      estimates: cust.estimates,
      flashReservations: cust.flashReservations,
      paymentSubmissions: cust.paymentSubmissions,
      payments: cust.payments,
      staffArtistName: cust.staffArtistName,
    });
    setIsDrawerOpen(true);
  };

  if (authLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt">
        <span className="text-xs text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์...</span>
      </div>
    );
  }

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';

  return (
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col pb-20 md:pb-10">
      {/* Header */}
      <ArtistHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Title & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-studio-red uppercase tracking-wider font-semibold">
                ARTIST PORTAL • {artistName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary mt-1 flex items-center space-x-2">
              <Users className="text-studio-red" size={24} />
              <span>ลูกค้าของฉัน ({customersList.length})</span>
            </h1>
          </div>

          <button
            onClick={() => fetchMyCustomers()}
            disabled={initialLoading || isRefreshing}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefreshing || initialLoading ? 'animate-spin text-studio-red' : ''} />
            <span>{isRefreshing ? 'กำลังอัปเดต...' : 'อัปเดตข้อมูล'}</span>
          </button>
        </div>

        {/* Search Bar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทรศัพท์..."
              className="w-full pl-10 pr-4 py-2 bg-studio-card border border-studio-border rounded-lg text-xs text-studio-primary placeholder-studio-muted focus:outline-none focus:border-studio-red/60 transition-colors font-prompt"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-studio-muted hover:text-studio-primary bg-studio-sec px-2 py-0.5 rounded cursor-pointer"
              >
                ล้าง
              </button>
            )}
          </div>

          {/* Status Filter & Sort Dropdowns */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Status Filter */}
            <div ref={statusDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
                className="h-[38px] px-3 bg-studio-card border border-studio-border hover:border-studio-secondary rounded-lg text-xs font-medium text-studio-primary flex items-center space-x-2 transition-colors outline-none cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-studio-red" />
                <span>
                  {selectedStatusFilter === 'ALL' && 'สถานะทั้งหมด'}
                  {selectedStatusFilter === 'HAS_NEXT' && 'มีคิวถัดไป'}
                  {selectedStatusFilter === 'HAS_PENDING' && 'มีคำขอรออยู่'}
                  {selectedStatusFilter === 'NO_APPOINTMENT' && 'ไม่มีคิว'}
                </span>
                <ChevronDown size={13} className="text-studio-muted" />
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute top-full mt-1 right-0 z-50 w-[170px] bg-studio-card border border-studio-border rounded-lg p-1.5 shadow-2xl space-y-0.5 animate-in fade-in">
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
                        setSelectedStatusFilter(item.id as any);
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full h-[34px] px-2.5 rounded flex items-center justify-between text-left text-xs font-medium transition-colors cursor-pointer ${
                        selectedStatusFilter === item.id
                          ? 'bg-studio-red/20 text-studio-primary'
                          : 'text-studio-secondary hover:bg-studio-sec'
                      }`}
                    >
                      <span>{item.label}</span>
                      {selectedStatusFilter === item.id && (
                        <Check size={13} className="text-studio-red" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div ref={sortDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                className="h-[38px] px-3 bg-studio-card border border-studio-border hover:border-studio-secondary rounded-lg text-xs font-medium text-studio-primary flex items-center space-x-2 transition-colors outline-none cursor-pointer"
              >
                <ArrowUpDown size={13} className="text-studio-red" />
                <span>{sortOrder === 'latest' ? 'ล่าสุด' : 'ตามชื่อ ก-ฮ'}</span>
                <ChevronDown size={13} className="text-studio-muted" />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute top-full mt-1 right-0 z-50 w-[140px] bg-studio-card border border-studio-border rounded-lg p-1.5 shadow-2xl space-y-0.5 animate-in fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('latest');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded flex items-center justify-between text-left text-xs font-medium transition-colors cursor-pointer ${
                      sortOrder === 'latest' ? 'bg-studio-red/20 text-studio-primary' : 'text-studio-secondary hover:bg-studio-sec'
                    }`}
                  >
                    <span>ล่าสุด</span>
                    {sortOrder === 'latest' && <Check size={13} className="text-studio-red" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('alphabetical');
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded flex items-center justify-between text-left text-xs font-medium transition-colors cursor-pointer ${
                      sortOrder === 'alphabetical' ? 'bg-studio-red/20 text-studio-primary' : 'text-studio-secondary hover:bg-studio-sec'
                    }`}
                  >
                    <span>ตามชื่อ ก-ฮ</span>
                    {sortOrder === 'alphabetical' && <Check size={13} className="text-studio-red" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Section */}
        {initialLoading ? (
          <div className="p-12 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse font-prompt">
            กำลังโหลดรายการลูกค้าของคุณ...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2 font-prompt">
            <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
              <Users size={24} />
            </div>
            <h3 className="text-sm font-semibold text-studio-primary">
              {searchQuery ? 'ไม่พบข้อมูลลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้าในรายการของคุณ'}
            </h3>
            <p className="text-xs text-studio-muted max-w-md mx-auto">
              {searchQuery
                ? `ไม่พบลำดับลูกค้าที่ตรงกับคำค้นหา "${searchQuery}"`
                : 'เมื่อมีลูกค้าส่งคำขอประเมินราคา หรือ จองคิวสักระบุถึงคุณ ข้อมูลลูกค้าจะแสดงในหน้านี้'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px / md:) */}
            <div className="hidden md:block bg-studio-card border border-studio-border rounded-xl overflow-hidden shadow-lg font-prompt">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-studio-sec/80 border-b border-studio-border text-studio-secondary font-medium uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">ลูกค้า</th>
                      <th className="py-3.5 px-4">ข้อมูลติดต่อ</th>
                      <th className="py-3.5 px-4">ช่างล่าสุด</th>
                      <th className="py-3.5 px-4">งานล่าสุด</th>
                      <th className="py-3.5 px-4">นัดหมายถัดไป</th>
                      <th className="py-3.5 px-4 text-center">จำนวนงาน</th>
                      <th className="py-3.5 px-4 text-right">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-studio-border/60">
                    {filteredCustomers.map((cust) => {
                      const phoneFormatted = cust.phone ? formatThaiPhoneForDisplay(cust.phone) : '-';
                      return (
                        <tr
                          key={cust.user_id}
                          onClick={() => handleOpenDetail(cust)}
                          className="h-[68px] hover:bg-studio-sec/40 transition-colors cursor-pointer group"
                        >
                          {/* 1. Customer Avatar & Name */}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <CustomerAvatar name={cust.display_name} sizeClass="w-9 h-9" textClass="text-xs" />
                              <div>
                                <strong className="text-studio-primary font-medium block">
                                  {cust.display_name}
                                </strong>
                              </div>
                            </div>
                          </td>

                          {/* 2. Contact Info */}
                          <td className="py-3 px-4">
                            <span className="text-studio-secondary font-mono text-[11px] block">
                              {cust.email || '-'}
                            </span>
                            <span className="text-studio-muted font-mono text-[10px] block">
                              {phoneFormatted}
                            </span>
                          </td>

                          {/* 3. Last Artist */}
                          <td className="py-3 px-4 text-studio-primary font-medium">
                            {cust.lastArtistName}
                          </td>

                          {/* 4. Last Artwork */}
                          <td className="py-3 px-4">
                            <span className="text-studio-primary font-medium block truncate max-w-[160px]">
                              {cust.lastArtworkTitle}
                            </span>
                            <span className="text-[10px] text-studio-muted font-mono block">
                              {cust.lastDate !== '-' ? formatDateBangkok(cust.lastDate) : '-'}
                            </span>
                          </td>

                          {/* 5. Next Appointment */}
                          <td className="py-3 px-4">
                            {cust.nextAppointment ? (
                              <div className="flex items-center space-x-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-studio-red shrink-0" />
                                <div>
                                  <span className="font-mono text-studio-primary block font-semibold">
                                    {formatDateBangkok(cust.nextAppointment.date)}
                                  </span>
                                  <span className="text-[10px] text-studio-secondary font-mono block">
                                    {cust.nextAppointment.startTime} • {cust.nextAppointment.artistName}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-studio-muted text-xs">ยังไม่มีนัดหมาย</span>
                            )}
                          </td>

                          {/* 6. Job Count */}
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono font-bold bg-studio-sec border border-studio-border text-studio-primary">
                              {cust.bookings_count} งาน
                            </span>
                          </td>

                          {/* 7. Action */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(cust);
                              }}
                              className="px-3 py-1.5 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded-lg border border-studio-border transition-colors cursor-pointer"
                            >
                              ดูข้อมูล
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List View (< 768px / md:) */}
            <div className="md:hidden space-y-3 font-prompt">
              {filteredCustomers.map((cust) => {
                const phoneFormatted = cust.phone ? formatThaiPhoneForDisplay(cust.phone) : 'ไม่ระบุเบอร์';
                return (
                  <div
                    key={cust.user_id}
                    onClick={() => handleOpenDetail(cust)}
                    className="p-4 bg-studio-card border border-studio-border hover:border-studio-red/40 rounded-xl space-y-3 cursor-pointer shadow-md transition-all"
                  >
                    {/* 1. Top Row: Avatar, Name, Phone, Job Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 min-w-0">
                        <CustomerAvatar name={cust.display_name} sizeClass="w-10 h-10" textClass="text-sm" />
                        <div className="truncate">
                          <h4 className="text-sm font-semibold text-studio-primary truncate">
                            {cust.display_name}
                          </h4>
                          <span className="text-[11px] text-studio-muted font-mono block">
                            {phoneFormatted}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-studio-sec border border-studio-border text-studio-primary font-bold">
                        {cust.bookings_count} งาน
                      </span>
                    </div>

                    {/* 2. Divider */}
                    <div className="border-t border-studio-border/50" />

                    {/* 3. 2-Column Grid: Last Job & Last Artist */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-studio-secondary">
                      <div>
                        <span className="text-[10px] text-studio-muted block">งานล่าสุด:</span>
                        <span className="text-studio-primary truncate block font-medium">
                          {cust.lastArtworkTitle}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-studio-muted block">ช่างล่าสุด:</span>
                        <span className="text-studio-primary block font-medium">{cust.lastArtistName}</span>
                      </div>
                    </div>

                    {/* 4. Next Appointment Box */}
                    <div className="p-2.5 bg-studio-main border-l-2 border-studio-red rounded-lg text-xs flex items-center justify-between">
                      {cust.nextAppointment ? (
                        <>
                          <div>
                            <span className="text-[9px] text-studio-red font-bold block uppercase">
                              นัดหมายถัดไป:
                            </span>
                            <span className="font-mono text-studio-primary text-xs font-semibold">
                              {formatDateBangkok(cust.nextAppointment.date)} • {cust.nextAppointment.startTime}
                            </span>
                          </div>
                          <span className="text-[10px] text-studio-secondary font-medium">
                            {cust.nextAppointment.artistName}
                          </span>
                        </>
                      ) : (
                        <span className="text-studio-muted text-xs">ยังไม่มีนัดหมาย</span>
                      )}
                    </div>

                    {/* 5. Bottom Action Button */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(cust);
                        }}
                        className="px-3.5 py-1.5 bg-studio-red hover:bg-studio-red/90 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow"
                      >
                        ดูข้อมูลลูกค้า
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Customer Detail Drawer */}
      <ArtistCustomerDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        customer={selectedCustomerDetail}
      />

      {/* Mobile Navigation */}
      <ArtistMobileNav />
    </div>
  );
}
