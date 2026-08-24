'use client';

import Link from 'next/link';
import { formatThaiDate } from '@/lib/dateUtils';

interface StepThreePlaceholderProps {
  artist: {
    artist_id: string;
    display_name: string;
  };
  shopSlug: string;
  slot: {
    slot_id: string;
    start_at: string;
    end_at: string;
  };
}

function formatBKKDate(dateStr: string) {
  return formatThaiDate(dateStr, { longMonth: true });
}

function formatBKKTime(dateStr: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(dateStr));
}

export default function StepThreePlaceholder({ artist, shopSlug, slot }: StepThreePlaceholderProps) {
  const dateStr = formatBKKDate(slot.start_at);
  const timeStr = `${formatBKKTime(slot.start_at)} – ${formatBKKTime(slot.end_at)}`;

  return (
    <div className="max-w-2xl mx-auto w-full pt-8">
      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 md:p-10 mb-8">
        <h2 className="text-2xl font-semibold text-[#F5F5F5] mb-6">รายละเอียดงานสัก</h2>
        
        <p className="text-[#A3A3A3] mb-4 text-sm">คุณเลือก:</p>
        
        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center pb-4 border-b border-[#262626]">
            <span className="text-[#737373]">ช่าง</span>
            <span className="text-[#F5F5F5] font-medium">{artist.display_name}</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-[#262626]">
            <span className="text-[#737373]">วันที่</span>
            <span className="text-[#F5F5F5] font-medium">{dateStr}</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-[#262626]">
            <span className="text-[#737373]">เวลา</span>
            <span className="text-[#F5F5F5] font-medium">{timeStr}</span>
          </div>
        </div>

        <div className="p-4 bg-[#121212] rounded-xl border border-[#262626] text-center mb-6">
          <p className="text-neutral-300">แบบฟอร์มรายละเอียดงาน<br/>จะพัฒนาใน STEP 6D.3</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Link 
          href={`/book/${shopSlug}?step=2&artist=${artist.artist_id}`}
          className="inline-flex items-center text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          กลับไปเลือกเวลา
        </Link>
      </div>
    </div>
  );
}
