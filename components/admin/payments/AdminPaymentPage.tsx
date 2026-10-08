'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  RefreshCw,
  CheckCircle2,
  X,
  Settings,
  Layers,
} from 'lucide-react';
import PaymentSummaryCards from './PaymentSummaryCards';
import PaymentBookingList from './PaymentBookingList';
import PaymentDetailPanel from './PaymentDetailPanel';
import RecordPaymentForm from './RecordPaymentForm';
import OnsitePriceAdjustmentModal from './OnsitePriceAdjustmentModal';
import VoidPaymentDialog from './VoidPaymentDialog';
import AdminPaymentSettingsSection from './AdminPaymentSettingsSection';
import RevenueFilters from '@/components/admin/revenue/RevenueFilters';
import RevenueByArtistBarChart, { ArtistRevenueItemDetail } from './RevenueByArtistBarChart';
import {
  DateFilterPreset,
  DailyRevenueItem,
  toBangkokDate,
  getBangkokToday,
  getBangkokCurrentMonth,
  getBangkokPreviousMonth,
} from '@/components/admin/revenue/types';
import {
  PaymentBookingDetail,
  BookingPaymentSummaryRow,
  BookingPaymentRecord,
  BookingStatusFilter,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminPaymentPage() {
  const [activeMainTab, setActiveMainTab] = useState<'overview_revenue' | 'settings'>('overview_revenue');

  const [bookings, setBookings] = useState<PaymentBookingDetail[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');

  // Revenue Date & Artist Filters (Default: 'this_month')
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(getBangkokToday());
  const [customEndDate, setCustomEndDate] = useState<string>(getBangkokToday());
  const [selectedArtistId, setSelectedArtistId] = useState<string>('ALL');

  // Modals & Panels State
  const [selectedBooking, setSelectedBooking] = useState<PaymentBookingDetail | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isAdjustPriceModalOpen, setIsAdjustPriceModalOpen] = useState(false);
  const [voidTargetPayment, setVoidTargetPayment] = useState<BookingPaymentRecord | null>(null);

  // Toast Feedback State
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Main Live Data Fetcher
  const fetchLivePaymentData = useCallback(async (opts?: { isInitial?: boolean }) => {
    if (opts?.isInitial) {
      setIsLoading(true);
    }
    try {
      const supabase = createClient();

      // 0. Fetch active artists list
      const { data: artList } = await supabase
        .from('artists')
        .select('id, name, nickname')
        .order('name');
      if (artList) setArtists(artList);

      // 1. Fetch live booking_payment_summary
      const { data: summaries, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('booking_id, estimate_request_id, customer_user_id, artist_id, quoted_price, deposit_required, deposit_paid, final_paid, total_paid, paid_total, balance_due, payment_status, is_fully_paid, is_deposit_paid, remaining_balance');

      if (sumErr) throw sumErr;

      // 2. Fetch all bookings with joined artist, estimate, and sessions
      const { data: bList, error: bErr } = await supabase
        .from('bookings')
        .select(`
          id, customer_id, customer_user_id, artist_id, estimate_request_id, flash_reservation_id, booking_number, status, appointment_date, appointment_time, work_type, custom_work_title, quoted_price, deposit_required, deposit_status, created_at, updated_at, request_type, booking_source, is_walkin, admin_notes, payment_status, cancellation_reason,
          artists (id, name, nickname),
          estimate_requests (id, placement, description, customer_user_id),
          booking_sessions (id, session_number, start_at, end_at, status)
        `)
        .order('created_at', { ascending: false });

      if (bErr) throw bErr;

      // 3. Fetch non-voided booking payments
      const { data: pList, error: pErr } = await supabase
        .from('booking_payments')
        .select('id, booking_id, customer_id, customer_user_id, payment_type, amount, currency, payment_method, payment_reference, status, created_at, verified_at, notes, booking_session_id')
        .neq('status', 'VOIDED')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      // 4. Fetch linked estimates, flash reservations, and flash designs for artwork title/style resolution
      const estimateIds = Array.from(new Set((bList || []).map((b: any) => b.estimate_request_id).filter(Boolean)));
      let estimatesMap = new Map<string, any>();
      if (estimateIds.length > 0) {
        const { data: dbEstimates } = await supabase.from('estimate_requests').select('*').in('id', estimateIds);
        (dbEstimates || []).forEach((e: any) => estimatesMap.set(e.id, e));
      }

      const flashResIds = Array.from(new Set((bList || []).map((b: any) => b.flash_reservation_id).filter(Boolean)));
      let flashReservationsMap = new Map<string, any>();
      let flashDesignIdsFromRes: string[] = [];
      if (flashResIds.length > 0) {
        const { data: dbFlashRes } = await supabase.from('flash_reservations').select('id, flash_design_id, flash_designs(*)').in('id', flashResIds);
        (dbFlashRes || []).forEach((fr: any) => {
          flashReservationsMap.set(fr.id, fr);
          if (fr.flash_design_id) flashDesignIdsFromRes.push(fr.flash_design_id);
        });
      }

      const allFlashDesignIds = Array.from(new Set([
        ...(bList || []).map((b: any) => b.flash_design_id).filter(Boolean),
        ...Array.from(estimatesMap.values()).map((e: any) => e.flash_design_id).filter(Boolean),
        ...flashDesignIdsFromRes.filter(Boolean)
      ]));

      let flashDesignsMap = new Map<string, any>();
      if (allFlashDesignIds.length > 0) {
        const { data: dbFlash } = await supabase.from('flash_designs').select('*').in('id', allFlashDesignIds);
        (dbFlash || []).forEach((f: any) => flashDesignsMap.set(f.id, f));
      }

      const resolveArtworkTitle = (b: any) => {
        const source = String(b.booking_source || '').trim().toUpperCase();
        const est = b.estimate_request_id ? estimatesMap.get(b.estimate_request_id) : null;
        const flashRes = b.flash_reservation_id ? flashReservationsMap.get(b.flash_reservation_id) : null;

        const targetFlashDesignId = b.flash_design_id
          || flashRes?.flash_design_id
          || est?.flash_design_id;

        const flashObj = (targetFlashDesignId ? flashDesignsMap.get(targetFlashDesignId) : null)
          || flashRes?.flash_designs
          || flashRes?.flash_design;

        const isFlash = source === 'FLASH'
          || Boolean(b.flash_design_id)
          || Boolean(b.flash_reservation_id)
          || Boolean(targetFlashDesignId)
          || (est && est.request_type === 'FLASH');

        if (isFlash) {
          const style = flashObj?.style
            || flashObj?.flash_design_style
            || flashRes?.flash_design_style
            || est?.style;

          if (style && String(style).trim()) {
            return `Flash · ${String(style).trim()}`;
          }
          return `Flash · ไม่ระบุสไตล์`;
        }

        const isCustom = source === 'CUSTOM' || source === 'STANDARD' || source === 'ESTIMATE' || Boolean(b.estimate_request_id);

        if (isCustom) {
          const styleName = est?.style || est?.tattoo_style || b?.style;
          if (styleName && String(styleName).trim()) {
            return `Custom · ${String(styleName).trim()}`;
          }
          return `Custom · ไม่ระบุสไตล์`;
        }

        return b.artwork_title || 'งานสัก Custom';
      };

      const resolveTattooStyle = (b: any) => {
        const est = b.estimate_request_id ? estimatesMap.get(b.estimate_request_id) : null;
        const flashRes = b.flash_reservation_id ? flashReservationsMap.get(b.flash_reservation_id) : null;

        const targetFlashDesignId = b.flash_design_id
          || flashRes?.flash_design_id
          || est?.flash_design_id;

        const flashObj = (targetFlashDesignId ? flashDesignsMap.get(targetFlashDesignId) : null)
          || flashRes?.flash_designs
          || flashRes?.flash_design;

        const rawStyle = flashObj?.style
          || flashObj?.flash_design_style
          || flashRes?.flash_design_style
          || est?.style
          || est?.tattoo_style
          || b?.tattoo_style
          || b?.style;

        if (rawStyle && String(rawStyle).trim()) {
          let cleanStr = String(rawStyle).trim();
          if (cleanStr.startsWith('Flash · ')) cleanStr = cleanStr.replace('Flash · ', '').trim();
          if (cleanStr.startsWith('Custom · ')) cleanStr = cleanStr.replace('Custom · ', '').trim();
          if (cleanStr) return cleanStr;
        }
        return 'ไม่ระบุสไตล์';
      };

      // 5. Fetch customers & profiles for display names
      const customerUids = Array.from(
        new Set(
          (bList || [])
            .map((b: any) => b.customer_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let custList: any[] = [];
      let profList: any[] = [];
      if (customerUids.length > 0) {
        const [cRes, pRes] = await Promise.all([
          supabase.from('customers').select('user_id, display_name, phone, email').in('user_id', customerUids),
          supabase.from('profiles').select('user_id, display_name, phone, email').in('user_id', customerUids),
        ]);
        if (cRes.data) custList = cRes.data;
        if (pRes.data) profList = pRes.data;
      }

      // 6. Map & Hydrate PaymentBookingDetail array
      const mapped: PaymentBookingDetail[] = (bList || []).map((b: any) => {
        const summary: BookingPaymentSummaryRow = (summaries || []).find((s: any) => s.booking_id === b.id) || {
          booking_id: b.id,
          estimate_request_id: b.estimate_request_id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          quoted_price: Number(b.tattoo_price || 0),
          deposit_required: Number(b.deposit_required || 0),
          paid_total: 0,
          remaining_balance: Number(b.tattoo_price || 0),
          deposit_paid: false,
          is_fully_paid: false,
        };

        const cust = (custList || []).find((c: any) => c.user_id === b.customer_user_id);
        const prof = (profList || []).find((p: any) => p.user_id === b.customer_user_id);
        const artist = b.artists;

        const est = b.estimate_request_id ? estimatesMap.get(b.estimate_request_id) : null;
        const flashRes = b.flash_reservation_id ? flashReservationsMap.get(b.flash_reservation_id) : null;

        const targetFlashDesignId = b.flash_design_id
          || flashRes?.flash_design_id
          || (est && est.request_type === 'FLASH' ? est.flash_design_id : null);

        const isCustomRequest = Boolean(
          (est && (est.request_type === 'CUSTOM' || est.request_type === 'ESTIMATE')) ||
          String(b.booking_source || '').toUpperCase() === 'CUSTOM' ||
          String(b.booking_source || '').toUpperCase() === 'STANDARD'
        );

        const isFlashBooking = !isCustomRequest && Boolean(
          String(b.booking_source || '').toUpperCase() === 'FLASH'
          || b.flash_design_id
          || b.flash_reservation_id
          || targetFlashDesignId
          || (est && est.request_type === 'FLASH')
        );

        return {
          id: b.id,
          estimate_request_id: b.estimate_request_id,
          flash_reservation_id: b.flash_reservation_id || null,
          flash_design_id: targetFlashDesignId || null,
          is_flash: isFlashBooking,
          is_custom: isCustomRequest,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          requested_date: b.requested_date,
          booking_source: b.booking_source,
          approved_at: b.approved_at,
          confirmed_at: b.confirmed_at,
          created_at: b.created_at,
          status: b.status,
          customer_name: cust?.display_name || prof?.display_name || prof?.email?.split('@')[0] || 'ลูกค้าประจำ',
          customer_phone: cust?.phone || prof?.phone || undefined,
          customer_email: cust?.email || prof?.email || undefined,
          artist_name: artist?.name || 'ช่างประจำร้าน',
          artist_nickname: artist?.nickname || undefined,
          artwork_title: resolveArtworkTitle(b),
          tattoo_style: resolveTattooStyle(b),
          summary,
          payments: (pList || [])
            .filter((p: any) => p.booking_id === b.id)
            .map((p: any) => ({
              id: p.id,
              booking_id: p.booking_id,
              customer_id: p.customer_id,
              customer_user_id: p.customer_user_id,
              payment_type: p.payment_type,
              amount: Number(p.amount || 0),
              currency: p.currency,
              payment_method: p.payment_method,
              payment_reference: p.payment_reference,
              status: p.status,
              customer_note: p.customer_note,
              staff_note: p.staff_note,
              paid_at: p.paid_at,
              created_at: p.created_at,
            })),
          sessions: (b.booking_sessions || []).map((s: any) => ({
            id: s.id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
          })),
        };
      });

      setBookings(mapped);

      // Keep selected booking updated if detail drawer is open
      setSelectedBooking((prev) => {
        if (!prev) return null;
        return mapped.find((m) => m.id === prev.id) || prev;
      });
    } catch (err: any) {
      console.error('Error fetching live payment data:', err);
      showToast('error', 'ไม่สามารถโหลดข้อมูลการเงินจากฐานข้อมูลได้: ' + (err.message || 'Network error'));
    } finally {
      if (opts?.isInitial) {
        setIsLoading(false);
      }
    }
  }, []);

  const isInitialMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isInitialMountedRef.current) {
      isInitialMountedRef.current = true;
      fetchLivePaymentData({ isInitial: true });
    } else {
      fetchLivePaymentData({ isInitial: false });
    }

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['booking_payments', 'booking_payment_submissions', 'bookings', 'customers'].includes(detail?.table)) {
        fetchLivePaymentData({ isInitial: false });
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
  }, [refreshTrigger, fetchLivePaymentData]);

  // Fallback for legacy URL tab parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'settings') {
        setActiveMainTab('settings');
      } else {
        setActiveMainTab('overview_revenue');
      }
    }
  }, []);

  // Filtered recorded payments based on selected Date Preset & Artist Dropdown
  const filteredPayments = useMemo(() => {
    const todayBangkok = getBangkokToday();
    const currentMonth = getBangkokCurrentMonth();
    const previousMonth = getBangkokPreviousMonth();

    const allPayments: Array<{ amount: number; paid_at_display: string; artist_id: string | null; booking_id: string }> = [];

    bookings.forEach((b) => {
      (b.payments || []).forEach((p: any) => {
        if (String(p.status || '').toUpperCase() === 'RECORDED') {
          // Robust date resolution: paid_at -> created_at (prevents returning "")
          const rawDate = p.paid_at || p.created_at;
          const bkkDate = toBangkokDate(rawDate);
          allPayments.push({
            amount: Number(p.amount || 0),
            paid_at_display: bkkDate,
            artist_id: b.artist_id,
            booking_id: b.id,
          });
        }
      });
    });

    return allPayments.filter((p) => {
      // Artist filter
      if (selectedArtistId !== 'ALL' && p.artist_id !== selectedArtistId) {
        return false;
      }

      // Date preset filter (Bangkok timezone)
      const pDate = p.paid_at_display;

      if (datePreset === 'this_month') {
        return pDate.startsWith(currentMonth);
      }
      if (datePreset === 'last_month') {
        return pDate.startsWith(previousMonth);
      }
      if (datePreset === 'custom') {
        if (customStartDate && pDate < customStartDate) return false;
        if (customEndDate && pDate > customEndDate) return false;
      }

      return true;
    });
  }, [bookings, selectedArtistId, datePreset, customStartDate, customEndDate]);

  // Total period revenue for selected filters
  const periodRevenueTotal = useMemo(() => {
    return filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPayments]);

  // Daily Revenue Trend for Bar Chart
  const dailyTrend: DailyRevenueItem[] = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();

    filteredPayments.forEach((p) => {
      const bkkDate = p.paid_at_display;
      if (!bkkDate) return;

      const curr = map.get(bkkDate) || { amount: 0, count: 0 };
      map.set(bkkDate, {
        amount: curr.amount + p.amount,
        count: curr.count + 1,
      });
    });

    const dates = Array.from(map.keys()).sort();
    if (dates.length === 0) return [];

    const thaiMonthsShort = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    return dates.map((d) => {
      const parts = d.split('-');
      const monthNum = parseInt(parts[1], 10);
      const dayNum = parseInt(parts[2], 10);
      const displayDate = `${dayNum} ${thaiMonthsShort[monthNum] || ''}`;
      const entry = map.get(d)!;

      return {
        date: d,
        displayDate,
        amount: entry.amount,
        count: entry.count,
      };
    });
  }, [filteredPayments]);

  // Revenue by Artist Data (Bar Chart)
  const artistRevenueData: ArtistRevenueItemDetail[] = useMemo(() => {
    const amountMap = new Map<string, number>();

    filteredPayments.forEach((p) => {
      const aid = p.artist_id || 'UNKNOWN';
      const curr = amountMap.get(aid) || 0;
      amountMap.set(aid, curr + p.amount);
    });

    const items: ArtistRevenueItemDetail[] = artists.map((art) => {
      const amount = amountMap.get(art.id) || 0;
      const percentage = periodRevenueTotal > 0 ? (amount / periodRevenueTotal) * 100 : 0;
      return {
        artist_id: art.id,
        name: art.name,
        nickname: art.nickname,
        amount,
        percentage,
      };
    });

    const unknownAmount = amountMap.get('UNKNOWN') || 0;
    if (unknownAmount > 0) {
      const percentage = periodRevenueTotal > 0 ? (unknownAmount / periodRevenueTotal) * 100 : 0;
      items.push({
        artist_id: 'UNKNOWN',
        name: 'ช่างประจำร้าน / ไม่ระบุ',
        nickname: null,
        amount: unknownAmount,
        percentage,
      });
    }

    return items.sort((a, b) => b.amount - a.amount);
  }, [artists, filteredPayments, periodRevenueTotal]);

  // KPI Calculations for Top Summary Cards
  const kpiData = useMemo(() => {
    let totalActiveBookingsCount = 0;
    let completedBookingsCount = 0;
    const uniqueFlashDesignIds = new Set<string>();

    const currentMonth = getBangkokCurrentMonth();
    const previousMonth = getBangkokPreviousMonth();

    const isDateMatch = (rawDateStr?: string | null) => {
      if (!rawDateStr) return false;
      const bkkDate = toBangkokDate(rawDateStr);
      if (!bkkDate) return false;

      if (datePreset === 'this_month') {
        return bkkDate.startsWith(currentMonth);
      }
      if (datePreset === 'last_month') {
        return bkkDate.startsWith(previousMonth);
      }
      if (datePreset === 'custom') {
        if (customStartDate && bkkDate < customStartDate) return false;
        if (customEndDate && bkkDate > customEndDate) return false;
      }
      return true;
    };

    bookings.forEach((b) => {
      // 1. Artist filter
      if (selectedArtistId !== 'ALL' && b.artist_id !== selectedArtistId) {
        return;
      }

      // 2. Date filter check (checks if booking has a payment in selected period, or if booking date matches period)
      const hasPaymentInPeriod = (b.payments || []).some((p: any) => {
        if (String(p.status || '').toUpperCase() !== 'RECORDED') return false;
        const pDate = p.paid_at || p.created_at;
        return isDateMatch(pDate);
      });

      const bDate = b.confirmed_at || b.requested_date || b.created_at;
      const isInDatePeriod = hasPaymentInPeriod || isDateMatch(bDate);

      if (!isInDatePeriod) {
        return;
      }

      const statusUpper = String(b.status || '').toUpperCase();

      // Confirmed statuses (EXCLUDES WAITING_DEPOSIT, PENDING_DEPOSIT, PENDING, REJECTED, CANCELLED, EXPIRED, HOLD)
      const isConfirmedOrActive = ['CONFIRMED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(statusUpper);

      // KPI 1: งานที่ยืนยันแล้วทั้งหมด
      if (isConfirmedOrActive) {
        totalActiveBookingsCount += 1;
      }

      // KPI 4: งานเสร็จสิ้น
      if (statusUpper === 'COMPLETED') {
        completedBookingsCount += 1;
      }

      // KPI 2: ลาย Flash ที่ถูกจอง (นับเฉพาะ Flash จริง ไม่รวม Custom, ต้องสถานะยืนยันแล้ว และนับแบบไม่ซ้ำ)
      if (isConfirmedOrActive && b.is_flash && !b.is_custom) {
        const flashKey = b.flash_design_id || b.flash_reservation_id || b.id;
        if (flashKey) {
          uniqueFlashDesignIds.add(flashKey);
        }
      }
    });

    return {
      totalRecordedRevenue: periodRevenueTotal,
      totalActiveBookingsCount,
      bookedFlashCount: uniqueFlashDesignIds.size,
      completedBookingsCount,
    };
  }, [bookings, selectedArtistId, datePreset, customStartDate, customEndDate, periodRevenueTotal]);

  // Filtered Bookings List for Finance Table (shows bookings with recorded payments > 0, or explicitly filtered CANCELLED/EXPIRED)
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 0. Filter out bookings with 0 recorded payments unless explicitly filtering CANCELLED/EXPIRED
      const recordedSum = (b.payments || [])
        .filter((p: any) => String(p.status || '').toUpperCase() === 'RECORDED')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

      if (recordedSum <= 0) {
        return false;
      }

      // 1. Artist filter
      if (selectedArtistId !== 'ALL' && b.artist_id !== selectedArtistId) {
        return false;
      }

      // 2. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = b.customer_name.toLowerCase().includes(q);
        const matchArtist = b.artist_name.toLowerCase().includes(q);
        const matchId = b.id.toLowerCase().includes(q);
        const matchArtwork = (b.artwork_title || '').toLowerCase().includes(q);
        if (!matchCust && !matchArtist && !matchId && !matchArtwork) return false;
      }

      return true;
    });
  }, [bookings, selectedArtistId, searchQuery]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6 font-prompt">
      {/* Toast Feedback Notification */}
      {feedbackToast && (
        <div
          className={`fixed top-20 right-4 sm:right-8 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl border text-xs font-medium animate-fadeIn ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
              : 'bg-red-950 text-red-300 border-red-700'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          ) : (
            <X size={16} className="text-red-400 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
          <button
            onClick={() => setFeedbackToast(null)}
            className="ml-2 text-[#7A7265] hover:text-[#ECE4D3] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Title & Subtitle Header */}
      <div className="border-b border-[#4A443A] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 sm:px-3 sm:py-1 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <CreditCard size={12} className="text-[#9C2F2F]" />
            <span>Financial & Payments</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            การเงินและการชำระเงิน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            ติดตามรายได้ ภาพรวมการชำระเงิน และตั้งค่าบัญชีรับเงินของสตูดิโอ
          </p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#4A443A] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveMainTab('overview_revenue')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 " +
            (activeMainTab === 'overview_revenue'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <Layers size={14} className={activeMainTab === 'overview_revenue' ? 'text-[#9C2F2F]' : ''} />
          <span>ภาพรวมและรายได้</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('settings')}
          className={
            "px-4 py-2 rounded-t-[6px] text-xs font-bold transition-all flex items-center gap-2 " +
            (activeMainTab === 'settings'
              ? "bg-[#171512] text-[#ECE4D3] border-t-2 border-t-[#9C2F2F] border-x border-[#4A443A]"
              : "text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/50")
          }
        >
          <Settings size={14} className={activeMainTab === 'settings' ? 'text-[#9C2F2F]' : ''} />
          <span>ตั้งค่าการชำระเงิน</span>
        </button>
      </div>

      {/* Tab 1 Content: Merged Overview & Revenue */}
      {activeMainTab === 'overview_revenue' && (
        <div className="space-y-6 animate-fadeIn">
          {/* 1. TOP: 4 Summary KPI Cards */}
          <PaymentSummaryCards
            totalRecordedRevenue={kpiData.totalRecordedRevenue}
            totalActiveBookingsCount={kpiData.totalActiveBookingsCount}
            bookedFlashCount={kpiData.bookedFlashCount}
            completedBookingsCount={kpiData.completedBookingsCount}
          />

          {/* 2. TOP: Date & Artist Filters */}
          <RevenueFilters
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            customStartDate={customStartDate}
            onCustomStartDateChange={setCustomStartDate}
            customEndDate={customEndDate}
            onCustomEndDateChange={setCustomEndDate}
            selectedArtistId={selectedArtistId}
            onArtistChange={setSelectedArtistId}
            artists={artists}
            onResetFilters={() => {
              setDatePreset('this_month');
              setSelectedArtistId('ALL');
            }}
          />

          {/* 3. MAIN: Side-by-Side Layout on XL Screens (Table ~65% Left, Charts ~35% Right Stacked) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Finance History Table (~65% width on XL) */}
            <div className="xl:col-span-8">
              <PaymentBookingList
                bookings={filteredBookings}
                selectedBookingId={selectedBooking?.id}
                onSelectBooking={(b) => setSelectedBooking(b)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedArtistId={selectedArtistId}
                onArtistChange={setSelectedArtistId}
                artists={artists}
                isLoading={isLoading}
              />
            </div>

            {/* Right Column: Revenue by Artist Card (~35% width on XL) */}
            <div className="xl:col-span-4">
              <RevenueByArtistBarChart
                artistsData={artistRevenueData}
                totalRevenue={periodRevenueTotal}
              />
            </div>
          </div>

          {/* Record Payment Form Modal */}
          <RecordPaymentForm
            booking={selectedBooking}
            isOpen={isRecordModalOpen}
            onClose={() => setIsRecordModalOpen(false)}
            onOpenAdjustPriceModal={() => setIsAdjustPriceModalOpen(true)}
            onSuccess={(msg) => {
              showToast('success', msg);
              handleRefresh();
            }}
            onError={(err) => showToast('error', err)}
          />

          {/* On-site Price Adjustment Modal (เพิ่มราคา / ลดราคา) */}
          <OnsitePriceAdjustmentModal
            booking={selectedBooking}
            isOpen={isAdjustPriceModalOpen}
            onClose={() => setIsAdjustPriceModalOpen(false)}
            onSuccess={(msg) => {
              showToast('success', msg);
              handleRefresh();
            }}
            onError={(err) => showToast('error', err)}
          />

          {/* Void Payment Confirmation Dialog */}
          <VoidPaymentDialog
            payment={voidTargetPayment}
            isOpen={Boolean(voidTargetPayment)}
            onClose={() => setVoidTargetPayment(null)}
            onSuccess={(msg) => {
              showToast('success', msg);
              handleRefresh();
            }}
            onError={(err) => showToast('error', err)}
          />
        </div>
      )}

      {/* Tab 2 Content: Payment Settings (Unchanged) */}
      {activeMainTab === 'settings' && (
        <div className="animate-fadeIn">
          <AdminPaymentSettingsSection
            onSuccessToast={(msg) => showToast('success', msg)}
            onErrorToast={(err) => showToast('error', err)}
          />
        </div>
      )}

      {/* Slide-out Payment Detail Panel */}
      <PaymentDetailPanel
        booking={selectedBooking}
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        onOpenRecordModal={() => setIsRecordModalOpen(true)}
        onOpenAdjustPriceModal={() => setIsAdjustPriceModalOpen(true)}
        onOpenVoidModal={(p) => setVoidTargetPayment(p)}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}

