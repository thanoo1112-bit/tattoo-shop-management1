'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BookingItem } from './types';
import { formatTattooSize } from '@/lib/utils/formatters';
import { checkAdminCompletionEligibility, mapServerCompletionError } from './adminCompletionGuard';

interface CompleteBookingDialogProps {
  booking: BookingItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CompleteBookingDialog({
  booking,
  isOpen,
  onClose,
  onSuccess,
}: CompleteBookingDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [approvedDeposit, setApprovedDeposit] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydrate initial values & load approved payments when dialog opens
  useEffect(() => {
    if (!isOpen || !booking) return;

    let isSubscribed = true;
    setErrorMessage(null);
    setIsSubmitting(false);

    async function loadApprovedPayments() {
      try {
        const supabase = createClient();
        // Query approved/recorded payments only (status = 'RECORDED')
        const { data, error } = await supabase
          .from('booking_payments')
          .select('amount, status')
          .eq('booking_id', booking.id)
          .eq('status', 'RECORDED');

        if (!error && data && isSubscribed) {
          const totalApproved = data.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          setApprovedDeposit(totalApproved);
        } else if (isSubscribed) {
          // Fallback to summary total_paid or default deposit 500
          const summaryPaid = Number(booking.financial?.total_paid ?? 0);
          setApprovedDeposit(summaryPaid > 0 ? summaryPaid : 500);
        }
      } catch (err) {
        console.error('[CompleteBookingDialog] Error loading approved payments:', err);
      }
    }

    loadApprovedPayments();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, booking]);

  if (!isOpen || !mounted) return null;

  const eligibility = checkAdminCompletionEligibility(booking);
  const isFormValid = eligibility.allowed;

  const handleConfirm = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // Pre-flight UI guard: strictly enforce that all sessions are completed
    if (!eligibility.allowed) {
      setErrorMessage(eligibility.reason || 'ไม่สามารถปิดงานได้');
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();

      // Effective deposit to satisfy DB trigger and RPC parameter without creating new balance/revenue
      const effectiveDeposit = approvedDeposit > 0
        ? approvedDeposit
        : Number(booking.financial?.total_paid ?? 0) > 0
        ? Number(booking.financial?.total_paid)
        : 500;

      const { data, error } = await supabase.rpc('admin_record_final_payment_and_complete_booking', {
        p_booking_id: booking.id,
        p_actual_price: effectiveDeposit,
      });

      if (error) {
        console.error('[CompleteBookingDialog] RPC error:', error);
        setErrorMessage(mapServerCompletionError(error.message, (error as any).code));
        setIsSubmitting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[CompleteBookingDialog] Execution error:', err);
      setErrorMessage(mapServerCompletionError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', err.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dimensions formatted text
  const dimensionsText = formatTattooSize(booking.width_cm, booking.height_cm);

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200 font-prompt tracking-normal">
      <div className="w-full max-w-md bg-[#171512] border border-[#4A443A] rounded-2xl shadow-2xl p-5 text-[#ECE4D3] my-auto max-h-[90dvh] overflow-y-auto space-y-4 font-prompt tracking-normal">
        {/* 1. Header */}
        <div className="flex items-start justify-between border-b border-[#4A443A]/70 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#ECE4D3] tracking-normal">
                ยืนยันปิดงาน
              </h3>
              <p className="text-xs text-[#B8B0A3] tracking-normal font-normal">
                คิวงาน <span className="font-mono text-[#B8B0A3]">#{booking.id.slice(0, 8)}</span> • <span className="text-emerald-400 font-medium">{booking.customer_name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#B8B0A3] hover:text-white hover:bg-[#26231E] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. สรุปข้อมูลคิว */}
        <div className="bg-[#0E0D0C] border border-[#4A443A]/80 rounded-xl p-3.5 text-xs space-y-2 font-prompt tracking-normal">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-[#B8B0A3] font-normal">ลูกค้า: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.customer_name}</span>
            </div>
            <div>
              <span className="text-[#B8B0A3] font-normal">ช่างสัก: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.artist_name || 'ไม่ระบุ'}</span>
            </div>
            <div>
              <span className="text-[#B8B0A3] font-normal">สไตล์ลายสัก: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.style_preference || 'ไม่ระบุ'}</span>
            </div>
            <div>
              <span className="text-[#B8B0A3] font-normal">ขนาดงาน: </span>
              <span className="text-[#ECE4D3] font-medium">{dimensionsText}</span>
            </div>
          </div>
        </div>

        {/* 3. ข้อความยืนยันปิดงาน */}
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-[#ECE4D3] text-xs font-normal flex items-center gap-2.5">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>ยืนยันว่าการสักงานนี้เสร็จสิ้นแล้ว</span>
        </div>

        {/* UI Guard Warning or Server Error Message */}
        {(!eligibility.allowed || errorMessage) && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs font-medium flex items-start gap-2 tracking-normal">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <div>{errorMessage || eligibility.reason}</div>
          </div>
        )}

        {/* 4. Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#4A443A]/70">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#B8B0A3] hover:text-white bg-[#0E0D0C] hover:bg-[#26231E] border border-[#4A443A] rounded-xl transition-colors cursor-pointer disabled:opacity-50 tracking-normal"
          >
            ยกเลิก
          </button>
          <button
            id="btn-confirm-complete-booking"
            type="button"
            disabled={isSubmitting || !isFormValid}
            onClick={handleConfirm}
            className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-950/50 disabled:opacity-50 flex items-center gap-2 cursor-pointer tracking-normal"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>กำลังปิดงาน...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>ยืนยันปิดงาน</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
