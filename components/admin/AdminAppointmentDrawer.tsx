'use client';

import React from 'react';
import { Booking } from '@/data/mockBookings';
import { useApp } from '../AppContext';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Maximize2,
  DollarSign,
  User,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock3,
  XCircle,
  FileText,
  BadgeDollarSign,
} from 'lucide-react';

interface AdminAppointmentDrawerProps {
  booking: Booking | null;
  onClose: () => void;
}

export default function AdminAppointmentDrawer({
  booking,
  onClose,
}: AdminAppointmentDrawerProps) {
  const { updateBookingStatus, artists } = useApp();

  if (!booking) return null;

  const assignedArtist = artists.find((a) => a.id === booking.artistId);

  const statusConfig: Record<
    string,
    { label: string; bg: string; text: string; border: string }
  > = {
    CONFIRMED: {
      label: 'ยืนยันคิวแล้ว',
      bg: 'bg-green-950/60',
      text: 'text-green-400',
      border: 'border-green-800',
    },
    IN_PROGRESS: {
      label: 'กำลังสัก',
      bg: 'bg-[#9C2F2F]/20',
      text: 'text-[#9C2F2F]',
      border: 'border-[#9C2F2F]',
    },
    WAITING_DEPOSIT: {
      label: 'รอมัดจำ',
      bg: 'bg-amber-950/60',
      text: 'text-amber-400',
      border: 'border-amber-800',
    },
    PENDING: {
      label: 'รอตรวจสอบ',
      bg: 'bg-blue-950/60',
      text: 'text-blue-400',
      border: 'border-blue-800',
    },
    COMPLETED: {
      label: 'เสร็จสิ้น',
      bg: 'bg-zinc-900',
      text: 'text-[#A89F91]',
      border: 'border-[#4A443A]',
    },
    CANCELLED: {
      label: 'ยกเลิก',
      bg: 'bg-red-950/60',
      text: 'text-red-400',
      border: 'border-red-800',
    },
    REJECTED: {
      label: 'ปฏิเสธ',
      bg: 'bg-red-950/60',
      text: 'text-red-400',
      border: 'border-red-800',
    },
  };

  const currentStatus = statusConfig[booking.status] || statusConfig.PENDING;

  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'มกราคม',
      'กุมภาพันธ์',
      'มีนาคม',
      'เมษายน',
      'พฤษภาคม',
      'มิถุนายน',
      'กรกฎาคม',
      'สิงหาคม',
      'กันยายน',
      'ตุลาคม',
      'พฤศจิกายน',
      'ธันวาคม',
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${
      parseInt(parts[0], 10) + 543
    }`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
      {/* Backdrop Click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
        {/* Drawer Header */}
        <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Sparkles size={16} className="text-[#9C2F2F]" />
              <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                MASTER CALENDAR • รายละเอียดคิวงานสัก
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>

          {/* Title & Artwork Image Header */}
          <div className="flex items-center space-x-4">
            {booking.artworkImage ? (
              <img
                src={booking.artworkImage}
                alt=""
                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-[6px] border border-[#4A443A] bg-[#0E0D0C] shrink-0 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[6px] bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F] shrink-0">
                <FileText size={26} />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-mono tracking-wider bg-[#0E0D0C] text-[#A89F91] px-2 py-0.5 rounded border border-[#4A443A] inline-block mb-1">
                {booking.bookingType === 'flash' ? 'Flash Design' : 'Custom Tattoo Design'}
              </span>
              <h2 className="text-lg sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                {booking.artworkTitle || 'Tattoo Appointment'}
              </h2>
              <div className="mt-1 flex items-center space-x-2">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-[4px] font-semibold inline-block border ${currentStatus.bg} ${currentStatus.border} ${currentStatus.text}`}
                >
                  ● {currentStatus.label}
                </span>
                <span className="text-[11px] text-[#7A7265] font-mono">
                  #{booking.id}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Work Order Body Specs */}
        <div className="space-y-4 flex-1 text-xs">
          {/* 1. Customer Info */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
            <div className="flex items-center space-x-2 text-[#ECE4D3] font-medium border-b border-[#4A443A]/40 pb-2">
              <User size={14} className="text-[#9C2F2F]" />
              <span className="uppercase text-[11px] tracking-wider">
                ข้อมูลลูกค้า (Customer)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[#7A7265] block text-[10px]">ชื่อลูกค้า:</span>
                <strong className="text-[#ECE4D3] font-medium">
                  {booking.customerName || 'ไม่ระบุ'}
                </strong>
              </div>
              <div>
                <span className="text-[#7A7265] block text-[10px]">อีเมลติดต่อ:</span>
                <span className="text-[#A89F91] font-mono truncate block">
                  {booking.customerEmail || 'ไม่มีข้อมูล'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Artist Info */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
            <div className="flex items-center space-x-2 text-[#ECE4D3] font-medium border-b border-[#4A443A]/40 pb-2">
              <ShieldCheck size={14} className="text-[#9C2F2F]" />
              <span className="uppercase text-[11px] tracking-wider">
                ช่างสักผู้รับผิดชอบ (Artist)
              </span>
            </div>
            <div className="flex items-center space-x-3">
              {assignedArtist?.avatar ? (
                <img
                  src={assignedArtist.avatar}
                  alt={assignedArtist.name}
                  className="w-10 h-10 rounded-full object-cover border border-[#4A443A]"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
                  <User size={16} />
                </div>
              )}
              <div>
                <strong className="text-sm text-[#ECE4D3] block">
                  {assignedArtist?.name || booking.artistName}
                </strong>
                <span className="text-[11px] text-[#9C2F2F] uppercase tracking-wide">
                  {assignedArtist?.specialty || 'Tattoo Artist'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Date & Time Specification */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] font-medium border-b border-[#4A443A]/40 pb-2">
              <Calendar size={14} className="text-[#9C2F2F]" />
              <span className="uppercase text-[11px] tracking-wider">
                กำหนดการนัดหมาย (Schedule)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#7A7265] text-[10px] block">วันที่นัดสัก:</span>
                <span className="text-[#ECE4D3] font-medium">
                  {formatThaiDate(booking.date)}
                </span>
              </div>
              <div>
                <span className="text-[#7A7265] text-[10px] block">ช่วงเวลาสัก:</span>
                <span className="text-[#ECE4D3] font-medium font-mono">
                  {booking.startTime} – {booking.endTime} ({booking.duration} ชม.)
                </span>
              </div>
            </div>
          </div>

          {/* 4. Placement & Size Specs */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
            <div className="flex items-center space-x-2 text-[#ECE4D3] font-medium border-b border-[#4A443A]/40 pb-2">
              <MapPin size={14} className="text-[#9C2F2F]" />
              <span className="uppercase text-[11px] tracking-wider">
                ตำแหน่งและขนาด (Placement & Size)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#7A7265] text-[10px] block">ตำแหน่งบนร่างกาย:</span>
                <span className="text-[#ECE4D3]">
                  {booking.placement || 'ตามที่ตกลงกับช่าง'}
                </span>
              </div>
              <div>
                <span className="text-[#7A7265] text-[10px] block">ขนาดผลงาน:</span>
                <span className="text-[#ECE4D3]">
                  {booking.width && booking.height
                    ? `${booking.width} × ${booking.height} cm`
                    : 'ประเมินหน้างาน'}
                </span>
              </div>
            </div>
            {booking.description && (
              <div className="pt-2 border-t border-[#4A443A]/30">
                <span className="text-[#7A7265] text-[10px] block">รายละเอียดงาน:</span>
                <p className="text-[#A89F91] text-xs leading-relaxed mt-0.5">
                  {booking.description}
                </p>
              </div>
            )}
          </div>

          {/* 5. Financial & Deposit Summary */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
            <div className="flex items-center space-x-2 text-[#ECE4D3] font-medium border-b border-[#4A443A]/40 pb-2">
              <BadgeDollarSign size={14} className="text-[#9C2F2F]" />
              <span className="uppercase text-[11px] tracking-wider">
                การชำระเงินและมัดจำ (Financials)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded bg-[#171512] border border-[#4A443A]/50">
                <span className="text-[10px] text-[#7A7265] block uppercase">ราคารวมประเมิน:</span>
                <strong className="text-sm text-[#ECE4D3] font-mono">
                  ฿{booking.price?.toLocaleString() || '0'}
                </strong>
              </div>
              <div className="p-2.5 rounded bg-[#171512] border border-[#4A443A]/50">
                <span className="text-[10px] text-[#7A7265] block uppercase">ยอดมัดจำ:</span>
                <strong className="text-sm text-green-400 font-mono">
                  ฿{booking.deposit?.toLocaleString() || '0'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Actions (State-dependent based on existing logic) */}
        <div className="pt-4 border-t border-[#4A443A]/60 flex flex-col sm:flex-row gap-3">
          {booking.status === 'PENDING' && (
            <>
              <button
                onClick={() => {
                  updateBookingStatus(booking.id, 'APPROVED');
                  onClose();
                }}
                className="flex-1 min-h-[44px] bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3] rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
              >
                <CheckCircle2 size={15} />
                <span>อนุมัติคำขอคิวสัก</span>
              </button>
              <button
                onClick={() => {
                  updateBookingStatus(booking.id, 'REJECTED');
                  onClose();
                }}
                className="min-h-[44px] px-4 bg-transparent hover:bg-red-950/30 border border-red-800 text-red-400 rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <XCircle size={15} />
                <span>ปฏิเสธ</span>
              </button>
            </>
          )}

          {booking.status === 'WAITING_DEPOSIT' && (
            <button
              onClick={() => {
                updateBookingStatus(booking.id, 'CONFIRMED');
                onClose();
              }}
              className="w-full min-h-[44px] bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3] rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
            >
              <CheckCircle2 size={15} />
              <span>ยืนยันมัดจำ & ล็อกคิวงาน</span>
            </button>
          )}

          {booking.status === 'CONFIRMED' && (
            <>
              <button
                onClick={() => {
                  updateBookingStatus(booking.id, 'IN_PROGRESS');
                  onClose();
                }}
                className="flex-1 min-h-[44px] bg-[#9C2F2F] hover:bg-[#7F2424] text-[#ECE4D3] rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
              >
                <Clock3 size={15} />
                <span>เริ่มรอบการสัก (In Progress)</span>
              </button>
              <button
                onClick={() => {
                  updateBookingStatus(booking.id, 'CANCELLED');
                  onClose();
                }}
                className="min-h-[44px] px-4 bg-transparent hover:bg-red-950/30 border border-red-800 text-red-400 rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <XCircle size={15} />
                <span>ยกเลิกคิว</span>
              </button>
            </>
          )}

          {booking.status === 'IN_PROGRESS' && (
            <button
              onClick={() => {
                updateBookingStatus(booking.id, 'COMPLETED');
                onClose();
              }}
              className="w-full min-h-[44px] bg-green-900/60 hover:bg-green-800 border border-green-700 text-green-300 rounded-[4px] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-md"
            >
              <CheckCircle2 size={15} />
              <span>บันทึกว่าสักเสร็จสิ้นแล้ว (Complete)</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="min-h-[44px] px-5 bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
