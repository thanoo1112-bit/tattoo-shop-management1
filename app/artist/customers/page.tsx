'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '@/components/AppContext';
import { createClient } from '@/lib/supabase/client';
import ArtistHeader from '@/components/artist/ArtistHeader';
import ArtistMobileNav from '@/components/artist/ArtistMobileNav';
import ArtistCustomerDetailDrawer, { ArtistCustomerDetail } from '@/components/artist/ArtistCustomerDetailDrawer';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { formatDateBangkok } from '@/components/admin/calendar/calendarUtils';
import { 
  Users, 
  Search, 
  RefreshCw, 
  User, 
  Phone, 
  Calendar as CalendarIcon, 
  Clock, 
  ChevronRight, 
  Eye, 
  Inbox, 
  ShieldCheck, 
  ShieldAlert,
  Sparkles
} from 'lucide-react';

interface FormattedArtistCustomer {
  user_id: string;
  display_name: string;
  phone?: string | null;
  email?: string | null;
  is_age_confirmed: boolean;
  
  bookings_count: number;
  sessions_count: number;
  estimates_count: number;
  last_activity_at: string | null;

  bookings: any[];
  sessions: any[];
  estimates: any[];
}

export default function ArtistCustomersPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [customersList, setCustomersList] = useState<FormattedArtistCustomer[]>([]);

  // Drawer State
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<ArtistCustomerDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  // Fetch live customers for this specific artist
  const fetchMyCustomers = useCallback(async () => {
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      // 1. Fetch bookings for staffArtistId
      const { data: dbBookings, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (bErr) console.error('Error fetching artist bookings for customers:', bErr);

      // 2. Fetch booking_sessions for staffArtistId
      const { data: dbSessions, error: sErr } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (sErr) console.error('Error fetching artist sessions for customers:', sErr);

      // 3. Fetch estimate_requests for staffArtistId
      const { data: dbEstimates, error: eErr } = await supabase
        .from('estimate_requests')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (eErr) console.error('Error fetching artist estimates for customers:', eErr);

      const bookings = dbBookings || [];
      const sessions = dbSessions || [];
      const estimates = dbEstimates || [];

      // Collect all distinct customer user IDs associated with this artist
      const allCustomerUserIds = Array.from(
        new Set([
          ...bookings.map((b: any) => b.customer_user_id),
          ...estimates.map((e: any) => e.customer_user_id),
        ].filter(Boolean))
      );

      if (allCustomerUserIds.length === 0) {
        setCustomersList([]);
        setLoading(false);
        return;
      }

      // Fetch customer metadata
      const { data: cData } = await supabase
        .from('customers')
        .select('user_id, display_name, first_name, last_name, phone, email, eligibility_confirmed_at, profile_completed_at')
        .in('user_id', allCustomerUserIds);

      const { data: pData } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, phone')
        .in('user_id', allCustomerUserIds);

      const cMap = new Map<string, any>();
      (cData || []).forEach((c: any) => cMap.set(c.user_id, c));

      const pMap = new Map<string, any>();
      (pData || []).forEach((p: any) => pMap.set(p.user_id, p));

      // Build customer models
      const formattedCustomers: FormattedArtistCustomer[] = allCustomerUserIds.map((uid: string) => {
        const c = cMap.get(uid);
        const p = pMap.get(uid);

        // Name resolution logic
        const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ')
          ? c.display_name
          : (p?.display_name && p.display_name !== 'ลูกค้าประจำ')
          ? p.display_name
          : (c?.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : null);

        let displayName = 'ลูกค้า (ไม่ระบุชื่อ)';
        if (candidate && candidate !== 'ลูกค้าประจำ' && candidate !== 'ลูกค้า 157 TATTOO') {
          displayName = candidate;
        } else {
          const emailPrefix = c?.email ? c.email.split('@')[0] : p?.email ? p.email.split('@')[0] : null;
          if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') {
            displayName = emailPrefix;
          }
        }

        const phone = p?.phone || c?.phone || null;
        const email = p?.email || c?.email || null;
        const isAgeConfirmed = Boolean(c?.eligibility_confirmed_at || c?.profile_completed_at);

        // Filter work history for this customer strictly for this artist
        const custBookings = bookings.filter((b: any) => b.customer_user_id === uid);
        const custEstimates = estimates.filter((e: any) => e.customer_user_id === uid);

        const custBookingIds = new Set(custBookings.map((b: any) => b.id));
        const custSessions = sessions.filter((s: any) => custBookingIds.has(s.booking_id));

        // Find last activity date
        const dates: string[] = [
          ...custBookings.map((b: any) => b.requested_date || b.created_at),
          ...custSessions.map((s: any) => s.start_at),
          ...custEstimates.map((e: any) => e.created_at),
        ].filter(Boolean);

        dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const lastActivityAt = dates[0] || null;

        return {
          user_id: uid,
          display_name: displayName,
          phone,
          email,
          is_age_confirmed: isAgeConfirmed,
          bookings_count: custBookings.length,
          sessions_count: custSessions.length,
          estimates_count: custEstimates.length,
          last_activity_at: lastActivityAt,
          bookings: custBookings,
          sessions: custSessions,
          estimates: custEstimates,
        };
      });

      // Sort by last activity descending
      formattedCustomers.sort((a, b) => {
        if (!a.last_activity_at) return 1;
        if (!b.last_activity_at) return -1;
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      });

      setCustomersList(formattedCustomers);
    } catch (err) {
      console.error('Exception fetching artist customers:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchMyCustomers();
    }
  }, [isAuthorized, staffArtistId, fetchMyCustomers]);

  // Filtered by Search term
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customersList;
    const term = searchTerm.trim().toLowerCase();
    return customersList.filter((c) => {
      const nameMatch = c.display_name.toLowerCase().includes(term);
      const phoneMatch = c.phone ? c.phone.replace(/[^0-9]/g, '').includes(term.replace(/[^0-9]/g, '')) : false;
      return nameMatch || phoneMatch;
    });
  }, [customersList, searchTerm]);

  const handleOpenDetail = (cust: FormattedArtistCustomer) => {
    setSelectedCustomerDetail({
      user_id: cust.user_id,
      display_name: cust.display_name,
      phone: cust.phone,
      email: cust.email,
      is_age_confirmed: cust.is_age_confirmed,
      bookings: cust.bookings,
      sessions: cust.sessions,
      estimates: cust.estimates,
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
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
              <Users className="text-studio-red" size={24} />
              <span>ลูกค้าของฉัน ({customersList.length})</span>
            </h1>
          </div>

          <button
            onClick={() => fetchMyCustomers()}
            disabled={loading}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-studio-red' : ''} />
            <span>อัปเดตข้อมูล</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-studio-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาตามชื่อลูกค้า หรือ เบอร์โทรศัพท์..."
            className="w-full pl-10 pr-4 py-2.5 bg-studio-card border border-studio-border rounded-xl text-sm text-studio-primary placeholder-studio-muted focus:outline-none focus:border-studio-red/60 transition-colors font-prompt"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-studio-muted hover:text-studio-primary bg-studio-sec px-2 py-0.5 rounded cursor-pointer"
            >
              ล้าง
            </button>
          )}
        </div>

        {/* Customers Grid / List */}
        {loading ? (
          <div className="p-12 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse font-prompt">
            กำลังโหลดรายการลูกค้าของคุณ...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2 font-prompt">
            <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
              <Users size={24} />
            </div>
            <h3 className="text-sm font-semibold text-studio-primary">
              {searchTerm ? 'ไม่พบข้อมูลลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้าในรายการของคุณ'}
            </h3>
            <p className="text-xs text-studio-muted max-w-md mx-auto">
              {searchTerm
                ? `ไม่พบลำดับลูกค้าที่ตรงกับคำค้นหา "${searchTerm}"`
                : 'เมื่อมีลูกค้าส่งคำขอประเมินราคา หรือ จองคิวสักระบุถึงคุณ ข้อมูลลูกค้าจะแสดงในหน้านี้'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.map((cust) => {
              const phoneFormatted = cust.phone ? formatThaiPhoneForDisplay(cust.phone) : 'ไม่ระบุเบอร์';

              return (
                <div
                  key={cust.user_id}
                  className="bg-studio-card border border-studio-border hover:border-studio-red/40 p-5 rounded-xl transition-all duration-200 shadow-md flex flex-col justify-between space-y-4"
                >
                  {/* Customer Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3 truncate">
                      <div className="w-10 h-10 rounded-full bg-studio-red/15 border border-studio-red/30 flex items-center justify-center text-studio-red shrink-0 font-bold">
                        <User size={18} />
                      </div>
                      <div className="truncate">
                        <h3 className="text-sm font-semibold text-studio-primary truncate">
                          {cust.display_name}
                        </h3>
                        <div className="flex items-center space-x-1 text-xs text-studio-secondary font-mono mt-0.5">
                          <Phone size={11} className="text-studio-muted" />
                          <span>{phoneFormatted}</span>
                        </div>
                      </div>
                    </div>

                    {cust.is_age_confirmed ? (
                      <span className="shrink-0 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded font-medium">
                        ยืนยันแล้ว
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded font-medium">
                        รออายุ
                      </span>
                    )}
                  </div>

                  {/* Summary Counters */}
                  <div className="grid grid-cols-3 gap-2 bg-studio-main/60 p-2.5 rounded-lg border border-studio-border/60 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-studio-muted block">งานสัก</span>
                      <span className="font-bold font-mono text-studio-primary">{cust.bookings_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-studio-muted block">รอบสัก</span>
                      <span className="font-bold font-mono text-studio-red">{cust.sessions_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-studio-muted block">คำขอราคา</span>
                      <span className="font-bold font-mono text-amber-400">{cust.estimates_count}</span>
                    </div>
                  </div>

                  {/* Last Activity & Action */}
                  <div className="flex items-center justify-between pt-1 text-xs border-t border-studio-border/40">
                    <span className="text-[11px] text-studio-muted">
                      ล่าสุด: {cust.last_activity_at ? formatDateBangkok(cust.last_activity_at) : 'ไม่ระบุ'}
                    </span>

                    <button
                      onClick={() => handleOpenDetail(cust)}
                      className="px-3 py-1.5 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded-lg border border-studio-border transition-colors flex items-center space-x-1 cursor-pointer"
                    >
                      <Eye size={13} />
                      <span>ดูประวัติ</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
