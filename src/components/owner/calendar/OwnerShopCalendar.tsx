'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, User, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Artist {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  artist_id: string;
  request_date: string;
  preferred_time: string | null;
  end_time_str: string | null;
  status: string;
  session_number: number;
  customer_name: string;
  customer_phone: string;
  artist_name: string;
  is_flash: boolean;
  project_name: string;
  tattoo_style: string;
  body_placement: string;
  width_cm: number | null;
  height_cm: number | null;
  agreed_price: number | null;
  project_payments: any[];
  booking_requests: any[];
  artist?: { display_name: string };
}

interface OwnerShopCalendarProps {
  artists: Artist[];
  appointments: Appointment[];
  dailyCapacities: Record<string, any>; // Currently ignoring as user said 'ใช้ระบบ Daily Capacity ปัจจุบัน' but didn't provide schema, we'll try to aggregate from appointments
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const DAYS_OF_WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const STATUS_MAP: Record<string, { label: string, color: string }> = {
  scheduled: { label: 'ยืนยันแล้ว', color: 'bg-[#F5F5F5] text-black' },
  in_progress: { label: 'กำลังดำเนินการ', color: 'border border-[#F5F5F5] text-[#F5F5F5]' },
  completed: { label: 'เสร็จแล้ว', color: 'bg-[#2A2A2A] text-[#A3A3A3]' },
  cancelled: { label: 'ยกเลิก', color: 'bg-[#EF4444] text-white' },
  no_show: { label: 'ไม่มาตามนัด', color: 'bg-[#404040] text-white' },
};

export function OwnerShopCalendar({ artists, appointments, dailyCapacities }: OwnerShopCalendarProps) {
  const searchParams = useSearchParams();
  const artistParam = searchParams?.get('artistId') || 'all';

  const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedArtist, setSelectedArtist] = useState<string>(artistParam);
  const [selectedMobileDate, setSelectedMobileDate] = useState<string | null>(null);
  const [selectedApptForModal, setSelectedApptForModal] = useState<Appointment | null>(null);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedMobileDate(null);
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedMobileDate(null);
  };

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const thaiYear = currentMonth.getFullYear() + 543;
  const thaiMonthName = THAI_MONTHS[currentMonth.getMonth()];

  const filteredAppointments = useMemo(() => {
    return appointments.filter(app => {
      if (selectedArtist !== 'all' && app.artist_id !== selectedArtist) return false;
      return true;
    });
  }, [appointments, selectedArtist]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    filteredAppointments.forEach(app => {
      if (!app.request_date) return;
      const list = map.get(app.request_date) || [];
      list.push(app);
      map.set(app.request_date, list);
    });
    return map;
  }, [filteredAppointments]);

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl flex flex-col overflow-hidden shadow-md">
      {/* Toolbar */}
      <div className="p-4 border-b border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="text-xs font-medium px-3 py-1.5 bg-[#262626] hover:bg-[#333333] text-[#F3F3F3] rounded-md transition-colors">
            วันนี้
          </button>
          <div className="flex items-center space-x-2">
            <button onClick={handlePrevMonth} className="p-1.5 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#262626] transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-sm font-medium text-[#F3F3F3] min-w-[120px] text-center tracking-wide">
              {thaiMonthName} {thaiYear}
            </h3>
            <button onClick={handleNextMonth} className="p-1.5 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#262626] transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        
        <div>
          <select 
            value={selectedArtist}
            onChange={(e) => setSelectedArtist(e.target.value)}
            className="w-full sm:w-auto bg-[#0A0A0A] border border-[#262626] text-[#F3F3F3] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#404040]"
          >
            <option value="all">ช่างทั้งหมด</option>
            {artists.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar Grid - Desktop */}
      <div className="hidden md:block flex-1 p-4 bg-[#121212]">
        <div className="grid grid-cols-7 mb-2">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center text-xs font-medium text-[#9CA3AB] uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 border-t border-l border-[#262626] rounded-sm overflow-hidden">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="border-r border-b border-[#262626] min-h-[120px] bg-[#0A0A0A]/50"></div>
          ))}
          
          {days.map(day => {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const mStr = String(date.getMonth() + 1).padStart(2, '0');
            const dStr = String(date.getDate()).padStart(2, '0');
            const dateKey = `${date.getFullYear()}-${mStr}-${dStr}`;
            
            const dayApps = appointmentsByDate.get(dateKey) || [];
            
            return (
              <div key={day} className="border-r border-b border-[#262626] min-h-[120px] p-2 flex flex-col bg-[#171717]">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm ${dayApps.length > 0 ? 'text-[#F3F3F3] font-medium' : 'text-[#9CA3AB]'}`}>
                    {day}
                  </span>
                  {dayApps.length > 0 && (
                    <span className="text-[10px] text-[#9CA3AB]">{dayApps.length} คิว</span>
                  )}
                </div>
                
                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[100px] no-scrollbar">
                  {dayApps.slice(0, 3).map(app => {
                    const statusInfo = STATUS_MAP[app.status] || { label: app.status, color: 'bg-[#262626] text-[#9CA3AB]' };
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedApptForModal(app);
                        }}
                        className="w-full text-left text-[10px] bg-[#121212] hover:bg-[#1E1E1E] border border-[#262626] rounded p-1.5 flex flex-col gap-0.5 shadow-sm cursor-pointer transition-colors"
                      >
                        <div className="flex justify-between items-center text-[#9CA3AB] text-[9px] font-semibold gap-1">
                          <span className={app.is_flash ? 'text-purple-400' : 'text-gray-400'}>
                            {app.is_flash ? '⚡ FLASH' : '✏️ CUSTOM'}
                          </span>
                          <span className="shrink-0">{app.preferred_time || ''}{app.end_time_str ? `–${app.end_time_str}` : ''}</span>
                        </div>
                        <div className="font-semibold text-[#F5F5F5] truncate text-[9.5px]">
                          ล/ค: {app.customer_name}
                        </div>
                        <div className="text-[#A3A3A3] truncate text-[9px]">
                          ช่าง: {app.artist_name}
                        </div>
                        <span className={`inline-block px-1 py-0.5 rounded-[3px] text-[8px] w-fit font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </button>
                    );
                  })}
                  {dayApps.length > 3 && (
                    <div className="text-[10px] text-[#9CA3AB] text-center pt-1">+ อีก {dayApps.length - 3} คิว</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar Grid - Mobile */}
      <div className="md:hidden flex-1 p-4 bg-[#121212]">
        <div className="grid grid-cols-7 mb-2">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center text-xs font-medium text-[#9CA3AB]">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-y-2 gap-x-1">
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="aspect-square"></div>
          ))}
          
          {days.map(day => {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const mStr = String(date.getMonth() + 1).padStart(2, '0');
            const dStr = String(date.getDate()).padStart(2, '0');
            const dateKey = `${date.getFullYear()}-${mStr}-${dStr}`;
            
            const dayApps = appointmentsByDate.get(dateKey) || [];
            const isSelected = selectedMobileDate === dateKey;
            
            return (
              <button
                key={day}
                onClick={() => setSelectedMobileDate(isSelected ? null : dateKey)}
                className={`w-full aspect-square flex flex-col items-center justify-center rounded-full text-sm transition-all relative ${
                  isSelected ? 'bg-[#F5F5F5] text-[#0A0A0A] font-semibold' : 'text-[#9CA3AB] hover:bg-[#262626]'
                } ${dayApps.length > 0 && !isSelected ? 'text-[#F3F3F3] font-medium' : ''}`}
              >
                <span>{day}</span>
                {dayApps.length > 0 && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-[#F5F5F5] absolute bottom-1.5"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile Agenda View */}
        {selectedMobileDate && (
          <div className="mt-6 pt-6 border-t border-[#262626]">
            <h4 className="text-sm font-medium text-[#F3F3F3] mb-4 tracking-wide">
              วันที่ {parseInt(selectedMobileDate.split('-')[2])} {thaiMonthName}
            </h4>
            
            {(() => {
              const dayApps = appointmentsByDate.get(selectedMobileDate) || [];
              if (dayApps.length === 0) {
                return <p className="text-sm text-[#9CA3AB]">ไม่มีคิวงานในวันนี้</p>;
              }
              
              return (
                <div className="space-y-3">
                  {dayApps.map(app => {
                    const statusInfo = STATUS_MAP[app.status] || { label: app.status, color: 'bg-[#262626] text-[#9CA3AB]' };
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setSelectedApptForModal(app)}
                        className="w-full text-left bg-[#171717] hover:bg-[#202020] border border-[#262626] rounded-lg p-3 flex justify-between items-start shadow-sm cursor-pointer transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-semibold ${app.is_flash ? 'text-purple-400' : 'text-gray-400'}`}>
                              {app.is_flash ? '⚡ FLASH' : '✏️ CUSTOM'}
                            </span>
                            <span className="text-[10px] text-[#737373]">•</span>
                            <p className="text-xs font-semibold text-[#F3F3F3]">ล/ค: {app.customer_name}</p>
                          </div>
                          <p className="text-[11px] text-[#A3A3A3]">ช่าง: {app.artist_name}</p>
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-medium ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="text-xs text-[#9CA3AB] shrink-0">
                          {app.preferred_time || ''}{app.end_time_str ? `–${app.end_time_str}` : ''} น.
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedApptForModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#262626] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F5] flex items-center gap-2">
                <span>รายละเอียดนัดหมาย</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                  selectedApptForModal.is_flash 
                    ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' 
                    : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                }`}>
                  {selectedApptForModal.is_flash ? 'FLASH' : 'CUSTOM'}
                </span>
              </h3>
              <button 
                type="button" 
                onClick={() => setSelectedApptForModal(null)}
                className="p-1 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs text-[#A3A3A3]">
              {/* Main info card */}
              <div className="bg-[#0A0A0A] border border-[#262626] rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span>ชื่อลูกค้า:</span>
                  <span className="text-[#F5F5F5] font-medium">{selectedApptForModal.customer_name}</span>
                </div>
                {selectedApptForModal.customer_phone && (
                  <div className="flex justify-between">
                    <span>เบอร์ติดต่อ:</span>
                    <span className="text-[#F5F5F5] font-medium">{selectedApptForModal.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>ช่างสัก:</span>
                  <span className="text-[#F5F5F5] font-medium">{selectedApptForModal.artist_name}</span>
                </div>
                <div className="flex justify-between border-t border-[#262626] pt-2">
                  <span>วันที่นัด:</span>
                  <span className="text-[#F5F5F5] font-medium">
                    {selectedApptForModal.request_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>เวลานัด:</span>
                  <span className="text-[#F5F5F5] font-medium">
                    {selectedApptForModal.preferred_time || ''}{selectedApptForModal.end_time_str ? ` – ${selectedApptForModal.end_time_str}` : ''} น.
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Session:</span>
                  <span className="text-[#F5F5F5] font-medium"># {selectedApptForModal.session_number}</span>
                </div>
                <div className="flex justify-between">
                  <span>สถานะนัดหมาย:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    STATUS_MAP[selectedApptForModal.status]?.color || 'bg-[#262626] text-[#9CA3AB]'
                  }`}>
                    {STATUS_MAP[selectedApptForModal.status]?.label || selectedApptForModal.status}
                  </span>
                </div>
              </div>

              {/* Project Details */}
              <div className="space-y-2">
                <h4 className="font-semibold text-[#F5F5F5] uppercase tracking-wider text-[10px]">รายละเอียดลายสัก</h4>
                <div className="bg-[#121212] border border-[#262626] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span>ชื่องานสัก:</span>
                    <span className="text-[#F5F5F5] font-medium truncate max-w-[180px]">{selectedApptForModal.project_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>สไตล์:</span>
                    <span className="text-[#F5F5F5]">{selectedApptForModal.tattoo_style}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ตำแหน่ง:</span>
                    <span className="text-[#F5F5F5]">{selectedApptForModal.body_placement}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ขนาดแนะนำ:</span>
                    <span className="text-[#F5F5F5]">
                      {selectedApptForModal.width_cm && selectedApptForModal.height_cm 
                        ? `${selectedApptForModal.width_cm} × ${selectedApptForModal.height_cm} ซม.` 
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Summary */}
              {(() => {
                const projectPayments = selectedApptForModal.project_payments || [];
                const brPayments = selectedApptForModal.booking_requests?.flatMap((br: any) => br.payments || []) || [];
                const allPayments = [...projectPayments, ...brPayments];
                const paidTotal = allPayments.filter((p: any) => p.status === 'paid').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
                const agreedPrice = selectedApptForModal.agreed_price !== null ? Number(selectedApptForModal.agreed_price) : null;
                const remaining = agreedPrice !== null ? Math.max(0, agreedPrice - paidTotal) : null;

                return (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#F5F5F5] uppercase tracking-wider text-[10px]">การชำระเงินโดยสรุป</h4>
                    <div className="bg-[#121212] border border-[#262626] rounded-lg p-3 space-y-2">
                      <div className="flex justify-between">
                        <span>ราคางานสัก:</span>
                        <span className="text-[#F5F5F5] font-semibold">
                          {agreedPrice !== null ? `฿${agreedPrice.toLocaleString()}` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>ชำระเงินแล้ว:</span>
                        <span className="text-emerald-400">฿{paidTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#262626] pt-2 font-semibold">
                        <span>ยอดคงเหลือ:</span>
                        <span className={remaining && remaining > 0 ? 'text-yellow-500' : 'text-[#F5F5F5]'}>
                          {remaining !== null ? `฿${remaining.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Action Button */}
            <div className="p-4 border-t border-[#262626] bg-[#121212]">
              <Link
                href="/owner/appointments"
                className="w-full inline-flex justify-center items-center gap-1.5 px-4 h-10 rounded-lg bg-[#F5F5F5] hover:bg-white text-black text-sm font-semibold transition-colors cursor-pointer"
              >
                <span>จัดการคิว →</span>
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
