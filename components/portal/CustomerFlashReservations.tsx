'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
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
} from 'lucide-react';
import Link from 'next/link';

export interface CustomerFlashReservationRecord {
  id: string;
  flash_design_id: string;
  customer_user_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  requested_date?: string | null;
  requested_start_time?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  flash_design?: {
    id: string;
    title: string;
    style: string;
    size_label?: string | null;
    price: number;
    deposit_amount: number;
    image_url: string;
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

      const formatted: CustomerFlashReservationRecord[] = (data || []).map((r: any) => ({
        id: r.id,
        flash_design_id: r.flash_design_id,
        customer_user_id: r.customer_user_id,
        status: r.status,
        requested_date: r.requested_date,
        requested_start_time: r.requested_start_time,
        customer_note: r.customer_note,
        admin_note: r.admin_note,
        approved_at: r.approved_at,
        rejected_at: r.rejected_at,
        cancelled_at: r.cancelled_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        flash_design: r.flash_designs ? {
          id: r.flash_designs.id,
          title: r.flash_designs.title,
          style: r.flash_designs.style,
          size_label: r.flash_designs.size_label,
          price: Number(r.flash_designs.price) || 0,
          deposit_amount: Number(r.flash_designs.deposit_amount) || 0,
          image_url: r.flash_designs.image_url,
          artist: r.flash_designs.artists ? {
            id: r.flash_designs.artists.id,
            name: r.flash_designs.artists.name,
            nickname: r.flash_designs.artists.nickname,
          } : null,
        } : null,
      }));

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
            const isPending = res.status === 'PENDING';
            const isApproved = res.status === 'APPROVED';
            const isCompleted = res.status === 'COMPLETED';
            const isCancelled = res.status === 'CANCELLED';
            const isRejected = res.status === 'REJECTED';

            const design = res.flash_design;
            const artistName = design?.artist?.name
              ? `${design.artist.name}${design.artist.nickname ? ` (${design.artist.nickname})` : ''}`
              : 'ช่างสักประจำร้าน';

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
                    {isApproved && (
                      <span className="text-[10px] bg-indigo-950/60 border border-indigo-600/40 text-indigo-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={11} /> ร้านยืนยันแล้ว (APPROVED)
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
                <div className="flex gap-3.5 items-start">
                  {design?.image_url && (
                    <div className="w-16 h-20 sm:w-20 sm:h-24 bg-studio-main rounded overflow-hidden shrink-0 border border-studio-border/60">
                      <img src={design.image_url} alt={design.title} className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-studio-primary text-sm truncate">
                        {design?.title || 'แบบลายสัก Flash'}
                      </h4>
                      <span className="font-bold text-studio-red text-sm shrink-0 pl-2">
                        ฿{design?.price ? design.price.toLocaleString() : '0'}
                      </span>
                    </div>

                    <div className="text-[11px] text-studio-secondary flex items-center gap-1">
                      <User size={11} className="text-studio-red shrink-0" />
                      <span>ช่างสัก: <strong className="text-studio-primary">{artistName}</strong></span>
                      {design?.style && (
                        <span className="text-studio-muted">({design.style})</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-studio-muted pt-1">
                      {res.requested_date && (
                        <div className="flex items-center gap-1">
                          <Calendar size={11} className="text-studio-red shrink-0" />
                          <span>วันที่สะดวก: <strong className="text-studio-primary">{formatThaiDate(res.requested_date)}</strong></span>
                        </div>
                      )}
                      {res.requested_start_time && (
                        <div className="flex items-center gap-1">
                          <Clock size={11} className="text-studio-red shrink-0" />
                          <span>เวลาที่สะดวก: <strong className="text-studio-primary">{res.requested_start_time.slice(0, 5)} น.</strong></span>
                        </div>
                      )}
                    </div>

                    {res.customer_note && (
                      <div className="text-[11px] text-studio-secondary bg-studio-main/60 p-2 rounded border border-studio-border/30 mt-1 font-light">
                        <span className="text-studio-muted font-normal">หมายเหตุจากคุณ: </span>
                        {res.customer_note}
                      </div>
                    )}

                    {res.admin_note && (
                      <div className="text-[11px] text-amber-300 bg-amber-950/20 p-2 rounded border border-amber-800/30 mt-1 font-light">
                        <span className="text-amber-400 font-medium">หมายเหตุจากทางร้าน: </span>
                        {res.admin_note}
                      </div>
                    )}
                  </div>
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

                  {/* Customer Cancel Button (PENDING only) */}
                  {isPending && (
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
