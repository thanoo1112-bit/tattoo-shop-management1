'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import SelectedArtistSummary from './SelectedArtistSummary';
import BookingCalendar from './BookingCalendar';
import { useRouter } from 'next/navigation';
import { useBookingState } from './BookingStateProvider';
import { X, Calendar as CalendarIcon, Clock, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { calculateTattooEstimate, getLatestPreferredStartTime } from '@/lib/bookingCalculations';
import { formatThaiDate } from '@/lib/dateUtils';

export interface AvailabilitySlot {
  slot_id: string;
  start_at: string;
  end_at: string;
  available: boolean;
}

export interface DailyAvailability {
  date: string;
  status: 'AVAILABLE' | 'LIMITED' | 'FULL' | 'CLOSED';
  capacity: number;
  occupied: number;
  remaining: number;
  can_request: boolean;
}

interface BookingCalendarFlowProps {
  artist: {
    artist_id: string;
    display_name: string;
    avatar_url: string | null;
  };
  shopSlug: string;
  availability: DailyAvailability[];
}

export default function BookingCalendarFlow({ artist, shopSlug, availability }: BookingCalendarFlowProps) {
  const router = useRouter();
  const { formData, setFormData } = useBookingState();
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const timeDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target as Node)) {
        setIsTimeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availabilityMap = useMemo(() => {
    const map = new Map<string, DailyAvailability>();
    availability.forEach(item => {
      map.set(item.date, item);
    });
    return map;
  }, [availability]);

  const handleDateSelect = (dateKey: string) => {
    setFormData(prev => ({ ...prev, selectedDate: dateKey }));
  };

  const selectedData = formData.selectedDate ? availabilityMap.get(formData.selectedDate) : null;
  const isDateValid = selectedData && selectedData.can_request;

  const { sizeCategory } = formData.flashId
    ? { sizeCategory: '' }
    : calculateTattooEstimate(formData.widthCm, formData.heightCm);

  const STORE_CLOSING_HOURS = 23;
  const STORE_CLOSING_MINUTES = 30;
  const closingTimeDecimal = STORE_CLOSING_HOURS + (STORE_CLOSING_MINUTES / 60);
  const latestStartTimeDecimal = getLatestPreferredStartTime(sizeCategory || '', closingTimeDecimal);

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let h = 10; h <= 23; h++) {
      if (h <= latestStartTimeDecimal) options.push(`${h}:00`);
      if (h + 0.5 <= latestStartTimeDecimal) options.push(`${h}:30`);
    }
    return options;
  }, [latestStartTimeDecimal]);

  // Invalidate preferredTime if it's no longer valid based on new duration
  useEffect(() => {
    if (formData.preferredTime && !timeOptions.includes(formData.preferredTime)) {
      setFormData(prev => ({ ...prev, preferredTime: '' }));
    }
  }, [timeOptions, formData.preferredTime, setFormData]);

  const isContinueDisabled = !isDateValid || !formData.preferredTime;

  return (
    <div className="w-full">
      <SelectedArtistSummary artist={artist} shopSlug={shopSlug} />

      <div className="mb-6 md:mb-8 space-y-2 mt-6">
        <h2 className="text-2xl md:text-[28px] font-semibold text-[#F5F5F5]">เลือกวันและเวลา</h2>
        <p className="text-sm md:text-base text-[#A3A3A3]">เลือกวันที่ต้องการจองคิวสัก</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        <div className="w-full lg:w-[55%]">
          <BookingCalendar 
            availabilityMap={availabilityMap}
            selectedDateKey={formData.selectedDate}
            onSelectDate={handleDateSelect}
          />
        </div>
        
        <div className="w-full lg:w-[45%] flex flex-col">
          <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 mb-6 flex-1">
            {!formData.selectedDate ? (
              <div className="text-center py-12 text-[#A3A3A3] h-full flex items-center justify-center">
                เลือกวันที่ต้องการจอง
              </div>
            ) : selectedData ? (
              <div className="space-y-6">
                <h3 className="text-xl font-medium text-[#F5F5F5]">{formatThaiDate(selectedData.date, { longMonth: true })}</h3>
                
                {selectedData.status === 'AVAILABLE' && (
                  <div className="space-y-2">
                    <p className="text-[#F5F5F5] font-medium">สถานะ: ว่าง</p>
                    <p className="text-[#A3A3A3]">คิวปัจจุบัน: {selectedData.occupied} / {selectedData.capacity}</p>
                    <p className="text-[#A3A3A3]">เหลือ: {selectedData.remaining} คิว</p>
                  </div>
                )}

                {selectedData.status === 'LIMITED' && (
                  <div className="space-y-2">
                    <p className="text-[#F5F5F5] font-medium">สถานะ: ยังรับจองได้</p>
                    <p className="text-[#A3A3A3]">คิวปัจจุบัน: {selectedData.occupied} / {selectedData.capacity}</p>
                    <p className="text-[#A3A3A3]">เหลือ: {selectedData.remaining} คิว</p>
                  </div>
                )}

                {selectedData.status === 'FULL' && (
                  <div className="space-y-2">
                    <p className="text-red-400 font-medium">เต็มแล้ว</p>
                    <p className="text-[#A3A3A3]">คิวปัจจุบัน: {selectedData.occupied} / {selectedData.capacity}</p>
                    <p className="text-[#A3A3A3] mt-4">ไม่สามารถเลือกวันนี้ได้</p>
                  </div>
                )}

                {selectedData.status === 'CLOSED' && (
                  <div className="space-y-2">
                    <p className="text-[#A3A3A3] font-medium">ปิดรับคิววันนี้</p>
                    <p className="text-[#A3A3A3] mt-4">ไม่สามารถเลือกวันนี้ได้</p>
                  </div>
                )}

                {isDateValid && (
                  <div className="pt-4 border-t border-[#262626] mt-4">
                    <label className="block text-[#F5F5F5] font-medium mb-3">
                      ช่วงเวลาที่สะดวก <span className="text-red-500">*</span>
                    </label>
                    <div className="bg-[#0A0A0A] border border-[#262626] rounded-xl p-3">
                      <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#262626] pr-1">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {timeOptions.map(time => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, preferredTime: time }))}
                              className={`py-2.5 px-1 text-center text-[13px] md:text-sm rounded-lg border transition-all ${
                                formData.preferredTime === time 
                                  ? 'bg-[#F5F5F5] border-[#F5F5F5] text-[#0A0A0A] font-medium' 
                                  : 'bg-[#121212] border-[#262626] text-[#A3A3A3] hover:border-[#525252] hover:text-[#F5F5F5]'
                              }`}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-[#737373] mt-3 leading-relaxed">
                      ช่วงเวลานี้เป็นเวลาที่คุณสะดวก ช่างจะตรวจสอบและยืนยันอีกครั้ง
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-[#A3A3A3] h-full flex items-center justify-center">
                ไม่พบข้อมูลของวันนี้
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-6 border-t border-[#262626]">
            <button 
              type="button"
              onClick={() => {
                const currentUrl = new URL(window.location.href);
                const styleParam = currentUrl.searchParams.get('style');
                let url = `/book/${shopSlug}?step=2&artist=${artist.artist_id}${styleParam ? '&style=' + styleParam : ''}`;
                if (formData.flashId) {
                  url += `&flash_id=${formData.flashId}`;
                  if (formData.holdId) url += `&hold_id=${formData.holdId}`;
                  if (formData.flashVariantId) url += `&variant_id=${formData.flashVariantId}`;
                }
                router.push(url);
              }}
              className="flex-1 py-3.5 md:py-4 text-center rounded-xl border border-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors font-medium"
            >
              ย้อนกลับ
            </button>
            <button
              disabled={isContinueDisabled}
              onClick={() => {
                if (formData.selectedDate && !isContinueDisabled) {
                  const currentUrl = new URL(window.location.href);
                  const styleParam = currentUrl.searchParams.get('style');
                  let url = `/book/${shopSlug}?step=4&artist=${artist.artist_id}${styleParam ? '&style=' + styleParam : ''}`;
                  if (formData.flashId) {
                    url += `&flash_id=${formData.flashId}`;
                    if (formData.holdId) url += `&hold_id=${formData.holdId}`;
                    if (formData.flashVariantId) url += `&variant_id=${formData.flashVariantId}`;
                  }
                  router.push(url);
                }
              }}
              className="flex-1 py-3.5 md:py-4 px-6 rounded-xl font-medium transition-all flex items-center justify-center
                disabled:bg-[#1A1A1A] disabled:text-[#404040] disabled:cursor-not-allowed
                bg-[#F5F5F5] text-black hover:bg-[#E5E5E5] active:scale-[0.98]"
            >
              ดำเนินการต่อ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
