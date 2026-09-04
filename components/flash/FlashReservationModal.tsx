'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { X, Calendar, Clock, DollarSign, User, ShieldCheck, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface FlashDesignData {
  id: string;
  artist_id: string;
  title: string;
  description?: string | null;
  style: string;
  size_label?: string | null;
  price: number;
  deposit_amount: number;
  estimated_duration_minutes?: number | null;
  image_url: string;
  image_url_2?: string | null;
  status: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'SOLD';
  is_visible: boolean;
  artist?: {
    id: string;
    name: string;
    nickname?: string | null;
  } | null;
}

interface FlashReservationModalProps {
  flash: FlashDesignData;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}

export default function FlashReservationModal({
  flash,
  isOpen,
  onClose,
  onSuccess,
}: FlashReservationModalProps) {
  const router = useRouter();
  const { user } = useApp();
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('13:00');
  const [customerNote, setCustomerNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const artistName = flash.artist?.name
    ? `${flash.artist.name}${flash.artist.nickname ? ` (${flash.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Guest Auth Guard
    if (!user) {
      if (typeof window !== 'undefined') {
        window.location.href = `/login?redirect=${encodeURIComponent(`/flash?select=${flash.id}`)}`;
      }
      return;
    }

    if (flash.status !== 'AVAILABLE') {
      setError('ลายนี้ไม่สามารถส่งคำขอได้ในขณะนี้ (สถานะ: ' + flash.status + ')');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc('create_flash_reservation', {
        p_flash_design_id: flash.id,
        p_requested_date: requestedDate || null,
        p_requested_start_time: requestedTime ? `${requestedTime}:00` : null,
        p_customer_note: customerNote.trim() || null,
      });

      if (rpcErr) throw rpcErr;

      const resId = data?.reservation_id || (typeof data === 'string' ? data : '');
      setSuccessMsg('ส่งคำขอจองลาย Flash สำเร็จแล้ว! ร้านจะตรวจสอบและติดต่อยืนยันอีกครั้ง');
      setTimeout(() => {
        onSuccess(resId);
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Error creating flash reservation:', err);
      setError(err.message || 'ไม่สามารถส่งคำขอจองลาย Flash ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt animate-fadeIn">
      <div className="w-full max-w-lg bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px] shadow-2xl relative my-6 text-studio-primary">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-xs text-studio-muted hover:text-studio-red font-bold p-1 transition-colors"
        >
          ✕ ปิดหน้าต่าง
        </button>

        <div className="border-b border-studio-border pb-3 mb-4">
          <div className="inline-flex items-center space-x-1.5 bg-studio-red/10 border border-studio-red/30 px-2 py-0.5 rounded text-studio-red text-[10px] uppercase font-bold tracking-widest mb-1">
            <Sparkles size={11} />
            <span>FLASH RESERVATION REQUEST</span>
          </div>
          <h2 className="text-lg sm:text-xl font-heading text-studio-primary">
            ส่งคำขอจองแบบลายสัก Flash — {flash.title}
          </h2>
          <p className="text-[11px] text-studio-secondary mt-0.5 font-light">
            ลายพร้อมสักราคาคงที่ (Fixed Price) ระบุวันที่และเวลาที่ท่านสะดวก ร้านจะทำการตรวจสอบและยืนยันรอบนัดหมายอีกครั้ง
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Flash Summary Card */}
          <div className="flex gap-3 bg-studio-main border border-studio-border p-3 rounded-[6px] items-center">
            <div className="w-16 h-20 bg-studio-card rounded overflow-hidden shrink-0 border border-studio-border/60">
              <img src={flash.image_url} alt={flash.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-bold text-studio-primary truncate text-sm">{flash.title}</h4>
              <div className="text-[11px] text-studio-secondary flex items-center gap-1">
                <User size={11} className="text-studio-red" />
                <span>ช่างสัก: <strong className="text-studio-primary">{artistName}</strong></span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-studio-border/40 text-[11px]">
                <span className="text-studio-muted">ราคาสัก: <strong className="text-studio-red">฿{flash.price.toLocaleString()}</strong></span>
                {flash.deposit_amount > 0 && (
                  <span className="text-studio-muted">มัดจำ: <strong className="text-studio-primary">฿{flash.deposit_amount.toLocaleString()}</strong></span>
                )}
              </div>
            </div>
          </div>

          {/* Requested Date & Time Preferences */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-studio-secondary font-medium flex items-center gap-1">
                <Calendar size={12} className="text-studio-red" />
                <span>วันที่สะดวกเข้ารับบริการ (ทางเลือก)</span>
              </label>
              <input
                type="date"
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary px-3 py-2 rounded-[4px] outline-none focus:border-studio-red"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-studio-secondary font-medium flex items-center gap-1">
                <Clock size={12} className="text-studio-red" />
                <span>เวลาที่สะดวกเริ่มสัก (ทางเลือก)</span>
              </label>
              <select
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
                className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary px-3 py-2 rounded-[4px] outline-none focus:border-studio-red cursor-pointer"
              >
                <option value="10:00">10:00 น. (ช่วงเช้า)</option>
                <option value="11:00">11:00 น. (ช่วงสาย)</option>
                <option value="13:00">13:00 น. (ช่วงบ่าย)</option>
                <option value="14:00">14:00 น. (ช่วงบ่าย)</option>
                <option value="15:00">15:00 น. (ช่วงบ่ายแก่)</option>
                <option value="16:00">16:00 น. (ช่วงเย็น)</option>
                <option value="17:00">17:00 น. (ช่วงค่ำ)</option>
              </select>
            </div>
          </div>

          {/* Customer Note */}
          <div className="space-y-1">
            <label className="block text-studio-secondary font-medium">
              ข้อความหรือหมายเหตุเพิ่มเติมถึงช่างสัก (ไม่บังคับ)
            </label>
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="ระบุตำแหน่งร่างกายที่ต้องการสัก หรือรายละเอียดเพิ่มเติม..."
              rows={2}
              className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary p-2.5 rounded-[4px] outline-none focus:border-studio-red resize-none"
            />
          </div>

          {/* Informational Disclaimer */}
          <div className="bg-studio-main/80 border border-studio-border/60 p-3 rounded-[4px] space-y-1 text-[11px] text-studio-secondary">
            <div className="flex items-center gap-1 text-studio-primary font-semibold">
              <ShieldCheck size={13} className="text-studio-red" />
              <span>เงื่อนไขการส่งคำขอจองลาย Flash:</span>
            </div>
            <p className="leading-relaxed font-light">
              • การส่งคำขอนี้จะเปลี่ยนสถานะลายเป็น <strong>รอการยืนยัน (HELD)</strong> ชั่วคราวเพื่อป้องกันผู้อื่นจองซ้ำ<br />
              • ท่านสามารถยกเลิกคำขอได้ตลอดเวลาขณะที่คำขอยังอยู่ในสถานะ <strong>รอดำเนินการ (PENDING)</strong><br />
              • ร้านจะติดต่อยืนยันรอบนัดหมายและการชำระเงินมัดจำอีกครั้ง
            </p>
          </div>

          {/* Submit Action */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/40 py-2.5 px-3 rounded-[4px] text-xs font-semibold transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || !!successMsg}
              className="flex-[2] bg-studio-red border border-studio-red text-studio-primary hover:bg-studio-red/80 py-2.5 px-3 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังส่งคำขอ...' : user ? 'ยืนยันส่งคำขอจองลายนี้' : 'เข้าสู่ระบบเพื่อจองลายนี้'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
