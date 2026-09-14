'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { BookingItem } from './types';
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
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !mounted) return null;

  const eligibility = checkAdminCompletionEligibility(booking);
  const quotedPriceNum = Number(booking.financial?.quoted_price ?? (booking as any)?.quoted_price ?? 0);
  const quotedPriceFormatted = quotedPriceNum > 0 ? quotedPriceNum.toLocaleString('th-TH') : null;

  const hasRemainingBalance = (booking.financial?.remaining_balance ?? 0) > 0;
  const remainingBalanceFormatted = Number(booking.financial?.remaining_balance ?? 0).toLocaleString('th-TH');

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    // Pre-flight UI Guard check
    if (!eligibility.allowed) {
      setErrorMessage(eligibility.reason || 'ไม่สามารถจบงานสักได้');
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('complete_booking', {
        p_booking_id: booking.id,
      });

      if (error) {
        console.error('complete_booking error:', error);
        setErrorMessage(mapServerCompletionError(error.message));
        onSuccess(); // Trigger parent refresh on server rejection for stale state recovery
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('complete_booking unexpected error:', err);
      setErrorMessage(mapServerCompletionError(err.message));
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200 font-prompt">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl p-6 text-zinc-100 my-auto max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">ยืนยันจบงานสักทั้งหมด?</h3>
            <p className="text-xs text-zinc-400">คิวงาน #{booking.id.slice(0, 8)} • {booking.customer_name}</p>
          </div>
        </div>

        <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
          ตรวจสอบว่ารอบสักทั้งหมดที่ต้องดำเนินการเสร็จสิ้นแล้ว ก่อนยืนยันจบงาน
        </p>

        {/* Read-only Actual Tattoo Price */}
        {quotedPriceFormatted && (
          <div className="mb-4 p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-xs flex items-center justify-between">
            <span className="text-zinc-400">ราคางานสักจริง:</span>
            <span className="font-bold text-white font-mono">฿{quotedPriceFormatted}</span>
          </div>
        )}

        {/* Remaining balance non-blocking warning */}
        {hasRemainingBalance && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2.5">
            <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div className="font-semibold text-amber-200">งานนี้ยังมียอดค้างชำระ ฿{remainingBalanceFormatted}</div>
              <div className="text-amber-300/80 mt-0.5">คุณยังสามารถบันทึกรับเงินส่วนที่เหลือภายหลังได้ในหน้าระบบการเงิน</div>
            </div>
          </div>
        )}

        {/* UI Guard Warning or Server Error Message */}
        {(!eligibility.allowed || errorMessage) && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium">
            {errorMessage || eligibility.reason}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700/80 rounded-xl transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            id="btn-confirm-complete-booking"
            type="button"
            disabled={isSubmitting || !eligibility.allowed}
            onClick={handleConfirm}
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                กำลังปิดงาน...
              </>
            ) : (
              'ยืนยันปิดงาน'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
