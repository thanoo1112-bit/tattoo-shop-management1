'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { CustomerPortalBooking } from './types';
import {
  Sparkles,
  Calendar,
  Clock,
  DollarSign,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock3,
  Ban,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Palette,
  MapPin,
  Maximize2,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import CustomerDepositPaymentSection from './CustomerDepositPaymentSection';
import { formatTattooSize } from '@/lib/utils/formatters';
import { parseFlashCustomerNote } from './portalUtils';


export interface CustomerFlashReservationRecord {
  id: string;
  flash_design_id: string;
  customer_user_id: string;
  status: 'PENDING' | 'WAITING_DEPOSIT' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | string;
  requested_date?: string | null;
  requested_start_time?: string | null;
  placement?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  customer_note?: string | null;
  admin_note?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  has_pending_payment_submission?: boolean;
  booking?: CustomerPortalBooking | null;
  flash_design?: {
    id: string;
    title: string;
    style: string;
    size_label?: string | null;
    price: number;
    deposit_amount: number;
    image_url: string;
    is_repeatable?: boolean;
    artist?: {
      id: string;
      name: string;
      nickname?: string | null;
    } | null;
  } | null;
}

export default function CustomerFlashReservations() {
  const { user } = useApp();
  const [reservations, setReservations] = useState<CustomerFlashReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; text: string; type: 'success' | 'error' } | null>(null);

  const fetchCustomerFlashReservations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('flash_reservations')
        .select(`
          id,
          flash_design_id,
          customer_user_id,
          status,
          requested_date,
          requested_start_time,
          placement,
          width_cm,
          height_cm,
          customer_note,
          admin_note,
          approved_at,
          rejected_at,
          cancelled_at,
          completed_at,
          created_at,
          flash_designs (
            id,
            title,
            style,
            size_label,
            price,
            deposit_amount,
            image_url,
            is_repeatable,
            artists (
              id,
              name,
              nickname
            )
          )
        `)
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const rawFlashList = data || [];
      const flashIds = rawFlashList.map((r: any) => r.id);
      let linkedBookingsMap: Record<string, any> = {};

      if (flashIds.length > 0) {
        const { data: bData } = await supabase
          .from('bookings')
          .select('id, flash_reservation_id, customer_user_id, artist_id, status, approved_at, quoted_price, created_at')
          .in('flash_reservation_id', flashIds);

        if (bData && bData.length > 0) {
          const bookingIds = bData.map((b: any) => b.id);
          const { data: finData } = await supabase
            .from('booking_payment_summary')
            .select('*')
            .in('booking_id', bookingIds);

          const { data: subData } = await supabase
            .from('booking_payment_submissions')
            .select('id, booking_id, status')
            .in('booking_id', bookingIds)
            .eq('status', 'PENDING');

          (bData || []).forEach((b: any) => {
            const fin = (finData || []).find((f: any) => f.booking_id === b.id);
            const hasPending = (subData || []).some((s: any) => s.booking_id === b.id);
            linkedBookingsMap[b.flash_reservation_id] = {
              id: b.id,
              customer_user_id: b.customer_user_id,
              artist_id: b.artist_id,
              status: b.status,
              approved_at: b.approved_at,
              created_at: b.created_at,
              financial: {
                booking_id: b.id,
                customer_user_id: b.customer_user_id,
                quoted_price: fin?.quoted_price ? Number(fin.quoted_price) : Number(b.quoted_price || 10000),
                deposit_required: fin?.deposit_required ? Number(fin.deposit_required) : 500,
                paid_total: Number(fin?.paid_total || 0),
                remaining_balance: fin?.remaining_balance ? Number(fin.remaining_balance) : null,
                deposit_paid: Boolean(fin?.deposit_paid),
                is_fully_paid: Boolean(fin?.is_fully_paid),
              },
              has_pending_payment_submission: hasPending,
            };
          });
        }
      }

      const formatted: CustomerFlashReservationRecord[] = rawFlashList.map((r: any) => {
        const lBooking = linkedBookingsMap[r.id] || null;
        return {
          id: r.id,
          flash_design_id: r.flash_design_id,
          customer_user_id: r.customer_user_id,
          status: r.status,
          requested_date: r.requested_date,
          requested_start_time: r.requested_start_time,
          placement: r.placement,
          width_cm: r.width_cm ? Number(r.width_cm) : null,
          height_cm: r.height_cm ? Number(r.height_cm) : null,
          customer_note: r.customer_note,
          admin_note: r.admin_note,
          approved_at: r.approved_at,
          rejected_at: r.rejected_at,
          cancelled_at: r.cancelled_at,
          completed_at: r.completed_at,
          created_at: r.created_at,
          has_pending_payment_submission: Boolean(lBooking?.has_pending_payment_submission),
          booking: lBooking,
          flash_design: r.flash_designs ? {
            id: r.flash_designs.id,
            title: r.flash_designs.title,
            style: r.flash_designs.style,
            size_label: r.flash_designs.size_label,
            price: Number(r.flash_designs.price) || 0,
            deposit_amount: Number(r.flash_designs.deposit_amount) || 0,
            image_url: r.flash_designs.image_url,
            is_repeatable: Boolean(r.flash_designs.is_repeatable),
            artist: r.flash_designs.artists ? {
              id: r.flash_designs.artists.id,
              name: r.flash_designs.artists.name,
              nickname: r.flash_designs.artists.nickname,
            } : null,
          } : null,
        };
      });

      setReservations(formatted);
    } catch (err: any) {
      console.error('Error fetching customer flash reservations:', err);
      setError('ไม่สามารถโหลดข้อมูลคำขอจอง Flash ได้');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCustomerFlashReservations();
  }, [fetchCustomerFlashReservations]);

  const handleCancelReservation = async (reservationId: string) => {
    if (!window.confirm('ท่านต้องการยกเลิกคำขอจองลาย Flash นี้ใช่หรือไม่?')) return;
    setActionLoadingId(reservationId);
    setActionMsg(null);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc('cancel_flash_reservation', {
        p_reservation_id: reservationId,
      });

      if (rpcErr) throw rpcErr;

      setActionMsg({ id: reservationId, text: 'ยกเลิกคำขอจองสำเร็จแล้ว ลายถูกปลดล็อกกลับสู่สถานะว่าง', type: 'success' });
      fetchCustomerFlashReservations();
    } catch (err: any) {
      console.error('Cancel flash reservation error:', err);
      setActionMsg({ id: reservationId, text: err.message || 'ไม่สามารถยกเลิกคำขอได้', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatThaiDate = (dateStr?: string | null) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Bangkok',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 font-prompt animate-fadeIn">
      <div className="flex justify-between items-center pb-2 border-b border-studio-border">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-studio-primary flex items-center gap-2">
            <Sparkles size={16} className="text-studio-red" />
            <span>คำขอจองลายสักพร้อมจอง (Flash Reservations)</span>
          </h3>
          <p className="text-[11px] text-studio-secondary font-light">
            รายการคำขอจองแบบลายสัก Flash ของท่าน ติดตามสถานะและรอบยืนยันจากทางร้าน
          </p>
        </div>
        <Link
          href="/flash"
          className="text-xs text-studio-red hover:underline flex items-center gap-1 font-semibold shrink-0"
        >
          <span>+ เลือกลาย Flash เพิ่ม</span>
          <ExternalLink size={12} />
        </Link>
      </div>

      {loading && (
        <div className="py-12 text-center text-xs text-studio-secondary animate-pulse">
          กำลังโหลดรายการจอง Flash...
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && reservations.length === 0 && (
        <div className="bg-studio-card border border-studio-border p-10 rounded-[6px] text-center space-y-3">
          <Sparkles size={28} className="text-studio-muted mx-auto" />
          <h4 className="text-sm font-bold text-studio-primary">ยังไม่มีรายการจองลายสัก Flash</h4>
          <p className="text-xs text-studio-secondary max-w-sm mx-auto font-light">
            ท่านสามารถเลือกชมแบบลายสักพร้อมจอง (Fixed Price) ลิขสิทธิ์เฉพาะของช่างประจำร้านได้ที่แกลเลอรี Flash
          </p>
          <Link
            href="/flash"
            className="inline-block bg-studio-red text-studio-primary text-xs font-bold px-4 py-2 rounded-[4px] hover:bg-studio-red/80 transition-all uppercase tracking-wider"
          >
            ดูลาย Flash ทั้งหมด
          </Link>
        </div>
      )}

      {!loading && !error && reservations.length > 0 && (
        <div className="space-y-3">
          {reservations.map((res) => {
            const isWaitingDeposit = res.status === 'WAITING_DEPOSIT' || res.booking?.status === 'WAITING_DEPOSIT';
            const hasPendingSlip = Boolean(res.has_pending_payment_submission || res.booking?.has_pending_payment_submission);
            const isPending = res.status === 'PENDING' && !isWaitingDeposit;
            const isApproved = (res.status === 'APPROVED' || res.status === 'CONFIRMED' || res.booking?.status === 'CONFIRMED') && !isWaitingDeposit;
            const isCompleted = res.status === 'COMPLETED' || res.booking?.status === 'COMPLETED';
            const isCancelled = res.status === 'CANCELLED' || res.booking?.status === 'CANCELLED';
            const isRejected = res.status === 'REJECTED' || res.booking?.status === 'REJECTED';

            const design = res.flash_design;
            const artistName = design?.artist?.name
              ? `${design.artist.name}${design.artist.nickname ? ` (${design.artist.nickname})` : ''}`
              : 'ช่างสักประจำร้าน';

            const parsedNote = parseFlashCustomerNote(res.customer_note);
            const placementDisplay = (res.placement && res.placement.trim())
              ? res.placement.trim()
              : (parsedNote.parsedPlacement || 'ไม่ระบุ');
            const sizeFormatted = formatTattooSize(res.width_cm, res.height_cm, parsedNote.parsedSizeRaw);
            const hasSize = sizeFormatted !== 'ไม่ระบุ';

            return (
              <div
                key={res.id}
                className="bg-studio-card border border-studio-border hover:border-studio-border/80 p-4 rounded-[6px] transition-all space-y-3 shadow-md"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2.5 border-b border-studio-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-studio-red tracking-wider">
                      FLASH #{res.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      • ส่งเมื่อ: {formatThaiDate(res.created_at)}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isPending && (
                      <span className="text-[10px] bg-amber-950/60 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <Clock3 size={11} /> รอดำเนินการ (PENDING)
                      </span>
                    )}
                    {isWaitingDeposit && !hasPendingSlip && (
                      <span className="text-[10px] bg-amber-950/60 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <Clock3 size={11} /> รอมัดจำ ฿500 (WAITING_DEPOSIT)
                      </span>
                    )}
                    {isWaitingDeposit && hasPendingSlip && (
                      <span className="text-[10px] bg-purple-950/60 border border-purple-600/40 text-purple-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <Clock3 size={11} /> รอตรวจสลิป (SLIP_REVIEW)
                      </span>
                    )}
                    {isApproved && (
                      <span className="text-[10px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={11} /> ยืนยันคิวแล้ว (CONFIRMED)
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={11} /> เสร็จสิ้น / สักแล้ว (COMPLETED)
                      </span>
                    )}
                    {isCancelled && (
                      <span className="text-[10px] bg-[#171512] border border-[#4A443A] text-[#7A7265] px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <Ban size={11} /> ยกเลิกแล้ว (CANCELLED)
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[10px] bg-red-950/40 border border-red-900/60 text-red-400 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <XCircle size={11} /> ปฏิเสธ (REJECTED)
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Body */}
                <div className="space-y-3">
                  <div className="flex gap-3.5 items-start">
                    <div className="w-16 h-20 sm:w-20 sm:h-24 bg-studio-main rounded overflow-hidden shrink-0 border border-studio-border/60">
                      <CustomerReferenceImage
                        src={design?.image_url}
                        alt={design?.title || ''}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1 text-xs">
                      <h4 className="font-bold text-studio-primary text-sm truncate">
                        {design?.title || 'แบบลายสัก Flash'}
                      </h4>
                      <p className="text-[11px] text-studio-secondary font-light">
                        ลายสัก Flash พร้อมสักราคาคงที่ (Fixed Price)
                      </p>
                    </div>
                  </div>

                  {/* กล่อง “รายละเอียดงานสัก” รูปแบบเดียวกับการจองคิวสักปกติ */}
                  <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] space-y-2.5 text-xs text-studio-primary">
                    <div className="text-[11px] font-bold text-studio-secondary uppercase tracking-wider border-b border-studio-border/40 pb-1.5 mb-1">
                      รายละเอียดงานสัก
                    </div>

                    {/* 1. ช่างสัก */}
                    <div className="flex justify-between items-center">
                      <span className="text-studio-secondary flex items-center gap-1.5">
                        <User size={13} className="text-studio-red" /> ช่างสัก
                      </span>
                      <span className="font-semibold text-studio-primary">{artistName}</span>
                    </div>

                    {/* 2. สไตล์ลายสัก */}
                    <div className="flex justify-between items-center">
                      <span className="text-studio-secondary flex items-center gap-1.5">
                        <Palette size={13} className="text-studio-red" /> สไตล์ลายสัก
                      </span>
                      <span className="font-semibold text-studio-primary">{design?.style || '-'}</span>
                    </div>

                    {/* 3. ตำแหน่งที่สัก */}
                    <div className="flex justify-between items-center">
                      <span className="text-studio-secondary flex items-center gap-1.5">
                        <MapPin size={13} className="text-studio-red" /> ตำแหน่งที่สัก
                      </span>
                      <span className="font-semibold text-studio-primary">{placementDisplay}</span>
                    </div>

                    {/* 4. ขนาดงานสัก */}
                    {hasSize && (
                      <div className="flex justify-between items-center">
                        <span className="text-studio-secondary flex items-center gap-1.5">
                          <Maximize2 size={13} className="text-studio-red" /> ขนาดงานสัก
                        </span>
                        <span className="font-semibold text-studio-primary">
                          {sizeFormatted}
                        </span>
                      </div>
                    )}

                    {/* 5. วันนัด */}
                    <div className="flex justify-between items-center">
                      <span className="text-studio-secondary flex items-center gap-1.5">
                        <Calendar size={13} className="text-studio-red" /> วันนัด
                      </span>
                      <span className="font-semibold text-studio-primary">
                        {res.requested_date ? formatThaiDate(res.requested_date) : '-'}
                      </span>
                    </div>

                    {/* 6. เวลาเริ่ม */}
                    <div className="flex justify-between items-center">
                      <span className="text-studio-secondary flex items-center gap-1.5">
                        <Clock size={13} className="text-studio-red" /> เวลาเริ่ม
                      </span>
                      <span className="font-semibold text-studio-primary">
                        {res.requested_start_time ? `${res.requested_start_time.slice(0, 5)} น.` : '-'}
                      </span>
                    </div>

                    {/* 7. รายละเอียดเพิ่มเติม */}
                    {res.customer_note && (
                      <div className="pt-2 border-t border-studio-border/30 text-[11px]">
                        <span className="text-studio-secondary block mb-1 flex items-center gap-1.5 font-medium">
                          <FileText size={12} className="text-studio-red" /> รายละเอียดเพิ่มเติม:
                        </span>
                        <p className="text-studio-primary bg-studio-card/80 p-2 rounded border border-studio-border/40 font-light whitespace-pre-wrap">
                          {res.customer_note}
                        </p>
                      </div>
                    )}
                  </div>



                  {/* Deposit Payment Section for Flash Reservation */}
                  {res.booking && (
                    (isWaitingDeposit || isApproved || hasPendingSlip)
                  ) && (
                    <div className="pt-2 border-t border-studio-border/30">
                      <CustomerDepositPaymentSection
                        booking={res.booking}
                        onRefresh={fetchCustomerFlashReservations}
                      />
                    </div>
                  )}
                </div>

                {/* Status Notice & Customer Action */}
                <div className="pt-2 border-t border-studio-border/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="text-[11px] text-studio-muted font-light">
                    {isPending && (
                      <span className="text-amber-300/80">
                        • ลายนี้ถูก Hold ไว้ชั่วคราว ร้านกำลังตรวจสอบคิวงาน
                      </span>
                    )}
                    {isApproved && (
                      <span className="text-indigo-300/90 font-medium flex items-center gap-1">
                        <ShieldCheck size={12} className="text-indigo-400" />
                        ร้านยืนยันลายนี้ให้คุณแล้ว (Design RESERVED) กรุณารอรับการติดต่อเรื่องมัดจำ/นัดหมาย
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-emerald-400/90 font-medium">
                        ✓ ทำการสักและปิดงานเรียบร้อยแล้ว (Design SOLD)
                      </span>
                    )}
                    {isCancelled && (
                      <span className="text-studio-muted">
                        • คำขอจองนี้ถูกยกเลิกแล้ว
                      </span>
                    )}
                  </div>

                  {/* Customer Cancel Button (PENDING & no deposit slip submitted only) */}
                  {isPending && !hasPendingSlip && !res.booking?.financial?.deposit_paid && (
                    <button
                      type="button"
                      disabled={actionLoadingId === res.id}
                      onClick={() => handleCancelReservation(res.id)}
                      className="bg-transparent border border-red-900/50 text-red-400 hover:bg-red-950/40 hover:border-red-600 px-3 py-1.5 rounded-[4px] text-[11px] font-semibold transition-all disabled:opacity-50 shrink-0"
                    >
                      {actionLoadingId === res.id ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอจอง'}
                    </button>
                  )}
                </div>

                {actionMsg && actionMsg.id === res.id && (
                  <div
                    className={`text-xs p-2 rounded border ${
                      actionMsg.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-red-950/40 border-red-800 text-red-300'
                    }`}
                  >
                    {actionMsg.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
