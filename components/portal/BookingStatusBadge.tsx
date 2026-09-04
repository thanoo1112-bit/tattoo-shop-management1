'use client';

import React from 'react';

type StatusType = 
  | 'PENDING' | 'APPROVED' | 'WAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  | 'QUOTED' | 'ACCEPTED' | 'REJECTED';

interface BookingStatusBadgeProps {
  status: StatusType;
  type?: 'estimate' | 'booking';
}

export default function BookingStatusBadge({ status, type = 'booking' }: BookingStatusBadgeProps) {
  // Label and dot + border styling lookup (No blue/indigo or rainbow background fills)
  const config: Record<StatusType, { label: string; dot: string; container: string; text: string }> = {
    PENDING: {
      label: type === 'estimate' ? 'รอช่างประเมิน' : 'รอช่างอนุมัติ',
      dot: 'bg-[#9C2F2F] animate-pulse',
      container: 'bg-[#171512] border-[#4A443A]',
      text: 'text-[#ECE4D3]',
    },
    QUOTED: {
      label: 'เสนอราคาแล้ว',
      dot: 'bg-[#C9A86A]',
      container: 'bg-[#171512] border-[#C9A86A]/40',
      text: 'text-[#ECE4D3]',
    },
    ACCEPTED: {
      label: 'ลูกค้ายอมรับแล้ว',
      dot: 'bg-[#9C2F2F]',
      container: 'bg-[#171512] border-[#9C2F2F]/40',
      text: 'text-[#ECE4D3]',
    },
    REJECTED: {
      label: 'ปฏิเสธคำขอ',
      dot: 'bg-[#7F2424]',
      container: 'bg-[#171512] border-red-900/30',
      text: 'text-[#A89F91]',
    },
    APPROVED: {
      label: 'ช่างอนุมัติแล้ว',
      dot: 'bg-[#4E9F6E]',
      container: 'bg-[#171512] border-emerald-800/40',
      text: 'text-[#ECE4D3]',
    },
    WAITING_DEPOSIT: {
      label: 'รอมัดจำ',
      dot: 'bg-[#9C2F2F]',
      container: 'bg-[#171512] border-[#9C2F2F]/40',
      text: 'text-[#ECE4D3]',
    },
    CONFIRMED: {
      label: 'ยืนยันคิวแล้ว',
      dot: 'bg-[#4E9F6E]',
      container: 'bg-[#171512] border-emerald-800/40',
      text: 'text-[#ECE4D3]',
    },
    IN_PROGRESS: {
      label: 'กำลังสัก',
      dot: 'bg-[#9C2F2F]',
      container: 'bg-[#171512] border-[#9C2F2F]/60',
      text: 'text-[#ECE4D3]',
    },
    COMPLETED: {
      label: 'เสร็จสิ้น',
      dot: 'bg-[#7A7265]',
      container: 'bg-[#171512] border-[#4A443A]',
      text: 'text-[#A89F91]',
    },
    CANCELLED: {
      label: 'ยกเลิกคิวแล้ว',
      dot: 'bg-[#7F2424]',
      container: 'bg-[#171512] border-red-900/30',
      text: 'text-[#A89F91]',
    },
  };

  const current = config[status] || {
    label: status,
    dot: 'bg-[#7A7265]',
    container: 'bg-[#171512] border-[#4A443A]',
    text: 'text-[#ECE4D3]',
  };

  return (
    <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 border rounded-[4px] text-[10px] font-semibold tracking-wide font-prompt ${current.container} ${current.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span>{current.label}</span>
    </span>
  );
}
