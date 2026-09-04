'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { BookingPayment } from '@/data/mockBookings';
import { Check, X, ShieldCheck, Mail, Calendar, Clock, DollarSign, Loader2, AlertCircle, FileText } from 'lucide-react';

export default function DepositVerificationQueue() {
  const { bookingPayments, bookings, verifyDepositPayment, rejectDepositPayment } = useApp();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED'>('SUBMITTED');

  // Filter deposit payments
  const displayedPayments = bookingPayments.filter(p => {
    if (p.paymentType !== 'DEPOSIT') return false;
    if (filterStatus === 'ALL') return true;
    return p.status === filterStatus;
  });

  const submittedCount = bookingPayments.filter(p => p.paymentType === 'DEPOSIT' && p.status === 'SUBMITTED').length;

  const handleVerify = async (paymentId: string) => {
    setError(null);
    setLoadingId(paymentId);
    try {
      await verifyDepositPayment(paymentId);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถยืนยันยอดเงินมัดจำได้');
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    const reason = window.prompt('กรุณาระบุเหตุผลในการปฏิเสธหลักฐานการชำระเงิน:');
    if (reason === null) return;
    if (reason.trim() === '') {
      alert('จำเป็นต้องระบุเหตุผลในการปฏิเสธ');
      return;
    }

    setError(null);
    setLoadingId(paymentId);
    try {
      await rejectDepositPayment(paymentId, reason.trim());
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถปฏิเสธยอดเงินมัดจำได้');
    } finally {
      setLoadingId(null);
    }
  };

  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('th-TH', { 
      timeZone: 'Asia/Bangkok', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  };

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full space-y-0">
      {/* Header */}
      <div className="p-4 border-b border-studio-border bg-studio-sec/40 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center space-x-2">
          <ShieldCheck size={16} className="text-studio-red" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-studio-primary">
            คิวตรวจสอบเงินมัดจำ (Deposit Verification Queue)
          </h3>
          {submittedCount > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
              รอตรวจ {submittedCount} รายการ
            </span>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex bg-studio-main border border-studio-border rounded-[4px] p-0.5 text-[10px]">
          {(['SUBMITTED', 'ALL', 'VERIFIED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded-[3px] font-semibold transition-colors ${
                filterStatus === st 
                  ? 'bg-studio-red text-studio-primary' 
                  : 'text-studio-secondary hover:text-studio-primary'
              }`}
            >
              {st === 'SUBMITTED' ? `รอตรวจสอบ (${submittedCount})` :
               st === 'ALL' ? 'ทั้งหมด' :
               st === 'VERIFIED' ? 'ยืนยันแล้ว' : 'ปฏิเสธ'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="m-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-studio-border text-[10px] uppercase tracking-wider text-studio-secondary bg-studio-main/30">
              <th className="p-4 font-semibold">ลูกค้า / คิวจอง</th>
              <th className="p-4 font-semibold">ช่างสัก</th>
              <th className="p-4 font-semibold">ยอดมัดจำ</th>
              <th className="p-4 font-semibold">เลขอ้างอิงสลิป</th>
              <th className="p-4 font-semibold">เวลาที่แจ้งชำระ</th>
              <th className="p-4 font-semibold">สถานะ</th>
              <th className="p-4 font-semibold text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border/60 text-xs text-studio-primary">
            {displayedPayments.map((payment) => {
              const linkedBooking = bookings.find(b => b.id === payment.bookingId);

              return (
                <tr key={payment.id} className="hover:bg-studio-sec/40 transition-colors">
                  <td className="p-4">
                    <div className="font-bold">{linkedBooking?.customerName || 'ลูกค้า'}</div>
                    <div className="text-[10px] text-studio-secondary flex items-center space-x-1 mt-0.5">
                      <Mail size={10} />
                      <span className="font-mono">{linkedBooking?.customerEmail}</span>
                    </div>
                    <div className="text-[9px] text-studio-red mt-1">
                      คิว: {linkedBooking?.artworkTitle || 'งานสัก'} ({linkedBooking?.date})
                    </div>
                  </td>
                  <td className="p-4 font-semibold text-studio-secondary">
                    {linkedBooking?.artistName || '-'}
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-studio-red">
                      ฿{payment.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 space-y-1">
                    <div className="font-mono text-xs bg-studio-main px-2 py-1 rounded border border-studio-border/50 inline-block">
                      {payment.paymentReference || '-'}
                    </div>
                    {payment.customerNote && (
                      <div className="text-[10px] text-studio-secondary italic">
                        “{payment.customerNote}”
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-[10px] text-studio-secondary font-mono">
                    {formatThaiDate(payment.submittedAt || payment.createdAt)}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-0.5 border rounded-[3px] text-[10px] font-semibold ${
                      payment.status === 'VERIFIED' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                      payment.status === 'SUBMITTED' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                      payment.status === 'REJECTED' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      'bg-studio-main border-studio-border text-studio-muted'
                    }`}>
                      {payment.status === 'VERIFIED' ? 'ยืนยันแล้ว' :
                       payment.status === 'SUBMITTED' ? 'รอตรวจสอบ' :
                       payment.status === 'REJECTED' ? 'ปฏิเสธ' : 'รอลูกค้าแจ้ง'}
                    </span>
                    {payment.staffNote && payment.status === 'REJECTED' && (
                      <div className="text-[9px] text-red-400 mt-1 max-w-xs">
                        เหตุผล: {payment.staffNote}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {payment.status === 'SUBMITTED' ? (
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleVerify(payment.id)}
                          disabled={loadingId === payment.id}
                          className="bg-studio-red text-studio-primary hover:bg-studio-red/80 text-[10px] font-bold tracking-wide uppercase px-2.5 py-1.5 rounded-[3px] transition-colors flex items-center space-x-1 disabled:opacity-50"
                        >
                          {loadingId === payment.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Check size={10} />
                          )}
                          <span>ยืนยันรับเงิน</span>
                        </button>
                        <button
                          onClick={() => handleReject(payment.id)}
                          disabled={loadingId === payment.id}
                          className="bg-transparent border border-studio-border hover:border-red-500/40 text-studio-muted hover:text-red-500 text-[10px] font-bold tracking-wide uppercase p-1.5 rounded-[3px] transition-colors disabled:opacity-50"
                          title="ปฏิเสธสลิป"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-studio-muted italic">
                        {payment.status === 'VERIFIED' ? 'อนุมัติเรียบร้อย' : '-'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {displayedPayments.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-studio-secondary italic">
                  ไม่มีรายการแจ้งชำระเงินมัดจำในหมวดหมู่นี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
