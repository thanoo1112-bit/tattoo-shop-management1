'use client';

import { useState, useMemo, useTransition } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { updateArtistDefaultCapacity, updateArtistDailyOverride } from '@/app/(dashboard)/artist/calendar/actions';
import { 
  ownerUpdateArtistDefaultCapacity, 
  ownerUpdateArtistDailyOverride 
} from '@/app/(dashboard)/owner/artists/actions';

interface Appointment {
  id: string;
  start_at: string;
  end_at?: string;
  status: string;
  customer?: { full_name: string | null } | null;
  artist?: { full_name: string | null } | null;
  project?: {
    name: string;
    tattoo_style: string;
    work_type?: string;
    color_mode?: string;
    width_cm?: number;
    height_cm?: number;
    body_placement?: string;
    agreed_price?: number | null;
  } | null;
  booking_request?: {
    payments?: { status: string; amount: number; payment_type: string }[] | null;
  } | null;
}

interface ArtistCalendarProps {
  defaultCapacity: number;
  overrides: Record<string, { capacity: number, is_closed: boolean }>;
  occupied: Record<string, number>;
  appointments: Appointment[];
  mode?: 'self' | 'owner';
  artistId?: string;
  shopId?: string;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const DAYS_OF_WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function ArtistCalendar({ 
  defaultCapacity, 
  overrides, 
  occupied, 
  appointments,
  mode = 'self',
  artistId,
  shopId
}: ArtistCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // State for Default Capacity Setting
  const [isPendingDefault, startTransitionDefault] = useTransition();
  const [localDefaultCap, setLocalDefaultCap] = useState(defaultCapacity.toString());

  // State for Daily Override Setting
  const [isPendingOverride, startTransitionOverride] = useTransition();
  const [overrideCap, setOverrideCap] = useState('');
  const [isClosed, setIsClosed] = useState(false);

  // Workflow State
  const router = useRouter();
  const supabase = createClient();
  const [confirmApp, setConfirmApp] = useState<Appointment | null>(null);
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const handleConfirmWorkflow = async () => {
    if (!confirmApp) return;
    setIsSubmittingWorkflow(true);
    setWorkflowError(null);
    
    const targetStatus = confirmApp.status === 'scheduled' ? 'in_progress' : 'completed';
    
    const { error } = await supabase.rpc('update_appointment_status', {
      p_appointment_id: confirmApp.id,
      p_status: targetStatus
    });

    if (error) {
      console.error('Workflow error:', error);
      setWorkflowError('ไม่สามารถอัปเดตสถานะคิวได้ กรุณาลองใหม่อีกครั้ง');
      setIsSubmittingWorkflow(false);
      router.refresh();
    } else {
      router.refresh();
      setConfirmApp(null);
      setIsSubmittingWorkflow(false);
    }
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const thaiYear = currentMonth.getFullYear() + 543;
  const thaiMonthName = THAI_MONTHS[currentMonth.getMonth()];

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach(app => {
      if (!app.start_at) return;
      const dateKey = app.start_at.split('T')[0];
      const list = map.get(dateKey) || [];
      list.push(app);
      map.set(dateKey, list);
    });
    return map;
  }, [appointments]);

  const handleSaveDefaultCapacity = () => {
    const val = parseInt(localDefaultCap);
    if (isNaN(val) || val <= 0) return;
    startTransitionDefault(async () => {
      if (mode === 'owner' && artistId && shopId) {
        await ownerUpdateArtistDefaultCapacity(artistId, shopId, val);
      } else {
        await updateArtistDefaultCapacity(val);
      }
    });
  };

  const openDateModal = (dateStr: string) => {
    setSelectedDate(dateStr);
    const over = overrides[dateStr];
    if (over) {
      setOverrideCap(over.capacity.toString());
      setIsClosed(over.is_closed);
    } else {
      setOverrideCap(defaultCapacity.toString());
      setIsClosed(false);
    }
  };

