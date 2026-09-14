'use client';

import React, { useState } from 'react';
import { CalendarArtist } from './types';
import { createClient } from '@/lib/supabase/client';
import { X, Lock, Unlock, AlertTriangle, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatDateBangkok } from './calendarUtils';

export interface BlockedDateItem {
  id?: string;
  scope?: 'STUDIO' | 'ARTIST';
  artist_id?: string | null;
  blocked_date: string;
  reason?: string | null;
}

interface AvailabilityBlockModalProps {
  isOpen: boolean;
  selectedDateStr: string; // YYYY-MM-DD
  artists: CalendarArtist[];
  existingBlocks: BlockedDateItem[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (errMsg: string) => void;
}

export default function AvailabilityBlockModal({
  isOpen,
  selectedDateStr,
  artists,
  existingBlocks,
  onClose,
  onSuccess,
  onError,
}: AvailabilityBlockModalProps) {
  const [scope, setScope] = useState<'STUDIO' | 'ARTIST'>('STUDIO');
  const [selectedArtistId, setSelectedArtistId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmUnblockItem, setConfirmUnblockItem] = useState<BlockedDateItem | null>(null);

  // Sync selectedArtistId when modal opens or artists list changes
  React.useEffect(() => {
    if (isOpen && artists.length > 0) {
      if (!selectedArtistId || !artists.some((a) => a.id === selectedArtistId)) {
        setSelectedArtistId(artists[0].id);
      }
    }
  }, [isOpen, artists, selectedArtistId]);

  if (!isOpen || !selectedDateStr) return null;

  // Filter existing blocks for selectedDateStr
  const dateBlocks = existingBlocks.filter((b) => b.blocked_date === selectedDateStr);
  const studioBlock = dateBlocks.find((b) => b.scope === 'STUDIO' || (!b.scope && !b.artist_id));
  const artistBlocks = dateBlocks.filter((b) => b.scope === 'ARTIST' || b.artist_id);

  const handleSubmitBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveArtistId = scope === 'STUDIO' ? null : (selectedArtistId || artists[0]?.id);

    if (scope === 'ARTIST' && !effectiveArtistId) {
      onError('กรุณาเลือกช่างสักที่ต้องการปิดรับคิว');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // Call RPC or Insert directly into artist_blocked_dates
      const { data, error } = await supabase.rpc('admin_set_availability_block', {
        p_date: selectedDateStr,
        p_scope: scope,
        p_artist_id: effectiveArtistId,
        p_reason: reason.trim() || null,
        p_blocked: true,
      });

      if (error) {
        // Fallback to direct insert if RPC permission fails
        const { error: insertErr } = await supabase
          .from('artist_blocked_dates')
          .insert({
            scope,
            artist_id: effectiveArtistId,
            blocked_date: selectedDateStr,
            reason: reason.trim() || null,
          });

        if (insertErr) {
          throw insertErr;
        }
      }

      const targetArtistName = artists.find((a) => a.id === effectiveArtistId)?.name;
      const formattedArtistName = targetArtistName
        ? (targetArtistName.trim().startsWith('ช่าง') ? targetArtistName.trim() : `ช่าง${targetArtistName.trim()}`)
        : '';
      const scopeLabel = scope === 'STUDIO' ? 'ทั้งร้าน' : formattedArtistName;
      onSuccess(`ปิดรับคิว (${scopeLabel}) วันที่ ${formatDateBangkok(selectedDateStr)} เรียบร้อยแล้ว`);
      onClose();
    } catch (err: any) {
      console.error('[AvailabilityBlockModal] Block error:', err);
      onError(err.message || 'เกิดข้อผิดพลาดในการบันทึกวันปิดรับคิว');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblock = async (blockItem: BlockedDateItem) => {
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const isStudio = blockItem.scope === 'STUDIO' || (!blockItem.scope && !blockItem.artist_id);
      const targetScope = isStudio ? 'STUDIO' : 'ARTIST';

      const { error } = await supabase.rpc('admin_set_availability_block', {
        p_date: selectedDateStr,
        p_scope: targetScope,
        p_artist_id: blockItem.artist_id || null,
        p_reason: null,
        p_blocked: false,
      });

      if (error) {
        // Fallback delete
        let query = supabase.from('artist_blocked_dates').delete().eq('blocked_date', selectedDateStr);
        if (isStudio) {
          query = query.or('scope.eq.STUDIO,artist_id.is.null');
        } else if (blockItem.artist_id) {
          query = query.eq('artist_id', blockItem.artist_id);
        }
        const { error: delErr } = await query;
        if (delErr) throw delErr;
      }

      onSuccess(`เปิดรับคิววันที่ ${formatDateBangkok(selectedDateStr)} เรียบร้อยแล้ว`);
      setConfirmUnblockItem(null);
      onClose();
    } catch (err: any) {
      console.error('[AvailabilityBlockModal] Unblock error:', err);
      onError(err.message || 'เกิดข้อผิดพลาดในการยกเลิกวันปิดรับคิว');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400">
              <Lock size={16} />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-[#ECE4D3]">
                จัดการวันปิดรับคิว
              </h3>
              <p className="text-xs text-amber-400/90 font-medium">
                {formatDateBangkok(selectedDateStr)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Existing Blocks Display / Reopen Section */}
        {dateBlocks.length > 0 && (
          <div className="space-y-2 bg-[#0E0D0C] border border-amber-900/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <AlertTriangle size={14} />
              <span>วันที่เลือกมีรายการปิดรับคิวอยู่แล้ว:</span>
            </div>
            <div className="space-y-2 pt-1">
              {studioBlock && (
                <div className="flex items-center justify-between bg-red-950/40 border border-red-900/60 rounded p-2 text-xs">
                  <div>
                    <span className="font-semibold text-red-400">🔒 ปิดทั้งร้าน (Studio Block)</span>
                    {studioBlock.reason && (
                      <p className="text-[11px] text-[#A89F91] mt-0.5">เหตุผล: {studioBlock.reason}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmUnblockItem(studioBlock)}
                    className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 rounded transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Unlock size={12} />
                    <span>เปิดรับคิว</span>
                  </button>
                </div>
              )}

              {artistBlocks.map((ab) => {
                const artistObj = artists.find((a) => a.id === ab.artist_id);
                const artistName = artistObj ? artistObj.name : 'ช่างสัก';
                return (
                  <div
                    key={ab.id || ab.artist_id}
                    className="flex items-center justify-between bg-amber-950/30 border border-amber-900/40 rounded p-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-amber-300">🔒 ช่าง{artistName} — ปิดรับคิว</span>
                      {ab.reason && (
                        <p className="text-[11px] text-[#A89F91] mt-0.5">เหตุผล: {ab.reason}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmUnblockItem(ab)}
                      className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 rounded transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Unlock size={12} />
                      <span>เปิดรับคิว</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirmation Modal for Reopening */}
        {confirmUnblockItem ? (
          <div className="bg-[#0E0D0C] border border-red-800/60 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
              <ShieldAlert size={16} />
              <span>ยืนยันเปิดรับคิวอีกครั้ง?</span>
            </div>
            <p className="text-xs text-[#A89F91]">
              การเปิดรับคิวจะทำให้ลูกค้าสามารถเลือกจองคิวในวันที่{' '}
              <span className="text-[#ECE4D3] font-medium">{formatDateBangkok(selectedDateStr)}</span> ได้ตามปกติ
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmUnblockItem(null)}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-[#A89F91] bg-[#171512] border border-[#4A443A] rounded hover:text-[#ECE4D3]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleUnblock(confirmUnblockItem)}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 rounded hover:bg-emerald-900/80 flex items-center gap-1"
              >
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                <span>ยืนยันเปิดรับคิว</span>
              </button>
            </div>
          </div>
        ) : (
          /* New Block Form */
          <form onSubmit={handleSubmitBlock} className="space-y-4">
            {/* Scope Selection */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
                ขอบเขตการปิดรับคิว <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('STUDIO')}
                  className={`py-2 px-3 text-xs rounded-md border font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    scope === 'STUDIO'
                      ? 'bg-red-950/80 text-red-300 border-red-800'
                      : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3]'
                  }`}
                >
                  <Lock size={13} />
                  <span>ปิดทั้งร้าน (Studio)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('ARTIST')}
                  className={`py-2 px-3 text-xs rounded-md border font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    scope === 'ARTIST'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                      : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3]'
                  }`}
                >
                  <Lock size={13} />
                  <span>ปิดเฉพาะช่าง (Artist)</span>
                </button>
              </div>
            </div>

            {/* Artist Selector if Scope = ARTIST */}
            {scope === 'ARTIST' && (
              <div>
                <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
                  เลือกช่างสัก <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedArtistId}
                  onChange={(e) => setSelectedArtistId(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#ECE4D3]"
                >
                  {artists.map((art) => (
                    <option key={art.id} value={art.id}>
                      ช่าง{art.name} {art.nickname ? `(${art.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Optional Reason */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เหตุผลการปิดรับคิว (Optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น ร้านปิดประจำปี, ช่างติดภารกิจ..."
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md px-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3]"
              />
            </div>

            {/* Notice Note */}
            <div className="bg-[#0E0D0C] border border-[#4A443A]/60 rounded-md p-2.5 text-[11px] text-[#A89F91] leading-relaxed">
              <span className="text-amber-400 font-medium block mb-0.5">ℹ️ ข้อควรทราบ:</span>
              การปิดรับคิวมีผลเฉพาะ <span className="text-[#ECE4D3] font-medium">คำขอจองคิวใหม่</span> ของลูกค้า โดยจะไม่กระทบกับคิวนัดหมายที่มีอยู่แล้วในระบบ
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/60">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs text-[#A89F91] hover:text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] rounded-md transition-colors"
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 text-xs font-medium text-white bg-red-900 hover:bg-red-800 border border-red-700 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <Lock size={13} />
                    <span>ยืนยันปิดรับคิว</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
