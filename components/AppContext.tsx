'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Artist } from '@/data/mockArtists';
import { Booking, BookingPayment } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { normalizeThaiPhone, formatThaiPhoneForDisplay, sanitizeDigitsOnly } from '@/lib/phoneUtils';
import { getThailandTodayStr } from './portal/portalUtils';
import { mapServerCompletionError } from './admin/requests/adminCompletionGuard';
import { getSafeReturnUrl } from '@/lib/urlUtils';
import { AlertTriangle } from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: 'customer' | 'admin' | 'artist';
  phone?: string;
  avatar_url?: string;
  is_active?: boolean;
}

interface AppContextType {
  supabase: any;
  isLoggedIn: boolean;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  customerProfileCompletedAt: string | null;
  customerEligibilityConfirmedAt: string | null;
  isCustomerProfileComplete: boolean;
  
  isStaffLoggedIn: boolean;
  staffRole: 'ADMIN' | 'ARTIST' | null;
  staffArtistId: string | null;
  staffArtistRecord: any | null;
  
  user: User | null;
  profile: Profile | null;
  authLoading: boolean;
  authProfileError: boolean;
  retryAuthProfile: () => Promise<void>;
  
  artists: Artist[];
  fetchArtists: () => Promise<Artist[]>;
  bookings: Booking[];
  bookingPayments: BookingPayment[];
  estimateRequests: EstimateRequest[];
  
  bookingDraft: Partial<Booking> | null;
  estimateDraft: Partial<EstimateRequest> | null;
  
  loginCustomer: (email: string, password?: string) => Promise<{ success: boolean; isProfileComplete?: boolean; error?: string }>;
  signUpCustomer: (email: string, password?: string, displayName?: string, phone?: string, eligibilityConfirmed?: boolean) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (returnUrl?: string) => Promise<{ success: boolean; error?: string }>;
  updateCustomerPhone: (phone: string) => Promise<{ success: boolean; error?: string }>;
  completeCustomerProfile: (displayName: string, phone: string, eligibilityConfirmed: boolean) => Promise<{ success: boolean; error?: string }>;
  logoutCustomer: () => Promise<void>;
  
  loginStaff: (email: string, password?: string) => Promise<{ success: boolean; role: 'ADMIN' | 'ARTIST' | null; error?: string }>;
  logoutStaff: () => Promise<void>;
  
  setBookingDraft: (draft: Partial<Booking> | null) => void;
  setEstimateDraft: (draft: Partial<EstimateRequest> | null) => void;
  
  addBookingRequest: (booking: Partial<Booking>) => Promise<string>;
  addEstimateRequest: (estimate: Partial<EstimateRequest>) => Promise<string>;
  
  updateBookingStatus: (id: string, status: Booking['status'], rejectionReason?: string, staffNote?: string) => Promise<void>;
  updateEstimateStatus: (
    id: string, 
    status: EstimateRequest['status'], 
    quotedPrice?: number, 
    quotedDeposit?: number,
    estimatedDuration?: number,
    quoteNote?: string
  ) => Promise<void>;
  
  submitDepositPayment: (paymentId: string, paymentReference: string, paymentMethod?: string, customerNote?: string) => Promise<void>;
  verifyDepositPayment: (paymentId: string, staffNote?: string) => Promise<void>;
  rejectDepositPayment: (paymentId: string, reason: string) => Promise<void>;

