'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wallet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
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

  // Form states
  const existingQuotedPrice = Number(booking.financial?.quoted_price ?? (booking as any)?.quoted_price ?? 0);
  
  const [actualPriceInput, setActualPriceInput] = useState<string>('');
  const [approvedDeposit, setApprovedDeposit] = useState<number>(0);
  const [isLoadingPayments, setIsLoadingPayments] = useState<boolean>(true);

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

    // Initial price prefill
    const initialPrice = Number(booking.financial?.quoted_price ?? (booking as any)?.quoted_price ?? 0);
    setActualPriceInput(initialPrice > 0 ? initialPrice.toString() : '');

    async function loadApprovedPayments() {
      setIsLoadingPayments(true);
      try {
        const supabase = createClient();
        // Query approved/recorded payments only (status != 'VOIDED')
        const { data, error } = await supabase
          .from('booking_payments')
          .select('amount, status')
          .eq('booking_id', booking.id)
          .neq('status', 'VOIDED');

        if (!error && data && isSubscribed) {
          const totalApproved = data.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          setApprovedDeposit(totalApproved);
        } else if (isSubscribed) {
          // Fallback to summary total_paid if query unavailable
          const summaryPaid = Number(booking.financial?.total_paid ?? 0);
          setApprovedDeposit(summaryPaid);
        }
      } catch (err) {
        console.error('[CompleteBookingDialog] Error loading approved payments:', err);
      } finally {
        if (isSubscribed) {
          setIsLoadingPayments(false);
        }
      }
    }

    loadApprovedPayments();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, booking]);

  if (!isOpen || !mounted) return null;

  // Derived calculation values
  const actualPriceNum = Number(actualPriceInput) || 0;
  const remainingBalance = Math.max(0, actualPriceNum - approvedDeposit);

  const eligibility = checkAdminCompletionEligibility(booking);

  // Validation rules
  const isPriceValid = actualPriceNum > 0 && actualPriceNum >= approvedDeposit;
  const isFormValid = isPriceValid && eligibility.allowed;

  const handleConfirm = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // Pre-flight UI guard
    if (!eligibility.allowed) {
      setErrorMessage(eligibility.reason || 'ไม่สามารถปิดงานได้');
      setIsSubmitting(false);
      return;
    }

    if (actualPriceNum <= 0) {
      setErrorMessage('กรุณาระบุราคางานสักที่ตกลงทั้งหมด');
      setIsSubmitting(false);
      return;
    }

    if (actualPriceNum < approvedDeposit) {
      setErrorMessage(`ราคางาน (฿${actualPriceNum.toLocaleString('th-TH')}) ต้องไม่น้อยกว่ายอดที่ชำระแล้ว (฿${approvedDeposit.toLocaleString('th-TH')})`);
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();

      const { data, error } = await supabase.rpc('admin_record_final_payment_and_complete_booking', {
        p_booking_id: booking.id,
        p_actual_price: actualPriceNum,
      });

      if (error) {
        console.error('[CompleteBookingDialog] RPC error:', error);
        setErrorMessage(mapServerCompletionError(error.message));
        setIsSubmitting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[CompleteBookingDialog] Execution error:', err);
      setErrorMessage(mapServerCompletionError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'));
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
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#ECE4D3] tracking-normal">
                {remainingBalance > 0 ? 'บันทึกรับเงินและปิดงาน' : 'ปิดงานสักเสร็จสิ้น'}
              </h3>
              <p className="text-xs text-[#A89F91] tracking-normal font-normal">
                คิวงาน <span className="font-mono text-[#A89F91]">#{booking.id.slice(0, 8)}</span> • <span className="text-emerald-400 font-medium">{booking.customer_name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A89F91] hover:text-white hover:bg-[#26231E] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. สรุปข้อมูลคิว */}
        <div className="bg-[#0E0D0C] border border-[#4A443A]/80 rounded-xl p-3.5 text-xs space-y-2 font-prompt tracking-normal">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-[#A89F91] font-normal">ลูกค้า: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.customer_name}</span>
            </div>
            <div>
              <span className="text-[#A89F91] font-normal">ช่างสัก: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.artist_name || 'ไม่ระบุ'}</span>
            </div>
            <div>
              <span className="text-[#A89F91] font-normal">สไตล์ลายสัก: </span>
              <span className="text-[#ECE4D3] font-medium">{booking.style_preference || 'ไม่ระบุ'}</span>
            </div>
            <div>
              <span className="text-[#A89F91] font-normal">ขนาดงาน: </span>
              <span className="text-[#ECE4D3] font-medium">{dimensionsText}</span>
            </div>
          </div>
        </div>

        {/* 3. ราคางานสักที่ตกลง (Input field always available for confirmation/editing) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#ECE4D3] tracking-normal flex items-center justify-between">
            <span>ราคางานสุดท้าย (บาท) <span className="text-red-400">*</span></span>
            <span className="text-[11px] text-[#A89F91] font-normal">
              {existingQuotedPrice > 0 ? 'กรุณายืนยันหรือแก้ไขราคาสุดท้าย' : 'กรอกราคาสุดท้ายเพื่อปิดงาน'}
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A89F91] font-mono text-base font-semibold">฿</span>
            <input
              id="input-actual-work-price"
              type="number"
              min="1"
              step="1"
              placeholder="ระบุราคางานสุดท้าย"
              value={actualPriceInput}
              onChange={(e) => setActualPriceInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#0E0D0C] border border-[#4A443A] rounded-xl text-white font-mono font-bold text-lg focus:outline-none focus:border-emerald-500 transition-colors placeholder:font-prompt placeholder:font-normal placeholder:text-sm placeholder:tracking-normal placeholder:text-[#A89F91]/50"
            />
          </div>
        </div>

        {/* 4. สรุปยอดเงินคำนวณแบบ Read-Only */}
        {actualPriceNum > 0 && (
          <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-3.5 space-y-2 text-xs font-prompt">
            <div className="flex items-center justify-between">
              <span className="text-[#A89F91]">ราคางานสักที่ตกลง:</span>
              <span className="text-[#ECE4D3] font-mono font-bold text-sm">
                ฿{actualPriceNum.toLocaleString('th-TH')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#A89F91]">หักมัดจำที่ชำระแล้ว:</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">
                -฿{approvedDeposit.toLocaleString('th-TH')}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#4A443A]/60">
              <span className="text-[#ECE4D3] font-semibold">ยอดที่ต้องรับวันนี้:</span>
              <span className="text-amber-400 font-mono font-bold text-base sm:text-lg">
                ฿{remainingBalance.toLocaleString('th-TH')}
              </span>
            </div>
          </div>
        )}

        {remainingBalance === 0 && actualPriceNum > 0 && (
          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>คิวงานนี้ชำระเงินครบถ้วนแล้ว พร้อมสำหรับการปิดงาน</span>
          </div>
        )}

        {/* UI Guard Warning or Server Error Message */}
        {(!eligibility.allowed || errorMessage) && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs font-medium flex items-start gap-2 tracking-normal">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <div>{errorMessage || eligibility.reason}</div>
          </div>
        )}

        {/* 5. Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#4A443A]/70">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#A89F91] hover:text-white bg-[#0E0D0C] hover:bg-[#26231E] border border-[#4A443A] rounded-xl transition-colors cursor-pointer disabled:opacity-50 tracking-normal"
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
                กำลังบันทึกและปิดงาน...
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>{remainingBalance > 0 ? 'บันทึกรับเงินและปิดงาน' : 'ปิดงาน'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
