'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DollarSign, RefreshCw, AlertCircle, Calendar } from 'lucide-react';
import RevenueKpiCards from './RevenueKpiCards';
import RevenueFilters from './RevenueFilters';
import RevenueTrendChart from './RevenueTrendChart';
import RevenueByArtist from './RevenueByArtist';
import RecentRevenueTransactions from './RecentRevenueTransactions';
import {
  RevenueRecord,
  RevenueKpiData,
  CompletedBookingRecord,
  DateFilterPreset,
  ArtistRevenueItem,
  PaymentTypeSummary,
  PaymentMethodSummary,
  DailyRevenueItem,
  toBangkokDate,
  getBangkokToday,
  getBangkokCurrentMonth,
  getBangkokPreviousMonth,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminRevenuePage() {
  const [allPayments, setAllPayments] = useState<RevenueRecord[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [summaryList, setSummaryList] = useState<any[]>([]);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters State (Default: 'this_month')
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(getBangkokToday());
  const [customEndDate, setCustomEndDate] = useState<string>(getBangkokToday());
  const [selectedArtistId, setSelectedArtistId] = useState<string>('ALL');

  // Main Live Data Fetcher
  const fetchRevenueData = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch RECORDED payments only (Section 4: VOIDED excluded)
      const { data: paymentsData, error: payErr } = await supabase
        .from('booking_payments')
        .select('*')
        .eq('status', 'RECORDED')
        .order('paid_at', { ascending: false });

      if (payErr) throw payErr;

      // 2. Fetch all bookings for artist assignment and status
      const { data: bookingsData, error: bookErr } = await supabase
        .from('bookings')
        .select('*');

      if (bookErr) console.warn('bookingsData fetch error:', bookErr);

      // 3. Fetch active artists
      const { data: artistsData, error: artErr } = await supabase
        .from('artists')
        .select('*')
        .order('name');

      if (artErr) console.warn('artistsData fetch error:', artErr);
      setArtists(artistsData || []);

      // 4. Fetch customers for names
      const { data: customersData, error: custErr } = await supabase
        .from('customers')
        .select('*');

      if (custErr) console.warn('customersData fetch error:', custErr);
      setCustomers(customersData || []);

      // 5. Fetch booking_payment_summary for outstanding balances
      const { data: summariesData, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('*');

      if (sumErr) console.warn('summariesData fetch error:', sumErr);
      setSummaryList(summariesData || []);
      setActiveBookings(bookingsData || []);

      // 6. Map and join payments with relations
      const mapped: RevenueRecord[] = (paymentsData || []).map((p: any) => {
        const booking = (bookingsData || []).find((b) => b.id === p.booking_id);
        const artist = (artistsData || []).find((a) => a.id === booking?.artist_id);
        const customer = (customersData || []).find((c) => (booking?.customer_id && c.id === booking.customer_id) || (booking?.customer_user_id && c.user_id === booking.customer_user_id));

        return {
          id: p.id,
          booking_id: p.booking_id,
          payment_type: p.payment_type,
          amount: Number(p.amount || 0),
          payment_method: p.payment_method,
          status: p.status,
          paid_at: p.paid_at || p.created_at,
          reference_no: p.reference_no,
          note: p.note,
          created_at: p.created_at,
          customer_name: customer?.display_name || 'ลูกค้า 157 Tattoo',
          customer_phone: customer?.phone || undefined,
          artist_id: booking?.artist_id || null,
          artist_name: artist?.name || 'ไม่ระบุช่าง',
          artist_nickname: artist?.nickname || null,
          booking_status: booking?.status || 'UNKNOWN',
        };
      });

      setAllPayments(mapped);
    } catch (err: any) {
      console.error('Error fetching revenue data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRevenueData();

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['booking_payments', 'bookings', 'customers'].includes(detail?.table)) {
        fetchRevenueData();
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
  }, [refreshTrigger, fetchRevenueData]);

  // ------------------------------------------------------------------
  // 1. KPI Calculations (Section 7: Business Timezone Asia/Bangkok)
  // ------------------------------------------------------------------
  const kpiData: RevenueKpiData = useMemo(() => {
    const todayBangkok = getBangkokToday();
    const currentMonth = getBangkokCurrentMonth();

    let todayRevenue = 0;
    let todayCount = 0;
    let monthRevenue = 0;
    let monthCount = 0;

    allPayments.forEach((p) => {
      const pDate = p.paid_at || p.created_at;
      const bkkDate = toBangkokDate(pDate);

      // Today
      if (bkkDate === todayBangkok) {
        todayRevenue += p.amount;
        todayCount += 1;
      }

      // This Month
      if (bkkDate.startsWith(currentMonth)) {
        monthRevenue += p.amount;
        monthCount += 1;
      }
    });

    // 3. งานปิดแล้วเดือนนี้: count of COMPLETED bookings in the current month
    const monthCompletedBookingsCount = activeBookings.filter((b) => {
      const statusUpper = String(b.status || '').toUpperCase();
      if (statusUpper !== 'COMPLETED') return false;
      const completionRaw = b.completed_at || b.updated_at || b.created_at;
      const bkkDate = toBangkokDate(completionRaw);
      const hasMonthPayment = allPayments.some(
        (p) => p.booking_id === b.id && toBangkokDate(p.paid_at || p.created_at).startsWith(currentMonth)
      );
      return (bkkDate && bkkDate.startsWith(currentMonth)) || hasMonthPayment;
    }).length;

    // 4. คิวรอปิดงาน: count of active bookings not COMPLETED, CANCELLED, or REJECTED
    const unfinishedBookingsCount = activeBookings.filter(
      (b) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(String(b.status || '').toUpperCase())
    ).length;

    return {
      todayRevenue,
      monthRevenue,
      monthCompletedBookingsCount,
      unfinishedBookingsCount,
      todayTransactionCount: todayCount,
      monthTransactionCount: monthCount,
    };
  }, [allPayments, activeBookings]);

  // ------------------------------------------------------------------
  // 2. Filtered Payments (Section 9 & 10)
  // ------------------------------------------------------------------
  const filteredPayments = useMemo(() => {
    const todayBangkok = getBangkokToday();
    const currentMonth = getBangkokCurrentMonth();
    const previousMonth = getBangkokPreviousMonth();

    return allPayments.filter((p) => {
      // Artist filter
      if (selectedArtistId !== 'ALL' && p.artist_id !== selectedArtistId) {
        return false;
      }

      // Date preset filter
      const pDate = toBangkokDate(p.paid_at);

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
  }, [allPayments, selectedArtistId, datePreset, customStartDate, customEndDate]);

  const totalPeriodRevenue = useMemo(() => {
    return filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPayments]);

  // ------------------------------------------------------------------
  // 3. Daily Revenue Trend (Section 11)
  // ------------------------------------------------------------------
  const dailyTrend: DailyRevenueItem[] = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();

    filteredPayments.forEach((p) => {
      const bkkDate = toBangkokDate(p.paid_at);
      const cur = map.get(bkkDate) || { amount: 0, count: 0 };
      cur.amount += p.amount;
      cur.count += 1;
      map.set(bkkDate, cur);
    });

    const list: DailyRevenueItem[] = [];
    map.forEach((val, dateKey) => {
      const parts = dateKey.split('-');
      const day = parseInt(parts[2], 10);
      const monthNum = parseInt(parts[1], 10);
      const monthShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][monthNum - 1];
      list.push({
        date: dateKey,
        displayDate: `${day} ${monthShort}`,
        amount: val.amount,
        count: val.count,
      });
    });

    list.sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [filteredPayments]);

  // ------------------------------------------------------------------
  // 4. Revenue By Artist (Section 12)
  // ------------------------------------------------------------------
  const artistsRevenue: ArtistRevenueItem[] = useMemo(() => {
    return artists.map((art) => {
      const artistPayments = filteredPayments.filter((p) => p.artist_id === art.id);
      const rev = artistPayments.reduce((sum, p) => sum + p.amount, 0);
      const uniqueBookings = new Set(artistPayments.map((p) => p.booking_id)).size;
      const pct = totalPeriodRevenue > 0 ? Math.round((rev / totalPeriodRevenue) * 100) : 0;

      return {
        artist_id: art.id,
        name: art.name,
        nickname: art.nickname,
        booking_count: uniqueBookings,
        revenue: rev,
        percentage: pct,
      };
    });
  }, [artists, filteredPayments, totalPeriodRevenue]);

  // ------------------------------------------------------------------
  // 5. Payment Type Breakdown (Section 13)
  // ------------------------------------------------------------------
  const typesSummary: PaymentTypeSummary[] = useMemo(() => {
    const types: Array<{ type: any; label: string }> = [
      { type: 'DEPOSIT', label: 'เงินมัดจำ' },
      { type: 'BALANCE', label: 'ยอดคงเหลือ' },
      { type: 'FULL_PAYMENT', label: 'ชำระเต็ม' },
      { type: 'OTHER', label: 'อื่น ๆ' },
    ];

    return types.map((t) => {
      const items = filteredPayments.filter((p) => p.payment_type === t.type);
      const amount = items.reduce((sum, p) => sum + p.amount, 0);
      const count = items.length;
      const pct = totalPeriodRevenue > 0 ? Math.round((amount / totalPeriodRevenue) * 100) : 0;

      return {
        type: t.type,
        label: t.label,
        amount,
        count,
        percentage: pct,
      };
    });
  }, [filteredPayments, totalPeriodRevenue]);

  // ------------------------------------------------------------------
  // 6. Payment Method Breakdown (Section 14)
  // ------------------------------------------------------------------
  const methodsSummary: PaymentMethodSummary[] = useMemo(() => {
    const methods: Array<{ method: any; label: string }> = [
      { method: 'CASH', label: 'เงินสด' },
      { method: 'BANK_TRANSFER', label: 'โอนธนาคาร' },
      { method: 'QR', label: 'QR Code' },
      { method: 'OTHER', label: 'อื่น ๆ' },
    ];

    return methods.map((m) => {
      const items = filteredPayments.filter((p) => p.payment_method === m.method);
      const amount = items.reduce((sum, p) => sum + p.amount, 0);
      const count = items.length;
      const pct = totalPeriodRevenue > 0 ? Math.round((amount / totalPeriodRevenue) * 100) : 0;

      return {
        method: m.method,
        label: m.label,
        amount,
        count,
        percentage: pct,
      };
    });
  }, [filteredPayments, totalPeriodRevenue]);

  // 7. Recent Completed Bookings (งานที่เสร็จล่าสุด max 10)
  const completedBookingsList: CompletedBookingRecord[] = useMemo(() => {
    const completed = activeBookings.filter((b) => String(b.status || '').toUpperCase() === 'COMPLETED');

    const mapped = completed.map((b) => {
      const summary = summaryList.find((s) => s.booking_id === b.id);
      const agreedPrice = Number(summary?.quoted_price || summary?.agreed_price || b.tattoo_price || b.quoted_price || 0);

      const recordedPayments = allPayments.filter((p) => p.booking_id === b.id);
      const actualTotalReceived = recordedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const lastPaymentDate = recordedPayments.length > 0
        ? recordedPayments.reduce((latest, p) => {
            const pDate = p.paid_at || p.created_at;
            return pDate > latest ? pDate : latest;
          }, recordedPayments[0].paid_at || recordedPayments[0].created_at)
        : null;

      const completedAt = b.completed_at || b.updated_at || lastPaymentDate || b.created_at || new Date().toISOString();

      const customer = customers.find(
        (c) => (b.customer_id && c.id === b.customer_id) || (b.customer_user_id && c.user_id === b.customer_user_id)
      );
      const artist = artists.find((a) => a.id === b.artist_id);

      return {
        id: b.id,
        customer_name: customer?.display_name || 'ลูกค้า 157 Tattoo',
        artist_name: artist?.nickname || artist?.name || 'ไม่ระบุช่าง',
        completed_at: completedAt,
        agreed_price: agreedPrice,
        actual_total_received: actualTotalReceived,
      };
    });

    mapped.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
    return mapped.slice(0, 10);
  }, [activeBookings, summaryList, allPayments, customers, artists]);

  const handleResetFilters = () => {
    setDatePreset('this_month');
    setSelectedArtistId('ALL');
    setCustomStartDate(getBangkokToday());
    setCustomEndDate(getBangkokToday());
  };

  return (
    <div className="space-y-6 font-prompt pb-12">
      {/* Title & Page Header */}
      <div className="border-b border-[#4A443A] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <DollarSign size={12} className="text-[#9C2F2F]" />
            <span>Revenue Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            รายได้ร้าน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            สรุปเงินจริงที่ร้านได้รับจากงานสัก (คำนวณจากสถานะ RECORDED เท่านั้น)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#ECE4D3] rounded-md transition-colors flex items-center gap-1.5 font-medium"
            title="รีเฟรชข้อมูลรายได้ล่าสุด"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards (Section 7 & 8) */}
      <RevenueKpiCards kpiData={kpiData} />

      {/* Date & Artist Filter Controls (Section 9 & 10) */}
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
        onResetFilters={handleResetFilters}
      />

      {/* Empty State Banner (Section 20: if no payments exist at all in baseline) */}
      {allPayments.length === 0 && !isLoading && (
        <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-6 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#7A7265]">
            <DollarSign size={20} />
          </div>
          <h3 className="text-sm font-semibold text-[#ECE4D3]">ยังไม่มีข้อมูลรายได้</h3>
          <p className="text-xs text-[#7A7265] max-w-md mx-auto">
            เมื่อร้านมีการบันทึกรับเงินจริง ข้อมูลสรุปรายได้ กราฟแนวโน้ม และสัดส่วนยอดเงินจะแสดงที่นี่
          </p>
        </div>
      )}

      {/* Main Revenue Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Trend Chart (Section 11) */}
        <div className="lg:col-span-2">
          <RevenueTrendChart
            data={dailyTrend}
            totalPeriodRevenue={totalPeriodRevenue}
          />
        </div>

        {/* Revenue by Artist (Section 12) */}
        <div className="lg:col-span-1">
          <RevenueByArtist
            artistsRevenue={artistsRevenue}
            totalRevenue={totalPeriodRevenue}
          />
        </div>

        {/* Recent Completed Bookings */}
        <div className="lg:col-span-1">
          <RecentRevenueTransactions
            completedBookings={completedBookingsList}
          />
        </div>
      </div>
    </div>
  );
}
