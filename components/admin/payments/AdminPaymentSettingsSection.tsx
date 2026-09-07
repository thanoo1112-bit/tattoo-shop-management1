'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AdminPaymentSetting } from './types';
import {
  Building2,
  CreditCard,
  QrCode,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Save,
  RefreshCw,
  Eye,
  Trash2,
  Check,
  Copy,
  Info,
  Layers,
} from 'lucide-react';
import Image from 'next/image';

interface AdminPaymentSettingsSectionProps {
  onSuccessToast?: (msg: string) => void;
  onErrorToast?: (msg: string) => void;
}

export default function AdminPaymentSettingsSection({
  onSuccessToast,
  onErrorToast,
}: AdminPaymentSettingsSectionProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);

  // Form Fields
  const [displayName, setDisplayName] = useState('157 TATTOO STUDIO');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const [promptpayId, setPromptpayId] = useState('');
  const [paymentInstruction, setPaymentInstruction] = useState(
    'สแกน QR ด้วยแอปธนาคารของคุณ และแนบสลิปเพื่อยืนยันคิว'
  );
  const [isActive, setIsActive] = useState(false);
  const [currentQrPath, setCurrentQrPath] = useState<string | null>(null);
  const [qrSignedUrl, setQrSignedUrl] = useState<string | null>(null);

  // QR Upload File State
  const [selectedQrFile, setSelectedQrFile] = useState<File | null>(null);
  const [qrLocalPreview, setQrLocalPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load existing payment setting
  const loadSetting = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching payment settings:', error);
      } else if (data) {
        setSettingId(data.id);
        setDisplayName(data.payment_display_name || '157 TATTOO STUDIO');
        setBankName(data.bank_name || '');
        setAccountNo(data.account_no || '');
        setAccountName(data.account_name || '');
        setPromptpayId(data.promptpay_id || '');
        setPaymentInstruction(data.payment_instruction || '');
        setIsActive(Boolean(data.is_active));
        setCurrentQrPath(data.payment_qr_path || null);

        if (data.payment_qr_path) {
          const { data: signedData } = await supabase.storage
            .from('shop-payment-assets')
            .createSignedUrl(data.payment_qr_path, 3600);
          if (signedData?.signedUrl) {
            setQrSignedUrl(signedData.signedUrl);
          } else {
            setQrSignedUrl(null);
          }
        } else {
          setQrSignedUrl(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  // Handle QR File Selection
  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      if (onErrorToast) onErrorToast('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG และ WEBP');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (onErrorToast) onErrorToast('ขนาดไฟล์ต้องไม่เกิน 5 MB');
      return;
    }

    setSelectedQrFile(file);
    const objectUrl = URL.createObjectURL(file);
    setQrLocalPreview(objectUrl);
  };

  const handleClearSelectedQr = () => {
    setSelectedQrFile(null);
    if (qrLocalPreview) {
      URL.revokeObjectURL(qrLocalPreview);
      setQrLocalPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Save / Update Payment Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let newlyUploadedQrPath: string | null = null;
    const oldQrPath = currentQrPath;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 1. If a new QR file was chosen, upload it to shop-payment-assets
      if (selectedQrFile) {
        const fileExt = selectedQrFile.name.split('.').pop()?.toLowerCase() || 'png';
        const newPath = 'payment-qr/' + crypto.randomUUID() + '.' + fileExt;

        const { error: uploadErr } = await supabase.storage
          .from('shop-payment-assets')
          .upload(newPath, selectedQrFile, {
            contentType: selectedQrFile.type,
            upsert: false,
          });

        if (uploadErr) {
          throw new Error('อัปโหลดไฟล์ QR Code ไม่สำเร็จ: ' + uploadErr.message);
        }

        newlyUploadedQrPath = newPath;
      }

      const effectiveQrPath = newlyUploadedQrPath || currentQrPath;

      // 2. Prepare payload
      const payload: any = {
        payment_display_name: displayName.trim() || null,
        bank_name: bankName.trim() || null,
        account_no: accountNo.trim() || null,
        account_name: accountName.trim() || null,
        promptpay_id: promptpayId.trim() || null,
        payment_instruction: paymentInstruction.trim() || null,
        payment_qr_path: effectiveQrPath,
        is_active: isActive,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      };

      // 3. Database Upsert/Update
      if (settingId) {
        const { error: updateErr } = await supabase
          .from('payment_settings')
          .update(payload)
          .eq('id', settingId);

        if (updateErr) throw updateErr;
      } else {
        const { data: insertData, error: insertErr } = await supabase
          .from('payment_settings')
          .insert([payload])
          .select()
          .single();

        if (insertErr) throw insertErr;
        if (insertData) setSettingId(insertData.id);
      }

      // 4. If new QR uploaded successfully and DB saved, cleanup old QR file
      if (newlyUploadedQrPath && oldQrPath && oldQrPath !== newlyUploadedQrPath) {
        try {
          await supabase.storage.from('shop-payment-assets').remove([oldQrPath]);
        } catch (delOldErr) {
          console.error('Failed to remove old QR asset:', delOldErr);
        }
      }

      // 5. Reset local file input
      handleClearSelectedQr();
      if (effectiveQrPath) setCurrentQrPath(effectiveQrPath);

      if (onSuccessToast) onSuccessToast('บันทึกการตั้งค่าการชำระเงินเรียบร้อยแล้ว');
      await loadSetting();
    } catch (err: any) {
      console.error('Failed to save payment settings:', err);

      // Cleanup newly uploaded file if DB update failed
      if (newlyUploadedQrPath) {
        try {
          await supabase.storage.from('shop-payment-assets').remove([newlyUploadedQrPath]);
        } catch (cleanErr) {
          console.error('Error cleaning up new QR asset:', cleanErr);
        }
      }

      if (onErrorToast) {
        onErrorToast(err.message || 'บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setSaving(false);
    }
  };

  const effectivePreviewQrUrl = qrLocalPreview || qrSignedUrl;

  return (
    <div className="space-y-6 font-prompt">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Settings Form (7 cols) */}
        <div className="lg:col-span-7 bg-[#171512] border border-[#4A443A] p-5 sm:p-6 rounded-[8px] space-y-5">
          <div className="border-b border-[#4A443A] pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                <CreditCard size={17} className="text-[#9C2F2F]" />
                <span>ตั้งค่าบัญชีและ QR Code รับชำระเงิน</span>
              </h2>
              <p className="text-[11px] text-[#A89F91] mt-0.5 font-light">
                ข้อมูลที่ระบุจะแสดงให้ลูกค้าเห็นในหน้า Customer Portal สำหรับการโอนเงินมัดจำ
              </p>
            </div>
            {settingId && (
              <span className="text-[10px] text-[#7A7265] font-mono">
                ID: {settingId.slice(0, 8)}
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Active Toggle */}
            <div className="bg-[#1C1A17] border border-[#4A443A] p-3.5 rounded-[6px] flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-[#ECE4D3] block cursor-pointer">
                  สถานะการเปิดรับชำระเงินผ่านระบบ
                </label>
                <p className="text-[10px] text-[#A89F91] font-light">
                  {isActive
                    ? 'เปิดใช้งานอยู่ — ลูกค้าสามารถดู QR และโอนเงินมัดจำได้ทันที'
                    : 'ปิดการใช้งาน — ลูกค้าจะเห็นข้อความแนะนำให้ติดต่อร้านโดยตรง'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#4A443A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#9C2F2F]"></div>
              </label>
            </div>

            {/* Display Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#ECE4D3] block">
                ชื่อแสดงสำหรับรับชำระ
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น 157 TATTOO STUDIO"
                className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3]"
              />
            </div>

            {/* Bank Name & Account No */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  ธนาคาร
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="เช่น ธนาคารกสิกรไทย (KBANK)"
                  className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  เลขที่บัญชี
                </label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="เช่น 123-4-56789-0"
                  className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3] font-mono"
                />
              </div>
            </div>

            {/* Account Name & PromptPay */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  ชื่อบัญชี
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="เช่น บจก. สตูดิโอ 157 แทททู"
                  className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  พร้อมเพย์ (PromptPay ID) <span className="text-[10px] text-[#7A7265] font-normal">(ถ้ามี)</span>
                </label>
                <input
                  type="text"
                  value={promptpayId}
                  onChange={(e) => setPromptpayId(e.target.value)}
                  placeholder="เบอร์โทรศัพท์ หรือ เลขประจำตัวผู้เสียภาษี"
                  className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3] font-mono"
                />
              </div>
            </div>

            {/* Payment Instruction */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#ECE4D3] block">
                คำแนะนำในการชำระเงิน
              </label>
              <textarea
                rows={2}
                value={paymentInstruction}
                onChange={(e) => setPaymentInstruction(e.target.value)}
                placeholder="ระบุคำแนะนำเพิ่มเติมสำหรับลูกค้า เช่น สแกนและแนบสลิป..."
                className="w-full bg-[#1C1A17] border border-[#4A443A] focus:border-[#9C2F2F] focus:outline-none px-3 py-2 rounded-[4px] text-xs text-[#ECE4D3] font-light resize-none"
              />
            </div>

            {/* QR Code Upload Section */}
            <div className="space-y-2 pt-2 border-t border-[#4A443A]/60">
              <label className="text-xs font-semibold text-[#ECE4D3] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <QrCode size={14} className="text-[#9C2F2F]" />
                  <span>รูปภาพ QR Code ของร้าน</span>
                </span>
                <span className="text-[10px] text-[#7A7265] font-normal">Private Storage Bucket: shop-payment-assets</span>
              </label>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-[#1C1A17] border border-[#4A443A] hover:border-[#9C2F2F] text-xs text-[#ECE4D3] rounded-[4px] transition-colors flex items-center gap-1.5 font-medium"
                >
                  <UploadCloud size={14} className="text-[#9C2F2F]" />
                  <span>{currentQrPath || selectedQrFile ? 'เปลี่ยนรูป QR Code' : 'อัปโหลด QR Code'}</span>
                </button>

                {selectedQrFile && (
                  <div className="flex items-center gap-2 text-xs text-[#ECE4D3] bg-[#1C1A17] px-2.5 py-1.5 rounded border border-[#4A443A]">
                    <span className="truncate max-w-[160px] text-[11px]">{selectedQrFile.name}</span>
                    <button
                      type="button"
                      onClick={handleClearSelectedQr}
                      className="text-[#7A7265] hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleQrFileChange}
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
              />
            </div>

            {/* Save Button */}
            <div className="pt-3 border-t border-[#4A443A] flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-[#9C2F2F] hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-[4px] transition-colors flex items-center gap-2 shadow-md"
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>บันทึกการตั้งค่า</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Customer Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-[#A89F91] flex items-center gap-1.5">
              <Eye size={13} className="text-[#9C2F2F]" /> ตัวอย่างที่ลูกค้าจะเห็น (Live Preview)
            </span>
            <span
              className={
                "px-2 py-0.5 rounded text-[9px] font-semibold " +
                (isActive
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                  : "bg-red-950/60 text-red-400 border border-red-900/50")
              }
            >
              {isActive ? 'เปิดใช้งานอยู่' : 'ปิดใช้งาน'}
            </span>
          </div>

          <div className="bg-[#171512] border border-[#4A443A] p-4 rounded-[8px] space-y-4">
            <div className="border-b border-[#4A443A]/40 pb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold text-[#A89F91] flex items-center gap-1.5">
                <QrCode size={13} className="text-[#9C2F2F]" /> ช่องทางการชำระเงินมัดจำ
              </span>
              <span className="text-[10px] text-[#7A7265]">
                ยอดชำระ: <strong className="text-[#9C2F2F]">฿1,000</strong>
              </span>
            </div>

            {!isActive ? (
              <div className="bg-[#1C1A17] border border-[#4A443A]/60 p-5 rounded-[6px] text-center space-y-1.5">
                <Building2 size={24} className="mx-auto text-[#7A7265]" />
                <p className="text-xs font-semibold text-[#ECE4D3]">
                  กรุณาติดต่อร้านเพื่อขอข้อมูลการชำระเงิน
                </p>
                <p className="text-[10px] text-[#A89F91] font-light">
                  (ระบบปิดการรับชำระผ่าน QR อัตโนมัติชั่วคราว)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* QR Display */}
                {effectivePreviewQrUrl ? (
                  <div className="flex flex-col items-center justify-center p-3 bg-[#1C1A17] rounded-[6px] border border-[#4A443A]/50 text-center space-y-2">
                    <div className="relative w-40 h-40 bg-white p-2 rounded-[6px] shadow border border-[#4A443A] flex items-center justify-center">
                      <Image
                        src={effectivePreviewQrUrl}
                        alt="Shop QR Preview"
                        width={150}
                        height={150}
                        className="w-full h-full object-contain"
                        unoptimized
                      />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-[#ECE4D3]">
                        สแกน QR ด้วยแอปธนาคารของคุณ
                      </p>
                      <p className="text-[10px] text-[#9C2F2F] font-semibold">
                        ยอดที่ต้องชำระ: ฿1,000 (ตัวอย่าง)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-[#1C1A17] rounded-[6px] border border-dashed border-[#4A443A] text-center text-[11px] text-[#7A7265]">
                    ยังไม่ได้ตั้งค่ารูป QR Code
                  </div>
                )}

                {/* Bank Information Details */}
                <div className="space-y-2 text-xs">
                  {bankName && (
                    <div className="flex justify-between items-center bg-[#1C1A17] p-2.5 rounded-[4px] border border-[#4A443A]/40">
                      <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                        <Building2 size={13} /> ธนาคาร
                      </span>
                      <span className="font-semibold text-[#ECE4D3] text-[11px]">
                        {bankName}
                      </span>
                    </div>
                  )}

                  {accountNo && (
                    <div className="flex justify-between items-center bg-[#1C1A17] p-2.5 rounded-[4px] border border-[#4A443A]/40">
                      <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                        <CreditCard size={13} /> เลขที่บัญชี
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#ECE4D3] text-xs">
                          {accountNo}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(accountNo, 'acc')}
                          className="p-1 hover:bg-[#171512] rounded text-[#7A7265] hover:text-[#ECE4D3]"
                        >
                          {copiedKey === 'acc' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {accountName && (
                    <div className="flex justify-between items-center bg-[#1C1A17] p-2.5 rounded-[4px] border border-[#4A443A]/40">
                      <span className="text-[#A89F91] text-[11px]">ชื่อบัญชี</span>
                      <span className="font-semibold text-[#ECE4D3] text-[11px]">
                        {accountName}
                      </span>
                    </div>
                  )}

                  {promptpayId && (
                    <div className="flex justify-between items-center bg-[#1C1A17] p-2.5 rounded-[4px] border border-[#4A443A]/40">
                      <span className="text-[#A89F91] text-[11px]">พร้อมเพย์</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#ECE4D3] text-xs">
                          {promptpayId}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(promptpayId, 'pp')}
                          className="p-1 hover:bg-[#171512] rounded text-[#7A7265] hover:text-[#ECE4D3]"
                        >
                          {copiedKey === 'pp' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {paymentInstruction && (
                    <div className="bg-[#171512] border border-[#4A443A]/40 p-2.5 rounded-[4px] text-[10px] text-[#A89F91] leading-relaxed font-light">
                      💡 {paymentInstruction}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
