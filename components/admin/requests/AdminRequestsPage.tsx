'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Calendar, RefreshCw, Layers } from 'lucide-react';
import RequestSummaryCards from './RequestSummaryCards';
import EstimateRequestList from './EstimateRequestList';
import EstimateDetailPanel from './EstimateDetailPanel';
import BookingList from './BookingList';
import BookingDetailPanel from './BookingDetailPanel';
import {
  EstimateRequestItem,
  BookingItem,
  BookingSessionItem,
  RequestSummaryCounts,
} from './types';
import { createClient } from '@/lib/supabase/client';

export default function AdminRequestsPage() {
  const [activeTab, setActiveTab] = useState<'estimates' | 'bookings'>('estimates');
  const [estimates, setEstimates] = useState<EstimateRequestItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [selectedEstimate, setSelectedEstimate] = useState<EstimateRequestItem | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Main Live Data Fetcher (Section 4 & 34: Avoid N+1 query)
  const fetchAllRequestsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch estimate requests
      const { data: estData, error: estErr } = await supabase
        .from('estimate_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (estErr) throw estErr;

      // 2. Fetch bookings
      const { data: bookData, error: bookErr } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookErr) throw bookErr;

      // 3. Fetch booking sessions
      const { data: sesData, error: sesErr } = await supabase
        .from('booking_sessions')
        .select('*')
        .order('session_number', { ascending: true });

      if (sesErr) throw sesErr;

      // 4. Fetch booking payment summaries
      const { data: sumData, error: sumErr } = await supabase
        .from('booking_payment_summary')
        .select('*');

      if (sumErr) throw sumErr;

      // 5. Fetch active artists
      const { data: artData, error: artErr } = await supabase
        .from('artists')
        .select('id, name, nickname')
        .order('name');

      if (artErr) throw artErr;
      setArtists(artData || []);

      // 6. Fetch customers
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('user_id, display_name, phone, email');

      if (custErr) throw custErr;

      // Map Estimate Requests
      const mappedEstimates: EstimateRequestItem[] = (estData || []).map((e: any) => {
        const artist = (artData || []).find((a) => a.id === e.artist_id);
        const customer = (custData || []).find((c) => c.user_id === e.customer_user_id);
        return {
          id: e.id,
          customer_user_id: e.customer_user_id,
          artist_id: e.artist_id,
          placement: e.placement,
          description: e.description,
          width_cm: e.width_cm,
          height_cm: e.height_cm,
          style_preference: e.style_preference,
          preferred_date: e.preferred_date,
          reference_images: e.reference_images,
          status: e.status,
          quoted_price: e.quoted_price ? Number(e.quoted_price) : null,
          deposit_required: e.deposit_required ? Number(e.deposit_required) : null,
          estimated_duration_minutes: e.estimated_duration_minutes,
          quote_note: e.quote_note,
          quoted_at: e.quoted_at,
          created_at: e.created_at,
          updated_at: e.updated_at,
          customer_name: customer?.display_name || 'ลูกค้า 157 Tattoo',
          customer_phone: customer?.phone || undefined,
          customer_email: customer?.email || undefined,
          artist_name: artist?.name || 'ไม่ระบุช่าง',
          artist_nickname: artist?.nickname || null,
        };
      });

      // Map Bookings
      const mappedBookings: BookingItem[] = (bookData || []).map((b: any) => {
        const artist = (artData || []).find((a) => a.id === b.artist_id);
        const customer = (custData || []).find((c) => c.user_id === b.customer_user_id);
        const summary = (sumData || []).find((s) => s.booking_id === b.id);
        const bookingSessions: BookingSessionItem[] = (sesData || [])
          .filter((s: any) => s.booking_id === b.id)
          .map((s: any) => ({
            id: s.id,
            booking_id: s.booking_id,
            artist_id: s.artist_id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
            note: s.note,
            created_at: s.created_at,
            updated_at: s.updated_at,
          }));

        return {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          requested_date: b.requested_date,
          requested_time: b.requested_time,
          status: b.status,
          customer_note: b.customer_note,
          admin_note: b.admin_note,
          created_at: b.created_at,
          updated_at: b.updated_at,
          customer_name: customer?.display_name || 'ลูกค้า 157 Tattoo',
          customer_phone: customer?.phone || undefined,
          customer_email: customer?.email || undefined,
          artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
          artist_nickname: artist?.nickname || null,
          financial: {
            quoted_price: Number(summary?.quoted_price || 0),
            deposit_required: Number(summary?.deposit_required || 0),
            total_paid: Number(summary?.paid_total ?? summary?.total_paid ?? 0),
            remaining_balance: Number(summary?.remaining_balance || 0),
            is_deposit_paid: Boolean(summary?.is_deposit_paid),
            is_fully_paid: Boolean(summary?.is_fully_paid),
          },
          sessions: bookingSessions,
        };
      });

      setEstimates(mappedEstimates);
      setBookings(mappedBookings);

      // Keep selected items updated if open
      if (selectedEstimate) {
        const updatedEst = mappedEstimates.find((e) => e.id === selectedEstimate.id);
        if (updatedEst) setSelectedEstimate(updatedEst);
      }
      if (selectedBooking) {
        const updatedBook = mappedBookings.find((b) => b.id === selectedBooking.id);
        if (updatedBook) setSelectedBooking(updatedBook);
      }
    } catch (err: any) {
      console.error('Error loading requests & bookings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEstimate?.id, selectedBooking?.id]);

  useEffect(() => {
    fetchAllRequestsData();
  }, [refreshTrigger, fetchAllRequestsData]);

  // Top Summary Counts (Section 5)
  const summaryCounts: RequestSummaryCounts = useMemo(() => {
    const newEstimates = estimates.filter((e) => e.status === 'PENDING').length;
    const waitingDeposit = bookings.filter((b) => b.status === 'WAITING_DEPOSIT').length;
    const confirmed = bookings.filter((b) => b.status === 'CONFIRMED').length;
    const inProgress = bookings.filter((b) => b.status === 'IN_PROGRESS').length;

    return {
      newEstimatesCount: newEstimates,
      waitingDepositCount: waitingDeposit,
      confirmedCount: confirmed,
      inProgressCount: inProgress,
    };
  }, [estimates, bookings]);

  return (
    <div className="space-y-6 font-prompt pb-12">
      {/* Title & Page Header */}
      <div className="border-b border-[#4A443A] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Layers size={12} className="text-[#9C2F2F]" />
            <span>Request & Booking Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            จัดการคิวงาน
          </h1>
          <p className="text-xs text-[#A89F91] mt-1 font-light">
            ติดตามคำขอ งานที่รออนุมัติ คิวที่ยืนยันแล้ว และสถานะงานสัก
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#ECE4D3] rounded-md transition-colors flex items-center gap-1.5 font-medium"
            title="รีเฟรชข้อมูลคำขอและคิวงาน"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards (Section 5) */}
      <RequestSummaryCards
        counts={summaryCounts}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main 2 Tabs Switcher (Section 6: Estimate != Booking) */}
      <div className="flex items-center border-b border-[#4A443A] gap-2">
        <button
          id="tab-btn-estimates"
          type="button"
          onClick={() => setActiveTab('estimates')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'estimates'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <FileText size={14} className={activeTab === 'estimates' ? 'text-[#9C2F2F]' : ''} />
          <span>คำขอประเมินราคา ({estimates.length})</span>
          {summaryCounts.newEstimatesCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {summaryCounts.newEstimatesCount}
            </span>
          )}
        </button>

        <button
          id="tab-btn-bookings"
          type="button"
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'bookings'
              ? 'text-[#ECE4D3] border-[#9C2F2F]'
              : 'text-[#7A7265] border-transparent hover:text-[#A89F91]'
          }`}
        >
          <Calendar size={14} className={activeTab === 'bookings' ? 'text-[#9C2F2F]' : ''} />
          <span>คิวงานทั้งหมด ({bookings.length})</span>
          {summaryCounts.waitingDepositCount + summaryCounts.confirmedCount > 0 && (
            <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {summaryCounts.waitingDepositCount + summaryCounts.confirmedCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Estimate Requests List */}
      {activeTab === 'estimates' && (
        <EstimateRequestList
          estimates={estimates}
          selectedEstimate={selectedEstimate}
          onSelectEstimate={setSelectedEstimate}
        />
      )}

      {/* Tab 2: Bookings List */}
      {activeTab === 'bookings' && (
        <BookingList
          bookings={bookings}
          selectedBooking={selectedBooking}
          onSelectBooking={setSelectedBooking}
        />
      )}

      {/* Estimate Detail Panel */}
      {selectedEstimate && (
        <EstimateDetailPanel
          estimate={selectedEstimate}
          onClose={() => setSelectedEstimate(null)}
          onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}

      {/* Booking Detail Panel */}
      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          artists={artists}
          onClose={() => setSelectedBooking(null)}
          onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}
    </div>
  );
}
