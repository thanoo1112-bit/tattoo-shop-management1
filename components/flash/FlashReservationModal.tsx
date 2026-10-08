'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import PlacementSelector from '@/components/estimate/PlacementSelector';
import TattooSizeInput from '@/components/estimate/TattooSizeInput';
import DatePickerPopover from '@/components/booking/DatePickerPopover';
import DualTimePicker from '@/components/estimate/DualTimePicker';
import { getThailandTodayStr } from '@/components/portal/portalUtils';
import {
  X,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  MapPin,
  Maximize2,
  Palette,
  Image as ImageIcon,
  Lock,
  FileText,
  ZoomIn,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';

export interface FlashDesignData {
  id: string;
  artist_id: string;
  title: string;
  description?: string | null;
  style: string;
  size_label?: string | null;
  price: number;
  deposit_amount: number;
  estimated_duration_minutes?: number | null;
  image_url: string;
  image_url_2?: string | null;
  status: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'SOLD';
  is_visible: boolean;
  is_repeatable?: boolean;
  artist?: {
    id: string;
    name: string;
    nickname?: string | null;
    is_active?: boolean;
    is_visible?: boolean;
  } | null;
}

interface FlashReservationModalProps {
  flash: FlashDesignData;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}

export default function FlashReservationModal({
  flash,
  isOpen,
  onClose,
  onSuccess,
}: FlashReservationModalProps) {
  const router = useRouter();
  const { user, isCustomerProfileComplete } = useApp();
  const [placement, setPlacement] = useState('');
  const [width, setWidth] = useState<number>(5);
  const [height, setHeight] = useState<number>(5);
  const [customerNote, setCustomerNote] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [hasMedicalCondition, setHasMedicalCondition] = useState<boolean | null>(null);
  const [medicalConditionNote, setMedicalConditionNote] = useState('');
  const [hasAllergy, setHasAllergy] = useState<boolean | null>(null);
  const [allergyNote, setAllergyNote] = useState('');

  // Pre-fill customer master health profile when modal opens
  React.useEffect(() => {
    if (!user || !isOpen) return;
    const userId = user.id;
    let isMounted = true;
    async function loadCustomerHealth() {
      try {
        const supabase = createClient();
        const { data: cust } = await supabase
          .from('customers')
          .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note, medical_conditions, allergies')
          .eq('user_id', userId)
          .maybeSingle();

        if (!isMounted) return;
        let hasFoundCustHealth = false;
        if (cust) {
          if (cust.has_medical_condition !== undefined && cust.has_medical_condition !== null) {
            setHasMedicalCondition(Boolean(cust.has_medical_condition));
            setMedicalConditionNote(cust.medical_condition_note || cust.medical_conditions || '');
            hasFoundCustHealth = true;
          } else if (cust.medical_conditions?.trim()) {
            setHasMedicalCondition(true);
            setMedicalConditionNote(cust.medical_conditions.trim());
            hasFoundCustHealth = true;
          }

          if (cust.has_allergy !== undefined && cust.has_allergy !== null) {
            setHasAllergy(Boolean(cust.has_allergy));
            setAllergyNote(cust.allergy_note || cust.allergies || '');
            hasFoundCustHealth = true;
          } else if (cust.allergies?.trim()) {
            setHasAllergy(true);
            setAllergyNote(cust.allergies.trim());
            hasFoundCustHealth = true;
          }
        }

        // Fallback to customer history in estimate_requests table if customers profile is unrecorded
        if (!hasFoundCustHealth) {
          const { data: estHist } = await supabase
            .from('estimate_requests')
            .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
            .eq('customer_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!isMounted || !estHist) return;
          if (estHist.has_medical_condition !== undefined && estHist.has_medical_condition !== null) {
            setHasMedicalCondition(Boolean(estHist.has_medical_condition));
            setMedicalConditionNote(estHist.medical_condition_note || '');
          }
          if (estHist.has_allergy !== undefined && estHist.has_allergy !== null) {
            setHasAllergy(Boolean(estHist.has_allergy));
            setAllergyNote(estHist.allergy_note || '');
          }
        }
      } catch (err) {
        console.error('Error prefilling health disclosure in FlashReservationModal:', err);
      }
    }
    loadCustomerHealth();
    return () => { isMounted = false; };
  }, [user, isOpen]);

  if (!isOpen) return null;

  const artistName = flash.artist?.name
    ? `${flash.artist.name}${flash.artist.nickname ? ` (${flash.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Guest Auth Guard
    if (!user) {
      if (typeof window !== 'undefined') {
        window.location.href = `/login?redirect=${encodeURIComponent(`/flash?select=${flash.id}`)}`;
      }
      return;
    }

    if (!isCustomerProfileComplete) {
      router.push(`/complete-profile?next=${encodeURIComponent(`/flash?select=${flash.id}`)}`);
      return;
    }

    if (flash.status !== 'AVAILABLE') {
      setError('ลายนี้ไม่สามารถส่งคำขอได้ในขณะนี้ (สถานะ: ' + flash.status + ')');
      return;
    }

    if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ' || placement.trim() === 'อื่น ๆ:') {
      setError('กรุณาเลือกหรือระบุตำแหน่งที่ต้องการสัก');
      return;
    }

    if (hasMedicalCondition === true && !medicalConditionNote.trim()) {
      setError('กรุณาระบุรายละเอียดโรคประจำตัวหรือข้อควรระวัง');
      return;
    }

    if (hasAllergy === true && !allergyNote.trim()) {
      setError('กรุณาระบุรายละเอียดประวัติการแพ้ยาหรืออาหาร');
      return;
    }

    if (!requestedDate) {
      setError('กรุณาเลือกวันนัดหมายเข้ารับบริการ');
      return;
    }

    if (requestedDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return;
    }

    if (!requestedTime || !requestedTime.trim() || !requestedTime.includes(':')) {
      setError('กรุณาเลือกเวลาที่สะดวกเริ่มสัก');
      return;
    }

    const targetArtistId = flash.artist_id || flash.artist?.id;
    if (requestedDate && targetArtistId) {
      const supabase = createClient();
      const { data: busyCheck } = await supabase.rpc('get_artist_busy_ranges', {
        p_artist_id: targetArtistId,
        p_start_date: requestedDate,
        p_end_date: requestedDate,
      });
      if (Array.isArray(busyCheck) && busyCheck.length > 0) {
        setError('วันที่เลือกมีคิวงานที่ยืนยันแล้วของช่างสักท่านนี้ กรุณาเลือกวันอื่น');
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Update customer's master health profile
      try {
        await supabase
          .from('customers')
          .update({
            has_medical_condition: hasMedicalCondition,
            medical_condition_note: hasMedicalCondition ? medicalConditionNote.trim() : null,
            has_allergy: hasAllergy,
            allergy_note: hasAllergy ? allergyNote.trim() : null,
            medical_conditions: hasMedicalCondition ? medicalConditionNote.trim() : null,
            allergies: hasAllergy ? allergyNote.trim() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (custErr) {
        console.warn('Could not update customer health master profile directly:', custErr);
      }

      const { data, error: rpcErr } = await supabase.rpc('create_flash_reservation', {
        p_flash_design_id: flash.id,
        p_requested_date: requestedDate,
        p_requested_start_time: requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime,
        p_customer_note: customerNote.trim() || null,
        p_placement: placement.trim(),
        p_width_cm: width,
        p_height_cm: height,
      });

      if (rpcErr) throw rpcErr;

      const resId = data?.reservation_id || (typeof data === 'string' ? data : '');
      setSuccessMsg('ส่งคำขอจองลาย Flash สำเร็จแล้ว! ร้านจะตรวจสอบและติดต่อยืนยันอีกครั้ง');
      setTimeout(() => {
        onSuccess(resId);
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Error creating flash reservation:', err);
      setError(err.message || 'ไม่สามารถส่งคำขอจองลาย Flash ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt animate-fadeIn">
      <div className="w-full max-w-2xl bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px] shadow-2xl relative my-6 text-studio-primary max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-xs text-studio-muted hover:text-studio-red font-bold p-1 transition-colors z-10"
        >
          ✕ ปิดหน้าต่าง
        </button>

        {/* Modal Header */}
        <div className="border-b border-studio-border pb-3.5 mb-5">
          <div className="inline-flex items-center space-x-1.5 bg-studio-red/10 border border-studio-red/30 px-2 py-0.5 rounded text-studio-red text-[10px] uppercase font-bold tracking-widest mb-1.5">
            <Sparkles size={11} />
            <span>FLASH TATTOO BOOKING REQUEST</span>
          </div>
          <h2 className="text-lg sm:text-xl font-heading text-studio-primary">
            ส่งคำขอจองคิวสักแบบลาย Flash — {flash.title}
          </h2>
          <p className="text-xs text-studio-secondary mt-0.5 font-light">
            กรอกข้อมูลรายละเอียดการจองคิวสัก และระบุวันนัดหมายเข้ารับบริการ
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* SECTION 1 — ช่างสักประจำลาย (Artist Section) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary font-semibold flex items-center gap-1.5">
                <User size={13} className="text-studio-red" />
                <span>1. ช่างสักประจำลาย (Artist)</span>
              </label>
              <span className="text-[10px] bg-studio-main border border-studio-border text-studio-muted px-2 py-0.5 rounded flex items-center gap-1">
                <Lock size={10} /> ช่างสักเจ้าของลาย
              </span>
            </div>

            <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-studio-card border border-studio-red/40 flex items-center justify-center text-studio-red font-bold text-sm shrink-0">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-studio-primary text-sm">{artistName}</h4>
                  <p className="text-[11px] text-studio-secondary font-light">
                    ช่างสักประจำร้าน 157 TATTOO
                  </p>
                </div>
              </div>
              <span className="text-[11px] bg-studio-red/10 border border-studio-red/30 text-studio-red px-2.5 py-1 rounded font-bold shrink-0">
                เจ้าของลาย
              </span>
            </div>
          </section>

          {/* SECTION 2 — รูปภาพอ้างอิงงานสัก (Reference Image Section) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary font-semibold flex items-center gap-1.5">
                <ImageIcon size={13} className="text-studio-red" />
                <span>2. รูปภาพอ้างอิงงานสัก (Reference Image)</span>
              </label>
              <span className="text-[10px] text-studio-muted flex items-center gap-1">
                <Lock size={10} strokeWidth={2} /> รูปต้นแบบ Flash ของร้าน
              </span>
            </div>

            <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] space-y-2.5">
              <div className="flex items-start gap-3.5">
                <div
                  onClick={() => setShowImageZoom(true)}
                  className="w-24 h-28 sm:w-28 sm:h-32 bg-studio-card rounded-[6px] overflow-hidden shrink-0 border border-studio-border/80 relative cursor-pointer group"
                >
                  <img
                    src={getThumbnailUrl(flash.image_url)}
                    onError={(e) => handleThumbnailError(e, flash.image_url)}
                    alt={flash.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <ZoomIn size={18} />
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                  <h4 className="font-bold text-studio-primary text-sm truncate">{flash.title}</h4>
                  <div className="text-xs text-studio-secondary space-y-0.5">
                    <p>สไตล์: <strong className="text-studio-primary">{flash.style}</strong></p>
                    <p className="text-[11px] text-studio-muted font-light">
                      • ราคาพร้อมสักแบบคงที่ (Fixed Price)<br />
                      • รูปอ้างอิงต้นแบบสงวนลิขสิทธิ์ของช่างประจำร้าน (ห้ามเปลี่ยนรูป)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 — รายละเอียดงานสัก (Tattoo Details) */}
          <section className="space-y-3.5">
            <div className="border-b border-studio-border pb-2">
              <h3 className="text-xs font-bold text-studio-primary uppercase tracking-wider flex items-center gap-1.5">
                <Palette size={13} className="text-studio-red" />
                <span>3. รายละเอียดงานสัก</span>
              </h3>
            </div>

            {/* 3.1 Style (Locked) */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold">
                สไตล์งานสัก
              </label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-[4px] text-xs bg-studio-red border border-studio-red text-white font-semibold shadow-md inline-block">
                  {flash.style}
                </span>
                <span className="text-[11px] text-studio-muted font-light">
                  (สไตล์ตามแบบลาย Flash)
                </span>
              </div>
            </div>

            {/* 3.2 Placement Selector */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <MapPin size={12} className="text-studio-red" />
                <span>ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span></span>
              </label>
              <PlacementSelector
                value={placement}
                onChange={(val) => {
                  setPlacement(val);
                  setError('');
                }}
              />
            </div>

            {/* 3.3 Size Selector */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <Maximize2 size={12} className="text-studio-red" />
                <span>ขนาดของงานสัก <span className="text-studio-red">*</span></span>
              </label>
              <TattooSizeInput
                width={width}
                height={height}
                onWidthChange={(w) => {
                  setWidth(w);
                  setError('');
                }}
                onHeightChange={(h) => {
                  setHeight(h);
                  setError('');
                }}
              />
            </div>

            {/* 3.4 Customer Note / Description */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <FileText size={12} className="text-studio-red" />
                <span>รายละเอียดเพิ่มเติม / หมายเหตุถึงช่างสัก (ไม่บังคับ)</span>
              </label>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="ระบุข้อความถึงช่างสักเพิ่มเติม เช่น ข้อจำกัดเรื่องผิว รายละเอียดที่ต้องการ..."
                rows={3}
                className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary p-2.5 rounded-[4px] outline-none focus:border-studio-red resize-none"
              />
            </div>

            {/* 3.5 Health Disclosure Section */}
            <div className="space-y-3 pt-2 border-t border-studio-border/60">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <AlertTriangle size={13} className="text-amber-400" />
                <span>ข้อมูลสุขภาพและข้อควรระวัง (Health Disclosure)</span>
              </label>

              {/* โรคประจำตัว */}
              <div className="space-y-2 bg-studio-main p-3 rounded-[4px] border border-studio-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-studio-primary">ท่านมีโรคประจำตัวหรือข้อควรระวังหรือไม่?</span>
                  <div className="flex items-center space-x-3 text-xs">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="hasMedicalCondition"
                        checked={hasMedicalCondition === true}
                        onChange={() => setHasMedicalCondition(true)}
                        className="text-studio-red focus:ring-0"
                      />
                      <span>มี</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="hasMedicalCondition"
                        checked={hasMedicalCondition === false}
                        onChange={() => {
                          setHasMedicalCondition(false);
                          setMedicalConditionNote('');
                        }}
                        className="text-studio-red focus:ring-0"
                      />
                      <span>ไม่มี</span>
                    </label>
                  </div>
                </div>
                {hasMedicalCondition === true && (
                  <textarea
                    value={medicalConditionNote}
                    onChange={(e) => setMedicalConditionNote(e.target.value)}
                    placeholder="ระบุชื่อโรคประจำตัว ยาที่ใช้ หรือข้อควรระวัง เช่น โรคความดัน, เบาหวาน, โรคหัวใจ ฯลฯ"
                    rows={2}
                    className="w-full bg-studio-card border border-red-900/60 text-xs text-studio-primary p-2 rounded outline-none focus:border-studio-red resize-none"
                  />
                )}
              </div>

              {/* ประวัติการแพ้ */}
              <div className="space-y-2 bg-studio-main p-3 rounded-[4px] border border-studio-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-studio-primary">ท่านมีประวัติการแพ้ยา อาหาร หรือสารเคมีหรือไม่?</span>
                  <div className="flex items-center space-x-3 text-xs">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="hasAllergy"
                        checked={hasAllergy === true}
                        onChange={() => setHasAllergy(true)}
                        className="text-studio-red focus:ring-0"
                      />
                      <span>มี</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="hasAllergy"
                        checked={hasAllergy === false}
                        onChange={() => {
                          setHasAllergy(false);
                          setAllergyNote('');
                        }}
                        className="text-studio-red focus:ring-0"
                      />
                      <span>ไม่มี</span>
                    </label>
                  </div>
                </div>
                {hasAllergy === true && (
                  <textarea
                    value={allergyNote}
                    onChange={(e) => setAllergyNote(e.target.value)}
                    placeholder="ระบุสิ่งที่แพ้ เช่น ยาชา, ยาแก้ปวด, แอลกอฮอล์, อาหารทะเล ฯลฯ"
                    rows={2}
                    className="w-full bg-studio-card border border-amber-900/60 text-xs text-studio-primary p-2 rounded outline-none focus:border-studio-red resize-none"
                  />
                )}
              </div>
            </div>
          </section>

          {/* SECTION 4 — วันนัดและเวลาเริ่มสัก (Appointment Schedule) */}
          <section className="space-y-3 pt-1">
            <div className="border-b border-studio-border pb-2">
              <h3 className="text-xs font-bold text-studio-primary uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={13} className="text-studio-red" />
                <span>4. วันนัดหมายและเวลาเริ่มสัก</span>
              </h3>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-studio-secondary font-medium flex items-center gap-1">
                  <Calendar size={12} className="text-studio-red" />
                  <span>วันนัดหมายเข้ารับบริการ <span className="text-studio-red">*</span></span>
                </label>
                <DatePickerPopover
                  value={requestedDate}
                  onChange={(dateStr) => {
                    setRequestedDate(dateStr);
                    setError('');
                  }}
                  artistId={flash.artist_id || flash.artist?.id}
                  placeholder="-- เลือกวันนัดหมายเข้ารับบริการ --"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-studio-secondary font-medium flex items-center gap-1">
                  <Clock size={12} className="text-studio-red" />
                  <span>เวลาที่สะดวกเริ่มสัก <span className="text-studio-red">*</span></span>
                </label>
                <DualTimePicker
                  value={requestedTime}
                  onChange={(t) => {
                    setRequestedTime(t);
                    setError('');
                  }}
                />
              </div>
            </div>
          </section>

          {/* Informational Disclaimer */}
          <div className="bg-studio-main/80 border border-studio-border/60 p-3.5 rounded-[4px] space-y-1 text-[11px] text-studio-secondary">
            <div className="flex items-center gap-1 text-studio-primary font-semibold">
              <ShieldCheck size={13} className="text-studio-red" />
              <span>เงื่อนไขการส่งคำขอจองลาย Flash:</span>
            </div>
            <p className="leading-relaxed font-light">
              • การส่งคำขอนี้จะทำการจองลายและวันที่เข้ารับบริการกับช่างสักเจ้าของลาย<br />
              • ท่านสามารถติดตามสถานะคำขอและข้อมูลการนัดหมายได้ที่เมนู <strong>ประวัติคำขอจอง Flash</strong><br />
              • ทางร้านจะทำการตรวจสอบคิวงานและติดต่อกลับเพื่อยืนยันรอบนัดหมายอีกครั้ง
            </p>
          </div>

          {/* Submit Action */}
          <div className="flex gap-2 pt-2 border-t border-studio-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/40 py-2.5 px-3 rounded-[4px] text-xs font-semibold transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || !!successMsg}
              className="flex-[2] bg-studio-red border border-studio-red text-studio-primary hover:bg-studio-red/80 py-2.5 px-3 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-studio-red/20"
            >
              {loading ? 'กำลังส่งคำขอ...' : user ? 'ยืนยันส่งคำขอจองลายนี้' : 'เข้าสู่ระบบเพื่อจองลายนี้'}
            </button>
          </div>
        </form>

        {/* Lightbox / Zoom Modal for Reference Image */}
        {showImageZoom && (
          <div
            onClick={() => setShowImageZoom(false)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          >
            <div className="relative max-w-3xl max-h-[85vh]">
              <img
                src={flash.image_url}
                alt={flash.title}
                className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/20 shadow-2xl"
              />
              <p className="text-center text-xs text-studio-secondary mt-2">
                {flash.title} — รูปภาพต้นแบบ Flash (ร้าน 157 TATTOO)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

