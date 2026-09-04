'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { Check, CreditCard, ShieldCheck, QrCode, AlertCircle, Loader2, Send } from 'lucide-react';

interface DepositCardProps {
  bookingId: string;
  paymentId?: string;
  depositAmount: number;
  artistName: string;
  dateString: string;
  timeSlotString: string;
  paymentStatus?: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
  initialPaymentReference?: string;
  staffRejectionNote?: string;
  onPaymentSuccess?: () => void;
}

export default function DepositCard({
  bookingId,
  paymentId,
  depositAmount,
  artistName,
  dateString,
  timeSlotString,
  paymentStatus = 'PENDING',
  initialPaymentReference = '',
  staffRejectionNote,
  onPaymentSuccess,
}: DepositCardProps) {
  const { submitDepositPayment, bookingPayments } = useApp();
  const [method, setMethod] = useState<'qr' | 'transfer'>('qr');
  const [paymentReference, setPaymentReference] = useState(initialPaymentReference);
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(paymentStatus === 'SUBMITTED');

  // Find linked payment id from context if not passed directly
  const activePayment = paymentId 
    ? bookingPayments.find(p => p.id === paymentId) 
    : bookingPayments.find(p => p.bookingId === bookingId && p.paymentType === 'DEPOSIT');

  const currentPaymentId = paymentId || activePayment?.id;
  const currentStatus = activePayment?.status || paymentStatus;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPaymentId) {
      setError('ไม่พบรายการแจ้งชำระเงินสำหรับคิวจองนี้ กรุณารอสักครู่หรือรีเฟรชหน้าจอ');
      return;
    }

    if (!paymentReference.trim()) {
      setError('กรุณาระบุเลขอ้างอิงการโอนเงินหรือหมายเลขสลิป');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await submitDepositPayment(
        currentPaymentId,
        paymentReference.trim(),
        method === 'qr' ? 'PROMPTPAY' : 'BANK_TRANSFER',
        customerNote
      );
      setSubmittedSuccess(true);
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถส่งข้อมูลแจ้งชำระเงินได้');
    } finally {
      setSubmitting(false);
    }
  };

  if (currentStatus === 'VERIFIED') {
    return (
      <div className="bg-studio-card border border-studio-red/60 p-6 rounded-[8px] text-center max-w-sm mx-auto animate-fadeIn">
        <div className="w-12 h-12 bg-studio-red/20 border border-studio-red text-studio-red flex items-center justify-center rounded-full mx-auto mb-4">
          <Check size={24} />
        </div>
        <h3 className="text-sm font-bold text-studio-primary mb-1">ยอดเงินมัดจำได้รับการยืนยันแล้ว</h3>
        <p className="text-[9px] text-studio-red mb-3 uppercase tracking-widest font-bold">
          Deposit Verified • คิวจองได้รับการยืนยัน
        </p>
        <p className="text-xs text-studio-secondary leading-relaxed">
          ทางร้านได้ทำการตรวจสอบยอดเงินมัดจำ ฿{depositAmount.toLocaleString()} เรียบร้อยแล้ว ช่าง {artistName} พร้อมให้บริการตามวันนัดหมาย
        </p>
      </div>
    );
  }

  if (submittedSuccess || currentStatus === 'SUBMITTED') {
    return (
      <div className="bg-studio-card border border-studio-border p-5 rounded-[8px] text-center max-w-sm mx-auto space-y-3 animate-fadeIn">
        <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center rounded-full mx-auto">
          <Send size={18} />
        </div>
        <h4 className="text-xs font-bold text-studio-primary">
          แจ้งชำระเงินมัดจำเรียบร้อยแล้ว
        </h4>
        <div className="text-[10px] text-studio-secondary leading-relaxed bg-studio-main p-3 rounded-[4px] border border-studio-border/60">
          <div className="flex justify-between mb-1">
            <span className="text-studio-muted">เลขอ้างอิงสลิป:</span>
            <span className="font-mono text-studio-primary font-bold">{paymentReference || activePayment?.paymentReference || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-studio-muted">ยอดมัดจำ:</span>
            <span className="text-studio-red font-bold">฿{depositAmount.toLocaleString()}</span>
          </div>
        </div>
        <p className="text-[10px] text-amber-300/90 leading-relaxed">
          เจ้าหน้าที่ร้านกำลังตรวจสอบยอดเงินในระบบ เมื่อตรวจสอบเสร็จสิ้น สถานะคิวจองจะเปลี่ยนเป็น <strong>“ยืนยันคิวแล้ว”</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-studio-card border border-studio-border p-5 rounded-[8px] w-full max-w-sm mx-auto flex flex-col space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-studio-border pb-3 text-center">
        <span className="text-[9px] uppercase tracking-wider text-studio-red bg-studio-red/10 px-2 py-0.5 border border-studio-red/20 rounded-[2px] font-semibold">
          แจ้งชำระเงินมัดจำ
        </span>
        <h3 className="text-sm font-bold text-studio-primary mt-2">
          ยืนยันสิทธิ์คิวของคุณ
        </h3>
        <p className="text-[10px] text-studio-secondary mt-0.5">
          ช่างสัก: {artistName} • วันที่: {dateString} ({timeSlotString})
        </p>
      </div>

      {currentStatus === 'REJECTED' && (
        <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] text-xs text-red-300 space-y-1">
          <div className="flex items-center space-x-1 font-bold text-red-400">
            <AlertCircle size={14} />
            <span>หลักฐานการชำระไม่ผ่านการตรวจสอบ</span>
          </div>
          <p className="text-[10px] text-red-300/90 leading-relaxed">
            เหตุผล: {staffRejectionNote || activePayment?.staffNote || 'ข้อมูลการโอนเงินไม่ตรงกับยอดที่ระบุ'} กรุณาตรวจสอบและส่งหลักฐานใหม่อีกครั้ง
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-2.5 rounded-[4px] flex items-start space-x-2 text-[10px] text-red-400">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Deposit Amount display */}
      <div className="bg-studio-main border border-studio-border p-3.5 rounded-[4px] text-center">
        <span className="text-[9px] text-studio-secondary block uppercase tracking-wider">
          ยอดเงินมัดจำที่ต้องชำระ
        </span>
        <span className="text-2xl font-bold text-studio-red block mt-0.5">
          ฿{depositAmount.toLocaleString()}
        </span>
        <span className="text-[9px] text-studio-muted block mt-0.5">
          (ยอดมัดจำจะถูกนำไปหักออกจากราคาค่าสักจริงในวันรับบริการ)
        </span>
      </div>

      {/* Payment Details info */}
      <div className="bg-studio-main/60 border border-studio-border p-3 rounded-[4px] space-y-2 text-xs">
        <div className="flex items-center space-x-1.5 text-studio-red font-semibold text-[10px]">
          <QrCode size={13} />
          <span>ช่องทางการโอนชำระเงิน</span>
        </div>
        <div className="space-y-1 text-[10px] text-studio-secondary">
          <p>ธนาคาร: <strong className="text-studio-primary font-medium">กสิกรไทย (KBANK)</strong></p>
          <p>เลขที่บัญชี: <strong className="text-studio-primary font-mono font-medium">157-2-88990-1</strong></p>
          <p>ชื่อบัญชี: <strong className="text-studio-primary font-medium">สตูดิโอ 157 แทททู จำกัด</strong></p>
        </div>
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1 font-semibold">
            เลขอ้างอิงสลิปการโอนเงิน (Transfer Reference / Transaction ID) *
          </label>
          <input
            type="text"
            required
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="เช่น 20260901-KBANK-981249"
            className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2 outline-none rounded-[4px] font-mono"
          />
        </div>

        <div>
          <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1 font-semibold">
            หมายเหตุเพิ่มเติม (ถ้ามี)
          </label>
          <input
            type="text"
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            placeholder="เช่น โอนจากบัญชี ธ.กรุงเทพ เวลา 14:30 น."
            className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2 outline-none rounded-[4px]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-studio-red text-studio-primary hover:bg-studio-red/80 text-xs uppercase tracking-wider py-3 px-4 font-bold rounded-[4px] transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" />
              <span>กำลังส่งข้อมูล...</span>
            </>
          ) : (
            <>
              <Send size={13} className="mr-1" />
              <span>แจ้งชำระเงินมัดจำ (฿{depositAmount.toLocaleString()})</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