  const handleSaveOverride = () => {
    if (!selectedDate) return;
    const val = parseInt(overrideCap);
    
    startTransitionOverride(async () => {
      // If matches default and not closed, remove override
      if (!isClosed && !isNaN(val) && val === defaultCapacity) {
        if (mode === 'owner' && artistId && shopId) {
          await ownerUpdateArtistDailyOverride(artistId, shopId, selectedDate, null, false);
        } else {
          await updateArtistDailyOverride(selectedDate, null, false);
        }
        setSelectedDate(null);
      } else {
        const capVal = isNaN(val) ? 0 : val;
        if (mode === 'owner' && artistId && shopId) {
          await ownerUpdateArtistDailyOverride(artistId, shopId, selectedDate, capVal, isClosed);
        } else {
          await updateArtistDailyOverride(selectedDate, capVal, isClosed);
        }
        setSelectedDate(null);
      }
    });
  };

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;

  return (
    <div className="space-y-6">
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-medium text-[#F3F3F3] mb-3">จำนวนคิวปกติต่อวัน</h3>
        <div className="flex items-center gap-3 max-w-sm">
          <input 
            type="number" 
            min="1"
            value={localDefaultCap}
            onChange={(e) => setLocalDefaultCap(e.target.value)}
            className="w-20 bg-[#262626] border border-[#333] text-[#F3F3F3] px-3 py-2 rounded-md focus:outline-none focus:border-[#F3F3F3]"
          />
          <span className="text-sm text-[#9CA3AB]">คิว</span>
          <button 
            onClick={handleSaveDefaultCapacity}
            disabled={isPendingDefault || parseInt(localDefaultCap) === defaultCapacity}
            className="ml-auto bg-[#FFFFFF] text-black px-4 py-2 text-xs font-medium rounded-md hover:bg-[#E5E5E5] disabled:opacity-50 transition-colors"
          >
            {isPendingDefault ? 'บันทึก...' : 'บันทึกค่าเริ่มต้น'}
          </button>
        </div>
        <p className="text-xs text-[#747C85] mt-2">ใช้เป็นค่าเริ่มต้นสำหรับวันที่ไม่ได้ตั้งค่าเฉพาะ</p>
      </div>

      <div className="bg-[#171717] border border-[#262626] rounded-xl flex flex-col overflow-hidden shadow-md">
        <div className="p-4 border-b border-[#262626] flex items-center justify-between">
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

        <div className="grid grid-cols-7 border-b border-[#262626]">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="py-2 text-center text-xs font-medium text-[#9CA3AB]">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 bg-[#121212]">
          {blanks.map((blank) => (
            <div key={`blank-${blank}`} className="min-h-[100px] border-b border-r border-[#262626] bg-[#0A0A0A]/50" />
          ))}

          {days.map((day) => {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const todayStr = new Date().toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            
            const over = overrides[dateStr];
            const isDayClosed = over?.is_closed || false;
            const cap = over ? over.capacity : defaultCapacity;
            const occ = occupied[dateStr] || 0;
            const rem = Math.max(0, cap - occ);

            return (
              <div 
                key={day} 
                onClick={() => !isPast && openDateModal(dateStr)}
                className={`min-h-[100px] border-b border-r border-[#262626] p-1 sm:p-2 transition-colors relative group ${
                  isToday ? 'bg-[#262626]/20' : ''
                } ${isPast ? 'opacity-50 cursor-default' : 'cursor-pointer hover:bg-[#1E1E1E]'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    isToday ? 'bg-[#FFFFFF] text-black' : isPast ? 'text-[#747C85]' : 'text-[#F3F3F3]'
                  }`}>
                    {day}
                  </span>
                </div>
                
                <div className="mt-1 flex flex-col gap-1">
                  {isPast ? (
                    <span className="text-[10px] sm:text-xs text-[#747C85]">ผ่านแล้ว</span>
                  ) : isDayClosed ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 w-fit">
                      ปิดรับ
                    </span>
                  ) : (
                    <>
                      <div className="text-[10px] sm:text-xs text-[#9CA3AB]">
                        <span className={occ >= cap ? 'text-[#EF4444]' : 'text-[#F3F3F3]'}>{occ}</span> / {cap} คิว
                      </div>
                      <div className="text-[10px] sm:text-xs text-[#747C85]">
                        {occ >= cap ? 'เต็ม' : `เหลือ ${rem}`}
                      </div>
                    </>
                  )}
                </div>
                
                {appointmentsByDate.get(dateStr) && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></div>
                    <span className="text-[10px] text-[#9CA3AB]">{appointmentsByDate.get(dateStr)?.length} นัดหมาย</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Workflow Confirmation Modal */}
      {confirmApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#F3F3F3]">
                {confirmApp.status === 'scheduled' ? 'เริ่มงานสัก' : 'ยืนยันเสร็จงาน'}
              </h3>
            </div>
            <div className="p-5">
              <p className="text-[#A3A3A3] text-sm">
                {confirmApp.status === 'scheduled' 
                  ? 'ยืนยันว่าต้องการเริ่มงานสำหรับคิวนี้' 
                  : 'ยืนยันว่า Session นี้ดำเนินการเสร็จแล้ว'}
              </p>
              
              {workflowError && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{workflowError}</span>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-[#262626] flex justify-end gap-3 bg-[#121212]">
              <button 
                onClick={() => { setConfirmApp(null); setWorkflowError(null); }}
                disabled={isSubmittingWorkflow}
                className="px-4 py-2 text-sm font-medium text-[#F3F3F3] hover:bg-[#262626] rounded-md transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleConfirmWorkflow}
                disabled={isSubmittingWorkflow}
                className="px-4 py-2 text-sm font-medium bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] rounded-md transition-colors disabled:opacity-50"
              >
                {isSubmittingWorkflow 
                  ? (confirmApp.status === 'scheduled' ? 'กำลังเริ่มงาน...' : 'กำลังบันทึก...') 
                  : (confirmApp.status === 'scheduled' ? 'เริ่มงาน' : 'ยืนยันเสร็จงาน')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#F3F3F3]">
                {selectedDateObj.getDate()} {THAI_MONTHS[selectedDateObj.getMonth()]} {selectedDateObj.getFullYear() + 543}
              </h3>
              <button onClick={() => setSelectedDate(null)} className="text-[#9CA3AB] hover:text-[#FFFFFF] transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#F3F3F3]">จำนวนคิวที่รับได้วันนี้</p>
                  <p className="text-xs text-[#9CA3AB] mt-0.5">คิวที่ถูกใช้แล้ว: {occupied[selectedDate] || 0}</p>
                </div>
                <input 
                  type="number" 
                  min="0"
                  disabled={isClosed}
                  value={overrideCap}
                  onChange={(e) => setOverrideCap(e.target.value)}
                  className="w-20 bg-[#262626] border border-[#333] text-[#F3F3F3] px-3 py-2 rounded-md focus:outline-none focus:border-[#F3F3F3] disabled:opacity-50"
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-[#1E1E1E] border border-[#262626] rounded-lg cursor-pointer hover:bg-[#262626] transition-colors">
                <input 
                  type="checkbox" 
                  checked={isClosed}
                  onChange={(e) => setIsClosed(e.target.checked)}
                  className="w-4 h-4 rounded border-[#333] bg-[#121212] text-[#F3F3F3] focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-sm text-[#F3F3F3]">ปิดรับคิววันนี้</span>
              </label>

              {appointmentsByDate.get(selectedDate) && appointmentsByDate.get(selectedDate)!.length > 0 && (
                <div className="mt-6 pt-6 border-t border-[#262626]">
                  <h4 className="text-xs font-medium text-[#9CA3AB] uppercase tracking-wider mb-3">นัดหมายของวันนี้</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {appointmentsByDate.get(selectedDate)!.map(app => {
                      let uiStatus = app.status;
                      switch(app.status) {
                        case 'scheduled': uiStatus = 'ยืนยันแล้ว'; break;
                        case 'in_progress': uiStatus = 'กำลังดำเนินงาน'; break;
                        case 'completed': uiStatus = 'เสร็จสิ้น'; break;
                        case 'cancelled': uiStatus = 'ยกเลิก'; break;
                        case 'no_show': uiStatus = 'ไม่มาตามนัด'; break;
                      }

                      const depositPayment = app.booking_request?.payments?.find(p => p.payment_type === 'deposit');

                      const formatTime = (isoString: string) => {
                        return new Date(isoString).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                      };

                      const timeStr = app.start_at 
                        ? (app.end_at ? `${formatTime(app.start_at)} – ${formatTime(app.end_at)}` : formatTime(app.start_at))
                        : '';

                      return (
                      <div key={app.id} className="bg-[#121212] border border-[#262626] p-4 rounded-md space-y-3">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-semibold text-[#F3F3F3] block">
                              {app.customer?.full_name || 'ไม่ทราบชื่อลูกค้า'}
                            </span>
                            {timeStr && (
                              <span className="text-xs text-[#9CA3AB] mt-0.5 block font-medium">
                                {timeStr}
                              </span>
                            )}
                            {app.artist?.full_name && (
                              <span className="text-[11px] text-[#747C85] mt-1 block">
                                ช่าง: {app.artist.full_name}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded-full bg-[#262626] text-[#F3F3F3] border border-[#333]">
                            {uiStatus}
                          </span>
                        </div>

                        {/* Project Details */}
                        {app.project && (
                          <div className="text-xs text-[#747C85] leading-relaxed">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {app.project.tattoo_style && <span>{app.project.tattoo_style}</span>}
                              {app.project.work_type && (
                                <>
                                  <span className="text-[#333]">·</span>
                                  <span>
                                    {app.project.work_type === 'new_work' ? 'งานใหม่' :
                                     app.project.work_type === 'extension' ? 'ต่อเติมลายเดิม' :
                                     app.project.work_type === 'touch_up' ? 'เก็บงาน/เติมสี' :
                                     app.project.work_type === 'cover_up' ? 'แก้/ทับลายเดิม' :
                                     app.project.work_type === 'scar_cover' ? 'สักทับรอยแผลเป็น' :
                                     app.project.work_type}
                                  </span>
                                </>
                              )}
                              {app.project.color_mode && (
                                <>
                                  <span className="text-[#333]">·</span>
                                  <span>
                                    {app.project.color_mode === 'black_grey' ? 'Black & Grey' :
                                     app.project.color_mode === 'color' ? 'Color' :
                                     app.project.color_mode}
                                  </span>
                                </>
                              )}
                            </div>
                            
                            {(app.project.width_cm || app.project.height_cm || app.project.body_placement) && (
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[#747C85]">
                                {(app.project.width_cm || app.project.height_cm) && (
                                  <span>ขนาด: กว้าง {app.project.width_cm || '?'} ซม. × สูง {app.project.height_cm || '?'} ซม.</span>
                                )}
                                {app.project.body_placement && (
                                  <>
                                    {(app.project.width_cm || app.project.height_cm) && <span className="text-[#333]">·</span>}
                                    <span>{app.project.body_placement}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Financial Details */}
                        {((app.project && app.project.agreed_price) || depositPayment) && (
                          <div className="pt-2 border-t border-[#262626] flex justify-between items-center text-xs">
                            {app.project?.agreed_price ? (
                              <span className="text-[#9CA3AB]">
                                ราคางานสัก <strong className="text-[#F3F3F3] font-medium ml-1">฿{app.project.agreed_price.toLocaleString()}</strong>
                              </span>
                            ) : (
                              <span className="text-[#9CA3AB]">ราคา: ไม่ระบุ</span>
                            )}
                            
                            {depositPayment && (
                              <span className="text-[#9CA3AB] flex items-center gap-1">
                                มัดจำ 
                                <strong className="text-[#F3F3F3] font-medium">฿{depositPayment.amount.toLocaleString()}</strong>
                                {depositPayment.status === 'paid' && (
                                  <span className="text-[#10B981] ml-1">· ชำระแล้ว</span>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {(app.status === 'scheduled' || app.status === 'in_progress') && (
                          <div className="pt-3 border-t border-[#262626]">
                            <button
                              onClick={() => setConfirmApp(app)}
                              className="w-full py-2.5 rounded-md text-sm font-medium bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] transition-colors"
                            >
                              {app.status === 'scheduled' ? 'เริ่มงาน' : 'เสร็จงาน'}
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#262626] flex justify-end gap-3 bg-[#121212]">
              <button 
                onClick={() => setSelectedDate(null)}
                className="px-4 py-2 text-sm font-medium text-[#F3F3F3] hover:bg-[#262626] rounded-md transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleSaveOverride}
                disabled={isPendingOverride}
                className="px-4 py-2 text-sm font-medium bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] rounded-md transition-colors disabled:opacity-50"
              >
                {isPendingOverride ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
