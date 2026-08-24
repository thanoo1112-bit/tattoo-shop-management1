'use client';

import { AvailabilitySlot } from './BookingCalendarFlow';

interface AvailabilitySlotListProps {
  dateKey: string | null;
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function formatTimeBKK(dateStr: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(dateStr));
}

export default function AvailabilitySlotList({ dateKey, slots, selectedSlotId, onSelectSlot }: AvailabilitySlotListProps) {
  if (!dateKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-[#262626] border-dashed rounded-2xl bg-[#121212]/20">
        <p className="text-[#737373]">กรุณาเลือกวันที่</p>
      </div>
    );
  }

  // Parse YYYY-MM-DD
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d); // Gregorian
  
  const dayName = THAI_DAYS[dateObj.getDay()];
  const monthName = THAI_MONTHS[dateObj.getMonth()];
  const thaiYear = dateObj.getFullYear() + 543;

  const dateHeading = `วัน${dayName}ที่ ${d} ${monthName} ${thaiYear}`;

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-[#F5F5F5] mb-1">ช่วงเวลาที่เปิดรับ</h3>
        <p className="text-[#A3A3A3] text-sm">{dateHeading}</p>
      </div>

      {slots.length === 0 ? (
        <div className="py-8 text-center bg-[#121212] rounded-2xl border border-[#262626]">
          <p className="text-[#A3A3A3] text-sm">ช่วงเวลานี้ไม่ว่างแล้ว<br/>กรุณาเลือกวันหรือเวลาอื่น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pr-1 pb-4 max-h-[350px]">
          {slots.map(slot => {
            const start = formatTimeBKK(slot.start_at);
            const end = formatTimeBKK(slot.end_at);
            const isSelected = selectedSlotId === slot.slot_id;
            
            return (
              <button
                key={slot.slot_id}
                onClick={() => onSelectSlot(slot.slot_id)}
                className={`
                  p-4 rounded-xl border text-center transition-all duration-200
                  ${isSelected 
                    ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5] font-semibold' 
                    : 'bg-[#121212] border-[#262626] text-neutral-200 hover:border-neutral-500'}
                `}
              >
                {start} – {end}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
