'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  Image as ImageIcon, 
  Layers, 
  FileText, 
  Clock, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { formatDateBangkok } from '@/components/admin/calendar/calendarUtils';
import { parseNoteWithPreferredTime, getInitialStartTime, extractHHMM } from '@/lib/noteUtils';

export interface ArtistPendingEstimateDetail {
  id: string;
  customer_user_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  artist_id?: string | null;
  placement?: string | null;
  description?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  style_preference?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  reference_images?: string[] | null;
  has_medical_condition?: boolean;
  medical_condition_note?: string | null;
  has_allergy?: boolean;
  allergy_note?: string | null;
  status: string;
  created_at?: string | null;
  is_age_confirmed?: boolean;
}

interface Props {
  estimate: ArtistPendingEstimateDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ArtistRequestDetailDrawer({ estimate, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [signedImageUrls, setSignedImageUrls] = useState<{ path: string; url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Secure Customer Confirmation Resolution State
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');

  useEffect(() => {
    if (!estimate) {
      setConfirmationState('not_confirmed');
      return;
    }

    if (estimate.is_age_confirmed === true) {
      setConfirmationState('confirmed');
      return;
    }

    const customerUserId = estimate.customer_user_id;
    if (!customerUserId) {
      setConfirmationState('not_confirmed');
      return;
    }

    let isMounted = true;
    setConfirmationState('loading');

    async function fetchConfirmation() {
      try {
        const { data, error } = await supabase.rpc('artist_get_customer_confirmation', {
          p_customer_user_id: customerUserId
        });

        if (!isMounted) return;

        if (error) {
          console.error('Error in artist_get_customer_confirmation RPC:', error);
          setConfirmationState('error');
          return;
        }

        const res = Array.isArray(data) ? data[0] : data;
        if (res && res.is_confirmed !== undefined) {
          setConfirmationState(res.is_confirmed ? 'confirmed' : 'not_confirmed');
        } else if (res && res.is_confirmed === null) {
          setConfirmationState('not_confirmed');
        } else {
          // If 0 rows returned (e.g. denied or not found)
          setConfirmationState('not_confirmed');
        }
      } catch (err) {
        console.error('Confirmation fetch exception:', err);
        if (isMounted) setConfirmationState('error');
      }
    }

    fetchConfirmation();

    return () => {
      isMounted = false;
    };
  }, [estimate]);

  // Accept / Reject Modal State
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const initialStartTime = getInitialStartTime(estimate, '10:00');

  const [acceptDate, setAcceptDate] = useState('');
  const [acceptStartTime, setAcceptStartTime] = useState(initialStartTime);
  const [acceptEndTime, setAcceptEndTime] = useState('13:00');
  const [acceptPrice, setAcceptPrice] = useState<number>(0);
  const [acceptDeposit, setAcceptDeposit] = useState<number>(500);
  const [acceptNote, setAcceptNote] = useState('');

  const [rejectReason, setRejectReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPending = estimate?.status === 'PENDING';

  const handleOpenAccept = () => {
    setErrorMsg(null);
    setAcceptDate(estimate?.preferred_date || '');
    setAcceptStartTime(getInitialStartTime(estimate, '10:00'));
    setAcceptEndTime('13:00');
    setAcceptPrice(0);
    setAcceptDeposit(500);
    setAcceptNote('');
    setShowAcceptModal(true);
  };

  const handleConfirmAccept = async () => {
    if (!estimate) return;
    if (!acceptDate) {
      setErrorMsg('กรุณาระบุวันที่นัดหมาย');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('artist_confirm_booking_request', {
        p_estimate_request_id: estimate.id,
        p_appointment_date: acceptDate,
        p_start_time: acceptStartTime,
        p_end_time: acceptEndTime,
        p_quoted_price: acceptPrice,
        p_deposit_required: acceptDeposit,
        p_artist_note: acceptNote || null
      });

      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการรับงาน');
      } else {
        setShowAcceptModal(false);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการรับงาน');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!estimate) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('artist_reject_booking_request', {
        p_estimate_request_id: estimate.id,
        p_rejection_reason: rejectReason || null
      });

      if (error || !data?.success) {
        setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการปฏิเสธงาน');
      } else {
        setShowRejectModal(false);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธงาน');
    } finally {
      setSubmitting(false);
    }
  };

  // Load signed URLs for reference images
  useEffect(() => {
    if (!estimate || !isOpen) {
      setSignedImageUrls([]);
      setLightboxIndex(null);
      return;
    }

    const imagesToSign: string[] = [];
    if (estimate.reference_images && Array.isArray(estimate.reference_images)) {
      imagesToSign.push(...estimate.reference_images.filter(Boolean));
    }

    if (imagesToSign.length === 0) {
      setSignedImageUrls([]);
      return;
    }

    let isSubscribed = true;
    setLoadingImages(true);

    async function signImages() {
      try {
        const signedList: { path: string; url: string }[] = [];
        for (const imgPath of imagesToSign) {
          if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
            signedList.push({ path: imgPath, url: imgPath });
            continue;
          }
          const cleanPath = imgPath.replace(/^customer-references\//, '');
          const { data, error } = await supabase.storage
            .from('customer-references')
            .createSignedUrl(cleanPath, 3600);

          if (!error && data?.signedUrl) {
            signedList.push({ path: imgPath, url: data.signedUrl });
          } else {
            // Fallback try public URL or direct path
            const { data: pubData } = supabase.storage
              .from('customer-references')
              .getPublicUrl(cleanPath);
            if (pubData?.publicUrl) {
              signedList.push({ path: imgPath, url: pubData.publicUrl });
            }
          }
        }
        if (isSubscribed) {
          setSignedImageUrls(signedList);
        }
      } catch (err) {
        console.error('Error signing request reference images:', err);
      } finally {
        if (isSubscribed) setLoadingImages(false);
      }
    }

    signImages();

    return () => {
      isSubscribed = false;
    };
  }, [estimate, isOpen, supabase]);

  if (!isOpen || !estimate) return null;

  const requestCode = `REQ-${estimate.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card/95">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2.5 py-1 rounded border border-studio-border">
              {requestCode}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full border bg-amber-950/60 text-amber-400 border-amber-800/60 font-medium">
              คำขอใหม่
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-secondary hover:text-studio-primary hover:bg-studio-sec border border-studio-border transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24 text-xs">
          {/* Read-only Notice */}
          <div className="p-3.5 bg-studio-sec/80 border border-studio-border rounded-xl flex items-start space-x-3 text-studio-secondary">
            <ShieldCheck size={16} className="text-studio-red shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-studio-primary block text-xs">รายละเอียดคำขอจองงานสัก (Artist View)</span>
              <p className="text-[11px] text-studio-muted leading-relaxed">
                คำขอใหม่ที่ลูกค้าระบุช่างสักเข้ามาโดยตรง ท่านสามารถเปิดดูรายละเอียด ภาพอ้างอิง และเตรียมความพร้อมสำหรับคิวนัดหมายได้ทันที
              </p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red" />
              <span>ข้อมูลลูกค้าที่ติดต่อ</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ชื่อลูกค้า:</span>
                <span className="text-studio-primary font-medium">{estimate.customer_name || 'ลูกค้า (ไม่ระบุชื่อ)'}</span>
              </div>
              {estimate.customer_phone && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">เบอร์โทรศัพท์:</span>
                  <a
                    href={`tel:${estimate.customer_phone}`}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded transition-colors"
                  >
                    <Phone size={12} />
                    <span>{estimate.customer_phone}</span>
                  </a>
                </div>
              )}
              {estimate.customer_email && (
                <div className="flex justify-between items-center pt-2">
                  <span className="text-studio-muted">อีเมล:</span>
                  <span className="text-studio-secondary font-mono truncate max-w-[200px]">{estimate.customer_email}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <span className="text-studio-muted">การยืนยันอายุและเงื่อนไข:</span>
                {confirmationState === 'loading' ? (
                  <span className="inline-flex items-center space-x-1 text-studio-muted bg-studio-card/80 border border-studio-border px-2.5 py-0.5 rounded text-[11px]">
                    <span>กำลังตรวจสอบ...</span>
                  </span>
                ) : confirmationState === 'confirmed' ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <ShieldCheck size={12} />
                    <span>ยืนยันแล้ว</span>
                  </span>
                ) : confirmationState === 'error' ? (
                  <span className="inline-flex items-center space-x-1 text-amber-400/80 bg-amber-950/30 border border-amber-800/30 px-2.5 py-0.5 rounded text-[11px]">
                    <span>! ไม่สามารถตรวจสอบได้</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <span>ยังไม่ยืนยัน</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Health Disclosure Card (Artist View) */}
          <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 space-y-3 font-prompt">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} className={estimate.has_medical_condition || estimate.has_allergy ? "text-amber-400 shrink-0" : "text-emerald-400 shrink-0"} />
                <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
              </div>
            </div>

            {!estimate.has_medical_condition && !estimate.has_allergy ? (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                <span>สุขภาพปกติ (ไม่มีโรคประจำตัวและประวัติภูมิแพ้)</span>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* โรคประจำตัว */}
                {estimate.has_medical_condition ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        โรคประจำตัว
                      </span>
                      <span className="inline-flex items-center space-x-1 text-red-400 bg-red-950/50 border border-red-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span>มีโรคประจำตัว</span>
                      </span>
                    </div>
                    <p className="text-xs text-red-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-red-900/50 whitespace-pre-wrap leading-relaxed">
                      {estimate.medical_condition_note?.trim() || 'ลูกค้าแจ้งว่ามี แต่ไม่ได้ระบุรายละเอียด'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-studio-muted">โรคประจำตัว:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}

                {/* ประวัติภูมิแพ้ */}
                {estimate.has_allergy ? (
                  <div className={`space-y-1.5 ${estimate.has_medical_condition ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        ประวัติภูมิแพ้ / แพ้ยา
                      </span>
                      <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span>มีประวัติภูมิแพ้</span>
                      </span>
                    </div>
                    <p className="text-xs text-amber-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-amber-900/50 whitespace-pre-wrap leading-relaxed">
                      {estimate.allergy_note?.trim() || 'ลูกค้าแจ้งว่ามี แต่ไม่ได้ระบุรายละเอียด'}
                    </p>
                  </div>
                ) : (
                  <div className={`flex items-center justify-between text-xs py-0.5 ${estimate.has_medical_condition ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                    <span className="text-studio-muted">ประวัติภูมิแพ้ / แพ้ยา:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dates Card */}
          {(() => {
            const rawTime = estimate.preferred_time || (estimate as any).preferredTime;
            const { cleanNote, extractedTime } = parseNoteWithPreferredTime(estimate.description);
            let timeDisplay = 'ไม่ระบุ';
            if (rawTime) {
              const hhmm = extractHHMM(rawTime) || rawTime;
              timeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
            } else if (extractedTime) {
              timeDisplay = extractedTime;
            }
            return (
              <>
                <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                    <Calendar size={14} className="text-studio-red" />
                    <span>วันที่ต้องการสัก & วันที่ส่งคำขอ</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-studio-muted text-[10px] block">วันที่ลูกค้าสะดวก</span>
                      <span className="text-sm font-semibold text-studio-primary">
                        {estimate.preferred_date ? formatDateBangkok(estimate.preferred_date) : 'ไม่ระบุ'}
                      </span>
                    </div>
                    <div>
                      <span className="text-studio-muted text-[10px] block">เวลาที่สะดวก</span>
                      <span className="text-sm font-semibold text-studio-primary">
                        {timeDisplay}
                      </span>
                    </div>
                    <div>
                      <span className="text-studio-muted text-[10px] block">วันที่ส่งคำขอ</span>
                      <span className="text-xs font-medium text-studio-secondary">
                        {estimate.created_at ? formatDateBangkok(estimate.created_at, true) : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tattoo Specs */}
                <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                    <Layers size={14} className="text-studio-red" />
                    <span>รายละเอียดงานสักที่ต้องการ</span>
                  </div>
                  <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
                    <div className="flex justify-between items-center pb-2">
                      <span className="text-studio-muted">ตำแหน่งที่สัก:</span>
                      <span className="text-studio-primary font-medium">{estimate.placement || 'ไม่ระบุ'}</span>
                    </div>
                    {(estimate.width_cm || estimate.height_cm) && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">ขนาดประมาณ:</span>
                        <span className="text-studio-primary font-mono">
                          {estimate.width_cm || '-'} x {estimate.height_cm || '-'} ซม.
                        </span>
                      </div>
                    )}
                    {(estimate.style_preference || (estimate as any).style) && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">สไตล์ลายสัก:</span>
                        <span className="text-studio-primary font-medium">{estimate.style_preference || (estimate as any).style}</span>
                      </div>
                    )}
                    {estimate.preferred_date && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">วันที่ต้องการ:</span>
                        <span className="text-studio-primary font-medium">{formatDateBangkok(estimate.preferred_date)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2">
                      <span className="text-studio-muted">เวลาที่สะดวก:</span>
                      <span className="text-studio-primary font-medium">{timeDisplay}</span>
                    </div>
                  </div>

                  {cleanNote && (
                    <div className="pt-2 border-t border-studio-border/60">
                      <span className="text-studio-muted text-[10px] block mb-1">รายละเอียดเพิ่มเติมจากลูกค้า:</span>
                      <p className="text-studio-primary text-xs bg-studio-sec p-3 rounded-lg border border-studio-border whitespace-pre-wrap leading-relaxed">
                        {cleanNote}
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Section 3: Reference Images */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold block">
              ภาพตัวอย่าง (Reference Images)
            </span>

            {loadingImages ? (
              <div className="p-4 text-center text-studio-muted text-[11px] animate-pulse">
                กำลังโหลดรูปภาพ...
              </div>
            ) : signedImageUrls.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {signedImageUrls.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className="relative aspect-square bg-studio-sec rounded-lg border border-studio-border overflow-hidden group cursor-pointer hover:border-studio-red/60 transition-colors"
                  >
                    <img
                      src={item.url}
                      alt={`Ref ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 size={16} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-studio-sec/40 border border-studio-border/60 rounded-lg text-center text-studio-muted text-[11px]">
                ไม่มีภาพเรฟเฟอเรนซ์แนบมากับคำขอนี้
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer with Operational Actions */}
        <div className="p-4 border-t border-studio-border bg-studio-card space-y-2">
          {isPending ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setRejectReason('');
                  setShowRejectModal(true);
                }}
                className="py-2.5 px-4 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
              >
                ปฏิเสธ
              </button>
              <button
                type="button"
                onClick={handleOpenAccept}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow transition-colors cursor-pointer"
              >
                รับงาน
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-studio-sec hover:bg-studio-border text-studio-primary rounded-xl font-semibold text-xs border border-studio-border transition-colors cursor-pointer"
            >
              ปิด
            </button>
          )}
        </div>
      </div>

      {/* Accept Request Modal Form */}
      {showAcceptModal && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">รับงานและกำหนดวันนัดหมาย</h3>
              <button onClick={() => setShowAcceptModal(false)} className="text-studio-secondary hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-studio-secondary mb-1">วันที่นัดหมาย *</label>
                <input
                  type="date"
                  value={acceptDate}
                  onChange={(e) => setAcceptDate(e.target.value)}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาเริ่ม *</label>
                  <input
                    type="time"
                    value={acceptStartTime}
                    onChange={(e) => setAcceptStartTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red font-mono"
                  />
                </div>
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาสิ้นสุด *</label>
                  <input
                    type="time"
                    value={acceptEndTime}
                    onChange={(e) => setAcceptEndTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-studio-secondary mb-1">ราคางานสัก (฿)</label>
                  <input
                    type="number"
                    min="0"
                    value={acceptPrice}
                    onChange={(e) => setAcceptPrice(Number(e.target.value))}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
                <div>
                  <label className="block text-studio-secondary mb-1">เงินมัดจำ (฿)</label>
                  <input
                    type="number"
                    min="0"
                    value={acceptDeposit}
                    onChange={(e) => setAcceptDeposit(Number(e.target.value))}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
              </div>

              <div>
                <label className="block text-studio-secondary mb-1">หมายเหตุของช่าง</label>
                <textarea
                  rows={2}
                  value={acceptNote}
                  onChange={(e) => setAcceptNote(e.target.value)}
                  placeholder="รายละเอียดเพิ่มเติมสำหรับการนัดหมาย..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => setShowAcceptModal(false)}
                disabled={submitting}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmAccept}
                disabled={submitting}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันรับงาน'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reject Request Modal Form */}
      {showRejectModal && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">ปฏิเสธคำขอใหม่</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-studio-secondary hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-studio-secondary mb-1">เหตุผลการปฏิเสธ</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น คิวเต็ม, สไตล์ไม่ตรง..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={submitting}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={submitting}
                className="w-full py-2.5 px-3 rounded-xl bg-red-800 hover:bg-red-900 text-white font-semibold text-xs shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && signedImageUrls[lightboxIndex] && mounted && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 font-prompt">
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-studio-red p-2 cursor-pointer"
          >
            <X size={24} />
          </button>
          <div className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center">
            <img
              src={signedImageUrls[lightboxIndex].url}
              alt="Reference detail"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
          {signedImageUrls.length > 1 && (
            <div className="flex items-center space-x-4 mt-4 text-white">
              <button
                onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : signedImageUrls.length - 1))}
                className="p-2 bg-studio-card border border-studio-border rounded-full hover:bg-studio-red cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-mono">
                {lightboxIndex + 1} / {signedImageUrls.length}
              </span>
              <button
                onClick={() => setLightboxIndex((prev) => (prev! < signedImageUrls.length - 1 ? prev! + 1 : 0))}
                className="p-2 bg-studio-card border border-studio-border rounded-full hover:bg-studio-red cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
