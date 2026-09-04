'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { Booking } from '@/data/mockBookings';
import BookingStatusBadge from '../portal/BookingStatusBadge';
import { Mail, Calendar, Clock, DollarSign, Check, X, Loader2, AlertCircle } from 'lucide-react';

interface BookingRequestQueueProps {
  singleArtistId?: string | null;
}

export default function BookingRequestQueue({ singleArtistId = null }: BookingRequestQueueProps) {
  const { bookings, updateBookingStatus } = useApp();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline Reject Modal State
  const [rejectingBooking, setRejectingBooking] = useState<Booking | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filter requests
  const displayedBookings = singleArtistId
    ? bookings.filter(b => b.artistId === singleArtistId)
    : bookings;

  const handleApprove = async (book: Booking) => {
    setError(null);
    setLoadingId(book.id);
    try {
      if (book.deposit > 0) {
        // Transition to WAITING_DEPOSIT which triggers payment record initialization
        await updateBookingStatus(book.id, 'WAITING_DEPOSIT');
      } else {
        // Zero deposit case: can confirm directly with note
        await updateBookingStatus(book.id, 'CONFIRMED', undefined, 'No Deposit Required');
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถอนุมัติคิวจองได้');
    } finally {
      setLoadingId(null);
    }
  };

  const confirmDecline = async () => {
    if (!rejectingBooking) return;
    if (!rejectionReason.trim()) {
      setError('จำเป็นต้องระบุเหตุผลในการปฏิเสธ');
      return;
    }

    const id = rejectingBooking.id;
    setError(null);
    setLoadingId(id);
    try {
      await updateBookingStatus(id, 'REJECTED', rejectionReason.trim());
      setRejectingBooking(null);
      setRejectionReason('');
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถปฏิเสธคำขอจองได้');
    } finally {
      setLoadingId(null);
    }
  };

  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[0], 10) + 543}`;
  };

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full font-prompt">
      <div className="p-4 border-b border-studio-border bg-studio-sec/40 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-wider text-studio-primary">
          คิวคำขอจองคิวสัก (Tattoo Bookings Requests Queue)
        </h3>
        <span className="text-[9px] bg-studio-red/10 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
          Database Active
        </span>
      </div>

      {error && (
        <div className="m-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-studio-border text-[10px] uppercase tracking-wider text-studio-secondary bg-studio-main/30">
              <th className="p-4 font-semibold">ลูกค้า</th>
              {!singleArtistId && <th className="p-4 font-semibold">ช่าง</th>}
              <th className="p-4 font-semibold">งานศิลปะ</th>
              <th className="p-4 font-semibold">ตารางเวลานัดหมาย</th>
              <th className="p-4 font-semibold">ค่าบริการ / มัดจำ</th>
              <th className="p-4 font-semibold">สถานะ</th>
              <th className="p-4 font-semibold text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border/60 text-xs text-studio-primary">
            {displayedBookings.map((book) => (
              <tr key={book.id} className="hover:bg-studio-sec/40 transition-colors">
                <td className="p-4">
                  <div className="font-bold">{book.customerName}</div>
                  <div className="text-[10px] text-studio-secondary flex items-center space-x-1 mt-0.5">
                    <Mail size={10} />
                    <span className="font-mono">{book.customerEmail}</span>
                  </div>
                </td>
                {!singleArtistId && (
                  <td className="p-4 font-semibold text-studio-secondary">
                    {book.artistName}
                  </td>
                )}
                <td className="p-4 flex items-center space-x-2.5">
                  <div className="w-10 h-10 bg-studio-main border border-studio-border rounded-[3px] overflow-hidden shrink-0">
                    <img src={book.artworkImage || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=100'} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="truncate max-w-[120px]">
                    <span className="font-bold block truncate">{book.artworkTitle}</span>
                    <span className="text-[9px] text-studio-red uppercase tracking-wider block mt-0.5">
                      {book.bookingSource || book.bookingType}
                    </span>
                  </div>
                </td>
                <td className="p-4 space-y-1">
                  <div className="flex items-center space-x-1">
                    <Calendar size={11} className="text-studio-red" />
                    <span>{formatThaiDate(book.date)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock size={11} className="text-studio-red" />
                    <span className="text-studio-secondary font-mono">{book.startTime} - {book.endTime} ({book.duration} ชม.)</span>
                  </div>
                </td>
                <td className="p-4 space-y-0.5">
                  <div>ยอดรวม: <span className="font-bold">฿{book.price.toLocaleString()}</span></div>
                  <div className="text-[10px] text-studio-red">มัดจำ: ฿{book.deposit.toLocaleString()}</div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col items-start gap-1">
                    <BookingStatusBadge status={book.status} type="booking" />
                    <span className="text-[9px] text-studio-secondary uppercase tracking-wider">
                      {book.depositStatus === 'VERIFIED' ? 'มัดจำแล้ว' :
                       book.depositStatus === 'SUBMITTED' ? 'แจ้งชำระแล้ว' : 'รอมัดจำ'}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-right">
                  {book.status === 'PENDING' && (
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleApprove(book)}
                        disabled={loadingId === book.id}
                        className="bg-studio-red text-studio-paper hover:bg-tattoo-red-dark text-[10px] font-bold tracking-wide uppercase px-2.5 py-1.5 rounded-[3px] transition-colors flex items-center space-x-1 disabled:opacity-50"
                      >
                        {loadingId === book.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Check size={10} />
                        )}
                        <span>อนุมัติ</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectingBooking(book);
                          setRejectionReason('');
                        }}
                        disabled={loadingId === book.id}
                        className="bg-transparent border border-studio-border hover:border-red-500/40 text-studio-muted hover:text-red-500 text-[10px] font-bold tracking-wide uppercase p-1.5 rounded-[3px] transition-colors disabled:opacity-50"
                        title="ปฏิเสธคำขอ"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {book.status === 'APPROVED' && (
                    <span className="text-[10px] text-studio-red font-semibold italic">อนุมัติแล้ว</span>
                  )}
                  {book.status === 'WAITING_DEPOSIT' && (
                    <span className="text-[10px] text-studio-red font-semibold italic">อนุมัติแล้ว รอมัดจำ</span>
                  )}
                  {book.status === 'CONFIRMED' && (
                    <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">คอนเฟิร์มคิวแล้ว</span>
                  )}
                  {book.status === 'REJECTED' && (
                    <span className="text-[10px] text-red-500 italic">ปฏิเสธแล้ว</span>
                  )}
                  {book.status === 'CANCELLED' && (
                    <span className="text-[10px] text-zinc-500 italic">ยกเลิกแล้ว</span>
                  )}
                </td>
              </tr>
            ))}

            {displayedBookings.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-studio-secondary italic">
                  ไม่มีรายการคำขอจองคิวใหม่เข้ามาในขณะนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inline Reject Modal (Replaces window.prompt) */}
      {rejectingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-studio-card border border-studio-border p-6 rounded-[8px] max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-studio-border pb-3">
              <h4 className="text-sm font-bold text-studio-primary">
                ปฏิเสธคำขอจองคิว #{rejectingBooking.id}
              </h4>
              <button
                onClick={() => setRejectingBooking(null)}
                className="text-studio-muted hover:text-studio-primary"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-studio-secondary">
              ลูกค้า: <strong>{rejectingBooking.customerName}</strong> ({rejectingBooking.artworkTitle})
            </p>
            <div>
              <label className="text-[10px] uppercase font-bold text-studio-secondary block mb-1">
                ระบุเหตุผลในการปฏิเสธ *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="เช่น คิวเต็มแล้ว หรือช่างติดภารกิจด่วน"
                className="w-full h-20 bg-studio-main border border-studio-border p-2.5 rounded text-xs text-studio-primary outline-none focus:border-studio-red"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setRejectingBooking(null)}
                className="px-3 py-1.5 bg-transparent border border-studio-border text-xs text-studio-secondary rounded hover:text-studio-primary"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmDecline}
                disabled={loadingId === rejectingBooking.id || !rejectionReason.trim()}
                className="px-4 py-1.5 bg-studio-red hover:bg-tattoo-red-dark text-xs text-studio-paper font-semibold rounded disabled:opacity-50"
              >
                ยืนยันการปฏิเสธ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
