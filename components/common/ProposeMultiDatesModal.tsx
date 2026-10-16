'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CalendarClock, AlertCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import DualTimePicker from '@/components/estimate/DualTimePicker';

interface ProposeMultiDatesModalProps {
  isOpen: boolean;
  estimateRequestId: string | null;
  flashReservationId?: string | null;
  requestCode?: string | null;
  customerName?: string | null;
  tattooSize?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  defaultDate?: string | null;
  defaultTime?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PREDEFINED_REASONS = [
  'งานมีรายละเอียด ต้องใช้เวลาเตรียมแบบร่าง / ออกแบบเพิ่ม',
  'วันที่ลูกค้าเลือกคิวเต็มหรือช่างติดนัด',
  'วันนัดกระชั้นเกินไป ช่างเตรียมอุปกรณ์ไม่ทัน',
];

const mapFlashProposeError = (rawErrorMsg?: string | null): string => {
  if (!rawErrorMsg) return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';

  const lower = rawErrorMsg.toLowerCase();

  // 1. Capacity limit (3 jobs / day)
  if (
    rawErrorMsg.includes('เต็ม') ||
    rawErrorMsg.includes('3 คิว') ||
    rawErrorMsg.includes('3 งาน') ||
    lower.includes('capacity')
  ) {
    return 'วันที่นี้คิวของช่างเต็ม 3 งานแล้ว กรุณาเลือกวันอื่น';
  }

  // 2. Blocked date / Artist unavailable
  if (
    rawErrorMsg.includes('ไม่พร้อมให้บริการ') ||
    rawErrorMsg.includes('ไม่ว่าง') ||
    lower.includes('blocked')
  ) {
    return 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาเลือกวันอื่น';
  }

  // 3. Permission / unauthorized / role check
  if (
    rawErrorMsg.includes('ไม่มีสิทธิ์') ||
    lower.includes('permission denied') ||
    lower.includes('unauthorized') ||
    lower.includes('42501') ||
    lower.includes('authentication required')
  ) {
    return 'คุณไม่มีสิทธิ์ดำเนินการคำขอนี้';
  }

  // 4. Known business validation errors
  if (rawErrorMsg.includes('ย้อนหลัง')) {
    return 'ไม่สามารถเลือกวันนัดหมายย้อนหลังได้';
  }
  if (rawErrorMsg.includes('10:00 - 23:00')) {
    return 'เวลาที่เสนอต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.';
  }
  if (rawErrorMsg.includes('ไม่พบคำขอ')) {
    return 'ไม่พบคำขอจองลาย Flash ที่ระบุ';
  }
  if (rawErrorMsg.includes('PENDING') || rawErrorMsg.includes('รอตรวจสอบ')) {
    return 'สามารถเสนอวันใหม่ได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบเท่านั้น';
  }

  // 5. Fallback for raw DB/server errors (e.g. relation does not exist, syntax error)
  return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
};

export default function ProposeMultiDatesModal({
  isOpen,
  estimateRequestId,
  flashReservationId,
  requestCode,
  customerName,
  tattooSize,
  preferredDate,
  preferredTime,
  defaultDate,
  defaultTime,
  onClose,
  onSuccess,
}: ProposeMultiDatesModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const getTodayBangkokStr = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  };

