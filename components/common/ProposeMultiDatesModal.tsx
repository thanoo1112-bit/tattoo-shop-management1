'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CalendarClock, Plus, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ProposeMultiDatesModalProps {
  isOpen: boolean;
  estimateRequestId: string | null;
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

export default function ProposeMultiDatesModal({
  isOpen,
  estimateRequestId,
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

  const [options, setOptions] = useState<{ date: string; time: string }[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isNoteManuallyEdited, setIsNoteManuallyEdited] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const baseDate = defaultDate || preferredDate || getTodayBangkokStr();
      const baseTime = defaultTime || preferredTime || '10:00';
      setOptions([
        { date: baseDate, time: baseTime },
      ]);
      setSelectedReason('');
      setNote('');
      setIsNoteManuallyEdited(false);
      setErrorMsg(null);
    }
  }, [isOpen, defaultDate, defaultTime, preferredDate, preferredTime]);

  // Generate message based on selected reason
  useEffect(() => {
    if (!isNoteManuallyEdited) {
      if (selectedReason) {
        setNote(
          `ขออภัย ทางร้านไม่สะดวกในวันเดิม (${selectedReason}) จึงขอเสนอวันนัดหมายใหม่ให้คุณเลือก กรุณาเลือกวันและเวลาที่สะดวกที่สุด`
        );
      } else {
        setNote(
          'ขออภัย ทางร้านไม่สะดวกในวันเดิม จึงขอเสนอวันนัดหมายใหม่ให้คุณเลือก กรุณาเลือกวันและเวลาที่สะดวกที่สุด'
        );
      }
    }
  }, [selectedReason, isNoteManuallyEdited]);

  if (!isOpen || !estimateRequestId || !mounted) return null;

  const handleAddOption = () => {
    if (options.length >= 3) return;
    const baseDate = options[options.length - 1]?.date || getTodayBangkokStr();
    setOptions([...options, { date: baseDate, time: '16:00' }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 1) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, field: 'date' | 'time', value: string) => {
    const next = [...options];
    next[index] = { ...next[index], [field]: value };
    setOptions(next);
  };

  const isFormValid = () => {
    if (options.length < 1) return false;
    for (const opt of options) {
      if (!opt.date || !opt.time) return false;
    }
    if (!selectedReason) return false;
    if (!note.trim()) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estimateRequestId || !isFormValid()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const formattedOptions = options.map((opt) => ({
        date: opt.date,
        time: opt.time.length === 5 ? `${opt.time}:00` : opt.time,
      }));

      const { data, error } = await supabase.rpc('artist_propose_multi_booking_dates', {
        p_estimate_request_id: estimateRequestId,
        p_date_options: formattedOptions,
        p_artist_note: note.trim(),
      });

      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการส่งตัวเลือกให้ลูกค้า');
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  };

  const reqCodeDisplay = requestCode || (estimateRequestId ? `REQ-${estimateRequestId.slice(0, 8).toUpperCase()}` : 'REQ-');
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
          
          {/* 3. Step 1: Appointment Options */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-studio-primary text-xs flex items-center gap-1.5">
                <span>1. เลือกวันนัดหมายที่ต้องการเสนอ (เลือกได้ 1–3 วัน):</span>
              </label>
              <span className="text-[11px] font-mono text-amber-400 font-bold bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                เลือกแล้ว {options.length} / 3 วัน
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-studio-sec/70 border border-studio-border rounded-xl space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300 text-[11px] flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-700/80 text-amber-400 text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      ตัวเลือกที่ {idx + 1}
                    </span>
                    {options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="text-studio-muted hover:text-red-400 p-1 transition-colors cursor-pointer"
                        title="ลบตัวเลือกนี้"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-studio-secondary mb-1">วันที่นัดหมาย *</label>
                      <input
                        type="date"
                        min={getTodayBangkokStr()}
                        value={opt.date}
                        onChange={(e) => handleOptionChange(idx, 'date', e.target.value)}
                        className="w-full bg-studio-card border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-amber-500 [color-scheme:dark] cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-studio-secondary mb-1">เวลานัดหมาย *</label>
                      <input
                        type="time"
                        value={opt.time}
                        onChange={(e) => handleOptionChange(idx, 'time', e.target.value)}
                        className="w-full bg-studio-card border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-amber-500 font-mono [color-scheme:dark] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {options.length < 3 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="w-full py-2 px-3 bg-amber-950/40 hover:bg-amber-950/70 border border-dashed border-amber-700/60 rounded-xl text-amber-300 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} className="text-amber-400" />
                <span>เพิ่มตัวเลือกวันนัด</span>
              </button>
            )}
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
