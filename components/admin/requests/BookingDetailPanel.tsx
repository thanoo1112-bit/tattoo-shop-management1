'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { BookingItem, formatDateTimeBangkok } from './types';
import BookingFinancialSummary from './BookingFinancialSummary';
import BookingSessionList from './BookingSessionList';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import { createClient } from '@/lib/supabase/client';

interface BookingDetailPanelProps {
  booking: BookingItem | null;
  artists: Array<{ id: string; name: string; nickname: string | null }>;
  onClose: () => void;
  onRefresh: () => void;
}

export default function BookingDetailPanel({
  booking,
  artists,
  onClose,
  onRefresh,
}: BookingDetailPanelProps) {
  const [selectedArtistId, setSelectedArtistId] = useState<string>(
    booking?.artist_id || artists[0]?.id || ''
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);

  if (!booking) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รออนุมัติคิว
          </span>
        );
      case 'APPROVED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            อนุมัติแล้ว
          </span>
        );
      case 'WAITING_DEPOSIT':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอมัดจำ
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ยืนยันคิวแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            กำลังดำเนินงาน
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            เสร็จสิ้นสมบูรณ์
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      default:
        return null;
    }
  };

  // Section 14: Approve Booking
  const handleApproveBooking = async () => {
    setActionError(null);
    const artistId = selectedArtistId || booking.artist_id;

    if (!artistId) {
      setActionError('กรุณาเลือกช่างสักก่อนทำการอนุมัติคิว');
      return;
    }

    setIsApproving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('bookings')
        .update({
          artist_id: artistId,
          status: 'APPROVED',
        })
        .eq('id', booking.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error approving booking:', err);
      setActionError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติคิวงาน');
    } finally {
      setIsApproving(false);
    }
  };

  // Section 15: Reject Booking
  const handleRejectBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    setIsRejecting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'REJECTED',
          admin_note: rejectReason.trim() ? `ปฏิเสธ: ${rejectReason.trim()}` : 'ร้านไม่สามารถรับคิวงานนี้ได้',
        })
        .eq('id', booking.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error rejecting booking:', err);
      setActionError(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธคิว');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] md:w-[600px] bg-[#171512] border-l border-[#4A443A] shadow-2xl flex flex-col font-prompt animate-slideInRight">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#4A443A] flex items-center justify-between bg-[#0E0D0C]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
              <Calendar size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
                  รายละเอียดคิวงาน
                </h3>
                {getStatusBadge(booking.status)}
              </div>
              <p className="text-[10px] text-[#7A7265] mt-0.5">
                คิว #{booking.id.slice(0, 8)} • สร้างเมื่อ: {formatDateTimeBangkok(booking.created_at)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#7A7265] hover:text-[#ECE4D3] hover:bg-[#1F1D1A] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {actionError && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Customer & Artist Overview */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#7A7265] block">ลูกค้า</span>
                <h4 className="text-sm font-semibold text-[#ECE4D3] flex items-center gap-1.5 mt-0.5">
                  <User size={13} className="text-[#9C2F2F]" />
                  {booking.customer_name}
                </h4>
              </div>

              {booking.customer_phone && (
                <a
                  href={`tel:${booking.customer_phone}`}
                  className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#171512] px-2 py-1 rounded border border-[#4A443A]/50"
                >
                  <Phone size={11} className="text-emerald-400" />
                  {booking.customer_phone}
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#4A443A]/40">
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">ช่างสักผู้รับผิดชอบ</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">
                  {booking.artist_name} {booking.artist_nickname ? `(${booking.artist_nickname})` : ''}
                </span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">วันที่ลูกค้าระบุ</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">
                  {booking.requested_date || 'ไม่ระบุวันที่'}
                </span>
              </div>
            </div>

            {booking.customer_note && (
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
                <span className="text-[10px] text-[#7A7265] block mb-0.5">หมายเหตุจากลูกค้า:</span>
                <p className="text-[#ECE4D3] font-light">{booking.customer_note}</p>
              </div>
            )}

            {booking.admin_note && (
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
                <span className="text-[10px] text-[#7A7265] block mb-0.5">หมายเหตุจากแอดมิน:</span>
                <p className="text-[#ECE4D3] font-light">{booking.admin_note}</p>
              </div>
            )}
          </div>

          {/* Section 14 & 15: Approve / Reject Actions (Only if PENDING) */}
          {booking.status === 'PENDING' && (
            <div className="bg-[#0E0D0C] border border-blue-900/50 rounded-xl p-4 space-y-3.5">
              <span className="text-xs font-semibold text-blue-400 block">
                คิวงานนี้รอการอนุมัติจากผู้ดูแลระบบ
              </span>

              {/* Artist Assignment Dropdown */}
              <div>
                <label className="block text-[11px] text-[#A89F91] mb-1">
                  มอบหมายช่างสัก <span className="text-[#9C2F2F]">*</span>
                </label>
                <select
                  id="select-booking-artist"
                  value={selectedArtistId}
                  onChange={(e) => setSelectedArtistId(e.target.value)}
                  className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400"
                >
                  <option value="" disabled>-- เลือกช่างสัก --</option>
                  {artists.map((art) => (
                    <option key={art.id} value={art.id}>
                      {art.name} {art.nickname ? `(${art.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  id="btn-approve-booking"
                  type="button"
                  disabled={isApproving}
                  onClick={handleApproveBooking}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  <CheckCircle2 size={14} />
                  <span>{isApproving ? 'กำลังอนุมัติ...' : 'อนุมัติคิวงาน'}</span>
                </button>

                <button
                  id="btn-open-reject-booking"
                  type="button"
                  onClick={() => setIsRejecting(true)}
                  className="px-3 py-2 bg-[#171512] hover:bg-red-950/40 text-xs text-[#A89F91] hover:text-red-400 rounded-lg border border-[#4A443A] hover:border-red-900/60 transition-colors"
                >
                  ปฏิเสธคิว
                </button>
              </div>

              {/* Reject Form inside modal */}
              {isRejecting && (
                <form onSubmit={handleRejectBooking} className="pt-2 border-t border-[#4A443A]/40 space-y-2 animate-fadeIn">
                  <span className="text-[11px] text-red-400 block">ระบุเหตุผลการปฏิเสธ</span>
                  <input
                    type="text"
                    required
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="เช่น ช่างคิวเต็ม หรือไม่สะดวกในวันดังกล่าว..."
                    className="w-full bg-[#171512] border border-[#4A443A] rounded px-2.5 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-2.5 py-1 text-xs text-[#A89F91]"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-red-600 text-xs text-white rounded font-medium"
                    >
                      ยืนยันปฏิเสธ
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Financial Summary */}
          <BookingFinancialSummary booking={booking} />

          {/* Section: Complete Booking Action (Only when IN_PROGRESS and all sessions completed) */}
          {booking.status === 'IN_PROGRESS' &&
            booking.sessions?.some((s) => s.status === 'COMPLETED') &&
            !booking.sessions?.some((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') && (
              <div className="bg-[#0E0D0C] border border-emerald-900/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-emerald-400 block">รอบสักทั้งหมดเสร็จสิ้นแล้ว</span>
                    <span className="text-[11px] text-[#A89F91]">สามารถกดยืนยันเพื่อปิดงานสักให้สมบูรณ์</span>
                  </div>
                  <button
                    id="btn-open-complete-booking"
                    type="button"
                    onClick={() => setIsCompleteDialogOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-bold text-white rounded-lg transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
                  >
                    <CheckCircle2 size={14} />
                    <span>ปิดงานสัก</span>
                  </button>
                </div>
              </div>
            )}

          {/* Completed State Banner */}
          {booking.status === 'COMPLETED' && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>งานสักนี้เสร็จสิ้นสมบูรณ์แล้ว</span>
              </div>
              {booking.completed_at && (
                <span className="text-[11px] text-[#A89F91]">
                  ปิดงานเมื่อ: {formatDateTimeBangkok(booking.completed_at)}
                </span>
              )}
            </div>
          )}

          {/* Sessions List & Management */}
          <BookingSessionList booking={booking} onRefresh={onRefresh} />
        </div>
      </div>

      {/* Complete Booking Modal Dialog */}
      <CompleteBookingDialog
        booking={booking}
        isOpen={isCompleteDialogOpen}
        onClose={() => setIsCompleteDialogOpen(false)}
        onSuccess={onRefresh}
      />
    </>
  );
}
