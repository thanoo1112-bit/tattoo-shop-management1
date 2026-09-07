'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PaymentSubmissionDetail, SubmissionReviewStatus } from './types';
import PaymentSubmissionReviewDrawer from './PaymentSubmissionReviewDrawer';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Eye,
  User,
  Calendar,
  Layers,
  FileText,
  CreditCard,
  ShieldCheck,
  Ban,
  Image as ImageIcon,
} from 'lucide-react';
import Image from 'next/image';

interface PaymentSubmissionReviewQueueProps {
  onSuccessToast?: (msg: string) => void;
  onErrorToast?: (msg: string) => void;
  onRefreshParent?: () => void;
  onPendingCountChange?: (count: number) => void;
}

export default function PaymentSubmissionReviewQueue({
  onSuccessToast,
  onErrorToast,
  onRefreshParent,
  onPendingCountChange,
}: PaymentSubmissionReviewQueueProps) {
  const supabase = createClient();

  const [submissions, setSubmissions] = useState<PaymentSubmissionDetail[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<SubmissionReviewStatus | 'ALL'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Submission for Review Drawer
  const [selectedSubmission, setSelectedSubmission] = useState<PaymentSubmissionDetail | null>(null);

  // Fetch Submissions with Batch Joins
  const fetchSubmissions = useCallback(async (opts?: { isInitial?: boolean }) => {
    if (opts?.isInitial) {
      setIsLoading(true);
    }
    try {
      // 1. Fetch raw submissions
      const { data: rawSubs, error: subsErr } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (subsErr) throw subsErr;

      const subsList = rawSubs || [];
      if (subsList.length === 0) {
        setSubmissions([]);
        setThumbnails({});
        if (onPendingCountChange) onPendingCountChange(0);
        return;
      }

      // Count pending
      const pendingCount = subsList.filter((s: any) => s.status === 'PENDING').length;
      if (onPendingCountChange) onPendingCountChange(pendingCount);

      // 2. Batch fetch bookings
      const bookingIds = Array.from(new Set(subsList.map((s: any) => s.booking_id)));
      const { data: rawBookings } = await supabase
        .from('bookings')
        .select('*, artists(id, name, nickname), booking_sessions(id, session_number, start_at, end_at, status)')
        .in('id', bookingIds);

      const estIds = Array.from(new Set((rawBookings || []).map((b: any) => b.estimate_request_id).filter(Boolean)));
      const { data: rawEstimates } = estIds.length > 0
        ? await supabase.from('estimate_requests').select('*').in('id', estIds)
        : { data: [] };

      // 3. Batch fetch customers & profiles
      const userIds = Array.from(new Set(subsList.map((s: any) => s.customer_user_id)));
      const { data: rawCustomers } = await supabase
        .from('customers')
        .select('user_id, display_name, first_name, last_name, phone, email')
        .in('user_id', userIds);
      const { data: rawProfiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, phone, email')
        .in('user_id', userIds);

      // 4. Batch fetch financials
      const { data: rawFinancials } = await supabase
        .from('booking_payment_summary')
        .select('*')
        .in('booking_id', bookingIds);

      // 5. Combine into PaymentSubmissionDetail
      const combined: PaymentSubmissionDetail[] = subsList.map((sub: any) => {
        const b = (rawBookings || []).find((x: any) => x.id === sub.booking_id);
        const est = b?.estimate_request_id ? (rawEstimates || []).find((e: any) => e.id === b.estimate_request_id) : null;
        const c = (rawCustomers || []).find((x: any) => x.user_id === sub.customer_user_id);
        const p = (rawProfiles || []).find((x: any) => x.user_id === sub.customer_user_id);
        const f = (rawFinancials || []).find((x: any) => x.booking_id === sub.booking_id);
        const artist: any = Array.isArray(b?.artists) ? b.artists[0] : b?.artists;

        const nameCandidate = c?.first_name
          ? `${c.first_name} ${c.last_name || ''}`.trim()
          : c?.display_name && c.display_name !== 'ลูกค้าประจำ'
          ? c.display_name
          : p?.display_name && p.display_name !== 'ลูกค้าประจำ'
          ? p.display_name
          : c?.email
          ? c.email.split('@')[0]
          : 'ลูกค้า';

        const phoneCandidate = p?.phone || c?.phone || '';

        const depReq = Number(f?.deposit_required ?? est?.deposit_required ?? 0);
        const paid = Number(f?.paid_total ?? 0);
        const outstanding = Math.max(0, depReq - paid);

        return {
          id: sub.id,
          booking_id: sub.booking_id,
          customer_user_id: sub.customer_user_id,
          claimed_amount: Number(sub.claimed_amount || 0),
          slip_path: sub.slip_path,
          reference_no: sub.reference_no,
          customer_note: sub.customer_note,
          status: sub.status,
          submitted_at: sub.submitted_at,
          reviewed_at: sub.reviewed_at,
          reviewed_by: sub.reviewed_by,
          rejection_reason: sub.rejection_reason,
          created_at: sub.created_at,
          updated_at: sub.updated_at,

          customer_name: nameCandidate,
          customer_phone: phoneCandidate,
          customer_email: c?.email || p?.email || '',
          artist_name: artist?.name ? `${artist.name}${artist.nickname ? ` (${artist.nickname})` : ''}` : 'ช่างสักประจำร้าน',
          artist_nickname: artist?.nickname || null,
          artwork_title: b?.artwork_title || est?.style || 'งานสัก Custom',
          artwork_image_url: b?.artwork_image_url || null,
          reference_images: b?.reference_images || null,
          placement: b?.placement || est?.placement || null,
          width_cm: b?.width_cm || est?.width_cm || null,
          height_cm: b?.height_cm || est?.height_cm || null,
          style: est?.style || null,
          description: est?.description || b?.description || null,
          quoted_price: Number(f?.quoted_price ?? est?.quoted_price ?? 0),
          requested_date: b?.requested_date || null,
          booking_status: b?.status || 'WAITING_DEPOSIT',
          deposit_required: depReq,
          paid_total: paid,
          outstanding_deposit: outstanding,
          estimate_request_id: b?.estimate_request_id || null,
          estimate_reference_images: est?.reference_images || null,
          sessions: (b?.booking_sessions || []).map((ses: any) => ({
            id: ses.id,
            session_number: ses.session_number,
            start_at: ses.start_at,
            end_at: ses.end_at,
            status: ses.status,
          })),
        };
      });

      setSubmissions(combined);

      // 6. Generate Signed URLs for thumbnails
      const thumbMap: Record<string, string> = {};
      for (const item of combined) {
        if (item.slip_path) {
          const { data: sData } = await supabase.storage
            .from('booking-payment-slips')
            .createSignedUrl(item.slip_path, 3600);
          if (sData?.signedUrl) {
            thumbMap[item.id] = sData.signedUrl;
          }
        }
      }
      setThumbnails(thumbMap);

      // If drawer was open, refresh selected item quietly
      setSelectedSubmission((prevSelected) => {
        if (!prevSelected) return null;
        const refreshed = combined.find((s) => s.id === prevSelected.id);
        return refreshed || prevSelected;
      });
    } catch (err: any) {
      console.error('Failed to fetch submissions:', err);
      if (onErrorToast) onErrorToast('โหลดรายการสลิปไม่สำเร็จ: ' + err.message);
    } finally {
      if (opts?.isInitial) {
        setIsLoading(false);
      }
    }
  }, [supabase, onPendingCountChange, onErrorToast]);

  const isMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      fetchSubmissions({ isInitial: true });
    } else {
      fetchSubmissions({ isInitial: false });
    }
  }, [fetchSubmissions]);

  // Filtered List
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      // Status Filter
      if (statusFilter !== 'ALL' && sub.status !== statusFilter) return false;

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = sub.customer_name.toLowerCase().includes(q);
        const matchArtist = sub.artist_name.toLowerCase().includes(q);
        const matchBooking = sub.booking_id.toLowerCase().includes(q);
        const matchRef = sub.reference_no?.toLowerCase().includes(q);
        if (!matchCust && !matchArtist && !matchBooking && !matchRef) return false;
      }

      return true;
    });
  }, [submissions, statusFilter, searchQuery]);

  const pendingCount = submissions.filter((s) => s.status === 'PENDING').length;
  const approvedCount = submissions.filter((s) => s.status === 'APPROVED').length;
  const rejectedCount = submissions.filter((s) => s.status === 'REJECTED').length;

  const formatCurrency = (amount: number) => {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatThaiDate = (dateStr?: string | null) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.';
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4 font-prompt">
      {/* Controls Bar: Search & Status Filters */}
      <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[8px] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, ช่างสัก, รหัสคิว หรือเลขอ้างอิง..."
            className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none pl-9 pr-4 py-2 rounded text-xs text-[#ECE4D3] placeholder-[#7A7265]"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            className={
              "px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 " +
              (statusFilter === 'PENDING'
                ? "bg-[#C9A86A] text-black"
                : "bg-[#1C1A17] text-[#ECE4D3] border border-[#4A443A] hover:border-[#C9A86A]")
            }
          >
            <span>รอตรวจสอบ</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-800 text-white font-mono">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('APPROVED')}
            className={
              "px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 " +
              (statusFilter === 'APPROVED'
                ? "bg-emerald-700 text-white"
                : "bg-[#1C1A17] text-[#ECE4D3] border border-[#4A443A] hover:border-emerald-600")
            }
          >
            <span>อนุมัติแล้ว</span>
            <span className="text-[10px] text-[#A89F91]">({approvedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('REJECTED')}
            className={
              "px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 " +
              (statusFilter === 'REJECTED'
                ? "bg-red-800 text-white"
                : "bg-[#1C1A17] text-[#ECE4D3] border border-[#4A443A] hover:border-red-700")
            }
          >
            <span>ปฏิเสธ</span>
            <span className="text-[10px] text-[#A89F91]">({rejectedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={
              "px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors " +
              (statusFilter === 'ALL'
                ? "bg-[#9C2F2F] text-white"
                : "bg-[#1C1A17] text-[#ECE4D3] border border-[#4A443A] hover:border-[#7A7265]")
            }
          >
            ทั้งหมด ({submissions.length})
          </button>

          <button
            type="button"
            onClick={() => fetchSubmissions({ isInitial: false })}
            disabled={isLoading}
            className="p-2 bg-[#1C1A17] border border-[#4A443A] hover:border-[#7A7265] text-[#ECE4D3] rounded transition-colors"
            title="รีเฟรชรายการ"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* List / Queue View */}
      {isLoading ? (
        <div className="bg-[#171512] border border-[#4A443A] p-12 text-center rounded-[8px] space-y-2">
          <RefreshCw size={24} className="mx-auto text-[#9C2F2F] animate-spin" />
          <p className="text-xs text-[#A89F91]">กำลังโหลดรายการสลิป...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="bg-[#171512] border border-[#4A443A] p-12 text-center rounded-[8px] space-y-2">
          <CheckCircle2 size={28} className="mx-auto text-[#7A7265]" />
          <p className="text-sm font-bold text-[#ECE4D3]">
            {statusFilter === 'PENDING'
              ? 'ไม่มีรายการสลิปที่รอตรวจสอบในขณะนี้'
              : 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'}
          </p>
          <p className="text-xs text-[#A89F91] font-light">
            {statusFilter === 'PENDING'
              ? 'เมื่อลูกค้าส่งหลักฐานการชำระเงินมัดจำเข้ามา รายการจะแสดงขึ้นที่นี่'
              : 'ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((sub) => {
            const thumbUrl = thumbnails[sub.id];

            return (
              <div
                key={sub.id}
                className="bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F]/60 p-4 rounded-[8px] transition-all duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                {/* Left Side: Thumbnail & Details */}
                <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                  {/* Slip Thumbnail */}
                  <div
                    onClick={() => setSelectedSubmission(sub)}
                    className="w-16 h-20 bg-black/60 border border-[#4A443A] rounded-[6px] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:border-[#9C2F2F] transition-colors relative group"
                  >
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt="Slip Thumbnail"
                        width={64}
                        height={80}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon size={20} className="text-[#7A7265]" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Eye size={14} className="text-white" />
                    </div>
                  </div>

                  {/* Submission & Booking Meta */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[#ECE4D3] truncate">
                        {sub.customer_name}
                      </span>
                      <span className="text-[10px] text-[#7A7265] font-mono">
                        #{sub.booking_id.slice(0, 8)}
                      </span>
                      <span
                        className={
                          "px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 " +
                          (sub.status === 'APPROVED'
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                            : sub.status === 'REJECTED'
                            ? "bg-red-950/60 text-red-400 border border-red-900/50"
                            : "bg-[#1C1A17] text-[#ECE4D3] border border-[#C9A86A]/50")
                        }
                      >
                        <span
                          className={
                            "w-1.5 h-1.5 rounded-full " +
                            (sub.status === 'APPROVED'
                              ? "bg-emerald-400"
                              : sub.status === 'REJECTED'
                              ? "bg-red-400"
                              : "bg-[#C9A86A] animate-pulse")
                          }
                        />
                        {sub.status === 'APPROVED'
                          ? 'อนุมัติแล้ว'
                          : sub.status === 'REJECTED'
                          ? 'ปฏิเสธ'
                          : 'รอตรวจสอบ'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#A89F91]">
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-[#9C2F2F]" />
                        <span>ช่าง: {sub.artist_name}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} className="text-[#9C2F2F]" />
                        <span>วันนัด: {formatThaiDate(sub.requested_date)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-[#7A7265]" />
                        <span>ส่งเมื่อ: {formatThaiDate(sub.submitted_at)} {formatTime(sub.submitted_at)}</span>
                      </span>
                    </div>

                    {/* Deposit Info Line */}
                    <div className="flex items-center gap-3 pt-1 text-[11px]">
                      <span className="text-[#A89F91]">
                        มัดจำกำหนด: <strong className="text-[#ECE4D3]">฿{formatCurrency(sub.deposit_required)}</strong>
                      </span>
                      <span className="text-[#7A7265]">|</span>
                      <span className="text-[#A89F91]">
                        รับจริงแล้ว: <strong className="text-emerald-400">฿{formatCurrency(sub.paid_total)}</strong>
                      </span>
                      <span className="text-[#7A7265]">|</span>
                      <span className="text-[#A89F91]">
                        ยังขาด: <strong className="text-[#9C2F2F]">฿{formatCurrency(sub.outstanding_deposit)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Claimed Amount & Action Button */}
                <div className="flex sm:flex-col items-end justify-between w-full md:w-auto shrink-0 gap-2 border-t md:border-t-0 border-[#4A443A]/40 pt-2 md:pt-0">
                  <div className="text-right">
                    <span className="text-[10px] text-[#7A7265] block">ยอดที่แจ้ง</span>
                    <span className="text-base font-bold text-[#ECE4D3] font-mono">
                      ฿{formatCurrency(sub.claimed_amount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(sub)}
                    className="px-4 py-2 bg-[#9C2F2F] hover:bg-red-700 text-white text-xs font-bold rounded-[4px] transition-colors flex items-center gap-1.5 shadow"
                  >
                    <Eye size={13} />
                    <span>{sub.status === 'PENDING' ? 'ตรวจสอบสลิป' : 'ดูรายละเอียด'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Drawer Modal */}
      <PaymentSubmissionReviewDrawer
        submission={selectedSubmission}
        isOpen={Boolean(selectedSubmission)}
        onClose={() => setSelectedSubmission(null)}
        onSuccess={(msg) => {
          if (onSuccessToast) onSuccessToast(msg);
          fetchSubmissions();
          if (onRefreshParent) onRefreshParent();
        }}
        onError={(err) => {
          if (onErrorToast) onErrorToast(err);
        }}
      />
    </div>
  );
}
