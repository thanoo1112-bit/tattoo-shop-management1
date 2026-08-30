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
      {/* Month header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-[#F5F5F5]">
          {thaiMonthName} {thaiYear}
        </h3>
        <div className="flex items-center space-x-1">
          <button 
            onClick={handlePrevMonth}
            disabled={isPrevDisabled}
            className="p-1.5 rounded-full text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#171717] disabled:text-[#404040] disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={handleNextMonth}
            className="p-1.5 rounded-full text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#171717] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Legend — compact single row */}
      <div className="flex items-center gap-x-3 mb-2 text-[10px] text-[#737373]">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F5F5F5]"></span>ว่าง
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full border border-[#F5F5F5]"></span>ยังรับได้
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#404040]"></span>เต็ม
        </div>
        <div className="flex items-center gap-1 text-[#404040] font-bold">× <span className="font-normal">ปิดรับ</span></div>
      </div>

      <div className="bg-[#262626] border border-[#262626] rounded-xl overflow-hidden flex flex-col">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 bg-[#121212] border-b border-[#262626]">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center text-[11px] font-medium text-[#A3A3A3] py-1.5">
              {day}
            </div>
          ))}
        </div>
        
        {/* Dates Grid */}
        <div className="grid grid-cols-7 gap-[1px] bg-[#262626]">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="bg-[#121212] h-[42px]"></div>
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
            
            let cellClass = "bg-[#121212] relative flex flex-col items-center justify-center h-[42px] w-full focus:outline-none transition-colors ";
            
            let Indicator = null;

            if (isPast || isToday) {
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
                 Indicator = <span className="w-1 h-1 rounded-full bg-[#F5F5F5] drop-shadow-[0_0_4px_rgba(245,245,245,0.25)]"></span>;
               } else if (dayData.status === 'LIMITED') {
                 Indicator = <span className="w-1 h-1 rounded-full border border-[#F5F5F5]"></span>;
               } else if (dayData.status === 'FULL') {
                 Indicator = <span className="w-1 h-1 rounded-full bg-[#404040]"></span>;
               } else if (dayData.status === 'CLOSED') {
                 Indicator = <span className="text-[10px] text-[#404040] font-bold leading-none">×</span>;
               }
            } else {
              cellClass += "cursor-default";
            }

            let numClass = "flex items-center justify-center w-7 h-7 rounded-full z-10 relative text-xs transition-colors ";
            
            if (isPast || isToday) {
              numClass += "text-[#404040]";
              if (isToday && !isSelected) {
                numClass += " border border-[#404040]/30";
              }
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
            } else {
              numClass += "text-[#404040]";
            }

            return (
              <button
                key={day}
                disabled={isPast || isToday || !dayData || dayData.status === 'FULL' || dayData.status === 'CLOSED'}
                onClick={() => onSelectDate(dateKey)}
                className={cellClass}
              >
                <div className={numClass}>
                  {day}
                </div>
                {!isSelected && Indicator && (
                  <div className="absolute bottom-0.5 flex justify-center w-full">
                    {Indicator}
                  </div>
                )}
              </button>
            );
          })}
          
          {Array.from({ length: (7 - ((blanks.length + days.length) % 7)) % 7 }, (_, i) => (
            <div key={`trailing-${i}`} className="bg-[#121212] h-[42px]"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
