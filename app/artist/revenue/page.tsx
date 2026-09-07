'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '@/components/AppContext';
import { createClient } from '@/lib/supabase/client';
import ArtistHeader from '@/components/artist/ArtistHeader';
import ArtistMobileNav from '@/components/artist/ArtistMobileNav';
import { formatDateBangkok, getTodayBangkokStr, getDateStrBangkok } from '@/components/admin/calendar/calendarUtils';
import { 
  DollarSign, 
  RefreshCw, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Wallet, 
  User, 
  FileText,
  Filter,
  Inbox
} from 'lucide-react';

interface PaymentHistoryRecord {
  id: string;
  booking_id: string;
  payment_type: string;
  payment_type_label: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  customer_name: string;
  artwork_title: string;
  booking_status: string;
}

export default function ArtistRevenuePage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'this_month' | 'last_month' | 'all'>('this_month');
  
  const [allPayments, setAllPayments] = useState<PaymentHistoryRecord[]>([]);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && staffArtistId))
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
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      // 1. Fetch bookings assigned to current artist
      const { data: dbBookings, error: bErr } = await supabase
        .from('bookings')
        .select('id, artwork_title, customer_user_id, status, estimate_request_id')
        .eq('artist_id', staffArtistId);

      if (bErr) console.error('Error fetching artist bookings for revenue:', bErr);
      const bookings = dbBookings || [];

      // Count completed jobs
      const completedCount = bookings.filter((b: any) => b.status === 'COMPLETED').length;
      setCompletedJobsCount(completedCount);

      const bookingIds = bookings.map((b: any) => b.id);
      if (bookingIds.length === 0) {
        setAllPayments([]);
        setLoading(false);
        return;
      }

      // 2. Fetch RECORDED payments for current artist's bookings
      const { data: dbPayments, error: pErr } = await supabase
        .from('booking_payments')
        .select('*')
        .in('booking_id', bookingIds)
        .eq('status', 'RECORDED')
        .order('paid_at', { ascending: false });

      if (pErr) console.error('Error fetching booking payments:', pErr);
      const payments = dbPayments || [];

      // 3. Fetch linked estimates for artwork title fallback
      const estimateIds = Array.from(new Set(bookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let estimatesMap = new Map<string, any>();
      if (estimateIds.length > 0) {
        const { data: dbEstimates } = await supabase
          .from('estimate_requests')
          .select('id, style')
          .in('id', estimateIds);
        (dbEstimates || []).forEach((e: any) => estimatesMap.set(e.id, e));
      }

      // 4. Fetch customer profile info
      const customerUserIds = Array.from(new Set(bookings.map((b: any) => b.customer_user_id).filter(Boolean)));
      let customersMap = new Map<string, any>();
      let profilesMap = new Map<string, any>();
      if (customerUserIds.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('user_id, display_name, first_name, last_name, email')
          .in('user_id', customerUserIds);
        (cData || []).forEach((c: any) => customersMap.set(c.user_id, c));

        const { data: pData } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', customerUserIds);
        (pData || []).forEach((p: any) => profilesMap.set(p.user_id, p));
      }

      const bookingsMap = new Map<string, any>();
      bookings.forEach((b: any) => bookingsMap.set(b.id, b));

      // Translate payment type
      const getPaymentTypeLabel = (type: string) => {
        switch (type) {
          case 'DEPOSIT':
            return 'มัดจำ';
          case 'BALANCE':
            return 'ยอดคงเหลือ';
          case 'FULL_PAYMENT':
            return 'ชำระเต็ม';
          case 'OTHER':
            return 'อื่น ๆ';
          default:
            return type || 'อื่น ๆ';
        }
      };

      // Map payment records
      const records: PaymentHistoryRecord[] = payments.map((p: any) => {
        const booking = bookingsMap.get(p.booking_id);
        const customer = booking?.customer_user_id ? customersMap.get(booking.customer_user_id) : null;
        const prof = booking?.customer_user_id ? profilesMap.get(booking.customer_user_id) : null;
        const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;

        // Clean customer name
        const candidate = (customer?.display_name && customer.display_name !== 'ลูกค้าประจำ')
          ? customer.display_name
          : (prof?.display_name && prof.display_name !== 'ลูกค้าประจำ')
          ? prof.display_name
          : (customer?.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null);

        let customerName = '-';
        if (candidate && candidate !== 'ลูกค้าประจำ' && candidate !== 'ลูกค้า 157 TATTOO') {
          customerName = candidate;
        } else {
          const emailPrefix = customer?.email ? customer.email.split('@')[0] : prof?.email ? prof.email.split('@')[0] : null;
          if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') {
            customerName = emailPrefix;
          }
        }

        const artworkTitle = booking?.artwork_title || estimate?.style || 'งานสัก Custom';

        return {
          id: p.id,
          booking_id: p.booking_id,
          payment_type: p.payment_type,
          payment_type_label: getPaymentTypeLabel(p.payment_type),
          amount: Number(p.amount || 0),
          payment_method: p.payment_method,
          paid_at: p.paid_at,
          customer_name: customerName,
          artwork_title: artworkTitle,
          booking_status: booking?.status || 'UNKNOWN',
        };
      });

      setAllPayments(records);
    } catch (err) {
      console.error('Exception fetching artist revenue data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistRevenue();
    }
  }, [isAuthorized, staffArtistId, fetchArtistRevenue]);

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

  // Calculate Summary KPI Cards (Always accurate regardless of table filter)
  const monthRevenueTotal = useMemo(() => {
    return allPayments
      .filter((p) => getDateStrBangkok(p.paid_at).startsWith(currentMonthStr))
      .reduce((sum, p) => sum + p.amount, 0);
  }, [allPayments, currentMonthStr]);

  const allTimeRevenueTotal = useMemo(() => {
    return allPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [allPayments]);

  // Filtered Payments History
  const filteredPayments = useMemo(() => {
    if (dateFilter === 'this_month') {
      return allPayments.filter((p) => getDateStrBangkok(p.paid_at).startsWith(currentMonthStr));
    }
    if (dateFilter === 'last_month') {
      return allPayments.filter((p) => getDateStrBangkok(p.paid_at).startsWith(previousMonthStr));
    }
    return allPayments;
  }, [allPayments, dateFilter, currentMonthStr, previousMonthStr]);

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
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

          {/* Card 2: รายได้สะสม */}
          <div className="bg-studio-card border border-studio-border p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">รายได้สะสม</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-studio-primary">
                {allTimeRevenueTotal.toLocaleString('th-TH')} <span className="text-xs font-normal text-studio-muted">บาท</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-studio-sec border border-studio-border flex items-center justify-center text-studio-red">
              <DollarSign size={22} />
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
                ประวัติรายได้ ({filteredPayments.length})
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
          ) : filteredPayments.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2">
              <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                <Inbox size={24} />
              </div>
              <h3 className="text-sm font-semibold text-studio-primary">ยังไม่มีข้อมูลรายได้</h3>
              <p className="text-xs text-studio-muted max-w-md mx-auto">
                {dateFilter === 'this_month'
                  ? 'ยังไม่มีรายการรับชำระค่างานสักในเดือนนี้'
                  : dateFilter === 'last_month'
                  ? 'ไม่มีรายการรับชำระค่างานสักในเดือนก่อน'
                  : 'ยังไม่มีประวัติการรับชำระค่างานสักในระบบ'}
              </p>
            </div>
          ) : (
            <div className="bg-studio-card border border-studio-border rounded-xl overflow-hidden shadow-lg">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-studio-sec/80 border-b border-studio-border text-studio-secondary font-medium uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">วันที่ชำระ</th>
                      <th className="py-3 px-4">ลูกค้า</th>
                      <th className="py-3 px-4">งาน / ลายสัก</th>
                      <th className="py-3 px-4">ประเภทการชำระ</th>
                      <th className="py-3 px-4 text-right">จำนวนเงิน</th>
                      <th className="py-3 px-4 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-studio-border/60">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-studio-sec/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-studio-secondary">
                          {formatDateBangkok(p.paid_at, true)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-studio-primary">
                          {p.customer_name}
                        </td>
                        <td className="py-3.5 px-4 text-studio-secondary">
                          {p.artwork_title}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-studio-sec border border-studio-border text-studio-primary">
                            {p.payment_type_label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          {p.amount.toLocaleString('th-TH')} บาท
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                            <CheckCircle2 size={11} />
                            <span>รับชำระแล้ว</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden divide-y divide-studio-border/60">
                {filteredPayments.map((p) => (
                  <div key={p.id} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-studio-muted">
                        {formatDateBangkok(p.paid_at, true)}
                      </span>
                      <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded text-[10px] font-medium">
                        <CheckCircle2 size={10} />
                        <span>รับชำระแล้ว</span>
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-studio-primary">
                          {p.artwork_title}
                        </h4>
                        <div className="flex items-center space-x-2 text-xs text-studio-secondary mt-0.5">
                          <User size={12} className="text-studio-muted" />
                          <span>{p.customer_name}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          {p.amount.toLocaleString('th-TH')} บาท
                        </div>
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-studio-sec border border-studio-border text-studio-secondary mt-1">
                          {p.payment_type_label}
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
