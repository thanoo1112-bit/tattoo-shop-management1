'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Clock,
  PlayCircle,
  CheckCircle2,
  Plus,
  AlertCircle,
  Check,
  MoreVertical,
  Edit3,
  CalendarDays,
  XCircle,
  Trash2,
  X,
  Loader2,
  Wallet,
} from 'lucide-react';
import { BookingItem, BookingSessionItem, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok } from './types';
import CreateSessionDialog from './CreateSessionDialog';
import RecordPaymentForm from '@/components/admin/payments/RecordPaymentForm';
import { PaymentBookingDetail } from '@/components/admin/payments/types';
import { createClient } from '@/lib/supabase/client';
import { BlockedDateRecord, checkDateAvailability, checkExistingDateWarning } from '@/lib/availabilityUtils';
import { AlertTriangle } from 'lucide-react';

interface BookingSessionListProps {
  booking: BookingItem;
  blockedDates?: BlockedDateRecord[];
  onRefresh: () => void;
  embedMode?: boolean;
}

export default function BookingSessionList({
  booking,
  blockedDates = [],
  onRefresh,
  embedMode = false,
}: BookingSessionListProps) {
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Active Action Menu & Modals State
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [activeModalSession, setActiveModalSession] = useState<BookingSessionItem | null>(null);
  const [modalType, setModalType] = useState<'edit' | 'reschedule' | 'cancel' | 'delete' | null>(null);
  const [recordPaymentSession, setRecordPaymentSession] = useState<BookingSessionItem | null>(null);

  // Check if booking is fully paid
  const isFullyPaid = (booking.financial?.remaining_balance ?? 1) <= 0 || Boolean(booking.financial?.is_fully_paid) || booking.status === 'COMPLETED';

  // Construct PaymentBookingDetail object for RecordPaymentForm modal
  const paymentBookingDetail: PaymentBookingDetail | null = recordPaymentSession ? {
    id: booking.id,
    estimate_request_id: booking.estimate_request_id,
    customer_user_id: booking.customer_user_id,
    artist_id: booking.artist_id,
    requested_date: booking.requested_date,
    status: booking.status,
    approved_at: null,
    confirmed_at: null,
    created_at: booking.created_at,
    customer_name: booking.customer_name,
    customer_phone: booking.customer_phone || '',
    customer_email: booking.customer_email || '',
    artist_name: booking.artist_name,
    artist_nickname: booking.artist_nickname || null,
    placement: booking.placement,
    summary: {
      booking_id: booking.id,
      estimate_request_id: booking.estimate_request_id,
      customer_user_id: booking.customer_user_id,
      artist_id: booking.artist_id,
      quoted_price: booking.financial?.quoted_price || 0,
      deposit_required: booking.financial?.deposit_required || 0,
      paid_total: booking.financial?.total_paid || 0,
      remaining_balance: booking.financial?.remaining_balance || 0,
      deposit_paid: booking.financial?.is_deposit_paid || false,
      is_fully_paid: booking.financial?.is_fully_paid || false,
    },
    sessions: (booking.sessions || []).map((s) => ({
      id: s.id,
      session_number: s.session_number,
      start_at: s.start_at,
      end_at: s.end_at,
      status: s.status,
    })),
  } : null;

  // Form Inputs State
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('10:00');
  const [editEndTime, setEditEndTime] = useState('13:00');
  const [editStatus, setEditStatus] = useState('SCHEDULED');
  const [editNote, setEditNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);

  const canCreateSession = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';

  const handleStartSession = async (session: BookingSessionItem) => {
    setSessionError(null);
    if (booking.status === 'WAITING_DEPOSIT') {
      setSessionError('ยังไม่สามารถเริ่มงานได้ เนื่องจากคิวรอการชำระมัดจำ');
      return;
    }

    setUpdatingSessionId(session.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('booking_sessions')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', session.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error starting session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการเริ่มรอบสัก');
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const handleCompleteSession = async (session: BookingSessionItem) => {
    setSessionError(null);
    setUpdatingSessionId(session.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('booking_sessions')
        .update({ status: 'COMPLETED' })
        .eq('id', session.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error completing session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการจบรอบสัก');
    } finally {
      setUpdatingSessionId(null);
    }
  };

  // Open Modal Handlers
  const handleOpenActionModal = (session: BookingSessionItem, type: 'edit' | 'reschedule' | 'cancel' | 'delete') => {
    setOpenMenuSessionId(null);
    setActiveModalSession(session);
    setModalType(type);
    setSessionError(null);

    // Populate initial form fields from session datetimes (+07 Bangkok)
    const startDateObj = new Date(session.start_at);
    const dateStr = startDateObj.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    const startTimeStr = startDateObj.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false, hour: '2-digit', minute: '2-digit' });
    
    const endDateObj = new Date(session.end_at);
    const endTimeStr = endDateObj.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false, hour: '2-digit', minute: '2-digit' });

    setEditDate(dateStr);
    setEditStartTime(startTimeStr);
    setEditEndTime(endTimeStr);
    setEditStatus(session.status);
    setEditNote(session.note || '');
    setCancelReason('');
  };

  // Action RPC Handlers
  const handleExecuteDelete = async () => {
    if (!activeModalSession || isSubmittingModal) return;
    setIsSubmittingModal(true);
    setSessionError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('artist_delete_session', {
        p_session_id: activeModalSession.id
      });
      if (error) throw error;
      setModalType(null);
      setActiveModalSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error deleting session:', err);
      setSessionError(err.message || 'ไม่สามารถลบรอบสักได้');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleExecuteCancel = async () => {
    if (!activeModalSession || isSubmittingModal) return;
    setIsSubmittingModal(true);
    setSessionError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('artist_cancel_session_item', {
        p_session_id: activeModalSession.id,
        p_reason: cancelReason.trim() || null
      });
      if (error) throw error;
      setModalType(null);
      setActiveModalSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error cancelling session:', err);
      setSessionError(err.message || 'ไม่สามารถยกเลิกรอบสักได้');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleExecuteReschedule = async () => {
    if (!activeModalSession || isSubmittingModal) return;

    const availCheck = checkDateAvailability(
      editDate,
      booking.artist_id,
      blockedDates,
      booking.artist_nickname || booking.artist_name
    );
    if (availCheck.isBlocked) {
      setSessionError(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ ร้านหรือช่างปิดรับคิวในวันที่เลือก');
      return;
    }

    setIsSubmittingModal(true);
    setSessionError(null);
    try {
      const supabase = createClient();
      const startAtIso = `${editDate}T${editStartTime}:00+07:00`;
      const endAtIso = `${editDate}T${editEndTime}:00+07:00`;
      const finalNote = editNote.trim() ? editNote.trim() : null;

      const { error: updateErr } = await supabase
        .from('booking_sessions')
        .update({
          start_at: startAtIso,
          end_at: endAtIso,
          note: finalNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeModalSession.id);

      if (updateErr) {
        const { error: rpcErr } = await supabase.rpc('artist_reschedule_session_item', {
          p_session_id: activeModalSession.id,
          p_new_date: editDate,
          p_new_start_time: editStartTime,
          p_new_end_time: editEndTime,
          p_note: finalNote
        });
        if (rpcErr) throw rpcErr;
      }

      setModalType(null);
      setActiveModalSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error rescheduling session:', err);
      setSessionError(err.message || 'ไม่สามารถเลื่อนรอบสักได้');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleExecuteEdit = async () => {
    if (!activeModalSession || isSubmittingModal) return;

    const originalDate = activeModalSession.start_at
      ? new Date(activeModalSession.start_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
      : '';

    if (editDate !== originalDate) {
      const availCheck = checkDateAvailability(
        editDate,
        booking.artist_id,
        blockedDates,
        booking.artist_nickname || booking.artist_name
      );
      if (availCheck.isBlocked) {
        setSessionError(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ ร้านหรือช่างปิดรับคิวในวันที่เลือก');
        return;
      }
    }

    setIsSubmittingModal(true);
    setSessionError(null);
    try {
      const supabase = createClient();
      const startAtIso = `${editDate}T${editStartTime}:00+07:00`;
      const endAtIso = `${editDate}T${editEndTime}:00+07:00`;
      const finalNote = editNote.trim() ? editNote.trim() : null;

      const { error: updateErr } = await supabase
        .from('booking_sessions')
        .update({
          start_at: startAtIso,
          end_at: endAtIso,
          status: editStatus,
          note: finalNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeModalSession.id);

      if (updateErr) {
        const { error: rpcErr } = await supabase.rpc('artist_edit_session_item', {
          p_session_id: activeModalSession.id,
          p_new_date: editDate,
          p_new_start_time: editStartTime,
          p_new_end_time: editEndTime,
          p_status: editStatus,
          p_note: finalNote
        });
        if (rpcErr) throw rpcErr;
      }

      setModalType(null);
      setActiveModalSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error editing session:', err);
      setSessionError(err.message || 'ไม่สามารถแก้ไขรอบสักได้');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const getSessionBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            นัดหมายแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            กำลังสัก
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            เสร็จสิ้นรอบนี้
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      default:
        return null;
    }
  };

  const sessions = booking.sessions || [];

  return (
    <div className={embedMode ? "space-y-3 font-prompt" : "bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 sm:p-4 space-y-3 font-prompt"}>
      {/* Header (Only when not embedded) */}
      {!embedMode && (
        <div className="flex items-center justify-between border-b border-[#4A443A]/50 pb-2.5">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-[#ECE4D3]" />
            <span className="text-xs font-semibold text-[#ECE4D3]">
              รอบนัดหมายการสัก ({sessions.length} รอบ)
            </span>
          </div>

          {canCreateSession && (
            <button
              id="btn-open-create-session"
              type="button"
              onClick={() => setIsCreatingSession(true)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shadow cursor-pointer"
            >
              <Plus size={12} />
              <span>เพิ่มรอบสัก</span>
            </button>
          )}
        </div>
      )}

      {sessionError && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-900/60 rounded-lg text-xs text-amber-400 flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span className="flex-1">{sessionError}</span>
          <button onClick={() => setSessionError(null)} className="text-amber-400 hover:text-amber-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="py-5 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/50 rounded-lg bg-[#171512]/40">
          {canCreateSession
            ? 'ยังไม่มีรอบนัดหมาย กดปุ่ม "+ เพิ่มรอบสัก" เพื่อกำหนดวันและเวลาทำงาน'
            : 'ยังไม่มีรอบนัดหมาย (สามารถเพิ่มรอบสักได้เมื่อคิวได้รับการยืนยันแล้ว)'}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((ses, idx) => {
            const isCancelled = ses.status === 'CANCELLED';
            const isCompleted = ses.status === 'COMPLETED';
            const isInProgress = ses.status === 'IN_PROGRESS';
            const isDeleteDisabled = isCancelled || isCompleted || isInProgress;
            const displayedRoundNum = idx + 1;

            return (
              <div
                key={ses.id}
                className={`relative bg-[#171512] border border-[#4A443A]/60 rounded-lg p-3 space-y-2 transition-all ${
                  isCancelled ? 'opacity-70 bg-[#12100E]/80 border-[#332E27]' : 'hover:border-[#7A7265]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isCancelled ? 'text-[#7A7265]' : 'text-[#ECE4D3]'}`}>
                      รอบที่ {displayedRoundNum}
                    </span>
                    {getSessionBadge(ses.status)}
                    {Boolean(ses.session_paid_amount && ses.session_paid_amount > 0) && (
                      <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                        <Wallet size={11} className="text-emerald-400" />
                        <span>รับเงินรอบนี้ ฿{ses.session_paid_amount!.toLocaleString('th-TH')}</span>
                      </span>
                    )}
                  </div>

                  {/* Actions Right Side */}
                  <div className="flex items-center gap-1.5">
                    {!embedMode && ses.status === 'SCHEDULED' && (
                      <button
                        id={`btn-start-session-${displayedRoundNum}`}
                        type="button"
                        disabled={updatingSessionId === ses.id}
                        onClick={() => handleStartSession(ses)}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <PlayCircle size={11} />
                        <span>{updatingSessionId === ses.id ? 'กำลังเริ่ม...' : 'เริ่มงาน'}</span>
                      </button>
                    )}

                    {!embedMode && ses.status === 'IN_PROGRESS' && (
                      <button
                        id={`btn-complete-session-${displayedRoundNum}`}
                        type="button"
                        disabled={updatingSessionId === ses.id}
                        onClick={() => handleCompleteSession(ses)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Check size={11} />
                        <span>{updatingSessionId === ses.id ? 'กำลังบันทึก...' : 'จบรอบสัก'}</span>
                      </button>
                    )}

                    {/* ⋯ Menu Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuSessionId(openMenuSessionId === ses.id ? null : ses.id)}
                        className="p-1 rounded text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#26221D] transition-colors cursor-pointer"
                        title="เมนูการจัดการรอบสัก"
                      >
                        <MoreVertical size={15} />
                      </button>

                      {/* Dropdown Menu */}
                      {openMenuSessionId === ses.id && (
                        <div className="absolute right-0 top-7 z-30 w-44 bg-[#171512] border border-[#4A443A] rounded-xl shadow-2xl py-1 text-xs font-prompt animate-in fade-in duration-100">
                          <button
                            type="button"
                            onClick={() => handleOpenActionModal(ses, 'edit')}
                            className="w-full px-3 py-2 text-left text-[#ECE4D3] hover:bg-[#26221D] flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Edit3 size={13} className="text-blue-400" />
                            <span>แก้ไขรอบสัก</span>
                          </button>
                          
                          {!isCompleted && !isInProgress && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleOpenActionModal(ses, 'reschedule')}
                              className="w-full px-3 py-2 text-left text-[#ECE4D3] hover:bg-[#26221D] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <CalendarDays size={13} className="text-amber-400" />
                              <span>เลื่อนรอบสัก</span>
                            </button>
                          )}

                          {!isFullyPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuSessionId(null);
                                setRecordPaymentSession(ses);
                              }}
                              className="w-full px-3 py-2 text-left text-[#ECE4D3] hover:bg-[#26221D] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Wallet size={13} className="text-emerald-400" />
                              <span>บันทึกรับเงิน</span>
                            </button>
                          )}

                          {!isCompleted && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleOpenActionModal(ses, 'cancel')}
                              className="w-full px-3 py-2 text-left text-[#ECE4D3] hover:bg-[#26221D] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <XCircle size={13} className="text-red-400" />
                              <span>ยกเลิกรอบสัก</span>
                            </button>
                          )}

                          {isDeleteDisabled ? (
                            <div className="px-3 py-2 text-[10px] text-[#7A7265] border-t border-[#332E27] cursor-not-allowed">
                              <span>ไม่สามารถลบรอบนี้ได้</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenActionModal(ses, 'delete')}
                              className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-950/40 border-t border-[#332E27] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                              <span>ลบรอบสัก</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-[#A89F91] pt-0.5">
                  <span className={`font-medium shrink-0 ${isCancelled ? 'text-[#7A7265] line-through' : 'text-[#ECE4D3]'}`}>
                    {formatDateBangkok(ses.start_at)} · {formatTimeBangkok(ses.start_at)} น.
                  </span>
                  {(() => {
                    const rawNote = ses.note?.trim();
                    if (!rawNote) return null;
                    const adminNote = booking.admin_note?.trim();
                    const custNote = booking.customer_note?.trim();
                    const isQuoteNote = Boolean(
                      (adminNote && rawNote === adminNote) ||
                      (custNote && rawNote === custNote)
                    );
                    if (isQuoteNote) return null;
                    return (
                      <div className="text-right truncate max-w-[60%]">
                        <span className="text-[#7A7265]">หมายเหตุ: </span>
                        <span className="text-[#ECE4D3] font-medium">{rawNote}</span>
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  if (isCancelled) return null;
                  const sessionDateStr = ses.start_at
                    ? new Date(ses.start_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
                    : '';
                  const sesWarn = checkExistingDateWarning(sessionDateStr, booking.artist_id, blockedDates, booking.artist_nickname || booking.artist_name);
                  if (!sesWarn.hasWarning) return null;
                  return (
                    <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/50 p-1.5 rounded flex items-center gap-1.5 font-prompt mt-1">
                      <AlertTriangle size={12} className="shrink-0 text-amber-400" />
                      <span>{sesWarn.warningMessage}</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog for Creating Session */}
      {isCreatingSession && (
        <CreateSessionDialog
          booking={booking}
          blockedDates={blockedDates}
          existingSessionCount={sessions.length}
          onSuccess={() => {
            setIsCreatingSession(false);
            onRefresh();
          }}
          onCancel={() => setIsCreatingSession(false)}
        />
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 1. DELETE SESSION CONFIRMATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {modalType === 'delete' && activeModalSession && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-[#171512] border border-[#4A443A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-base">
              <Trash2 size={18} />
              <span>ลบรอบสัก?</span>
            </div>

            <p className="text-xs text-[#A89F91] leading-relaxed">
              คุณต้องการลบรอบสักรอบนี้ใช่หรือไม่? ข้อมูลรอบนี้จะถูกนำออกจากรายการและจัดลำดับคิวใหม่
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setActiveModalSession(null);
                }}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl border border-[#4A443A] bg-[#0E0D0C] hover:bg-[#26221D] text-[#ECE4D3] font-medium text-xs transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl bg-red-800 hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isSubmittingModal ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <span>ลบรอบ</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. CANCEL SESSION CONFIRMATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {modalType === 'cancel' && activeModalSession && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-[#171512] border border-[#4A443A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
              <div className="flex items-center space-x-2 text-[#ECE4D3] font-bold text-sm">
                <XCircle size={18} className="text-red-400" />
                <span>ยกเลิกรอบสัก?</span>
              </div>
              <button onClick={() => setModalType(null)} className="text-[#A89F91] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#A89F91] leading-relaxed bg-[#0E0D0C] p-3 rounded-xl border border-[#332E27]">
              รอบนี้จะถูกเก็บไว้ในประวัติ แต่จะไม่นับเป็นรอบที่ต้องดำเนินการ
            </p>

            <div>
              <label className="block text-[#A89F91] mb-1">เหตุผลในการยกเลิก (ไม่บังคับ)</label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="ระบุเหตุผลในการยกเลิกรอบ..."
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setActiveModalSession(null);
                }}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl border border-[#4A443A] bg-[#0E0D0C] hover:bg-[#26221D] text-[#ECE4D3] font-medium text-xs transition-colors cursor-pointer"
              >
                กลับ
              </button>
              <button
                type="button"
                onClick={handleExecuteCancel}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl bg-red-800 hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isSubmittingModal ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>ยืนยันการยกเลิก</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. RESCHEDULE SESSION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {modalType === 'reschedule' && activeModalSession && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-[#171512] border border-[#4A443A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
              <h3 className="font-semibold text-sm text-[#ECE4D3]">เลื่อนรอบการสัก</h3>
              <button onClick={() => setModalType(null)} className="text-[#A89F91] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[#A89F91] mb-1">วันที่นัดใหม่ *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#A89F91] mb-1">เวลาเริ่ม *</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] font-mono focus:outline-none focus:border-[#9C2F2F]"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] mb-1">เวลาสิ้นสุด *</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] font-mono focus:outline-none focus:border-[#9C2F2F]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#A89F91] mb-1">หมายเหตุการเลื่อนคิว</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="ระบุเหตุผลการเลื่อนคิว..."
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#4A443A]/60">
              <button
                type="button"
                onClick={() => setModalType(null)}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl border border-[#4A443A] bg-[#0E0D0C] hover:bg-[#26221D] text-[#A89F91] font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteReschedule}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl bg-[#9C2F2F] hover:bg-red-700 text-white font-semibold flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmittingModal ? 'กำลังบันทึก...' : 'ยืนยันเลื่อนคิว'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. EDIT SESSION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {modalType === 'edit' && activeModalSession && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-[#171512] border border-[#4A443A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
              <h3 className="font-semibold text-sm text-[#ECE4D3]">แก้ไขข้อมูลรอบสัก</h3>
              <button onClick={() => setModalType(null)} className="text-[#A89F91] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[#A89F91] mb-1">วันที่ *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#A89F91] mb-1">เวลาเริ่ม *</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] font-mono focus:outline-none focus:border-[#9C2F2F]"
                  />
                </div>
                <div>
                  <label className="block text-[#A89F91] mb-1">เวลาสิ้นสุด *</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] font-mono focus:outline-none focus:border-[#9C2F2F]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#A89F91] mb-1">สถานะรอบสัก</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                >
                  <option value="SCHEDULED">นัดหมายแล้ว (SCHEDULED)</option>
                  <option value="IN_PROGRESS">กำลังสัก (IN_PROGRESS)</option>
                  <option value="COMPLETED">เสร็จสิ้นรอบนี้ (COMPLETED)</option>
                  <option value="CANCELLED">ยกเลิกแล้ว (CANCELLED)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#A89F91] mb-1">หมายเหตุรอบสัก</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="ระบุหมายเหตุ..."
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-xl px-3 py-2 text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#4A443A]/60">
              <button
                type="button"
                onClick={() => setModalType(null)}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl border border-[#4A443A] bg-[#0E0D0C] hover:bg-[#26221D] text-[#A89F91] font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteEdit}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmittingModal ? 'กำลังบันทึก...' : 'บันทึกแก้ไข'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Record Payment Form Modal for Session */}
      {recordPaymentSession && paymentBookingDetail && (
        <RecordPaymentForm
          booking={paymentBookingDetail}
          isOpen={Boolean(recordPaymentSession)}
          onClose={() => setRecordPaymentSession(null)}
          onSuccess={(msg) => {
            setRecordPaymentSession(null);
            onRefresh();
          }}
          onError={(err) => setSessionError(err)}
          bookingSessionId={recordPaymentSession.id}
          sessionRoundNumber={recordPaymentSession.session_number}
          sessionDate={formatDateBangkok(recordPaymentSession.start_at)}
        />
      )}
    </div>
  );
}
