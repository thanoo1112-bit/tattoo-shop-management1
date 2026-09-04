'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck,
  Maximize2,
  FileText,
  AlertCircle,
  XCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { EstimateRequestItem, formatCurrency, formatDateTimeBangkok } from './types';
import EstimateQuoteForm from './EstimateQuoteForm';
import { createClient } from '@/lib/supabase/client';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface EstimateDetailPanelProps {
  estimate: EstimateRequestItem | null;
  onClose: () => void;
  onRefresh: () => void;
}

export default function EstimateDetailPanel({
  estimate,
  onClose,
  onRefresh,
}: EstimateDetailPanelProps) {
  const [isQuoting, setIsQuoting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  if (!estimate) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอประเมินราคา
          </span>
        );
      case 'QUOTED':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            เสนอราคาแล้ว
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ลูกค้ายอมรับแล้ว
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            หมดอายุ
          </span>
        );
      default:
        return null;
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReject(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('estimate_requests')
        .update({
          status: 'REJECTED',
          quote_note: rejectReason.trim() ? `ปฏิเสธ: ${rejectReason.trim()}` : 'ร้านไม่สามารถรับคิวงานนี้ได้ในขณะนี้',
        })
        .eq('id', estimate.id);

      if (error) throw error;
      setIsRejecting(false);
      onRefresh();
    } catch (err: any) {
      console.error('Error rejecting estimate:', err);
    } finally {
      setIsSubmittingReject(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[560px] bg-[#171512] border-l border-[#4A443A] shadow-2xl flex flex-col font-prompt animate-slideInRight">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#4A443A] flex items-center justify-between bg-[#0E0D0C]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#171512] border border-[#4A443A] flex items-center justify-center text-blue-400">
              <FileText size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
                  รายละเอียดคำขอประเมิน
                </h3>
                {getStatusBadge(estimate.status)}
              </div>
              <p className="text-[10px] text-[#7A7265] mt-0.5">
                รหัส: #{estimate.id.slice(0, 8)} • ยื่นเมื่อ: {formatDateTimeBangkok(estimate.created_at)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#7A7265] hover:text-[#ECE4D3] hover:bg-[#1F1D1A] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Customer Information (Section 28) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              ข้อมูลลูกค้า
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                <User size={14} className="text-[#9C2F2F]" />
                {estimate.customer_name}
              </span>
              {estimate.customer_phone && (
                <a
                  href={`tel:${estimate.customer_phone}`}
                  className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/50"
                >
                  <Phone size={11} className="text-emerald-400" />
                  {estimate.customer_phone}
                </a>
              )}
            </div>
          </div>

          {/* Tattoo Request Details */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              รายละเอียดงานสัก
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">ตำแหน่งบนร่างกาย</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">{estimate.placement}</span>
              </div>
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">ขนาดที่ต้องการ</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">
                  {estimate.width_cm && estimate.height_cm
                    ? `${estimate.width_cm} × ${estimate.height_cm} ซม.`
                    : 'ไม่ระบุขนาด'}
                </span>
              </div>
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">ช่างที่ต้องการ</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">
                  {estimate.artist_name} {estimate.artist_nickname ? `(${estimate.artist_nickname})` : ''}
                </span>
              </div>
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                <span className="text-[10px] text-[#7A7265] block">สไตล์ที่ต้องการ</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block">
                  {estimate.style_preference || 'ตามที่ช่างแนะนำ'}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-[#171512] p-3 rounded-lg border border-[#4A443A]/40 text-xs">
              <span className="text-[10px] text-[#7A7265] block mb-1">คำอธิบายเพิ่มเติมจากลูกค้า</span>
              <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap">
                {estimate.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
              </p>
            </div>

            {/* Reference Images (Section 27) */}
            {estimate.reference_images && estimate.reference_images.length > 0 && (
              <div>
                <span className="text-[10px] text-[#7A7265] block mb-1.5 flex items-center gap-1">
                  <ImageIcon size={12} />
                  รูปภาพอ้างอิง ({estimate.reference_images.length} รูป)
                </span>
                <div className="flex flex-wrap gap-2">
                  {estimate.reference_images.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setPreviewImage(imgUrl)}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-[#4A443A] bg-[#171512] cursor-pointer hover:border-[#ECE4D3] transition-all relative group"
                    >
                      <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Maximize2 size={14} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quote Information / Form (Section 8 & 9) */}
          {estimate.status === 'PENDING' ? (
            isQuoting ? (
              <EstimateQuoteForm
                estimate={estimate}
                onSuccess={() => {
                  setIsQuoting(false);
                  onRefresh();
                }}
                onCancel={() => setIsQuoting(false)}
              />
            ) : isRejecting ? (
              <form onSubmit={handleReject} className="bg-[#0E0D0C] border border-red-900/60 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-red-400 block">ระบุเหตุผลในการปฏิเสธคำขอ</span>
                <textarea
                  required
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="เช่น คิวงานเต็ม หรือสไตล์ไม่ตรงกับทางร้าน..."
                  className="w-full bg-[#171512] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(false)}
                    className="px-3 py-1 bg-[#171512] text-xs text-[#A89F91] rounded border border-[#4A443A]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReject}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium"
                  >
                    {isSubmittingReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 bg-[#0E0D0C] border border-blue-900/40 rounded-xl space-y-3 text-center">
                <p className="text-xs text-[#A89F91]">
                  คำขอนี้ยังไม่ได้รับการประเมินราคา กรุณาส่งใบเสนอราคาให้ลูกค้า
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    id="btn-open-quote-form"
                    type="button"
                    onClick={() => setIsQuoting(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 shadow"
                  >
                    <DollarSign size={14} />
                    <span>ประเมินราคา / ส่งใบเสนอราคา</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="px-3 py-2 bg-[#171512] hover:bg-red-950/40 text-xs text-[#A89F91] hover:text-red-400 rounded-lg border border-[#4A443A] hover:border-red-900/60 transition-colors"
                  >
                    ปฏิเสธคำขอ
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Quoted / Accepted Overview */
            <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
                ข้อมูลใบเสนอราคา (Quote Details)
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                  <span className="text-[10px] text-[#7A7265] block">ราคางานสัก</span>
                  <span className="text-sm font-heading font-bold text-emerald-400 mt-0.5 block">
                    {formatCurrency(estimate.quoted_price || 0)}
                  </span>
                </div>
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
                  <span className="text-[10px] text-[#7A7265] block">เงินมัดจำที่กำหนด</span>
                  <span className="text-sm font-heading font-bold text-blue-400 mt-0.5 block">
                    {formatCurrency(estimate.deposit_required || 0)}
                  </span>
                </div>
              </div>

              {estimate.estimated_duration_minutes && (
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs flex items-center justify-between">
                  <span className="text-[#7A7265]">ระยะเวลาโดยประมาณ:</span>
                  <span className="font-medium text-[#ECE4D3]">
                    {estimate.estimated_duration_minutes} นาที (ประมาณ {Math.round(estimate.estimated_duration_minutes / 60)} ชม.)
                  </span>
                </div>
              )}

              {estimate.quote_note && (
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
                  <span className="text-[10px] text-[#7A7265] block mb-1">หมายเหตุในใบเสนอราคา</span>
                  <p className="text-[#ECE4D3] font-light leading-relaxed">{estimate.quote_note}</p>
                </div>
              )}

              {estimate.quoted_at && (
                <span className="text-[10px] text-[#7A7265] block text-right">
                  เสนอราคาเมื่อ: {formatDateTimeBangkok(estimate.quoted_at)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Image Preview */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 cursor-pointer animate-fadeIn"
        >
          <div className="max-w-full max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            <CustomerReferenceImage
              src={previewImage}
              alt="Reference preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white bg-[#171512] border border-[#4A443A] p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
