'use client';

import { AvailabilityCard, SlotData } from './AvailabilityCard';
import { Calendar } from 'lucide-react';
import { EmptyState } from '@/components/owner/empty-state';
import { formatThaiDate } from '@/lib/dateUtils';

interface Props {
  slots: SlotData[];
  showArtist?: boolean;
}

export function AvailabilityList({ slots, showArtist }: Props) {
  if (!slots || slots.length === 0) {
    return (
      <div className="bg-[#121212] border border-[#262626] rounded-xl p-8 min-h-[400px] flex items-center justify-center">
        <EmptyState 
          icon={Calendar}
          title="ยังไม่มีช่วงเวลาที่เปิดรับ"
          description="เพิ่มช่วงเวลาที่ช่างสามารถรับจอง เพื่อให้ลูกค้าเห็นในหน้าจองคิว"
        />
      </div>
    );
  }

  // Group by date in Asia/Bangkok
  const grouped = slots.reduce((acc, slot) => {
    const d = new Date(slot.start_at);
    const dateStr = formatThaiDate(d, { longMonth: true });

    if (!acc[dateStr]) {
      acc[dateStr] = [];
    }
    acc[dateStr].push(slot);
    return acc;
  }, {} as Record<string, SlotData[]>);

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([dateLabel, daySlots]) => (
        <div key={dateLabel}>
          <h3 className="text-[#A3A3A3] font-medium text-sm mb-4 pb-2 border-b border-[#262626]">
            {dateLabel}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {daySlots.map(slot => (
              <AvailabilityCard key={slot.id} slot={slot} showArtist={showArtist} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
