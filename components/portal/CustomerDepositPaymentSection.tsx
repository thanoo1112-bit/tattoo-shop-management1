'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CustomerPortalBooking,
  BookingPaymentSubmission,
  PaymentSetting,
} from './types';
import { formatThaiDate, formatTimeBangkok, formatCurrency, getDepositDeadlineInfo } from './portalUtils';
import {
  Wallet,
  QrCode,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  X,
  Eye,
  RefreshCw,
  Image as ImageIcon,
  Building2,
  CreditCard,
  Send,
} from 'lucide-react';
import Image from 'next/image';

interface CustomerDepositPaymentSectionProps {
  booking: CustomerPortalBooking;
  onRefresh?: () => void;
}

export default function CustomerDepositPaymentSection({
  booking,
  onRefresh,
}: CustomerDepositPaymentSectionProps) {
  const supabase = createClient();

  // Settings & Submissions State
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting | null>(null);
  const [qrSignedUrl, setQrSignedUrl] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<BookingPaymentSubmission[]>([]);
  const [slipSignedUrls, setSlipSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Form State
  const [customerNote, setCustomerNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [showReUploadForm, setShowReUploadForm] = useState(false);

  // UI Interactive States
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Financial Calculations (Deposit Only)
  const depositRequired = Number(booking.financial?.deposit_required ?? 0);
  const paidTotal = Number(booking.financial?.paid_total ?? 0);
  const depositOutstanding = Math.max(depositRequired - paidTotal, 0);
  const targetDepositAmount = depositOutstanding > 0 ? depositOutstanding : depositRequired;

  // Fetch Payment Settings & Submissions
  const loadPaymentData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch active payment settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (!settingsError && settingsData) {
        setPaymentSettings(settingsData as PaymentSetting);

        // Fetch Shop QR signed URL if qr_path exists
        if (settingsData.payment_qr_path) {
          const { data: qrData } = await supabase.storage
            .from('shop-payment-assets')
            .createSignedUrl(settingsData.payment_qr_path, 3600);
          if (qrData?.signedUrl) {
            setQrSignedUrl(qrData.signedUrl);
          } else {
            setQrSignedUrl(null);
          }
        } else {
          setQrSignedUrl(null);
        }
      } else {
        setPaymentSettings(null);
        setQrSignedUrl(null);
      }

      // 2. Fetch booking payment submissions
      const { data: subsData, error: subsError } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .eq('booking_id', booking.id)
        .order('submitted_at', { ascending: false });

      if (!subsError && subsData) {
        const parsedSubs: BookingPaymentSubmission[] = subsData.map((s: any) => ({
          ...s,
          claimed_amount: Number(s.claimed_amount),
        }));
        setSubmissions(parsedSubs);

        // Generate Signed URLs for slip previews
        const urls: Record<string, string> = {};
        for (const sub of parsedSubs) {
          if (sub.slip_path) {
            const { data: sData } = await supabase.storage
              .from('booking-payment-slips')
              .createSignedUrl(sub.slip_path, 3600);
            if (sData?.signedUrl) {
              urls[sub.id] = sData.signedUrl;
            }
          }
        }
        setSlipSignedUrls(urls);
      }
    } catch (err: any) {
      console.error('Error loading payment data:', err);
    } finally {
      setLoading(false);
    }

  }, [booking.id, supabase]);

  useEffect(() => {
    loadPaymentData();
  }, [loadPaymentData]);

  // Handle Copy to Clipboard
  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setFormError('รองรับเฉพาะ JPG, PNG และ WEBP');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    setFormError('');
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedFile) {
      setFormError('กรุณาเลือกรูปภาพสลิปการโอนเงิน');
      return;
    }

    const amountNum = targetDepositAmount;
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('ยอดเงินมัดจำที่ต้องชำระไม่ถูกต้อง');
      return;
    }

    setSubmitting(true);
    let uploadedSlipPath = null;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');

      // 1. Generate path: {auth.uid()}/{booking_id}/{uuid}.{ext}
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const randomId = crypto.randomUUID();
      const storagePath = user.id + '/' + booking.id + '/' + randomId + '.' + fileExt;

      // 2. Upload slip to private bucket 'booking-payment-slips'
      const { error: uploadErr } = await supabase.storage
        .from('booking-payment-slips')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Storage upload error:', uploadErr);
        throw new Error('อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }

      uploadedSlipPath = storagePath;

      // 3. Call Canonical RPC: submit_booking_payment_slip
      const { error: rpcErr } = await supabase.rpc('submit_booking_payment_slip', {
        p_booking_id: booking.id,
        p_claimed_amount: amountNum,
        p_slip_path: storagePath,
        p_reference_no: null,
        p_customer_note: customerNote.trim() ? customerNote.trim() : null,
      });

      if (rpcErr) {
        console.error('RPC submission error:', rpcErr);

        // Orphan File Cleanup: Remove the uploaded file if RPC failed
        if (uploadedSlipPath) {
          try {
            await supabase.storage
              .from('booking-payment-slips')
              .remove([uploadedSlipPath]);
          } catch (cleanErr: any) {
            console.error('Orphan cleanup error:', cleanErr);
          }
        }

        if (rpcErr.message?.includes('DEPOSIT_DEADLINE_EXPIRED')) {
          if (onRefresh) onRefresh();
          throw new Error('หมดเวลาชำระมัดจำแล้ว กรุณาติดต่อร้าน');
        }
        if (rpcErr.message?.includes('already pending')) {
          throw new Error('หลักฐานของคุณกำลังรอตรวจสอบ');
        }
        if (rpcErr.message?.includes('WAITING_DEPOSIT')) {
          throw new Error('คิวนี้ไม่ได้อยู่ในสถานะรอมัดจำ');
        }
        throw new Error(rpcErr.message || 'ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }

      setFormSuccess('ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว');
      handleRemoveFile();
      setCustomerNote('');
      setShowReUploadForm(false);

      // Refresh data
      await loadPaymentData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
    } finally {
      setSubmitting(false);
    }

  };

  // Real-time timer state to tick countdown every 30 seconds
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Derive active submission states
  const pendingSubmission = submissions.find((s) => s.status === 'PENDING');
  const latestSubmission = submissions[0] || null;
  const isBookingWaitingDeposit = booking.status === 'WAITING_DEPOSIT';
  const isBookingConfirmed = booking.status === 'CONFIRMED';

  // Deposit Deadline calculation (only when WAITING_DEPOSIT and no pending submission)
  const deadlineInfo = isBookingWaitingDeposit && !pendingSubmission ? getDepositDeadlineInfo(booking.approved_at, booking.created_at) : null;
  const isDeadlineExpired = Boolean(deadlineInfo?.isExpired);

  // Check if active bank/QR settings exist
  const hasActivePaymentSettings =
    paymentSettings &&
    paymentSettings.is_active &&
    (paymentSettings.bank_name ||
      paymentSettings.account_no ||
      paymentSettings.promptpay_id ||
      paymentSettings.payment_qr_path);

  return (
    <div className="space-y-4 font-prompt text-studio-primary">
      {/* 1. Deposit Payment Summary Card */}
      <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-3">
        <div className="flex items-center justify-between border-b border-studio-border/40 pb-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-studio-secondary flex items-center gap-1.5">
            <Wallet size={13} className="text-studio-red" /> สรุปยอดเงินมัดจำ
          </span>
          {isBookingConfirmed && (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
              ชำระมัดจำครบแล้ว
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="bg-studio-card p-2 rounded border border-studio-border/40">
            <span className="text-[9px] text-studio-secondary block">มัดจำที่กำหนด</span>
            <span className="font-bold text-studio-primary text-xs mt-0.5 block">
              ฿{formatCurrency(depositRequired)}
            </span>
          </div>
          <div className="bg-studio-card p-2 rounded border border-studio-border/40">
            <span className="text-[9px] text-studio-secondary block">รับแล้ว</span>
            <span className="font-bold text-emerald-400 text-xs mt-0.5 block">
              ฿{formatCurrency(paidTotal)}
            </span>
          </div>
          <div className="bg-studio-card p-2 rounded border border-studio-border/40">
            <span className="text-[9px] text-studio-secondary block">ยังขาดมัดจำ</span>
            <span
              className={
                'font-bold text-xs mt-0.5 block ' +
                (depositOutstanding > 0 ? 'text-studio-red' : 'text-studio-muted')
              }
            >
              ฿{formatCurrency(depositOutstanding)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Status Banner Contexts */}
      {/* A. Pending Submission Banner */}
      {pendingSubmission && (
        <div className="bg-[#171512] border border-[#C9A86A]/60 p-4 rounded-[6px] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
              <Clock size={15} className="text-[#C9A86A] animate-pulse" />
              <span>รอตรวจสอบการชำระเงิน</span>
            </div>
            <span className="text-[10px] bg-[#C9A86A]/20 text-[#ECE4D3] border border-[#C9A86A]/40 px-2 py-0.5 rounded font-mono">
              ฿{formatCurrency(pendingSubmission.claimed_amount)}
            </span>
          </div>

          <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
            เราได้รับหลักฐานการชำระเงินของคุณแล้วเมื่อ{' '}
            <span className="font-medium text-[#ECE4D3]">
              {formatThaiDate(pendingSubmission.submitted_at)}{' '}
              {formatTimeBangkok(pendingSubmission.submitted_at)}
            </span>{' '}
            ขณะนี้ผู้จัดการร้านกำลังดำเนินการตรวจสอบสลิปและจะยืนยันคิวให้คุณโดยเร็ว
          </p>

          {/* Pending Submission Details */}
          <div className="bg-studio-main/80 border border-studio-border/60 p-3 rounded-[4px] space-y-2 text-[11px]">
            {pendingSubmission.reference_no && (
              <div className="flex justify-between">
                <span className="text-studio-secondary">เลขอ้างอิง:</span>
                <span className="font-mono text-studio-primary">{pendingSubmission.reference_no}</span>
              </div>
            )}
            {pendingSubmission.customer_note && (
              <div className="space-y-1">
                <span className="text-studio-secondary block">หมายเหตุ:</span>
                <p className="text-studio-primary bg-studio-card/80 p-1.5 rounded text-[10px]">
                  {pendingSubmission.customer_note}
                </p>
              </div>
            )}

            {/* Slip Preview */}
            {slipSignedUrls[pendingSubmission.id] && (
              <div className="pt-1 flex items-center justify-between">
                <span className="text-studio-secondary text-[10px]">หลักฐานที่ส่ง:</span>
                <button
                  type="button"
                  onClick={() => setPreviewModalUrl(slipSignedUrls[pendingSubmission.id])}
                  className="inline-flex items-center gap-1 text-[10px] text-studio-red hover:underline font-medium"
                >
                  <Eye size={12} /> ดูรูปสลิป
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* B. Rejected Banner (When latest is rejected and no active pending) */}
      {!pendingSubmission && latestSubmission?.status === 'REJECTED' && !showReUploadForm && isBookingWaitingDeposit && (
        <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-[6px] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-red-400">
            <AlertTriangle size={15} />
            <span>หลักฐานการชำระเงินไม่ผ่านการตรวจสอบ</span>
          </div>

          <div className="text-[11px] text-red-200/90 leading-relaxed space-y-1">
            <p className="text-[10px] text-studio-secondary">เหตุผลจากทางร้าน:</p>
            <p className="bg-red-950/60 border border-red-900/40 p-2.5 rounded text-red-300 font-light">
              {latestSubmission.rejection_reason || 'หลักฐานไม่ชัดเจนหรือไม่ตรงกับยอดเงินที่กำหนด'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowReUploadForm(true)}
            className="w-full bg-studio-red hover:bg-red-700 text-white text-xs font-semibold py-2 px-3 rounded-[4px] transition-colors flex items-center justify-center gap-1.5"
          >
            <UploadCloud size={14} /> ส่งหลักฐานการชำระเงินใหม่
          </button>
        </div>
      )}

      {/* C. Partial Payment Approved Banner */}
      {!pendingSubmission && paidTotal > 0 && isBookingWaitingDeposit && (
        <div className="bg-[#171512] border border-[#C9A86A]/40 p-3.5 rounded-[6px] space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>รับเงินมัดจำบางส่วนแล้ว</span>
            </div>
            <span className="text-xs font-bold text-emerald-400">฿{formatCurrency(paidTotal)}</span>
          </div>
          <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
            ได้รับเงินมัดจำบางส่วนเรียบร้อยแล้ว ยังขาดมัดจำอีก{' '}
            <span className="font-bold text-studio-red">฿{formatCurrency(depositOutstanding)}</span>{' '}
            กรุณาชำระส่วนที่เหลือเพื่อยืนยันคิวอย่างสมบูรณ์
          </p>
        </div>
      )}

      {/* D. Confirmed Booking Banner */}
      {isBookingConfirmed && (
        <div className="bg-[#171512] border border-emerald-800/40 p-3.5 rounded-[6px] space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <CheckCircle2 size={14} />
            <span>ยืนยันคิวเรียบร้อยแล้ว</span>
          </div>
          <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
            การชำระเงินมัดจำได้รับการตรวจสอบและยืนยันคิวเรียบร้อยแล้ว พบกันในวันนัดหมายตามกำหนดเวลา
          </p>
        </div>
      )}

      {/* E. Expired Deposit Deadline Banner */}
      {!pendingSubmission && isBookingWaitingDeposit && isDeadlineExpired && (
        <div className="bg-red-950/40 border border-red-900/60 p-4 rounded-[6px] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-red-400">
            <AlertTriangle size={16} />
            <span>หมดเวลาชำระมัดจำ</span>
          </div>
          <p className="text-[11px] text-red-200/90 leading-relaxed font-light">
            คิวนี้เกินกำหนดเวลาชำระเงินมัดจำ {booking.approved_at ? '24 ชั่วโมง' : '1 ชั่วโมง'}แล้ว (ครบกำหนดเมื่อ{' '}
            <span className="font-medium text-red-100">{deadlineInfo?.deadlineDateStr || 'ไม่ระบุ'}</span>)
          </p>
          <p className="text-[11px] text-[#ECE4D3] font-medium pt-1">
            กรุณาติดต่อร้านเพื่อดำเนินการเกี่ยวกับคิวนี้
          </p>
        </div>
      )}

      {/* F. Active Deposit Deadline Countdown Banner */}
      {!pendingSubmission && isBookingWaitingDeposit && deadlineInfo && !isDeadlineExpired && (
        <div className="bg-[#171512] border border-[#D9A441]/50 p-3.5 rounded-[6px] space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#D9A441]">
              <Clock size={14} className="animate-pulse" />
              <span>กำหนดชำระมัดจำภายใน {booking.approved_at ? '24 ชั่วโมง' : '1 ชั่วโมง'}</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#D9A441] bg-[#D9A441]/10 border border-[#D9A441]/40 px-2 py-0.5 rounded">
              เหลือเวลา {deadlineInfo.remainingText}
            </span>
          </div>
          <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
            มัดจำที่ต้องชำระ <span className="font-bold text-[#ECE4D3]">฿{formatCurrency(depositOutstanding)}</span> ภายใน{' '}
            <span className="font-medium text-[#ECE4D3]">{deadlineInfo.deadlineDateStr}</span>
          </p>
        </div>
      )}

      {/* 3. Shop Payment Information & QR Display (Only when WAITING_DEPOSIT, no pending, and NOT expired) */}
      {isBookingWaitingDeposit && !pendingSubmission && !isDeadlineExpired && (
        <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-4">
          <div className="border-b border-studio-border/40 pb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-studio-secondary flex items-center gap-1.5">
              <QrCode size={13} className="text-[#D9A441]" /> ช่องทางการชำระเงินมัดจำ
            </span>
            <span className="text-[10px] text-studio-muted">
              ยอดชำระ: <strong className="text-[#D9A441]">฿{formatCurrency(depositOutstanding)}</strong>
            </span>
          </div>

          {!hasActivePaymentSettings ? (
            <div className="bg-studio-card/80 border border-studio-border/60 p-4 rounded-[6px] text-center space-y-1.5">
              <Building2 size={24} className="mx-auto text-studio-secondary" />
              <p className="text-xs font-semibold text-studio-primary">
                กรุณาติดต่อร้านเพื่อขอข้อมูลการชำระเงิน
              </p>
              <p className="text-[11px] text-studio-secondary font-light">
                ทางร้านยังไม่ได้เปิดใช้งานช่องทางชำระเงินอัตโนมัติ กรุณาติดต่อทางร้านโดยตรง
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QR Code Section */}
              {qrSignedUrl && (
                <div className="flex flex-col items-center justify-center p-3 bg-studio-card/60 rounded-[6px] border border-studio-border/50 text-center space-y-2">
                  <div className="relative w-44 h-44 bg-white p-2 rounded-[6px] shadow-md border border-studio-border/80 flex items-center justify-center">
                    <Image
                      src={qrSignedUrl}
                      alt="Shop Payment QR"
                      width={160}
                      height={160}
                      className="w-full h-full object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-studio-primary">
                      สแกน QR Code พร้อมเพย์
                    </p>
                    <p className="text-[11px] text-studio-red font-semibold">
                      ยอดที่ต้องชำระ: ฿{formatCurrency(depositOutstanding)}
                    </p>
                  </div>
                </div>
              )}

              {/* Bank Account Details Grid */}
              <div className="space-y-2 text-xs">
                {paymentSettings?.bank_name && (
                  <div className="flex justify-between items-center bg-studio-card/80 p-2.5 rounded-[4px] border border-studio-border/40">
                    <span className="text-studio-secondary flex items-center gap-1.5 text-[11px]">
                      <Building2 size={13} /> ธนาคาร
                    </span>
                    <span className="font-semibold text-studio-primary text-[11px]">
                      {paymentSettings.bank_name}
                    </span>
                  </div>
                )}

                {paymentSettings?.account_no && (
                  <div className="flex justify-between items-center bg-studio-card/80 p-2.5 rounded-[4px] border border-studio-border/40">
                    <span className="text-studio-secondary flex items-center gap-1.5 text-[11px]">
                      <CreditCard size={13} /> เลขที่บัญชี
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-studio-primary text-xs">
                        {paymentSettings.account_no}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(paymentSettings.account_no!, 'account_no')}
                        className="p-1 hover:bg-studio-main rounded text-studio-secondary hover:text-studio-primary transition-colors"
                        title="คัดลอกเลขบัญชี"
                      >
                        {copiedKey === 'account_no' ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {paymentSettings?.account_name && (
                  <div className="flex justify-between items-center bg-studio-card/80 p-2.5 rounded-[4px] border border-studio-border/40">
                    <span className="text-studio-secondary text-[11px]">ชื่อบัญชี</span>
                    <span className="font-semibold text-studio-primary text-[11px]">
                      {paymentSettings.account_name}
                    </span>
                  </div>
                )}

                {paymentSettings?.promptpay_id && (
                  <div className="flex justify-between items-center bg-studio-card/80 p-2.5 rounded-[4px] border border-studio-border/40">
                    <span className="text-studio-secondary text-[11px]">พร้อมเพย์</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-studio-primary text-xs">
                        {paymentSettings.promptpay_id}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(paymentSettings.promptpay_id!, 'promptpay')}
                        className="p-1 hover:bg-studio-main rounded text-studio-secondary hover:text-studio-primary transition-colors"
                        title="คัดลอกพร้อมเพย์"
                      >
                        {copiedKey === 'promptpay' ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {paymentSettings?.payment_instruction && (
                  <div className="bg-[#171512] border border-studio-border/40 p-2.5 rounded-[4px] text-[10px] text-studio-secondary leading-relaxed font-light">
                    💡 {paymentSettings.payment_instruction}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Slip Upload & Form Section (Visible when WAITING_DEPOSIT or re-upload, no pending, and NOT expired) */}
      {(isBookingWaitingDeposit || showReUploadForm) && !pendingSubmission && !isDeadlineExpired && (
        <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-4">
          <div className="border-b border-studio-border/40 pb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-studio-secondary flex items-center gap-1.5">
              <UploadCloud size={13} className="text-studio-red" /> แจ้งชำระเงินมัดจำ
            </span>
            <span className="text-[10px] text-studio-muted font-light">แนบหลักฐานสลิปโอนเงิน</span>
          </div>

          {formError && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start gap-2 text-[11px] text-red-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-[4px] flex items-start gap-2 text-[11px] text-emerald-300">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* File Upload Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-studio-secondary block">
                รูปภาพสลิปโอนเงิน <span className="text-studio-red">*</span>
              </label>

              {!filePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-studio-border hover:border-studio-red/60 bg-studio-card/60 p-6 rounded-[6px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center space-y-2"
                >
                  <UploadCloud size={28} className="text-studio-secondary hover:text-studio-red transition-colors" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-studio-primary">
                      คลิกเพื่อเลือกรูปสลิป
                    </p>
                    <p className="text-[10px] text-studio-muted">
                      รองรับ JPG, PNG, WEBP (ไม่เกิน 5 MB)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative border border-studio-border rounded-[6px] overflow-hidden bg-studio-card p-3 space-y-2">
                  <div className="relative w-full h-48 bg-black/40 rounded overflow-hidden flex items-center justify-center">
                    <Image
                      src={filePreview}
                      alt="Slip Preview"
                      width={300}
                      height={200}
                      className="w-full h-full object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-studio-secondary truncate max-w-[180px]">
                      {selectedFile?.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] text-studio-secondary hover:text-studio-primary px-2 py-1 bg-studio-main border border-studio-border rounded"
                      >
                        เปลี่ยนรูป
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 bg-studio-main border border-studio-border rounded"
                      >
                        ลบรูป
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
              />
            </div>

            {/* Customer Note */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-studio-secondary block">
                หมายเหตุเพิ่มเติม <span className="text-[10px] text-studio-muted font-normal">(ถ้ามี)</span>
              </label>
              <textarea
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="ระบุข้อมูลเพิ่มเติมถึงทางร้าน..."
                className="w-full bg-studio-card border border-studio-border focus:border-studio-red focus:outline-none px-3 py-2 rounded-[4px] text-xs text-studio-primary resize-none font-light"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !selectedFile || targetDepositAmount <= 0}
              className="w-full bg-studio-red hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-studio-red text-white text-xs font-semibold py-2.5 px-4 rounded-[4px] transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              {submitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>กำลังส่งหลักฐาน...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>ส่งหลักฐานการชำระเงิน</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* 5. Payment Submission History List */}
      {submissions.length > 0 && (
        <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-3">
          <div className="border-b border-studio-border/40 pb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-studio-secondary flex items-center gap-1.5">
              <FileText size={13} className="text-studio-red" /> ประวัติการแจ้งชำระเงิน ({submissions.length})
            </span>
          </div>

          <div className="space-y-2">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-studio-card/80 border border-studio-border/60 p-2.5 rounded-[4px] space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-studio-primary text-xs">
                      ฿{formatCurrency(sub.claimed_amount)}
                    </span>
                    <span className="text-[10px] text-studio-secondary block font-light">
                      {formatThaiDate(sub.submitted_at)} {formatTimeBangkok(sub.submitted_at)}
                    </span>
                  </div>

                  {/* Submission Status Badge */}
                  <span
                    className={
                      'px-2 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 ' +
                      (sub.status === 'APPROVED'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                        : sub.status === 'REJECTED'
                        ? 'bg-red-950/60 text-red-400 border border-red-900/50'
                        : 'bg-[#171512] text-[#ECE4D3] border border-[#C9A86A]/50')
                    }
                  >
                    <span
                      className={
                        'w-1.5 h-1.5 rounded-full ' +
                        (sub.status === 'APPROVED'
                          ? 'bg-emerald-400'
                          : sub.status === 'REJECTED'
                          ? 'bg-red-400'
                          : 'bg-[#C9A86A] animate-pulse')
                      }
                    />
                    {sub.status === 'APPROVED'
                      ? 'อนุมัติแล้ว'
                      : sub.status === 'REJECTED'
                      ? 'ปฏิเสธ'
                      : 'รอตรวจสอบ'}
                  </span>
                </div>

                {sub.reference_no && (
                  <p className="text-[10px] text-studio-secondary font-mono">
                    Ref: {sub.reference_no}
                  </p>
                )}

                {sub.status === 'REJECTED' && sub.rejection_reason && (
                  <p className="text-[10px] text-red-300 bg-red-950/40 border border-red-900/30 p-1.5 rounded font-light">
                    เหตุผล: {sub.rejection_reason}
                  </p>
                )}

                {slipSignedUrls[sub.id] && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPreviewModalUrl(slipSignedUrls[sub.id])}
                      className="inline-flex items-center gap-1 text-[10px] text-studio-secondary hover:text-studio-primary transition-colors"
                    >
                      <ImageIcon size={11} /> ดูรูปสลิป
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. High-Res Slip Lightbox Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fadeIn">
          <div className="relative max-w-lg w-full bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-3 border-b border-studio-border flex justify-between items-center bg-studio-main">
              <span className="text-xs font-bold text-studio-primary flex items-center gap-1.5">
                <ImageIcon size={14} className="text-studio-red" /> หลักฐานสลิปการโอนเงิน
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="p-1 hover:bg-studio-card rounded text-studio-secondary hover:text-studio-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex items-center justify-center bg-black/50 min-h-[300px]">
              <Image
                src={previewModalUrl}
                alt="Payment Slip Full View"
                width={500}
                height={600}
                className="max-h-[75vh] w-auto object-contain rounded"
                unoptimized
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
