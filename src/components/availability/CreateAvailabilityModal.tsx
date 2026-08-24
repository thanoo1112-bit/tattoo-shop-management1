'use client';

import { useState } from 'react';
import { createAvailabilitySlot } from '@/app/actions/availability';
import { X, Loader2, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { gregorianToThaiNumeric } from '@/lib/dateUtils';
import { ThaiBuddhistDatePicker } from '@/components/ui/ThaiBuddhistDatePicker';

interface Artist {
  id: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isOwner: boolean;
  artists?: Artist[];
  shopSlug: string;
}

export function CreateAvailabilityModal({ isOpen, onClose, isOwner, artists = [], shopSlug }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [artistId, setArtistId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic Validation
    if (isOwner && !artistId) {
      setError('กรุณาเลือกช่างสัก');
      return;
    }
    if (!date || !startTime || !endTime) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (startTime >= endTime) {
      setError('เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด');
      return;
    }

    const now = new Date();
    // Create start and end Date objects in Asia/Bangkok explicitly
    // Format: YYYY-MM-DDTHH:mm:ss+07:00
    const startIso = `${date}T${startTime}:00+07:00`;
    const endIso = `${date}T${endTime}:00+07:00`;

    if (new Date(startIso) < now) {
      setError('ไม่สามารถเปิดคิวย้อนหลังได้');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createAvailabilitySlot(artistId, startIso, endIso);
      if (res?.error) {
        setError(res.error);
      } else {
        // Success
        setArtistId('');
        setDate('');
        setStartTime('');
        setEndTime('');
        onClose();
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-[#262626] rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#262626]">
          <h2 className="text-lg font-medium text-[#F5F5F5]">เปิดช่วงเวลารับจอง</h2>
          <button 
            onClick={onClose}
            className="text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-5 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form id="create-slot-form" onSubmit={handleSubmit} className="space-y-5">
            {/* Artist Selector (Owner only) */}
            {isOwner && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#A3A3A3]">ช่างสัก *</label>
                <select 
                  value={artistId}
                  onChange={(e) => setArtistId(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg p-3 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#525252]"
                  required
                >
                  <option value="">เลือกช่างสัก</option>
                  {artists.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date Picker */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#A3A3A3]">วันที่ *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <CalendarIcon size={16} className="text-[#525252]" />
                </div>
                <ThaiBuddhistDatePicker
                  value={date}
                  onChange={setDate}
                  showIcon={false}
                  inputClassName="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg py-3 pl-10 pr-3 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#525252] cursor-pointer text-left min-h-[46px]"
                />
              </div>
            </div>

            {/* Time Pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#A3A3A3]">เวลาเริ่ม *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Clock size={16} className="text-[#525252]" />
                  </div>
                  <input 
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg py-3 pl-10 pr-3 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#525252] color-scheme-dark [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#A3A3A3]">เวลาสิ้นสุด *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Clock size={16} className="text-[#525252]" />
                  </div>
                  <input 
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#262626] rounded-lg py-3 pl-10 pr-3 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#525252] color-scheme-dark [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    required
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[#262626] flex gap-3 justify-end bg-[#0A0A0A] rounded-b-xl">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
            disabled={isSubmitting}
          >
            ยกเลิก
          </button>
          <button 
            type="submit"
            form="create-slot-form"
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-medium bg-[#F5F5F5] text-[#0A0A0A] rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                กำลังบันทึก
              </>
            ) : (
              'เปิดรับคิว'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
