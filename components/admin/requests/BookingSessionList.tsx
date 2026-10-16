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
  Trash2,
  X,
  Loader2,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import { BookingItem, BookingSessionItem, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok } from './types';
import CreateSessionDialog from './CreateSessionDialog';
import { createClient } from '@/lib/supabase/client';
import { BlockedDateRecord, checkExistingDateWarning } from '@/lib/availabilityUtils';

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
  const [modalType, setModalType] = useState<'delete' | 'complete' | null>(null);
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
      // Try SECURITY DEFINER RPC first for artist & admin RLS bypass
      const { error: rpcErr } = await supabase.rpc('artist_start_session', {
        p_session_id: session.id,
      });

      if (rpcErr) {
        // Fallback to direct table update for Admin or if RPC signature differs
        const { error: updateErr } = await supabase
          .from('booking_sessions')
          .update({ status: 'IN_PROGRESS' })
          .eq('id', session.id);

        if (updateErr) throw updateErr;
      }
      onRefresh();
    } catch (err: any) {
      console.error('Error starting session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการเริ่มรอบสัก');
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const handleCompleteSession = (session: BookingSessionItem) => {
    handleOpenActionModal(session, 'complete');
  };

  const handleExecuteComplete = async () => {
    if (!activeModalSession || isSubmittingModal) return;
    setIsSubmittingModal(true);
    setSessionError(null);
    try {
      const supabase = createClient();
      // Try SECURITY DEFINER RPC first to complete session without closing parent booking or requiring payment
      const { error: rpcErr } = await supabase.rpc('complete_booking_session', {
        p_booking_id: booking.id,
        p_session_id: activeModalSession.id,
      });

      if (rpcErr) {
        const { error: rpcErr2 } = await supabase.rpc('admin_complete_booking_session', {
          p_booking_id: booking.id,
          p_session_id: activeModalSession.id,
        });

        if (rpcErr2) {
          const { error: updateErr } = await supabase
            .from('booking_sessions')
            .update({ status: 'COMPLETED' })
            .eq('id', activeModalSession.id);

          if (updateErr) throw updateErr;
        }
      }
      setModalType(null);
      setActiveModalSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error completing session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการเสร็จสิ้นรอบสัก');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  // Open Modal Handlers
  const handleOpenActionModal = (session: BookingSessionItem, type: 'delete' | 'complete') => {
    setOpenMenuSessionId(null);
    setActiveModalSession(session);
    setModalType(type);
    setSessionError(null);
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

  const getSessionBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2 py-0.5 rounded text-[10px] font-semibold">
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
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
            <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
            <span>เสร็จสิ้น</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
            ยกเลิก
          </span>
        );
      default:
        return null;
    }
  };

  const sessions = booking.sessions || [];
  const maxSessionNumber = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.session_number || 0))
    : 0;

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
        <div className="py-5 text-center text-xs text-[#B8B0A3] border border-dashed border-[#4A443A]/50 rounded-lg bg-[#171512]/40">
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
            const displayedRoundNum = ses.session_number || idx + 1;

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
                    {!embedMode && (ses.status === 'SCHEDULED' || ses.status === 'IN_PROGRESS') && (
                      <button
                        id={`btn-complete-session-${displayedRoundNum}`}
                        type="button"
                        disabled={updatingSessionId === ses.id}
                        onClick={() => handleCompleteSession(ses)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Check size={11} />
                        <span>เสร็จสิ้นรอบสัก</span>
                      </button>
                    )}

                    {/* ⋯ Menu Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuSessionId(openMenuSessionId === ses.id ? null : ses.id)}
                        className="p-1 rounded text-[#B8B0A3] hover:text-[#ECE4D3] hover:bg-[#26221D] transition-colors cursor-pointer"
                        title="เมนูการจัดการรอบสัก"
                      >
                        <MoreVertical size={15} />
                      </button>

                      {/* Dropdown Menu */}
                      {openMenuSessionId === ses.id && (
                        <div className="absolute right-0 top-7 z-30 w-44 bg-[#171512] border border-[#4A443A] rounded-xl shadow-2xl py-1 text-xs font-prompt animate-in fade-in duration-100">
                          {/* Direct Complete Option for Uncompleted Sessions */}
                          {!isCompleted && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuSessionId(null);
                                handleCompleteSession(ses);
                              }}
                              className="w-full px-3 py-2 text-left text-emerald-400 hover:bg-[#26221D] flex items-center gap-2 transition-colors cursor-pointer font-medium"
                            >
                              <CheckCircle2 size={13} />
                              <span>เสร็จสิ้นรอบสัก</span>
                            </button>
                          )}

                          {isDeleteDisabled ? (
                            <div className={`px-3 py-2 text-[10px] text-[#7A7265] ${!isCompleted && !isCancelled ? 'border-t border-[#332E27]' : ''} cursor-not-allowed`}>
                              <span>ไม่สามารถลบรอบนี้ได้</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenActionModal(ses, 'delete')}
                              className={`w-full px-3 py-2 text-left text-red-400 hover:bg-red-950/40 ${!isCompleted && !isCancelled ? 'border-t border-[#332E27]' : ''} flex items-center gap-2 transition-colors cursor-pointer`}
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

                <div className="flex items-center justify-between gap-2 text-[11px] text-[#B8B0A3] pt-0.5">
                  <span className={`font-medium shrink-0 ${isCancelled ? 'text-[#7A7265] line-through' : 'text-[#ECE4D3]'}`}>
                    {formatDateBangkok(ses.start_at)} · เวลานัด {formatTimeBangkok(ses.start_at)}
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
                        <span className="text-[#B8B0A3]">หมายเหตุ: </span>
                        <span className="text-[#ECE4D3] font-medium">{rawNote}</span>
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  if (isCancelled || isCompleted) return null;
                  return (
                    <div className="text-[10px] text-amber-300 bg-amber-950/30 border border-amber-900/40 px-2 py-0.5 rounded flex items-center gap-1 mt-1 font-normal">
                      <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                      <span>ยังต้องเสร็จสิ้นรอบนี้ก่อนปิดงานหลัก</span>
                    </div>
                  );
                })()}
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
      {/* 0. COMPLETE SESSION CONFIRMATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {modalType === 'complete' && activeModalSession && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-[#171512] border border-[#4A443A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 size={18} />
                <span>ยืนยันเสร็จสิ้นรอบสัก</span>
              </div>
              <button onClick={() => setModalType(null)} className="text-[#B8B0A3] hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-[#ECE4D3] bg-[#0E0D0C] p-3.5 rounded-xl border border-[#332E27]">
              <p className="font-semibold text-xs text-[#ECE4D3]">
                คุณต้องการยืนยันว่า รอบที่ {activeModalSession.session_number || 1} เสร็จสิ้นแล้วจริงหรือไม่?
              </p>
              {activeModalSession.start_at && (
                <p className="text-[11px] text-[#B8B0A3]">
                  วันที่นัด: <span className="text-[#ECE4D3] font-medium">{formatDateBangkok(activeModalSession.start_at)} · เวลานัด {formatTimeBangkok(activeModalSession.start_at)}</span>
                </p>
              )}
            </div>

            <p className="text-[10px] text-[#B8B0A3] leading-relaxed italic">
              * การเสร็จสิ้นรอบสักนี้จะเปลี่ยนเฉพาะสถานะของรอบนี้เท่านั้น จะไม่ปิดงานรวมทั้ง Booking และไม่บันทึกรับเงินโดยอัตโนมัติ
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
                onClick={handleExecuteComplete}
                disabled={isSubmittingModal}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isSubmittingModal ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>ยืนยันเสร็จสิ้นรอบ</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
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

            <p className="text-xs text-[#B8B0A3] leading-relaxed">
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
    </div>
  );
}
