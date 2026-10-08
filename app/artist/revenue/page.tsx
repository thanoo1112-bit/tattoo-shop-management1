'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import { formatDateBangkok, getTodayBangkokStr, getDateStrBangkok } from '@/components/admin/calendar/calendarUtils';
import { 
  DollarSign, 
  RefreshCw, 
  CalendarCheck, 
  CheckCircle2, 
  Wallet, 
  User, 
  Inbox
} from 'lucide-react';

interface BookingJobRevenueRecord {
  booking_id: string;
  customer_name: string;
  artwork_title: string;
  deposit_paid: number;
  balance_paid: number;
  total_received: number;
  booking_status: string;
  date_display: string;
  month_date_str: string;
}

export default function ArtistRevenuePage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'this_month' | 'last_month' | 'all'>('this_month');
  
  const [jobRevenueRecords, setJobRevenueRecords] = useState<BookingJobRevenueRecord[]>([]);
  const [artistBookings, setArtistBookings] = useState<any[]>([]);
  const [bookedFlashWorksCount, setBookedFlashWorksCount] = useState<number>(0);

  const activeArtistId = staffArtistId || (staffRole === 'ADMIN' ? 'd5af5064-d973-4bbb-b205-1ab6b2929abb' : null);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && activeArtistId))
  );

  // Route protection
  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isAuthorized, authLoading]);

  // Fetch live revenue data for current artist
  const fetchArtistRevenue = useCallback(async () => {
    if (!isAuthorized || !activeArtistId) return;
    setLoading(true);
    setError(null);

    try {
      // 0. Fetch Flash-only booked designs count for current artist in current month using flash_reservations.created_at (Asia/Bangkok)
      const currentMonthStr = getTodayBangkokStr().slice(0, 7);
      const bookedFlashIds = new Set<string>();

      const { data: dbArtistFlash, error: flashErr } = await supabase
        .from('flash_designs')
        .select('id')
        .eq('artist_id', activeArtistId);

      if (flashErr) {
        console.error('[artist/revenue] failed to load artist flash designs', flashErr);
        setError('ไม่สามารถโหลดข้อมูลผลงาน Flash ได้ กรุณาลองใหม่อีกครั้ง');
        setLoading(false);
        return;
      }

      const artistFlashList = dbArtistFlash || [];
      const artistFlashIds = artistFlashList.map((f: any) => f.id);

      if (artistFlashIds.length > 0) {
        const { data: dbFlashRes, error: resErr } = await supabase
          .from('flash_reservations')
          .select('id, flash_design_id, status, created_at')
          .in('flash_design_id', artistFlashIds)
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED")');

        if (resErr) {
          console.error('[artist/revenue] failed to load flash reservations', resErr);
          setError('ไม่สามารถโหลดข้อมูลคำขอจอง Flash ได้ กรุณาลองใหม่อีกครั้ง');
          setLoading(false);
          return;
        }

        (dbFlashRes || []).forEach((fr: any) => {
          if (fr.flash_design_id && fr.created_at) {
            // Filter strictly by customer reservation booking date (created_at) in Asia/Bangkok timezone for current month
            const reservationMonthStr = getDateStrBangkok(fr.created_at).slice(0, 7);
            if (reservationMonthStr === currentMonthStr) {
              bookedFlashIds.add(fr.flash_design_id);
            }
          }
        });
      }

      setBookedFlashWorksCount(bookedFlashIds.size);

      // 1. Fetch bookings assigned to current artist
      const { data: dbBookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, artist_id, customer_user_id, estimate_request_id, flash_reservation_id, flash_design_id, status, appointment_date, created_at, requested_date, artwork_title, custom_work_title, style_preference, quoted_price')
        .eq('artist_id', activeArtistId);

      if (bErr) {
        console.error('[artist/revenue] failed to load artist bookings', bErr);
        setError('ไม่สามารถโหลดข้อมูลรายได้ได้ กรุณาลองใหม่อีกครั้ง');
        setLoading(false);
        return;
      }

      const bookings = dbBookings || [];
      setArtistBookings(bookings);

      const bookingIds = bookings.map((b: any) => b.id);
      if (bookingIds.length === 0) {
        setJobRevenueRecords([]);
        setLoading(false);
        return;
      }

      // 2. Fetch RECORDED payments for current artist's bookings
      const { data: dbPayments, error: pErr } = await supabase
        .from('booking_payments')
        .select('id, booking_id, amount, status, paid_at, payment_type, payment_method, verified_at, notes')
        .in('booking_id', bookingIds)
        .eq('status', 'RECORDED')
        .order('paid_at', { ascending: false });

      if (pErr) {
        console.error('[artist/revenue] failed to load booking payments', pErr);
        setError('ไม่สามารถโหลดข้อมูลการชำระเงินได้ กรุณาลองใหม่อีกครั้ง');
        setLoading(false);
        return;
      }

      const payments = dbPayments || [];

      // 3. Fetch linked estimates for artwork title / style
      const estimateIds = Array.from(new Set(bookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let estimatesMap = new Map<string, any>();
      if (estimateIds.length > 0) {
        const { data: dbEstimates } = await supabase
          .from('estimate_requests')
          .select('id, artwork_title, style, style_preference, flash_design_id, request_type')
          .in('id', estimateIds);
        (dbEstimates || []).forEach((e: any) => estimatesMap.set(e.id, e));
      }

      // 4. Fetch linked flash_reservations if available (Direct + Artist RPC fallback for RLS)
      const flashResIds = Array.from(new Set(bookings.map((b: any) => b.flash_reservation_id).filter(Boolean)));
      let flashReservationsMap = new Map<string, any>();
      let flashDesignIdsFromRes: string[] = [];

      if (flashResIds.length > 0) {
        const { data: dbFlashRes } = await supabase
          .from('flash_reservations')
          .select('id, flash_design_id, flash_designs(*)')
          .in('id', flashResIds);

        (dbFlashRes || []).forEach((fr: any) => {
          flashReservationsMap.set(fr.id, fr);
          if (fr.flash_design_id) {
            flashDesignIdsFromRes.push(fr.flash_design_id);
          }
        });

        // Artist RPC Fallback in case direct fetch hits RLS
        const missingResIds = flashResIds.filter(id => !flashReservationsMap.has(id));
        if (missingResIds.length > 0 && activeArtistId) {
          try {
            const { data: rpcRes } = await supabase.rpc('artist_get_flash_reservations', { p_artist_id: activeArtistId });
            (rpcRes || []).forEach((r: any) => {
              if (r.id) {
                const existing = flashReservationsMap.get(r.id);
                const mappedObj = {
                  id: r.id,
                  flash_design_id: r.flash_design_id,
                  flash_design_title: r.flash_design_title,
                  flash_design_style: r.flash_design_style,
                  flash_designs: existing?.flash_designs || {
                    id: r.flash_design_id,
                    title: r.flash_design_title,
                    style: r.flash_design_style
                  }
                };
                flashReservationsMap.set(r.id, mappedObj);
                if (r.flash_design_id) {
                  flashDesignIdsFromRes.push(r.flash_design_id);
                }
              }
            });
          } catch (e) {
            console.error('Error fetching artist flash reservations via RPC:', e);
          }
        }
      }

      // 5. Fetch linked flash designs for flash bookings
      const allFlashDesignIds = Array.from(new Set([
        ...bookings.map((b: any) => b.flash_design_id).filter(Boolean),
        ...Array.from(estimatesMap.values()).map((e: any) => e.flash_design_id).filter(Boolean),
        ...flashDesignIdsFromRes.filter(Boolean)
      ]));

      let flashDesignsMap = new Map<string, any>();
      if (allFlashDesignIds.length > 0) {
        const { data: dbFlash } = await supabase
          .from('flash_designs')
          .select('*')
          .in('id', allFlashDesignIds);
        (dbFlash || []).forEach((f: any) => flashDesignsMap.set(f.id, f));
      }

      // 6. Fetch customer profile info via RPC & direct fallback
      const customerUserIds = Array.from(new Set(bookings.map((b: any) => b.customer_user_id).filter(Boolean)));
      let contactsMap = new Map<string, any>();

      if (customerUserIds.length > 0) {
        const { data: contactsData, error: cErr } = await supabase
          .rpc('artist_get_customer_contacts', {
            p_customer_user_ids: customerUserIds
          });

        if (cErr) {
          console.error('Error fetching artist customer contacts via RPC:', cErr);
        } else if (contactsData) {
          contactsData.forEach((c: any) => {
            if (c.user_id) contactsMap.set(c.user_id, c);
          });
        }

        const { data: cData } = await supabase
          .from('customers')
          .select('user_id, display_name, first_name, last_name, email')
          .in('user_id', customerUserIds);

        (cData || []).forEach((c: any) => {
          if (c.user_id && !contactsMap.has(c.user_id)) {
            contactsMap.set(c.user_id, {
              display_name: c.display_name || (c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : c.email)
            });
          }
        });

        const { data: pData } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', customerUserIds);

        (pData || []).forEach((p: any) => {
          if (p.user_id && !contactsMap.has(p.user_id)) {
            contactsMap.set(p.user_id, { display_name: p.display_name || p.email });
          }
        });
      }

      // Helper function to resolve exact artwork title & style display
      const getArtworkTitle = (booking: any, estimate: any) => {
        if (!booking) return 'ไม่พบรายละเอียดงาน';

        const source = String(booking.booking_source || '').trim().toUpperCase();
        const flashRes = booking.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;

        const targetFlashDesignId = booking.flash_design_id
          || flashRes?.flash_design_id
          || estimate?.flash_design_id;

        const flashObj = (targetFlashDesignId ? flashDesignsMap.get(targetFlashDesignId) : null)
          || flashRes?.flash_designs
          || flashRes?.flash_design;

        const isFlash = source === 'FLASH'
          || Boolean(booking.flash_design_id)
          || Boolean(booking.flash_reservation_id)
          || Boolean(targetFlashDesignId)
          || (estimate && estimate.request_type === 'FLASH');

        if (isFlash) {
          const style = flashObj?.style
            || flashObj?.flash_design_style
            || flashRes?.flash_design_style
            || (estimate as any)?.style;

          if (style && String(style).trim()) {
            return `Flash · ${String(style).trim()}`;
          }
          return `Flash · ไม่ระบุสไตล์`;
        }

        // Check if Custom job
        const isCustom = source === 'CUSTOM' || source === 'STANDARD' || source === 'ESTIMATE' || Boolean(booking.estimate_request_id);

        if (isCustom) {
          const styleName = estimate?.style || estimate?.tattoo_style || booking?.style;
          if (styleName && String(styleName).trim()) {
            return `Custom · ${String(styleName).trim()}`;
          }
          return `Custom · ไม่ระบุสไตล์`;
        }

        return 'ไม่พบรายละเอียดงาน';
      };

      // 7. Aggregate ALL bookings with recorded payments into 1 row per booking
      const paidBookings = bookings.filter((b: any) => payments.some((p: any) => p.booking_id === b.id && p.status === 'RECORDED'));

      const jobRecords: BookingJobRevenueRecord[] = paidBookings.map((b: any) => {
        const contact = b.customer_user_id ? contactsMap.get(b.customer_user_id) : null;
        const estimate = b.estimate_request_id ? estimatesMap.get(b.estimate_request_id) : null;

        let customerName = '-';
        if (contact?.display_name && contact.display_name !== 'ลูกค้าประจำ' && contact.display_name !== 'ลูกค้า 157 TATTOO') {
          customerName = contact.display_name;
        } else if (contact?.display_name) {
          customerName = contact.display_name;
        }

        const artworkTitle = getArtworkTitle(b, estimate);

        // Filter RECORDED payments for this booking
        const bPayments = payments.filter((p: any) => p.booking_id === b.id && p.status === 'RECORDED');

        const depositPaid = bPayments
          .filter((p: any) => p.payment_type === 'DEPOSIT')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const balancePaid = bPayments
          .filter((p: any) => p.payment_type === 'BALANCE' || p.payment_type === 'FULL_PAYMENT')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const totalReceived = bPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        // Latest payment date or completion date
        const sortedPayments = [...bPayments].sort((a: any, b: any) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
        const rawDate = sortedPayments[0]?.paid_at || b.completed_at || b.updated_at || b.created_at;
        const monthDateStr = getDateStrBangkok(rawDate);

        return {
          booking_id: b.id,
          customer_name: customerName,
          artwork_title: artworkTitle,
          deposit_paid: depositPaid,
          balance_paid: balancePaid,
          total_received: totalReceived,
          booking_status: b.status,
          date_display: rawDate,
          month_date_str: monthDateStr,
        };
      });

      setJobRevenueRecords(jobRecords);
    } catch (err) {
      console.error('Exception fetching artist revenue data:', err);
      setError('เกิดข้อผิดพลาดในการประมวลผลข้อมูลรายได้');
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, activeArtistId]);

  useEffect(() => {
    if (isAuthorized && activeArtistId) {
      fetchArtistRevenue();
    }
  }, [isAuthorized, activeArtistId, fetchArtistRevenue]);

  // Current Bangkok Month string (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    const today = getTodayBangkokStr(); // YYYY-MM-DD
    return today.slice(0, 7);
  }, []);

  // Previous Bangkok Month string (YYYY-MM)
  const previousMonthStr = useMemo(() => {
    const [yearStr, monthStr] = currentMonthStr.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  }, [currentMonthStr]);

  // Filter Job Records by Date Filter Tab
  const filteredJobRecords = useMemo(() => {
    if (dateFilter === 'this_month') {
      return jobRevenueRecords.filter((r) => r.month_date_str.startsWith(currentMonthStr));
    }
    if (dateFilter === 'last_month') {
      return jobRevenueRecords.filter((r) => r.month_date_str.startsWith(previousMonthStr));
    }
    return jobRevenueRecords;
  }, [jobRevenueRecords, dateFilter, currentMonthStr, previousMonthStr]);

  // Calculate Summary KPI Cards
  const monthRevenueTotal = useMemo(() => {
    return jobRevenueRecords
      .filter((r) => r.month_date_str.startsWith(currentMonthStr))
      .reduce((sum, r) => sum + r.total_received, 0);
  }, [jobRevenueRecords, currentMonthStr]);

  // Count completed jobs based on active dateFilter
  const completedJobsCount = useMemo(() => {
    return filteredJobRecords.filter((r) => r.booking_status === 'COMPLETED').length;
  }, [filteredJobRecords]);

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
                Artist Portal
              </span>
              <span className="text-studio-muted text-xs">•</span>
              <span className="text-xs text-studio-secondary">
                {artistName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary mt-1 flex items-center space-x-2">
              <DollarSign className="text-studio-red" size={24} />
              <span>รายได้จากงานสัก</span>
            </h1>
          </div>

          <button
            onClick={() => fetchArtistRevenue()}
            disabled={loading}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-studio-red' : ''} />
            <span>อัปเดตข้อมูล</span>
          </button>
        </div>

        {/* Top 3 Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: รายได้เดือนนี้ */}
          <div className="bg-studio-card border border-studio-border p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">รายได้เดือนนี้</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                {monthRevenueTotal.toLocaleString('th-TH')} <span className="text-xs font-normal text-studio-muted">บาท</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
              <Wallet size={22} />
            </div>
          </div>

          {/* Card 2: ผลงานที่จอง */}
          <div className="bg-studio-card border border-studio-border p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">ผลงานที่จอง</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-cyan-400">
                {bookedFlashWorksCount} <span className="text-xs font-normal text-studio-muted">รายการ</span>
              </div>
              <p className="text-[11px] text-studio-muted">
                {bookedFlashWorksCount === 0 ? 'เดือนนี้ยังไม่มีผลงานที่ถูกจอง' : 'ลาย Flash ที่ถูกจองในเดือนนี้'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex items-center justify-center text-cyan-400">
              <CalendarCheck size={22} />
            </div>
          </div>

          {/* Card 3: งานเสร็จแล้ว */}
          <div className="bg-studio-card border border-studio-border p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">งานเสร็จแล้ว</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">
                {completedJobsCount} <span className="text-xs font-normal text-studio-muted">งาน</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-center justify-center text-amber-400">
              <CheckCircle2 size={22} />
            </div>
          </div>
        </div>

        {/* Revenue History Section */}
        <div className="space-y-4">
          {/* Section Title & Filter Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-studio-border/60 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-studio-red" />
              <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                ประวัติรายได้ ({filteredJobRecords.length})
              </h2>
            </div>

            {/* Date Filter Tabs */}
            <div className="flex items-center space-x-1.5 bg-studio-card p-1 rounded-lg border border-studio-border text-xs">
              <button
                onClick={() => setDateFilter('this_month')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  dateFilter === 'this_month'
                    ? 'bg-studio-red text-white font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                เดือนนี้
              </button>
              <button
                onClick={() => setDateFilter('last_month')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  dateFilter === 'last_month'
                    ? 'bg-studio-red text-white font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                เดือนก่อน
              </button>
              <button
                onClick={() => setDateFilter('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  dateFilter === 'all'
                    ? 'bg-studio-red text-white font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                ทั้งหมด
              </button>
            </div>
          </div>

          {/* Table / List */}
          {loading ? (
            <div className="p-12 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดประวัติรายได้...
            </div>
          ) : error ? (
            <div className="p-8 sm:p-12 text-center bg-red-950/20 border border-red-900/40 rounded-xl space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-950/50 border border-red-800/40 mx-auto flex items-center justify-center text-red-400">
                <RefreshCw size={24} />
              </div>
              <h3 className="text-sm font-semibold text-red-400">{error}</h3>
              <p className="text-xs text-studio-muted max-w-md mx-auto">
                เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบ กรุณากดปุ่มเพื่อลองใหม่อีกครั้ง
              </p>
              <button
                onClick={() => fetchArtistRevenue()}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-primary rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw size={14} className="text-studio-red" />
                <span>อัปเดตข้อมูลอีกครั้ง</span>
              </button>
            </div>
          ) : filteredJobRecords.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2">
              <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                <Inbox size={24} />
              </div>
              <h3 className="text-sm font-semibold text-studio-primary">ยังไม่มีข้อมูลรายได้</h3>
              <p className="text-xs text-studio-muted max-w-md mx-auto">
                {dateFilter === 'this_month'
                  ? 'ยังไม่มีรายการชำระเงินในเดือนนี้'
                  : dateFilter === 'last_month'
                  ? 'ไม่มีรายการชำระเงินในเดือนก่อน'
                  : 'ยังไม่มีประวัติการชำระเงินในระบบ'}
              </p>
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-studio-card border border-studio-border rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-studio-sec/80 border-b border-studio-border text-studio-secondary font-medium uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">วันที่</th>
                      <th className="py-3 px-4">ลูกค้า</th>
                      <th className="py-3 px-4">งาน / ลายสัก</th>
                      <th className="py-3 px-4 text-right">เงินมัดจำ</th>
                      <th className="py-3 px-4 text-right">ชำระวันปิดงาน</th>
                      <th className="py-3 px-4 text-right">ยอดรับรวม</th>
                      <th className="py-3 px-4 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-studio-border/60">
                    {filteredJobRecords.map((r) => (
                      <tr key={r.booking_id} className="hover:bg-studio-sec/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-studio-secondary">
                          {formatDateBangkok(r.date_display, true)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-studio-primary">
                          {r.customer_name}
                        </td>
                        <td className="py-3.5 px-4 text-studio-secondary font-medium">
                          {r.artwork_title}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                          {r.deposit_paid > 0 ? `${r.deposit_paid.toLocaleString('th-TH')} บาท` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                          {r.balance_paid > 0 ? `${r.balance_paid.toLocaleString('th-TH')} บาท` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          {r.total_received.toLocaleString('th-TH')} บาท
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {r.booking_status === 'COMPLETED' ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                              <CheckCircle2 size={11} />
                              <span>เสร็จสิ้น</span>
                            </span>
                          ) : r.booking_status === 'CONFIRMED' || r.booking_status === 'SCHEDULED' || r.booking_status === 'WAITING_DEPOSIT' ? (
                            <span className="inline-flex items-center space-x-1 text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                              <CalendarCheck size={11} />
                              <span>นัดหมายแล้ว</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-studio-secondary bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-[10px] font-medium">
                              <span>{r.booking_status}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View (Separate Cards per Booking with Gap) */}
              <div className="md:hidden space-y-3">
                {filteredJobRecords.map((r) => (
                  <div
                    key={r.booking_id}
                    className="bg-studio-card border border-studio-border rounded-xl p-3.5 sm:p-4 space-y-3 shadow-md"
                  >
                    {/* Card Header: Date (Left) & Status Badge (Right) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-studio-muted">
                        {formatDateBangkok(r.date_display, true)}
                      </span>
                      {r.booking_status === 'COMPLETED' ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                          <CheckCircle2 size={10} />
                          <span>เสร็จสิ้น</span>
                        </span>
                      ) : r.booking_status === 'CONFIRMED' || r.booking_status === 'SCHEDULED' || r.booking_status === 'WAITING_DEPOSIT' ? (
                        <span className="inline-flex items-center space-x-1 text-blue-400 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                          <CalendarCheck size={10} />
                          <span>นัดหมายแล้ว</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-studio-secondary bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-[10px] font-medium">
                          <span>{r.booking_status}</span>
                        </span>
                      )}
                    </div>

                    {/* Artwork Title (Primary) & Customer Name (Secondary) */}
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold text-studio-primary truncate">
                        {r.artwork_title}
                      </h4>
                      <div className="flex items-center space-x-1.5 text-xs text-studio-secondary">
                        <User size={12} className="text-studio-muted shrink-0" />
                        <span className="truncate">{r.customer_name}</span>
                      </div>
                    </div>

                    {/* Financial Numbers Section (Layout C: 2 side-by-side boxes) */}
                    <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-studio-border/40 font-mono">
                      {/* Left Box: Deposit (Top) & Balance (Bottom) separated by thin line */}
                      <div className="bg-[#0E0D0C] p-2.5 rounded-lg border border-[#4A443A]/60 flex flex-col justify-between gap-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] text-studio-muted font-sans">มัดจำ</span>
                          <span className="text-xs font-semibold text-amber-400">
                            {r.deposit_paid > 0 ? `฿${r.deposit_paid.toLocaleString('th-TH')}` : '—'}
                          </span>
                        </div>
                        <div className="border-t border-[#4A443A]/40" />
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] text-studio-muted font-sans">ปิดงาน</span>
                          <span className="text-xs font-semibold text-emerald-400">
                            {r.balance_paid > 0 ? `฿${r.balance_paid.toLocaleString('th-TH')}` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Right Box: Dark green bg & border, centered ยอดรับรวม & large green sum */}
                      <div className="bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded-lg flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] text-emerald-300/80 font-sans font-medium">
                          ยอดรับรวม
                        </span>
                        <span className="text-base font-bold text-emerald-400 mt-0.5">
                          ฿{r.total_received.toLocaleString('th-TH')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile Navigation */}
      <ArtistMobileNav />
    </div>
  );
}