  const formatThaiDateDisplay = (dateStr?: string | null) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const d = dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T00:00:00+07:00`);
      return new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('10:00');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isNoteManuallyEdited, setIsNoteManuallyEdited] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      const rawBaseTime = defaultTime || preferredTime || '10:00';
      const baseTime = rawBaseTime.length >= 5 ? rawBaseTime.slice(0, 5) : '10:00';
      const baseDate = defaultDate || preferredDate || getTodayBangkokStr();

      setSelectedDate(baseDate);
      setSelectedTime(baseTime);
      setSelectedReason('');
      setNote('');
      setIsNoteManuallyEdited(false);
      setErrorMsg(null);

      // If defaultDate was not provided by parent, fetch latest active PENDING proposal
      if (!defaultDate && flashReservationId) {
        (async () => {
          try {
            const supabase = createClient();
            const { data, error } = await supabase
              .from('flash_reservations')
              .select('proposed_date, proposed_time, proposal_note')
              .eq('id', flashReservationId)
              .maybeSingle();

            if (!error && data && isMounted) {
              if (data.proposed_date) {
                setSelectedDate(data.proposed_date);
              }
              if (data.proposed_time) {
                const optTime = data.proposed_time.length >= 5 ? data.proposed_time.slice(0, 5) : data.proposed_time;
                setSelectedTime(optTime);
              }
            }
          } catch (err) {
            console.error('Failed to load flash proposal in modal:', err);
          }
        })();
      } else if (!defaultDate && estimateRequestId) {
        (async () => {
          try {
            const supabase = createClient();
            const { data, error } = await supabase
              .from('estimate_request_date_options')
              .select('proposed_date, proposed_time, status, created_at')
              .eq('estimate_request_id', estimateRequestId)
              .eq('status', 'PENDING')
              .order('created_at', { ascending: false })
              .limit(1);

            if (!error && data && data.length > 0 && isMounted) {
              const latest = data[0];
              if (latest.proposed_date) {
                setSelectedDate(latest.proposed_date);
              }
              if (latest.proposed_time) {
                const optTime = latest.proposed_time.length >= 5 ? latest.proposed_time.slice(0, 5) : latest.proposed_time;
                setSelectedTime(optTime);
              }
            }
          } catch (err) {
            console.error('Failed to load latest proposed option in modal:', err);
          }
        })();
      }
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, defaultDate, defaultTime, preferredDate, preferredTime, estimateRequestId, flashReservationId]);

  // Generate message based on selected reason
  useEffect(() => {
    if (!isNoteManuallyEdited) {
      if (selectedReason) {
        setNote(
          `ขออภัย ทางร้านไม่สะดวกในวันเดิม (${selectedReason}) จึงขอเสนอวันนัดหมายใหม่ให้คุณพิจารณา`
        );
      } else {
        setNote(
          'ขออภัย ทางร้านไม่สะดวกในวันเดิม จึงขอเสนอวันนัดหมายใหม่ให้คุณพิจารณา'
        );
      }
    }
  }, [selectedReason, isNoteManuallyEdited]);

  if (!isOpen || (!estimateRequestId && !flashReservationId) || !mounted) return null;

  const isFormValid = () => {
    if (!selectedDate || !selectedTime) return false;
    if (!selectedReason) return false;
    if (!note.trim()) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!estimateRequestId && !flashReservationId) || !isFormValid()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const formattedTime = selectedTime.length === 5 ? `${selectedTime}:00` : selectedTime;

      if (flashReservationId) {
        const { data, error } = await supabase.rpc('artist_propose_flash_reservation_date', {
          p_reservation_id: flashReservationId,
          p_proposed_date: selectedDate,
          p_proposed_time: formattedTime,
          p_note: note.trim(),
        });

        if (error || !data?.success) {
          const rawErr = error?.message || data?.error;
          setErrorMsg(mapFlashProposeError(rawErr));
        } else {
          onSuccess();
          onClose();
        }
      } else if (estimateRequestId) {
        const formattedOptions = [
          {
            date: selectedDate,
            time: formattedTime,
          },
        ];

        const { data, error } = await supabase.rpc('artist_propose_multi_booking_dates', {
          p_estimate_request_id: estimateRequestId,
          p_date_options: formattedOptions,
          p_artist_note: note.trim(),
        });

        if (error || !data?.success) {
          setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการส่งข้อเสนอให้ลูกค้า');
        } else {
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      if (flashReservationId) {
        setErrorMsg(mapFlashProposeError(err?.message));
      } else {
        setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reqCodeDisplay = requestCode || (flashReservationId ? `FLASH-${flashReservationId.slice(0, 8).toUpperCase()}` : (estimateRequestId ? `REQ-${estimateRequestId.slice(0, 8).toUpperCase()}` : 'REQ-'));
  const originalDateText = formatThaiDateDisplay(preferredDate);
  const originalTimeText = preferredTime ? (preferredTime.length === 5 ? `${preferredTime} น.` : `${preferredTime}`) : '';

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
      <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-lg p-4 sm:p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-auto max-h-[90dvh] overflow-y-auto font-prompt">
        
        {/* 1. Header */}
        <div className="flex items-start justify-between border-b border-studio-border pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-400 shrink-0">
              <CalendarClock size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-studio-primary">ขอเสนอวันและเวลานัดหมายใหม่</h3>
              <div className="flex items-center space-x-2 text-[11px] text-studio-muted mt-0.5 flex-wrap">
                <span className="font-mono font-bold text-amber-300">{reqCodeDisplay}</span>
                {customerName && (
                  <>
                    <span>·</span>
                    <span>{customerName}</span>
                  </>
                )}
                {tattooSize && (
                  <>
                    <span>·</span>
                    <span>ขนาด {tattooSize}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-studio-secondary hover:text-white cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. Display Original Date */}
        {preferredDate && (
          <div className="p-3 bg-studio-sec/80 border border-studio-border rounded-xl flex items-center justify-between text-xs">
            <span className="text-studio-secondary font-medium">วันที่ลูกค้าขอนัดมา:</span>
            <span className="text-red-400 line-through font-semibold font-mono">
              {originalDateText} {originalTimeText && `· ${originalTimeText}`}
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* 3. Step 1: Appointment Option (Single Option) */}
          <div className="space-y-2.5">
            <label className="font-semibold text-studio-primary text-xs block">
              1. เลือกวันและเวลานัดหมายใหม่
            </label>

            <div className="p-3 bg-studio-sec/70 border border-studio-border rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-studio-secondary mb-1">วันที่นัดหมาย *</label>
                  <input
                    type="date"
                    min={getTodayBangkokStr()}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-studio-card border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-amber-500 [color-scheme:dark] cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-studio-secondary mb-1">เวลาที่สะดวกเริ่มสัก * (10:00 - 23:00 น.)</label>
                  <DualTimePicker
                    value={selectedTime}
                    onChange={(val) => setSelectedTime(val)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Step 2: Specify Reason */}
          <div className="space-y-2 pt-2 border-t border-studio-border">
            <label className="font-semibold text-studio-primary text-xs block">
              2. ระบุเหตุผลที่ต้องเลื่อนนัด
            </label>
            <div className="space-y-1.5">
              {PREDEFINED_REASONS.map((r, idx) => {
                const isSelected = selectedReason === r;
                return (
                  <label
                    key={idx}
                    onClick={() => {
                      setSelectedReason(r);
                    }}
                    className={`p-2.5 rounded-xl border transition-all flex items-center space-x-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200 font-medium'
                        : 'bg-studio-sec/60 border-studio-border hover:border-amber-800/60 text-studio-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="propose_reason"
                      checked={isSelected}
                      onChange={() => setSelectedReason(r)}
                      className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                    />
                    <span className="text-xs leading-normal">{r}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 5. Step 3: Message to Customer */}
          <div className="space-y-1.5 pt-2 border-t border-studio-border">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-studio-primary text-xs">
                3. ข้อความแจ้งเตือนถึงลูกค้า:
              </label>
              <span className="text-[10px] text-studio-muted">
                พิมพ์ปรับแก้ไขเพิ่มเติมได้
              </span>
            </div>
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setIsNoteManuallyEdited(true);
              }}
              placeholder="ข้อความถึงลูกค้า..."
              className="w-full bg-studio-sec border border-studio-border rounded-xl p-3 text-xs text-studio-primary focus:outline-none focus:border-amber-500 leading-relaxed"
            />
          </div>

          {/* 6. Footer */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-studio-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-semibold text-xs cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid()}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'กำลังบันทึก...' : 'ส่งข้อเสนอวันนัดให้ลูกค้า'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
