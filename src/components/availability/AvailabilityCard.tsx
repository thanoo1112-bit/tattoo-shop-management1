'use client';

import { useState } from 'react';
import { cancelAvailabilitySlot, deleteAvailabilitySlot } from '@/app/actions/availability';
import { Loader2, Trash2, XCircle } from 'lucide-react';
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils';

export interface SlotData {
  id: string;
  start_at: string;
  end_at: string;
  status: 'open' | 'held' | 'booked' | 'blocked' | 'cancelled';
  hasHistory?: boolean;
  artist?: {
    display_name: string;
  };
}

interface Props {
  slot: SlotData;
  showArtist?: boolean;
}

const statusMap: Record<string, { label: string, color: string }> = {
  open: { label: 'เปิดรับคิว', color: 'text-[#F5F5F5] border-[#262626]' },
  held: { label: 'กำลังรอชำระ', color: 'text-amber-500 border-amber-500/20' },
  booked: { label: 'ถูกจองแล้ว', color: 'text-emerald-500 border-emerald-500/20' },
  blocked: { label: 'ปิดเวลา', color: 'text-[#737373] border-[#262626]' },
  cancelled: { label: 'ยกเลิก', color: 'text-red-500 border-red-500/20' }
};

export function AvailabilityCard({ slot, showArtist }: Props) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  
  const dateString = formatThaiDate(start, { longMonth: true });
  const timeString = `${formatThaiTime(start).replace(' น.', '')} – ${formatThaiTime(end)}`;
  const statusInfo = statusMap[slot.status] || statusMap.open;

  async function handleAction() {
    if (slot.status === 'open' && !slot.hasHistory) {
      // Hard Delete flow
      const confirmMsg = `ลบช่วงเวลานี้?\n\n${dateString}\n${timeString}\nช่าง: ${slot.artist?.display_name || 'ไม่ระบุ'}\n\nช่วงเวลานี้จะถูกลบออกจากตาราง\nและลูกค้าจะไม่เห็นเวลานี้อีก`;
      if (!confirm(confirmMsg)) return;
      
      setIsCancelling(true);
      setError(null);
      try {
        const res = await deleteAvailabilitySlot(slot.id);
        if (res?.error) {
          setError(res.error);
        }
      } catch (e) {
        setError('เกิดข้อผิดพลาดในการลบ');
      } finally {
        setIsCancelling(false);
      }
    } else {
      // Soft Cancel flow (if we ever allow it from here)
      if (!confirm('คุณต้องการยกเลิกช่วงเวลารับคิวนี้ใช่หรือไม่?')) return;
      
      setIsCancelling(true);
      setError(null);
      try {
        const res = await cancelAvailabilitySlot(slot.id);
        if (res?.error) {
          setError(res.error);
        }
      } catch (e) {
        setError('เกิดข้อผิดพลาดในการยกเลิก');
      } finally {
        setIsCancelling(false);
      }
    }
  }

  return (
    <div className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors bg-[#0A0A0A] ${statusInfo.color} ${slot.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div>
        <div className="font-medium text-[15px] text-[#F5F5F5] mb-1">
          {timeString}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={statusInfo.color.split(' ')[0]}>
            {statusInfo.label}
          </span>
          {showArtist && slot.artist && (
            <>
              <span className="text-[#525252]">•</span>
              <span className="text-[#A3A3A3]">ช่าง: {slot.artist.display_name}</span>
            </>
          )}
        </div>
        {error && (
          <div className="text-red-400 text-xs mt-2">{error}</div>
        )}
      </div>

      {slot.status === 'open' && !slot.hasHistory && (
        <button
          onClick={handleAction}
          disabled={isCancelling}
          className="self-start sm:self-auto flex items-center justify-center p-2 text-[#A3A3A3] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
          title="ลบช่วงเวลานี้"
        >
          {isCancelling ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        </button>
      )}
    </div>
  );
}
