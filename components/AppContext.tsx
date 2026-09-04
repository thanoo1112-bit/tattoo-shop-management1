'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Artist } from '@/data/mockArtists';
import { Booking, BookingPayment } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { normalizeThaiPhone, formatThaiPhoneForDisplay } from '@/lib/phoneUtils';

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
  
  artists: Artist[];
  fetchArtists: () => Promise<Artist[]>;
  bookings: Booking[];
  bookingPayments: BookingPayment[];
  estimateRequests: EstimateRequest[];
  
  bookingDraft: Partial<Booking> | null;
  estimateDraft: Partial<EstimateRequest> | null;
  
  loginCustomer: (email: string, password?: string) => Promise<{ success: boolean; isProfileComplete?: boolean; error?: string }>;
  signUpCustomer: (email: string, password?: string, displayName?: string, phone?: string, eligibilityConfirmed?: boolean) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
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
const parseBangkokDateTime = (isoString: string) => {
  const d = new Date(isoString);
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
  if (role !== 'customer') return false;
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

  // Fetch estimates from Supabase
  const fetchEstimates = useCallback(async (currentUser = user) => {
    if (!currentUser) {
      setEstimateRequests([]);
      return;
    }

    const { data: dbEstimates, error: errEst } = await supabase
      .from('estimate_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (errEst) {
      console.error('Error fetching estimates:', errEst);
      return;
    }

    if (!dbEstimates) {
      setEstimateRequests([]);
      return;
    }

    const customerUserIds = Array.from(
      new Set(dbEstimates.map(e => e.customer_user_id).filter(Boolean))
    );

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
      const customerProf = profilesList.find(p => p.user_id === item.customer_user_id);
      const matchedArtist = artistsList.find((a: any) => a.id === item.artist_id);

      return {
        id: item.id,
        customerName: customerProf?.display_name || customerProf?.email?.split('@')[0] || 'ลูกค้าประจำ',
        customerEmail: customerProf?.email || 'customer@example.com',
        artistId: item.artist_id || '',
        artistName: matchedArtist?.name || 'ช่างประจำร้าน',
        referenceImage: item.reference_images?.[0] || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500',
        width: Number(item.width_cm) || 10,
        height: Number(item.height_cm) || 10,
        placement: item.placement,
        style: item.style || 'Fine Line',
        description: item.description || '',
        preferredDate: item.preferred_date || undefined,
        submittedDate: new Date(item.created_at).toISOString().split('T')[0],
        status: item.status as any,
        quotedPrice: item.quoted_price ? Number(item.quoted_price) : undefined,
        quotedDeposit: item.deposit_required ? Number(item.deposit_required) : undefined,
        estimatedDuration: item.estimated_duration_minutes ? Number(item.estimated_duration_minutes) / 60 : undefined,
        quoteNote: item.quote_note || undefined,
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

    // 1. Fetch bookings
    const { data: dbBookings, error: errBook } = await supabase
      .from('bookings')
      .select('*')
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
      customerUserId: p.customer_user_id,
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
    const customerUserIds = Array.from(
      new Set(dbBookings.map(b => b.customer_user_id).filter(Boolean))
    );

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
      const customerProf = profilesList.find(p => p.user_id === item.customer_user_id);
      const matchedArtist = artistsList.find((a: any) => a.id === item.artist_id);

      const startParsed = parseBangkokDateTime(item.start_at);
      const endParsed = parseBangkokDateTime(item.end_at);

      const durationHours = Math.max(
        1,
        Math.round((new Date(item.end_at).getTime() - new Date(item.start_at).getTime()) / (1000 * 60 * 60) * 10) / 10
      );

      // Match linked deposit payment
      const linkedDeposit = rawPayments.find(p => p.bookingId === item.id && p.paymentType === 'DEPOSIT');
      const verifiedDepositAmount = linkedDeposit?.status === 'VERIFIED' ? linkedDeposit.amount : 0;
      const tattooPrice = item.tattoo_price ? Number(item.tattoo_price) : 0;
      const remainingBalance = Math.max(0, tattooPrice - verifiedDepositAmount);

      return {
        id: item.id,
        customerName: customerProf?.display_name || customerProf?.email?.split('@')[0] || 'ลูกค้าประจำ',
        customerEmail: customerProf?.email || 'customer@example.com',
        artistId: item.artist_id || '',
        artistName: matchedArtist?.name || 'ช่างประจำร้าน',
        artworkTitle: item.artwork_title || (item.booking_source === 'ESTIMATE' ? 'งานสักจากใบประเมินราคา' : 'งานสัก Custom'),
        artworkImage: item.artwork_image_url || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500',
        date: item.requested_date || startParsed.date,
        startTime: item.requested_start_time || startParsed.time,
        endTime: endParsed.time,
        duration: durationHours,
        price: tattooPrice,
        deposit: item.deposit_required ? Number(item.deposit_required) : 0,
        bookingType: item.booking_source === 'FLASH' ? 'flash' : 'custom',
        status: item.status as any,
        paymentStatus: linkedDeposit?.status === 'VERIFIED' ? 'DEPOSIT_PAID' : 'UNPAID',
        estimateRequestId: item.estimate_request_id || undefined,
        bookingSource: item.booking_source as any,
        placement: item.placement || undefined,
        width: item.width_cm ? Number(item.width_cm) : undefined,
        height: item.height_cm ? Number(item.height_cm) : undefined,
        description: item.description || undefined,
        customerNote: item.customer_note || undefined,
        staffNote: item.staff_note || undefined,
        rejectionReason: item.rejection_reason || undefined,
        paymentId: linkedDeposit?.id,
        depositStatus: linkedDeposit?.status,
        depositPaymentReference: linkedDeposit?.paymentReference,
        depositStaffNote: linkedDeposit?.staffNote,
        remainingBalance: remainingBalance,
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

    const initializeAuth = async () => {
      console.log('[ADMIN-AUTH 01] AppContext mounted');
      console.log('[ADMIN-AUTH 02] initializeAuth started');
      setAuthLoading(true);

      try {
        console.log('[ADMIN-AUTH 03] before getSession');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('[ADMIN-AUTH 04] getSession returned. Session present:', !!session, 'Error:', sessionError?.message || 'none');

        if (!isMountedLocal) return;

        if (session?.user) {
          console.log('[ADMIN-AUTH 05] session user exists:', session.user.email);
          setUser(session.user);
          console.log('[ADMIN-AUTH 06] before profile query');
          try {
            const { data: prof, error: profError } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .single();
            console.log('[ADMIN-AUTH 07] profile query returned. Role:', prof?.role, 'Error:', profError?.message || 'none');

            if (prof && isMountedLocal) {
              setProfile(prof);
              if (prof.role === 'customer') {
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
                    if (!prof.phone && custData.phone) {
                      prof.phone = custData.phone;
                      setProfile({ ...prof, phone: custData.phone });
                    }
                  }
                } catch (_) {}
              }
              if (prof.role === 'admin') {
                console.log('[ADMIN-AUTH 08] role verified admin');
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
              } else if (prof.role === 'artist' && prof.is_active !== false) {
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
              console.log('[ADMIN-AUTH 09] auth state updated');
              // Asynchronously load operational data in background - NEVER block Auth loading!
              loadUserData(session.user, prof.role).catch(() => {});
            }
          } catch (profErr) {
            console.error('[ADMIN-AUTH] profile query exception:', profErr);
          }
        } else {
          // No active Supabase session found - strictly clear state and remove legacy cookies/storage
          console.log('[ADMIN-AUTH 05] No active Supabase session in browser client');
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
        }
      } catch (err) {
        console.error('[ADMIN-AUTH] Auth initialization error:', err);
      } finally {
        if (isMountedLocal) {
          console.log('[ADMIN-AUTH 10] before setAuthLoading(false)');
          setAuthLoading(false);
          console.log('[ADMIN-AUTH 11] authLoading false');
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

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        if (isMountedLocal) setAuthLoading(true);
        // Defer database query outside the auth lock to avoid deadlock with signInWithPassword
        setTimeout(async () => {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', session.user.id)
              .single();
            if (prof && isMountedLocal) {
              setProfile(prof);
              if (prof.role === 'customer') {
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
                    if (!prof.phone && custData.phone) {
                      prof.phone = custData.phone;
                      setProfile({ ...prof, phone: custData.phone });
                    }
                  }
                } catch (_) {}
              } else if (prof.role === 'admin') {
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
              } else if (prof.role === 'artist' && prof.is_active !== false) {
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
              loadUserData(session.user, prof.role).catch(() => {});
            }
          } catch (_) {}
          if (isMountedLocal) setAuthLoading(false);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
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
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .single();

        let customerData: any = null;
        if (prof?.role === 'customer') {
          try {
            const { data: cRow } = await supabase
              .from('customers')
              .select('*')
              .eq('user_id', data.user.id)
              .maybeSingle();
            customerData = cRow;
          } catch (_) {}
        }

        if (prof) {
          setUser(data.user);
          setProfile(prof);
          if (customerData) {
            setCustomerProfileCompletedAt(customerData.profile_completed_at || null);
            setCustomerEligibilityConfirmedAt(customerData.eligibility_confirmed_at || null);
          }
          await loadUserData(data.user, prof.role).catch(() => {});
        } else {
          setUser(data.user);
        }

        const effectivePhone = prof?.phone || customerData?.phone || '';
        const validPhone = Boolean(effectivePhone && /^0[0-9]{9}$/.test(effectivePhone.trim()));
        const isComplete = Boolean(
          prof?.role === 'customer' &&
          validPhone &&
          customerData?.profile_completed_at &&
          customerData?.eligibility_confirmed_at
        );

        if (typeof document !== 'undefined') {
          document.cookie = '157_customer_role=customer; path=/; max-age=86400; SameSite=Lax';
        }
        return { success: true, isProfileComplete: isComplete };
      }
      if (error && error.message !== 'Failed to fetch' && !error.message.includes('fetch')) {
        let msg = error.message;
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        } else if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        }
        return { success: false, error: msg };
      }

      // Seamless resilient fallback for demo / test customer
      const mockUser: any = { id: 'mock-customer-1', email: cleanEmail };
      const mockProf: Profile = { 
        id: 'prof-cust-1', 
        user_id: 'mock-customer-1', 
        display_name: cleanEmail.split('@')[0], 
        email: cleanEmail, 
        phone: '081-234-5678', 
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
      const mockUser: any = { id: 'mock-customer-1', email: cleanEmail };
      const mockProf: Profile = { 
        id: 'prof-cust-1', 
        user_id: 'mock-customer-1', 
        display_name: cleanEmail.split('@')[0], 
        email: cleanEmail, 
        phone: '081-234-5678', 
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

  const signUpCustomer = async (
    email: string, 
    password?: string, 
    displayName?: string, 
    phone?: string,
    eligibilityConfirmed?: boolean
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    const name = displayName || cleanEmail.split('@')[0];
    const contactPhone = phone ? phone.trim() : '';

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password || 'password',
        options: {
          data: {
            display_name: name,
            phone: contactPhone,
            ...(eligibilityConfirmed === true ? { eligibility_confirmed: true } : {}),
          },
        },
      });
      if (!error && data.user) {
        // Enforce Register-then-Login: Immediately sign out any session created by Supabase on signup
        try {
          await supabase.auth.signOut();
        } catch (_) {}

        // Clear local state so customer must manually log in with email and password
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

  const loginWithGoogle = async () => {
    try {
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl}/portal`,
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
    displayName: string, 
    phone: string, 
    eligibilityConfirmed: boolean
  ) => {
    const cleanName = displayName.trim();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      return { success: false, error: 'กรุณากรอกชื่อผู้ใช้งาน' };
    }
    if (!cleanPhone) {
      return { success: false, error: 'กรุณากรอกเบอร์โทรศัพท์' };
    }
    if (!/^0[0-9]{9}$/.test(cleanPhone)) {
      return { success: false, error: 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก' };
    }
    if (eligibilityConfirmed !== true) {
      return { success: false, error: 'กรุณายืนยันเงื่อนไขก่อนดำเนินการ' };
    }

    try {
      // Single Authority: Call complete_customer_profile RPC
      // NO direct update fallback!
      const { data, error } = await supabase.rpc('complete_customer_profile', {
        p_display_name: cleanName,
        p_phone: cleanPhone,
        p_eligibility_confirmed: true,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Update in-memory state upon confirmed RPC success
      setCustomerMasterPhone(cleanPhone);
      setCustomerProfileCompletedAt(data?.profile_completed_at || new Date().toISOString());
      setCustomerEligibilityConfirmedAt(data?.eligibility_confirmed_at || new Date().toISOString());

      if (user) {
        try {
          const { data: freshCust } = await supabase
            .from('customers')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          if (freshCust) {
            setCustomerMasterPhone(freshCust.phone || cleanPhone);
            setCustomerProfileCompletedAt(freshCust.profile_completed_at || null);
            setCustomerEligibilityConfirmedAt(freshCust.eligibility_confirmed_at || null);
          }

          const { data: freshProf } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          if (freshProf) {
            setProfile(freshProf);
            saveToStorage('157_customer_session', { user, profile: freshProf });
          } else if (profile) {
            const updated = { ...profile, display_name: cleanName, phone: cleanPhone };
            setProfile(updated);
            saveToStorage('157_customer_session', { user, profile: updated });
          }
        } catch (_) {}
      }

      return { success: true };
    } catch (err: any) {
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
    console.log('[STAFF-LOGIN 04] loginStaff entered');
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

      console.log('[STAFF-LOGIN 05] before signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: lowerEmail,
        password: password,
      });
      console.log('[STAFF-LOGIN 06] signInWithPassword returned. Error:', error?.message || 'none', 'User:', data?.user?.id ? '[PRESENT]' : 'null');

      if (!error && data.user) {
        console.log('[STAFF-LOGIN 07] before profile query');
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.user.id)
          .maybeSingle();
        console.log('[STAFF-LOGIN 08] profile query returned. Role:', prof?.role);

        if (!prof) {
          await supabase.auth.signOut();
          return { success: false, role: null, error: 'ไม่พบข้อมูลโปรไฟล์พนักงานในระบบ' };
        }

        if (prof.is_active === false) {
          await supabase.auth.signOut();
          return { success: false, role: null, error: 'บัญชีนี้ไม่สามารถเข้าใช้งานระบบพนักงานได้' };
        }

        if (prof.role === 'customer') {
          await supabase.auth.signOut();
          return { success: false, role: null, error: 'บัญชีนี้เป็นบัญชีลูกค้า กรุณาเข้าสู่ระบบผ่านหน้าลูกค้า' };
        }

        if (prof.role === 'admin') {
          console.log('[STAFF-LOGIN 09] admin verified');
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
          console.log('[STAFF-LOGIN 10] loginStaff returning success (ADMIN)');
          return { success: true, role: 'ADMIN' as const };
        }

        if (prof.role === 'artist') {
          console.log('[STAFF-LOGIN 09] validating artist record linkage');
          const { data: artistRec, error: artErr } = await supabase
            .from('artists')
            .select('*')
            .eq('user_id', data.user.id)
            .eq('is_active', true)
            .maybeSingle();

          if (artErr || !artistRec || artistRec.is_active === false) {
            console.warn('[STAFF-LOGIN] artist profile exists but no active linked artists row');
            await supabase.auth.signOut();
            return {
              success: false,
              role: null,
              error: 'บัญชีช่างยังไม่ได้เชื่อมกับข้อมูลช่างในระบบ กรุณาติดต่อผู้ดูแลร้าน'
            };
          }

          console.log('[STAFF-LOGIN 09] artist verified:', artistRec.name, 'ID:', artistRec.id);
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
          console.log('[STAFF-LOGIN 10] loginStaff returning success (ARTIST)');
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

    const newDbEstimate: any = {
      customer_user_id: user.id,
      artist_id: estimate.artistId,
      reference_images: estimate.referenceImage ? [estimate.referenceImage] : [],
      width_cm: estimate.width || 10,
      height_cm: estimate.height || 10,
      placement: estimate.placement || 'ท่อนแขน (Forearm)',
      style: estimate.style.trim(),
      description: estimate.description || '',
      preferred_date: estimate.preferredDate || null,
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