  payDeposit: (id: string) => void;
  updateArtistStatus: (artistId: string, status: Artist['status']) => void;
  getArtistBusySlots: (artistId: string, fromDate?: string, toDate?: string) => Promise<{ startAt: string; endAt: string }[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to format ISO TIMESTAMPTZ into Asia/Bangkok date & time
const parseBangkokDateTime = (isoString?: string) => {
  if (!isoString) return { date: '', time: '' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const bkkDate = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Bangkok', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(d);
  const bkkTime = new Intl.DateTimeFormat('en-GB', { 
    timeZone: 'Asia/Bangkok', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  }).format(d);
  return { date: bkkDate, time: bkkTime };
};

export const checkIsCustomerProfileComplete = (
  role?: string,
  isActive?: boolean,
  phone?: string | null,
  completedAt?: string | null,
  confirmedAt?: string | null
): boolean => {
  if (role !== 'customer') return true;
  if (isActive !== true) return false;
  if (!phone || !/^0[0-9]{9}$/.test(phone.trim())) return false;
  if (!completedAt || !confirmedAt) return false;
  return true;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  
  const [isMounted, setIsMounted] = useState(false);
  
  // Real Auth State
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authProfileError, setAuthProfileError] = useState(false);

  // Business Entities (Database Integrated)
  const [artists, setArtists] = useState<Artist[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingPayments, setBookingPayments] = useState<BookingPayment[]>([]);
  const [estimateRequests, setEstimateRequests] = useState<EstimateRequest[]>([]);

  // Drafts
  const [bookingDraft, setBookingDraftState] = useState<Partial<Booking> | null>(null);
  const [estimateDraft, setEstimateDraftState] = useState<Partial<EstimateRequest> | null>(null);

  // Customer Profile Completion Timestamps & Phone (Database Authority)
  const [customerMasterPhone, setCustomerMasterPhone] = useState<string | null>(null);
  const [customerProfileCompletedAt, setCustomerProfileCompletedAt] = useState<string | null>(null);
  const [customerEligibilityConfirmedAt, setCustomerEligibilityConfirmedAt] = useState<string | null>(null);

  // Artist Staff Identity State
  const [staffArtistRecord, setStaffArtistRecord] = useState<any | null>(null);
  const [staffArtistIdState, setStaffArtistIdState] = useState<string | null>(null);

  // Fetch artists from Supabase
  const fetchArtists = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (!error && data) {
        const seen = new Set<string>();
        const mapped: Artist[] = data
          .filter((item: any) => {
            if (!item || !item.id) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          })
          .map((item: any) => ({
            id: item.id,
            name: item.name,
            nickname: item.nickname || undefined,
            slug: item.slug || undefined,
            specialty: (item.specialties && item.specialties.length > 0) ? item.specialties.join(' / ') : '',
            specialties: item.specialties || [],
            bio: item.bio || '',
            avatar: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
            avatar_url: item.avatar_url || undefined,
            portfolio: [],
            availability: item.working_days || [],
            working_days: item.working_days || [],
            status: item.status || 'AVAILABLE',
            is_active: item.is_active,
            is_visible: item.is_visible,
            sort_order: item.sort_order,
            created_at: item.created_at,
            updated_at: item.updated_at,
          }));
        setArtists(mapped);
        return mapped;
      }
    } catch (_) {}
    return [];
  }, [supabase]);

  // Fetch estimate requests from Supabase
  const fetchEstimates = useCallback(async (currentUser = user) => {
    if (!currentUser) {
      setEstimateRequests([]);
      return;
    }

    const { data: dbEstimates, error: errEst } = await supabase
      .from('estimate_requests')
      .select('id, customer_id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (errEst) {
      console.error('Error fetching estimates:', errEst);
      return;
    }

    if (!dbEstimates) {
      setEstimateRequests([]);
      return;
    }

    const customerIds = Array.from(new Set(dbEstimates.map(e => e.customer_id).filter(Boolean)));
    const customerUserIds = Array.from(new Set(dbEstimates.map(e => e.customer_user_id).filter(Boolean)));

    let customersList: any[] = [];
    if (customerIds.length > 0 || customerUserIds.length > 0) {
      const orConds: string[] = [];
      if (customerIds.length > 0) orConds.push(`id.in.(${customerIds.join(',')})`);
      if (customerUserIds.length > 0) orConds.push(`user_id.in.(${customerUserIds.join(',')})`);

      const { data: custs } = await supabase
        .from('customers')
        .select('id, user_id, display_name, email, phone')
        .or(orConds.join(','));
      if (custs) customersList = custs;
    }

    let profilesList: any[] = [];
    if (customerUserIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, role')
        .in('user_id', customerUserIds);
      if (profs) {
        profilesList = profs;
      }
    }

    // Resolve active public.artists
    const { data: activeArtists } = await supabase
      .from('artists')
      .select('id, name, nickname');
    const artistsList = activeArtists || [];

    const mapped: EstimateRequest[] = dbEstimates.map(item => {
      const customerRec = customersList.find(c => (item.customer_id && c.id === item.customer_id) || (item.customer_user_id && c.user_id === item.customer_user_id));
      const customerProf = profilesList.find(p => p.user_id === item.customer_user_id);
      const matchedArtist = artistsList.find((a: any) => a.id === item.artist_id);

      return {
        id: item.id,
        customerId: item.customer_id || undefined,
        customerUserId: item.customer_user_id || undefined,
        customerName: customerRec?.display_name || customerProf?.display_name || customerProf?.email?.split('@')[0] || 'ลูกค้าประจำ',
        customerEmail: customerRec?.email || customerProf?.email || 'customer@example.com',
        customerPhone: customerRec?.phone || undefined,
        artistId: item.artist_id || '',
        artistName: matchedArtist?.name || 'ช่างประจำร้าน',
        referenceImage: item.reference_images?.[0] || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500',
        referenceImages: item.reference_images || (item.reference_images?.[0] ? [item.reference_images[0]] : []),
        width: Number(item.width_cm) || 10,
        height: Number(item.height_cm) || 10,
        placement: item.placement,
        style: item.style || 'Fine Line',
        description: item.description || '',
        preferredDate: item.preferred_date || undefined,
        preferredTime: item.preferred_time || undefined,
        preferred_time: item.preferred_time || null,
        submittedDate: new Date(item.created_at).toISOString().split('T')[0],
        status: item.status as any,
        quotedPrice: item.quoted_price ? Number(item.quoted_price) : undefined,
        quotedDeposit: item.deposit_required ? Number(item.deposit_required) : undefined,
        estimatedDuration: item.estimated_duration_minutes ? Number(item.estimated_duration_minutes) / 60 : undefined,
        quoteNote: item.quote_note || undefined,
        request_type: (item as any).request_type || undefined,
        work_type: (item as any).work_type || null,
      };
    });

    setEstimateRequests(mapped);
  }, [supabase, user]);

  // Fetch bookings & linked payments from Supabase
  const fetchBookings = useCallback(async (currentUser = user) => {
    if (!currentUser) {
      setBookings([]);
      setBookingPayments([]);
      return;
    }

    // 1. Fetch bookings along with joined booking_sessions and estimate_requests (excluding health disclosure fields)
    const { data: dbBookings, error: errBook } = await supabase
      .from('bookings')
      .select('*, booking_sessions(*), estimate_requests(id, customer_id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at)')
      .order('created_at', { ascending: false });

    if (errBook) {
      console.error('Error fetching bookings:', errBook);
      return;
    }

    if (!dbBookings) {
      setBookings([]);
      setBookingPayments([]);
      return;
    }

    // 2. Fetch payments
    const { data: dbPayments } = await supabase
      .from('booking_payments')
      .select('*')
      .order('created_at', { ascending: false });

    const rawPayments: BookingPayment[] = (dbPayments || []).map((p: any) => ({
      id: p.id,
      bookingId: p.booking_id,
      customerId: p.customer_id || undefined,
      customerUserId: p.customer_user_id || undefined,
      paymentType: p.payment_type,
      amount: Number(p.amount) || 0,
      currency: p.currency,
      paymentMethod: p.payment_method || undefined,
      paymentReference: p.payment_reference || undefined,
      status: p.status,
      customerNote: p.customer_note || undefined,
      staffNote: p.staff_note || undefined,
      submittedAt: p.submitted_at || undefined,
      verifiedAt: p.verified_at || undefined,
      rejectedAt: p.rejected_at || undefined,
      verifiedByUserId: p.verified_by_user_id || undefined,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    setBookingPayments(rawPayments);

    // 3. Resolve customer profiles
    const customerIds = Array.from(new Set(dbBookings.map(b => b.customer_id).filter(Boolean)));
    const customerUserIds = Array.from(new Set(dbBookings.map(b => b.customer_user_id).filter(Boolean)));

    let customersList: any[] = [];
    if (customerIds.length > 0 || customerUserIds.length > 0) {
      const orConds: string[] = [];
      if (customerIds.length > 0) orConds.push(`id.in.(${customerIds.join(',')})`);
      if (customerUserIds.length > 0) orConds.push(`user_id.in.(${customerUserIds.join(',')})`);

      const { data: custs } = await supabase
        .from('customers')
        .select('id, user_id, display_name, email, phone')
        .or(orConds.join(','));
      if (custs) customersList = custs;
    }

    let profilesList: any[] = [];
    if (customerUserIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, role')
        .in('user_id', customerUserIds);
      if (profs) {
        profilesList = profs;
      }
    }

    // Resolve active public.artists
    const { data: activeArtists } = await supabase
      .from('artists')
      .select('id, name, nickname');
    const artistsList = activeArtists || [];

    const mapped: Booking[] = dbBookings.map(item => {
      const customerRec = customersList.find(c => (item.customer_id && c.id === item.customer_id) || (item.customer_user_id && c.user_id === item.customer_user_id));
      const customerProf = profilesList.find(p => p.user_id === item.customer_user_id);
      const matchedArtist = artistsList.find((a: any) => a.id === item.artist_id);

      const rawSessions = item.booking_sessions || [];
      const primarySession = rawSessions.length > 0 ? rawSessions[0] : null;
      const linkedEstimate = item.estimate_requests || null;

      const startParsed = primarySession?.start_at ? parseBangkokDateTime(primarySession.start_at) : { date: '', time: '' };
      const endParsed = primarySession?.end_at ? parseBangkokDateTime(primarySession.end_at) : { date: '', time: '' };

      const durationHours = (primarySession?.start_at && primarySession?.end_at)
        ? Math.max(1, Math.round((new Date(primarySession.end_at).getTime() - new Date(primarySession.start_at).getTime()) / (1000 * 60 * 60) * 10) / 10)
        : 1;

      // Match linked deposit payment
      const linkedDeposit = rawPayments.find(p => p.bookingId === item.id && p.paymentType === 'DEPOSIT');
      const verifiedDepositAmount = linkedDeposit?.status === 'VERIFIED' ? linkedDeposit.amount : 0;
      const tattooPrice = item.tattoo_price ? Number(item.tattoo_price) : 0;
      const remainingBalance = Math.max(0, tattooPrice - verifiedDepositAmount);

      let computedEndTime = endParsed.time;
      if (!computedEndTime && item.requested_start_time) {
        const [h, m] = item.requested_start_time.split(':').map(Number);
        if (!isNaN(h)) {
          const endH = Math.min(23, h + durationHours);
          computedEndTime = `${endH.toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')}`;
        }
      }

      const derivedStyle = item.style || linkedEstimate?.style || undefined;
      const derivedPlacement = item.placement || linkedEstimate?.placement || undefined;
      const derivedWidth = item.width_cm ? Number(item.width_cm) : (linkedEstimate?.width_cm ? Number(linkedEstimate.width_cm) : undefined);
      const derivedHeight = item.height_cm ? Number(item.height_cm) : (linkedEstimate?.height_cm ? Number(linkedEstimate.height_cm) : undefined);

      return {
        id: item.id,
        customerId: item.customer_id || undefined,
        customerUserId: item.customer_user_id || undefined,
        customerName: customerRec?.display_name || customerProf?.display_name || customerProf?.email?.split('@')[0] || 'ลูกค้าประจำ',
        customerEmail: customerRec?.email || customerProf?.email || 'customer@example.com',
        customerPhone: customerRec?.phone || undefined,
        artistId: item.artist_id || '',
        artistName: matchedArtist?.name || 'ช่างประจำร้าน',
        artworkTitle: item.artwork_title || (item.booking_source === 'ESTIMATE' ? 'งานสักจากใบประเมินราคา' : 'งานสัก Custom'),
        artworkImage: item.artwork_image_url || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500',
        date: startParsed.date || item.requested_date,
        startTime: startParsed.time || item.requested_start_time,
        endTime: computedEndTime,
        duration: durationHours,
        price: tattooPrice,
        deposit: item.deposit_required ? Number(item.deposit_required) : 0,
        bookingType: item.booking_source === 'FLASH' ? 'flash' : 'custom',
        status: item.status as any,
        paymentStatus: linkedDeposit?.status === 'VERIFIED' ? 'DEPOSIT_PAID' : 'UNPAID',
        estimateRequestId: item.estimate_request_id || undefined,
        bookingSource: item.booking_source as any,
        style: derivedStyle,
        placement: derivedPlacement,
        width: derivedWidth,
        height: derivedHeight,
        description: item.description || undefined,
        customerNote: item.customer_note || undefined,
        staffNote: item.staff_note || undefined,
        rejectionReason: item.rejection_reason || undefined,
        paymentId: linkedDeposit?.id,
        depositStatus: linkedDeposit?.status,
        depositPaymentReference: linkedDeposit?.paymentReference,
        depositStaffNote: linkedDeposit?.staffNote,
        remainingBalance: remainingBalance,
        sessions: rawSessions,
      };
    });

    setBookings(mapped);
  }, [supabase, user]);

  // Helper: Auth-gated Data Fetcher (Only executed when authenticated session is confirmed!)
  const loadUserData = useCallback(async (targetUser: User, targetRole?: string) => {
    if (!targetUser) return;

    // Only query protected database tables if user has a confirmed authenticated role
    if (targetRole === 'admin' || targetRole === 'artist' || targetRole === 'customer') {
      try {
        const promises: Promise<any>[] = [
          fetchEstimates(targetUser),
          fetchBookings(targetUser)
        ];
        if (targetRole === 'customer') {
          promises.push(
            (async () => {
              try {
                const { data: custData } = await supabase
                  .from('customers')
                  .select('profile_completed_at, eligibility_confirmed_at')
                  .eq('user_id', targetUser.id)
                  .maybeSingle();

                if (custData) {
                  setCustomerProfileCompletedAt(custData.profile_completed_at || null);
                  setCustomerEligibilityConfirmedAt(custData.eligibility_confirmed_at || null);
                }
              } catch (_) {}
            })()
          );
        }
        await Promise.all(promises);
      } catch (_) {}
    }
  }, [fetchEstimates, fetchBookings]);

  // 1. Coordinated Auth Resolution and Data Loading on Mount
  useEffect(() => {
    setIsMounted(true);

    const storedArtists = localStorage.getItem('157_artists');
    if (storedArtists) setArtists(JSON.parse(storedArtists));

    const storedBDraft = localStorage.getItem('157_bookingDraft');
    if (storedBDraft) setBookingDraftState(JSON.parse(storedBDraft));

    const storedEDraft = localStorage.getItem('157_estimateDraft');
    if (storedEDraft) setEstimateDraftState(JSON.parse(storedEDraft));

    let isMountedLocal = true;
    let initialAuthDone = false;

    const initializeAuth = async () => {
      setAuthLoading(true);
      setAuthProfileError(false);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isMountedLocal) return;

        if (session?.user) {
          setUser(session.user);
          try {
            const { data: prof, error: profError } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (profError) {
              console.error('[AUTH] Profile query error:', profError.message);
              if (isMountedLocal) {
                setAuthProfileError(true);
                setProfile(null);
              }
              return;
            }

            if (isMountedLocal) {
              setAuthProfileError(false);
              const effectiveRole = prof ? prof.role : 'customer';

              const resolvedProf: Profile = prof ? { ...prof, role: effectiveRole } : {
                id: session.user.id,
                user_id: session.user.id,
                display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'ลูกค้า 157 TATTOO',
                email: session.user.email || '',
                role: 'customer',
                is_active: true,
              };

              setProfile(resolvedProf);

              let custData: any = null;
              if (effectiveRole === 'customer') {
                try {
                  const { data: cRow } = await supabase
                    .from('customers')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .maybeSingle();
                  custData = cRow;

                  if (custData && isMountedLocal) {
                    setCustomerMasterPhone(custData.phone || null);
                    setCustomerProfileCompletedAt(custData.profile_completed_at || null);
                    setCustomerEligibilityConfirmedAt(custData.eligibility_confirmed_at || null);
                    if (!resolvedProf.phone && custData.phone) {
                      resolvedProf.phone = custData.phone;
                      setProfile({ ...resolvedProf, phone: custData.phone });
                    }
                  } else {
                    setCustomerMasterPhone(null);
                    setCustomerProfileCompletedAt(null);
                    setCustomerEligibilityConfirmedAt(null);
                  }
                } catch (_) {}
              }

              if (resolvedProf.role === 'admin') {
                try {
                  const { data: artistRec } = await supabase
                    .from('artists')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .eq('is_active', true)
                    .maybeSingle();
                  if (artistRec && isMountedLocal) {
                    setStaffArtistRecord(artistRec);
                    setStaffArtistIdState(artistRec.id);
                  }
                } catch (_) {}
              } else if (resolvedProf.role === 'artist' && resolvedProf.is_active !== false) {
                try {
                  const { data: artistRec } = await supabase
                    .from('artists')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .eq('is_active', true)
                    .maybeSingle();
                  if (artistRec && isMountedLocal) {
                    setStaffArtistRecord(artistRec);
                    setStaffArtistIdState(artistRec.id);
                  }
                } catch (_) {}
              }
              loadUserData(session.user, resolvedProf.role).catch(() => {});
            }
          } catch (profErr) {
            console.error('[AUTH] Profile query exception:', profErr);
            if (isMountedLocal) {
              setAuthProfileError(true);
              setProfile(null);
            }
          }
        } else {
          // No active Supabase session found - strictly clear state and remove legacy cookies/storage
          if (typeof window !== 'undefined') {
            document.cookie = '157_staff_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            document.cookie = '157_staff_email=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            document.cookie = '157_artist_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            localStorage.removeItem('157_staff_session');
          }
          setUser(null);
          setProfile(null);
          setStaffArtistRecord(null);
          setStaffArtistIdState(null);
          setAuthProfileError(false);
        }
      } catch (err) {
        console.error('[AUTH] Auth initialization error:', err);
      } finally {
        if (isMountedLocal) {
          initialAuthDone = true;
          setAuthLoading(false);
        }
      }
    };

    initializeAuth();
    fetchArtists();

    // 2. Auth State Change Listener (Only handles subsequent auth transitions!)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setUser(session.user);
        setTimeout(async () => {
          try {
            const { data: prof, error: profError } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (profError) {
              console.error('[AUTH] auth change profile query error:', profError.message);
              if (isMountedLocal) {
                setAuthProfileError(true);
                setProfile(null);
              }
              return;
            }

            if (isMountedLocal) {
              setAuthProfileError(false);
              const effectiveRole = prof ? prof.role : 'customer';

              const resolvedProf: Profile = prof ? { ...prof, role: effectiveRole } : {
                id: session.user.id,
                user_id: session.user.id,
                display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'ลูกค้า 157 TATTOO',
                email: session.user.email || '',
                role: 'customer',
                is_active: true,
              };

              setProfile(resolvedProf);

              if (effectiveRole === 'customer') {
                try {
                  const { data: custData } = await supabase
                    .from('customers')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .maybeSingle();

                  if (custData && isMountedLocal) {
                    setCustomerMasterPhone(custData.phone || null);
                    setCustomerProfileCompletedAt(custData.profile_completed_at || null);
                    setCustomerEligibilityConfirmedAt(custData.eligibility_confirmed_at || null);
                    if (!resolvedProf.phone && custData.phone) {
                      resolvedProf.phone = custData.phone;
                      setProfile({ ...resolvedProf, phone: custData.phone });
                    }
                  } else {
                    setCustomerMasterPhone(null);
                    setCustomerProfileCompletedAt(null);
                    setCustomerEligibilityConfirmedAt(null);
                  }
                } catch (_) {}
              } else if (resolvedProf.role === 'admin' || resolvedProf.role === 'artist') {
                try {
                  const { data: artistRec } = await supabase
                    .from('artists')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .eq('is_active', true)
                    .maybeSingle();
                  if (artistRec && isMountedLocal) {
                    setStaffArtistRecord(artistRec);
                    setStaffArtistIdState(artistRec.id);
                  }
                } catch (_) {}
              }
              loadUserData(session.user, resolvedProf.role).catch(() => {});
            }
          } catch (err) {
            console.error('[AUTH] auth change profile error:', err);
            if (isMountedLocal) {
              setAuthProfileError(true);
              setProfile(null);
            }
          }
        }, 0);
      } else if (event === 'SIGNED_OUT' || !session) {
        const storedStaff = typeof window !== 'undefined' ? localStorage.getItem('157_staff_session') : null;
        const storedCustomer = typeof window !== 'undefined' ? localStorage.getItem('157_customer_session') : null;
        if (!storedStaff && !storedCustomer) {
          setUser(null);
          setProfile(null);
          setStaffArtistRecord(null);
          setStaffArtistIdState(null);
          setEstimateRequests([]);
          setBookings([]);
          setBookingPayments([]);
        }
        if (isMountedLocal) setAuthLoading(false);
      }
    });

    return () => {
      isMountedLocal = false;
      subscription.unsubscribe();
    };
  }, []); // Run once on mount!

  const retryAuthProfile = useCallback(async () => {
    setAuthLoading(true);
    setAuthProfileError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: prof, error: profError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profError) {
          console.error('[AUTH Retry] profile query error:', profError.message);
          setAuthProfileError(true);
          setProfile(null);
          return;
        }

        setAuthProfileError(false);
        const effectiveRole = prof ? prof.role : 'customer';

        const resolvedProf: Profile = prof ? { ...prof, role: effectiveRole } : {
          id: session.user.id,
          user_id: session.user.id,
          display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'ลูกค้า 157 TATTOO',
          email: session.user.email || '',
          role: 'customer',
          is_active: true,
        };

        setProfile(resolvedProf);

        if (effectiveRole === 'customer') {
          try {
            const { data: custData } = await supabase
              .from('customers')
              .select('*')
              .eq('user_id', session.user.id)
              .maybeSingle();
            if (custData) {
              setCustomerMasterPhone(custData.phone || null);
              setCustomerProfileCompletedAt(custData.profile_completed_at || null);
              setCustomerEligibilityConfirmedAt(custData.eligibility_confirmed_at || null);
            }
          } catch (_) {}
        }
        loadUserData(session.user, resolvedProf.role).catch(() => {});
      }
    } catch (e) {
      console.error('[AUTH Retry] exception:', e);
      setAuthProfileError(true);
    } finally {
      setAuthLoading(false);
    }
  }, [supabase, loadUserData]);

  const saveToStorage = (key: string, data: any) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    }
  };

  // Customer Auth Operations (Email + Password, with contact phone metadata)
  const loginCustomer = async (email: string, password?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!password || password.trim() === '') {
      return { success: false, error: 'กรุณากรอกรหัสผ่าน' };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (!error && data.user) {
        setUser(data.user);

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .maybeSingle();

        let customerData: any = null;
        try {
          const { data: cRow } = await supabase
            .from('customers')
            .select('*')
            .eq('user_id', data.user.id)
            .maybeSingle();
          customerData = cRow;
        } catch (_) {}

        const userMetaRole = data.user.user_metadata?.role;
        const effectiveRole = (prof?.role && prof.role !== 'customer')
          ? prof.role
          : (userMetaRole || prof?.role || 'customer');

        const resolvedProf: Profile = prof ? { ...prof, role: effectiveRole } : {
          id: data.user.id,
          user_id: data.user.id,
          display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || cleanEmail.split('@')[0],
          email: data.user.email || cleanEmail,
          role: 'customer',
          is_active: true,
        };

        setProfile(resolvedProf);

        if (customerData) {
          setCustomerMasterPhone(customerData.phone || null);
          setCustomerProfileCompletedAt(customerData.profile_completed_at || null);
          setCustomerEligibilityConfirmedAt(customerData.eligibility_confirmed_at || null);
        } else {
          setCustomerMasterPhone(null);
          setCustomerProfileCompletedAt(null);
          setCustomerEligibilityConfirmedAt(null);
        }

        await loadUserData(data.user, resolvedProf.role).catch(() => {});

        const effectivePhone = (resolvedProf.phone || customerData?.phone || '').trim();
        const validPhone = Boolean(effectivePhone && /^0[0-9]{9}$/.test(effectivePhone));
        const isComplete = Boolean(
          resolvedProf.role === 'customer' &&
          validPhone &&
          customerData?.profile_completed_at &&
          customerData?.eligibility_confirmed_at
        );

        if (typeof document !== 'undefined') {
          document.cookie = '157_customer_role=customer; path=/; max-age=86400; SameSite=Lax';
        }
        return { success: true, isProfileComplete: isComplete };
      }

      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        } else if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        }
        return { success: false, error: msg };
      }

      return { success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    }
  };

  const signUpCustomer = async (
    email: string, 
    password?: string, 
    displayName?: string, 
    phone?: string,
    eligibilityConfirmed?: boolean
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    const name = displayName || cleanEmail.split('@')[0];
    const contactPhone = sanitizeDigitsOnly(phone || '');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password || '',
        options: {
          data: {
            full_name: name,
            name: name,
            role: 'customer'
          }
        }
      });

      if (!error && data.user) {
        try {
          const { data: existingProf } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (!existingProf) {
            await supabase.from('profiles').insert({
              user_id: data.user.id,
              display_name: name,
              email: cleanEmail,
              phone: contactPhone,
              role: 'customer',
              is_active: true
            });
          }
        } catch (_) {}

        setUser(null);
        setProfile(null);
        if (typeof document !== 'undefined') {
          document.cookie = '157_customer_role=; path=/; max-age=0; SameSite=Lax';
        }
        if (typeof window !== 'undefined') {
          localStorage.removeItem('157_customer_session');
        }

        return { success: true };
      }
      if (error && error.message !== 'Failed to fetch' && !error.message.includes('fetch')) {
        let msg = error.message;
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        }
        return { success: false, error: msg };
      }

      // Resilient fallback: create profile & session
      const mockUser: any = { id: 'cust-' + Date.now(), email: cleanEmail };
      const mockProf: Profile = {
        id: 'prof-' + Date.now(),
        user_id: mockUser.id,
        display_name: name,
        email: cleanEmail,
        phone: contactPhone,
        role: 'customer'
      };
      setUser(mockUser);
      setProfile(mockProf);
      setBookings([]);
      setEstimateRequests([]);
      if (typeof document !== 'undefined') {
        document.cookie = '157_customer_role=customer; path=/; max-age=86400; SameSite=Lax';
      }
      saveToStorage('157_customer_session', { user: mockUser, profile: mockProf });
      return { success: true };
    } catch (e: any) {
      const mockUser: any = { id: 'cust-' + Date.now(), email: cleanEmail };
      const mockProf: Profile = {
        id: 'prof-' + Date.now(),
        user_id: mockUser.id,
        display_name: name,
        email: cleanEmail,
        phone: contactPhone,
        role: 'customer'
      };
      setUser(mockUser);
      setProfile(mockProf);
      setBookings([]);
      setEstimateRequests([]);
      if (typeof document !== 'undefined') {
        document.cookie = '157_customer_role=customer; path=/; max-age=86400; SameSite=Lax';
      }
      saveToStorage('157_customer_session', { user: mockUser, profile: mockProf });
      return { success: true };
    }
  };

  const loginWithGoogle = async (returnUrl?: string) => {
    try {
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const safeTarget = getSafeReturnUrl(returnUrl);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(safeTarget)}`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Google' };
    }
  };

  const updateCustomerPhone = async (newPhone: string) => {
    const cleanPhone = newPhone.trim();
    if (!/^0[0-9]{9}$/.test(cleanPhone)) {
      return { success: false, error: 'กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก' };
    }
    if (user && profile) {
      const { error } = await supabase
        .from('profiles')
        .update({ phone: cleanPhone })
        .eq('user_id', user.id);
      if (!error) {
        const updated = { ...profile, phone: cleanPhone };
        setProfile(updated);
        saveToStorage('157_customer_session', { user, profile: updated });
        return { success: true };
      }
    }
    if (profile) {
      const updated = { ...profile, phone: cleanPhone };
      setProfile(updated);
      saveToStorage('157_customer_session', { user, profile: updated });
      return { success: true };
    }
    return { success: false, error: 'ไม่พบบัญชีผู้ใช้' };
  };

  const completeCustomerProfile = async (
    name: string,
    phone: string,
    eligibilityConfirmed: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' };
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      return { success: false, error: 'กรุณากรอกชื่อผู้ใช้งาน' };
    }

    if (!cleanPhone || !/^0[0-9]{9}$/.test(cleanPhone)) {
      return { success: false, error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง 10 หลัก' };
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('complete_customer_profile', {
        p_user_id: user.id,
        p_name: cleanName,
        p_phone: cleanPhone,
        p_eligibility_confirmed: eligibilityConfirmed
      });

      if (rpcError) {
        console.error('[AppContext] complete_customer_profile RPC error:', rpcError);
        return { success: false, error: rpcError.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' };
      }

      const nowIso = new Date().toISOString();

      let resultCustData: any = null;
      try {
        const { data: cRow } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        resultCustData = cRow;
      } catch (_) {}

      try {
        await supabase
          .from('profiles')
          .update({
            display_name: cleanName,
            phone: cleanPhone,
            role: 'customer',
            is_active: true
          })
          .eq('user_id', user.id);
      } catch (_) {}

      setCustomerMasterPhone(cleanPhone);
      setCustomerProfileCompletedAt(resultCustData?.profile_completed_at || nowIso);
      setCustomerEligibilityConfirmedAt(resultCustData?.eligibility_confirmed_at || nowIso);

      if (profile) {
        const updatedProf = { ...profile, display_name: cleanName, phone: cleanPhone };
        setProfile(updatedProf);
        saveToStorage('157_customer_session', { user, profile: updatedProf });
      }

      return { success: true };
    } catch (err: any) {
      console.error('[AppContext] completeCustomerProfile error:', err);
      return { success: false, error: err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' };
    }
  };

  const logoutCustomer = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    setUser(null);
    setProfile(null);
    setEstimateRequests([]);
    setBookings([]);
    setBookingPayments([]);
    if (typeof window !== 'undefined') {
      document.cookie = '157_customer_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      localStorage.removeItem('157_customer_session');
      window.location.href = '/';
    }
  };

  const loginStaff = async (
    email: string, 
    password?: string
  ): Promise<{ success: boolean; role: 'ADMIN' | 'ARTIST' | null; error?: string }> => {
    const lowerEmail = email.toLowerCase().trim();
    if (!password || password.trim() === '') {
      return { success: false, role: null, error: 'กรุณากรอกรหัสผ่าน' };
    }

    try {
      // Clear prior customer cookies/storage before staff auth
      if (typeof document !== 'undefined') {
        document.cookie = '157_customer_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        localStorage.removeItem('157_customer_session');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: lowerEmail,
        password: password,
      });

      if (!error && data.user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (!prof) {
          return { success: false, role: null, error: 'ไม่พบข้อมูลโปรไฟล์พนักงานในระบบ' };
        }

        if (prof.is_active === false) {
          return { success: false, role: null, error: 'บัญชีนี้ไม่สามารถเข้าใช้งานระบบพนักงานได้' };
        }

        if (prof.role === 'customer') {
          return { success: false, role: null, error: 'บัญชีนี้เป็นบัญชีลูกค้า กรุณาเข้าสู่ระบบผ่านหน้าลูกค้า' };
        }

        if (prof.role === 'admin') {
          setUser(data.user);
          setProfile(prof);

          let linkedArtist: any = null;
          try {
            const { data: artistRec } = await supabase
              .from('artists')
              .select('*')
              .eq('user_id', data.user.id)
              .eq('is_active', true)
              .maybeSingle();
            if (artistRec) {
              linkedArtist = artistRec;
              setStaffArtistRecord(artistRec);
              setStaffArtistIdState(artistRec.id);
            } else {
              setStaffArtistRecord(null);
              setStaffArtistIdState(null);
            }
          } catch (_) {
            setStaffArtistRecord(null);
            setStaffArtistIdState(null);
          }

          if (typeof document !== 'undefined') {
            document.cookie = `157_staff_role=admin; path=/; max-age=86400; SameSite=Lax`;
            document.cookie = `157_staff_email=${lowerEmail}; path=/; max-age=86400; SameSite=Lax`;
            if (linkedArtist) {
              document.cookie = `157_artist_id=${linkedArtist.id}; path=/; max-age=86400; SameSite=Lax`;
            } else {
              document.cookie = '157_artist_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            }
            document.cookie = '157_customer_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            localStorage.removeItem('157_customer_session');
          }
          saveToStorage('157_staff_session', { user: data.user, profile: prof, artist: linkedArtist });
          loadUserData(data.user, 'admin').catch(() => {});
          setAuthLoading(false);
          return { success: true, role: 'ADMIN' as const };
        }

        if (prof.role === 'artist') {
          const { data: artistRec, error: artErr } = await supabase
            .from('artists')
            .select('*')
            .eq('user_id', data.user.id)
            .eq('is_active', true)
            .maybeSingle();

          if (artErr || !artistRec || artistRec.is_active === false) {
            console.warn('[STAFF-LOGIN] artist profile exists but no active linked artists row');
            return {
              success: false,
              role: null,
              error: 'บัญชีช่างยังไม่ได้เชื่อมกับข้อมูลช่างในระบบ กรุณาติดต่อผู้ดูแลร้าน'
            };
          }

          setUser(data.user);
          setProfile(prof);
          setStaffArtistRecord(artistRec);
          setStaffArtistIdState(artistRec.id);
          if (typeof document !== 'undefined') {
            document.cookie = `157_staff_role=artist; path=/; max-age=86400; SameSite=Lax`;
            document.cookie = `157_staff_email=${lowerEmail}; path=/; max-age=86400; SameSite=Lax`;
            document.cookie = `157_artist_id=${artistRec.id}; path=/; max-age=86400; SameSite=Lax`;
            document.cookie = '157_customer_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            localStorage.removeItem('157_customer_session');
          }
          saveToStorage('157_staff_session', { user: data.user, profile: prof, artist: artistRec });
          loadUserData(data.user, 'artist').catch(() => {});
          setAuthLoading(false);
          return { success: true, role: 'ARTIST' as const };
        }

        await supabase.auth.signOut();
        return { success: false, role: null, error: 'บัญชีนี้ไม่สามารถเข้าใช้งานระบบพนักงานได้' };
      }

      if (error) {
        return { success: false, role: null, error: error.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
      }

      return { success: false, role: null, error: 'ไม่พบผู้ใช้ในระบบ หรืออีเมลและรหัสผ่านไม่ถูกต้อง (สำหรับพนักงานเท่านั้น)' };
    } catch (e: any) {
      return { success: false, role: null, error: e?.message || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์' };
    }
  };

  const logoutStaff = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    setUser(null);
    setProfile(null);
    setStaffArtistRecord(null);
    setStaffArtistIdState(null);
    setEstimateRequests([]);
    setBookings([]);
    setBookingPayments([]);
    if (typeof window !== 'undefined') {
      document.cookie = '157_staff_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = '157_staff_email=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = '157_artist_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      localStorage.removeItem('157_staff_session');
      window.location.href = '/staff/login';
    }
  };

  // Draft operations
  const setBookingDraft = (draft: Partial<Booking> | null) => {
    setBookingDraftState(draft);
    if (draft) {
      saveToStorage('157_bookingDraft', draft);
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('157_bookingDraft');
    }
  };

  const setEstimateDraft = (draft: Partial<EstimateRequest> | null) => {
    setEstimateDraftState(draft);
    if (draft) {
      saveToStorage('157_estimateDraft', draft);
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem('157_estimateDraft');
    }
  };

  // Insert Booking request to Supabase
  const addBookingRequest = async (booking: Partial<Booking>): Promise<string> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนทำการส่งคำขอจองคิวสัก');
    }

    const targetArtistId = booking.artistId || (artists.length > 0 ? artists[0].id : null);
    if (!targetArtistId) {
      throw new Error('ไม่พบข้อมูลช่างสักที่ระบุในระบบ กรุณาเลือกช่างสักใหม่อีกครั้ง');
    }

    if (!booking.date || !booking.startTime || !booking.endTime) {
      throw new Error('กรุณาระบุวันที่และช่วงเวลาที่ต้องการจองให้ครบถ้วน');
    }

    const startAt = `${booking.date}T${booking.startTime}:00+07:00`;
    const endAt = `${booking.date}T${booking.endTime}:00+07:00`;
    const bookingSource = booking.bookingSource || (booking.estimateRequestId ? 'ESTIMATE' : 'FLASH');

    const newDbBooking: any = {
      customer_user_id: user.id,
      artist_id: targetArtistId,
      booking_source: bookingSource,
      source_ref: booking.bookingType === 'flash' ? booking.id || 'flash-artwork' : null,
      artwork_title: booking.artworkTitle || null,
      artwork_image_url: booking.artworkImage || null,
      placement: booking.placement || null,
      width_cm: booking.width || null,
      height_cm: booking.height || null,
      description: booking.description || null,
      start_at: startAt,
      end_at: endAt,
      requested_date: booking.date,
      requested_start_time: booking.startTime,
      timezone: 'Asia/Bangkok',
      tattoo_price: booking.price !== undefined ? booking.price : null,
      deposit_required: booking.deposit !== undefined ? booking.deposit : null,
      customer_note: booking.customerNote || null,
      status: 'PENDING'
    };

    if (booking.estimateRequestId) {
      newDbBooking.estimate_request_id = booking.estimateRequestId;
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert(newDbBooking)
      .select()
      .single();

    if (error) {
      console.error('Error inserting booking:', error);
      if (error.code === '23P01' || error.message?.includes('no_artist_double_booking')) {
        throw new Error('ช่วงเวลานี้มีคิวจองที่ได้รับการอนุมัติแล้ว กรุณาเลือกวันหรือช่วงเวลาอื่น');
      }
      if (error.code === '23505' || error.message?.includes('idx_unique_active_estimate_booking')) {
        throw new Error('ใบเสนอราคานี้ได้ถูกดำเนินการจองคิวไปแล้ว ไม่สามารถส่งคำขอจองซ้ำได้');
      }
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลการจอง');
    }

    setBookingDraft(null);
    await fetchBookings(user);
    return data.id;
  };

  // Insert Estimate request to Supabase
  const addEstimateRequest = async (estimate: Partial<EstimateRequest>): Promise<string> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบเพื่อดำเนินการส่งคำขอประเมินราคา');
    }

    if (!estimate.artistId) {
      throw new Error('กรุณาเลือกช่างสักที่ต้องการ');
    }

    if (!estimate.style || !estimate.style.trim()) {
      throw new Error('กรุณาเลือกสไตล์งานสัก');
    }

    // Verify selected style against actual artist specialties in database
    const { data: artistRecord, error: artistErr } = await supabase
      .from('artists')
      .select('id, name, specialties')
      .eq('id', estimate.artistId)
      .single();

    if (artistErr || !artistRecord) {
      throw new Error('ไม่พบข้อมูลช่างสักที่ระบุในระบบ');
    }

    const validStyles: string[] = Array.isArray(artistRecord.specialties) && artistRecord.specialties.length > 0
      ? artistRecord.specialties.map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (!validStyles.includes(estimate.style.trim())) {
      throw new Error('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่');
    }

    const finalRefImages = estimate.referenceImages && estimate.referenceImages.length > 0 
      ? estimate.referenceImages 
      : (estimate.referenceImage ? [estimate.referenceImage] : []);

    if (finalRefImages.length > 5) {
      throw new Error('สามารถแนบรูปภาพอ้างอิงได้สูงสุด 5 รูปเท่านั้น');
    }

    const rawTime = estimate.preferred_time || estimate.preferredTime;
    const formattedPreferredTime = rawTime && rawTime.trim()
      ? (rawTime.trim().length === 5 ? `${rawTime.trim()}:00` : rawTime.trim())
      : null;

    const newDbEstimate: any = {
      customer_user_id: user.id,
      artist_id: estimate.artistId,
      reference_images: finalRefImages.slice(0, 5),
      width_cm: estimate.width || 10,
      height_cm: estimate.height || 10,
      placement: estimate.placement || 'ไม่ระบุ',
      style: estimate.style.trim(),
      description: estimate.description || '',
      preferred_date: estimate.preferredDate || null,
      preferred_time: formattedPreferredTime,
      has_medical_condition: Boolean(estimate.hasMedicalCondition),
      medical_condition_note: estimate.hasMedicalCondition && estimate.medicalConditionNote?.trim() ? estimate.medicalConditionNote.trim() : null,
      has_allergy: Boolean(estimate.hasAllergy),
      allergy_note: estimate.hasAllergy && estimate.allergyNote?.trim() ? estimate.allergyNote.trim() : null,
      request_type: 'ESTIMATE',
      work_type: estimate.work_type || null,
      status: 'PENDING'
    };

    const { data, error } = await supabase
      .from('estimate_requests')
      .insert(newDbEstimate)
      .select()
      .single();

    if (error) {
      console.error('Error inserting estimate:', error);
      if (error.message?.includes('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก')) {
        throw new Error('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่');
      }
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลคำขอประเมินราคา');
    }

    setEstimateDraft(null);
    await fetchEstimates(user);
    return data.id;
  };

  // Update Booking status in Supabase
  const updateBookingStatus = async (
    id: string, 
    status: Booking['status'],
    rejectionReason?: string,
    staffNote?: string
  ): Promise<void> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');
    }

    const updatePayload: any = { status };
    if (rejectionReason) updatePayload.rejection_reason = rejectionReason;
    if (staffNote) updatePayload.staff_note = staffNote;

    const { error } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error('Error updating booking status:', error);
      if (error.code === '23P01' || error.message?.includes('no_artist_double_booking')) {
        throw new Error('ไม่สามารถอนุมัติได้เนื่องจากช่วงเวลาชนกับคิวจองอื่นที่ได้รับการอนุมัติแล้ว (Double-booking Conflict)');
      }
      if (status === 'COMPLETED') {
        throw new Error(mapServerCompletionError(error.message));
      }
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการอัปเดตสถานะการจอง');
    }

    await fetchBookings(user);
  };

  // Update Estimate status in Supabase
  const updateEstimateStatus = async (
    id: string, 
    status: EstimateRequest['status'], 
    quotedPrice?: number, 
    quotedDeposit?: number,
    estimatedDuration?: number,
    quoteNote?: string
  ): Promise<void> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');
    }

    const updateData: any = { status };
    if (quotedPrice !== undefined) updateData.quoted_price = quotedPrice;
    if (quotedDeposit !== undefined) updateData.deposit_required = quotedDeposit;
    if (estimatedDuration !== undefined) updateData.estimated_duration_minutes = estimatedDuration * 60;
    if (quoteNote !== undefined) updateData.quote_note = quoteNote;

    const { error } = await supabase
      .from('estimate_requests')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating estimate status:', error);
      throw new Error(error.message);
    }

    await fetchEstimates(user);
  };

  // Customer submits deposit payment reference
  const submitDepositPayment = async (
    paymentId: string, 
    paymentReference: string, 
    paymentMethod = 'PROMPTPAY', 
    customerNote?: string
  ): Promise<void> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนแจ้งชำระเงินมัดจำ');
    }

    if (!paymentReference || paymentReference.trim() === '') {
      throw new Error('กรุณากรอกเลขอ้างอิงการโอนเงินหรือสลิป');
    }

    const { error } = await supabase
      .from('booking_payments')
      .update({
        status: 'SUBMITTED',
        payment_reference: paymentReference.trim(),
        payment_method: paymentMethod,
        customer_note: customerNote || null,
        submitted_at: new Date().toISOString()
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error submitting deposit payment:', error);
      throw new Error(error.message || 'ไม่สามารถส่งข้อมูลแจ้งชำระเงินได้');
    }

    await fetchBookings(user);
  };

  // Admin verifies deposit payment atomically
  const verifyDepositPayment = async (paymentId: string, staffNote?: string): Promise<void> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');
    }

    const { error } = await supabase.rpc('verify_deposit_payment', {
      p_payment_id: paymentId,
      p_staff_note: staffNote || null
    });

    if (error) {
      console.error('Error verifying deposit payment:', error);
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการยืนยันยอดเงินมัดจำ');
    }

    await fetchBookings(user);
  };

  // Admin rejects deposit payment
  const rejectDepositPayment = async (paymentId: string, reason: string): Promise<void> => {
    if (!user) {
      throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');
    }

    if (!reason || reason.trim() === '') {
      throw new Error('กรุณาระบุเหตุผลในการปฏิเสธ');
    }

    const { error } = await supabase.rpc('reject_deposit_payment', {
      p_payment_id: paymentId,
      p_reason: reason.trim()
    });

    if (error) {
      console.error('Error rejecting deposit payment:', error);
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการปฏิเสธยอดเงินมัดจำ');
    }

    await fetchBookings(user);
  };

  const payDeposit = (id: string) => {
    // Phase 2C: Local preview fallback
    setBookings(prev => prev.map(b => b.id === id ? { ...b, paymentStatus: 'DEPOSIT_PAID' as const } : b));
  };

  const updateArtistStatus = (artistId: string, status: Artist['status']) => {
    const updated = artists.map(a => a.id === artistId ? { ...a, status } : a);
    setArtists(updated);
    saveToStorage('157_artists', updated);
  };

  const getArtistBusySlots = async (
    artistId: string, 
    fromDate?: string, 
    toDate?: string
  ): Promise<{ startAt: string; endAt: string }[]> => {
    if (!artistId) return [];

    const startDate = fromDate || new Date().toISOString().split('T')[0];
    const endDate = toDate || fromDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const { data, error } = await supabase.rpc('get_artist_busy_ranges', {
        p_artist_id: artistId,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error || !data) {
        return [];
      }

      return (data || []).map((d: any) => ({ startAt: d.start_at, endAt: d.end_at }));
    } catch (_) {
      return [];
    }
  };

  const isLoggedIn = user !== null;
  const isStaffLoggedIn = Boolean(
    profile &&
    profile.is_active !== false &&
    (
      profile.role === 'admin' ||
      (profile.role === 'artist' && staffArtistRecord && staffArtistRecord.is_active !== false)
    )
  );

  const staffRole: 'ADMIN' | 'ARTIST' | null = (
    profile?.is_active !== false && profile?.role === 'admin'
      ? ('ADMIN' as const)
      : (profile?.is_active !== false && profile?.role === 'artist' && staffArtistRecord && staffArtistRecord.is_active !== false)
        ? ('ARTIST' as const)
        : null
  );

  const staffArtistId = staffArtistIdState || staffArtistRecord?.id || null;

  const effectiveCustomerPhone = (profile?.phone || customerMasterPhone || user?.phone || '').trim();

  const isCustomerProfileComplete = checkIsCustomerProfileComplete(
    profile?.role,
    profile?.is_active,
    effectiveCustomerPhone,
    customerProfileCompletedAt,
    customerEligibilityConfirmedAt
  );

  return (
    <AppContext.Provider value={{
      supabase,
      isLoggedIn,
      customerPhone: effectiveCustomerPhone,
      customerEmail: user?.email || profile?.email || '',
      customerName: profile?.display_name || (user?.phone ? formatThaiPhoneForDisplay(user.phone) : user?.email?.split('@')[0]) || 'ลูกค้า 157 TATTOO',
      customerProfileCompletedAt,
      customerEligibilityConfirmedAt,
      isCustomerProfileComplete,
      isStaffLoggedIn,
      staffRole,
      staffArtistId,
      staffArtistRecord,
      user,
      profile,
      authLoading,
      authProfileError,
      retryAuthProfile,
      artists,
      fetchArtists,
      bookings,
      bookingPayments,
      estimateRequests,
      bookingDraft,
      estimateDraft,
      loginCustomer,
      signUpCustomer,
      loginWithGoogle,
      updateCustomerPhone,
      completeCustomerProfile,
      logoutCustomer,
      loginStaff,
      logoutStaff,
      setBookingDraft,
      setEstimateDraft,
      addBookingRequest,
      addEstimateRequest,
      updateBookingStatus,
      updateEstimateStatus,
      submitDepositPayment,
      verifyDepositPayment,
      rejectDepositPayment,
      payDeposit,
      updateArtistStatus,
      getArtistBusySlots
    }}>
      {authProfileError && user ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">เกิดข้อผิดพลาดในการโหลดข้อมูล</h3>
            <p className="text-sm text-zinc-400">ไม่สามารถโหลดข้อมูลบัญชีได้ กรุณาลองใหม่อีกครั้ง</p>
            <button
              onClick={() => retryAuthProfile()}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition duration-200"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
