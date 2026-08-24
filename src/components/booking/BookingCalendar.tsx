'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DailyAvailability } from './BookingCalendarFlow';

interface BookingCalendarProps {
  availabilityMap: Map<string, DailyAvailability>;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
}

function getTodayBKK() {
  const parts = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Asia/Bangkok', 
    year: 'numeric', month: 'numeric', day: 'numeric' 
  }).formatToParts(new Date());
  const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
  const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  return new Date(y, m, d);
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const DAYS_OF_WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function BookingCalendar({ availabilityMap, selectedDateKey, onSelectDate }: BookingCalendarProps) {
  const today = useMemo(() => getTodayBKK(), []);
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isPrevDisabled = currentMonth.getFullYear() === today.getFullYear() && currentMonth.getMonth() === today.getMonth();

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const thaiYear = currentMonth.getFullYear() + 543;
  const thaiMonthName = THAI_MONTHS[currentMonth.getMonth()];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 px-2">
        <h3 className="text-lg font-semibold text-[#F5F5F5]">
          {thaiMonthName} {thaiYear}
        </h3>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handlePrevMonth}
            disabled={isPrevDisabled}
            className="p-2 rounded-full text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#171717] disabled:text-[#404040] disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={handleNextMonth}
            className="p-2 rounded-full text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#171717] transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 mb-5 text-[11px] sm:text-xs text-[#A3A3A3]">
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F5F5F5] mr-1.5 drop-shadow-[0_0_4px_rgba(255,255,255,0.25)]"></span>
            <span>ว่าง</span>
          </div>
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 rounded-full border border-[#F5F5F5] mr-1.5"></span>
            <span>ยังรับได้</span>
          </div>
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 bg-[#404040] rounded-full mr-1.5"></span>
            <span>เต็ม</span>
          </div>
          <div className="flex items-center text-[#404040] font-bold mr-1.5">
            × <span className="ml-1 font-normal">ปิดรับคิว</span>
          </div>
        </div>
      </div>

      <div className="bg-[#262626] border border-[#262626] rounded-xl overflow-hidden flex flex-col">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 bg-[#121212] border-b border-[#262626]">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center text-[13px] sm:text-sm font-medium text-[#A3A3A3] py-2.5 sm:py-3">
              {day}
            </div>
          ))}
        </div>
        
        {/* Dates Grid */}
        <div className="grid grid-cols-7 gap-[1px] bg-[#262626]">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="bg-[#121212] min-h-[64px] sm:min-h-[84px]"></div>
          ))}
          
          {days.map(day => {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            
            const mStr = String(date.getMonth() + 1).padStart(2, '0');
            const dStr = String(date.getDate()).padStart(2, '0');
            const dateKey = `${date.getFullYear()}-${mStr}-${dStr}`;

            const isToday = date.getTime() === today.getTime();
            const isPast = date.getTime() < today.getTime();
            const isSelected = selectedDateKey === dateKey;
            
            const dayData = availabilityMap.get(dateKey);
            
            let cellClass = "bg-[#121212] relative flex flex-col items-center justify-start pt-2 sm:pt-3 min-h-[64px] sm:min-h-[84px] w-full focus:outline-none transition-colors ";
            
            let Indicator = null;

            if (isPast) {
              cellClass += "cursor-default";
            } else if (dayData) {
               if (isSelected) {
                 cellClass += "bg-[#1A1A1A]";
               } else if (dayData.status === 'FULL' || dayData.status === 'CLOSED') {
                 cellClass += "cursor-not-allowed";
               } else {
                 cellClass += "cursor-pointer hover:bg-[#1A1A1A]";
               }

               if (dayData.status === 'AVAILABLE') {
                 Indicator = <span className="w-1.5 h-1.5 rounded-full bg-[#F5F5F5] drop-shadow-[0_0_4px_rgba(245,245,245,0.25)]"></span>;
               } else if (dayData.status === 'LIMITED') {
                 Indicator = <span className="w-1.5 h-1.5 rounded-full border border-[#F5F5F5]"></span>;
               } else if (dayData.status === 'FULL') {
                 Indicator = <span className="w-1.5 h-1.5 rounded-full bg-[#404040]"></span>;
               } else if (dayData.status === 'CLOSED') {
                 Indicator = <span className="text-[11px] text-[#404040] font-bold leading-none">×</span>;
               }
            } else {
              cellClass += "cursor-default";
            }

            let numClass = "flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full z-10 relative text-sm sm:text-base transition-colors ";
            
            if (isPast) {
              numClass += "text-[#404040]";
            } else if (dayData) {
               if (isSelected) {
                 numClass += "bg-[#F5F5F5] text-[#0A0A0A] font-semibold drop-shadow-md";
               } else {
                 if (dayData.status === 'AVAILABLE' || dayData.status === 'LIMITED') {
                   numClass += "text-[#F5F5F5] font-medium";
                 } else if (dayData.status === 'FULL') {
                   numClass += "text-[#737373]";
                 } else if (dayData.status === 'CLOSED') {
                   numClass += "text-[#525252]";
                 }
               }
  
               if (isToday && !isSelected) {
                 numClass += " border border-[#525252]";
               }
            } else {
              numClass += "text-[#404040]";
            }

            return (
              <button
                key={day}
                disabled={isPast || !dayData || dayData.status === 'FULL' || dayData.status === 'CLOSED'}
                onClick={() => onSelectDate(dateKey)}
                className={cellClass}
              >
                <div className={numClass}>
                  {day}
                </div>
                {!isSelected && Indicator && (
                  <div className="absolute bottom-2 sm:bottom-3 flex justify-center w-full">
                    {Indicator}
                  </div>
                )}
              </button>
            );
          })}
          
          {Array.from({ length: (7 - ((blanks.length + days.length) % 7)) % 7 }, (_, i) => (
            <div key={`trailing-${i}`} className="bg-[#121212] min-h-[64px] sm:min-h-[84px]"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
