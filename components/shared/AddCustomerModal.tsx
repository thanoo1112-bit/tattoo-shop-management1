'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  UserCheck, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';

export interface AddCustomerModalProps {
  role: 'ADMIN' | 'ARTIST';
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: any) => void;
}

interface DuplicateCardData {
  type: 'PHONE_MATCH' | 'EMAIL_MATCH' | 'CONFLICT';
  title: string;
  message: string;
  customer?: {
    id?: string;
    display_name?: string;
    phone?: string;
    email?: string;
    date_of_birth?: string | null;
  };
}

export default function AddCustomerModal({
  role,
  open,
  onClose,
  onSuccess,
}: AddCustomerModalProps) {
  const supabase = createClient();

  // Form State
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // UI & Validation State
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    phone?: string;
    email?: string;
  }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCardData | null>(null);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (open) {
      setDisplayName('');
      setPhone('');
      setEmail('');
      setDateOfBirth('');
      setFieldErrors({});
      setGeneralError(null);
      setDuplicateResult(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  // Thai phone normalizer: strips non-digits, converts +66/66 to 0
  const normalizeThaiPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('66') && digits.length === 11) {
      return '0' + digits.slice(2);
    }
    return digits;
  };

  // Client-side Validation before sending to RPC
  const validateForm = (): boolean => {
    const errors: { displayName?: string; phone?: string; email?: string } = {};
    setGeneralError(null);
    setDuplicateResult(null);

    // 1. Name required
    const cleanName = displayName.trim();
    if (!cleanName) {
      errors.displayName = 'กรุณาระบุชื่อลูกค้า';
    }

    // 2. Phone required & must be 10 digits starting with 0
    const cleanPhone = normalizeThaiPhone(phone);
    if (!cleanPhone) {
      errors.phone = 'กรุณาระบุเบอร์โทรศัพท์';
    } else if (!/^0[0-9]{9}$/.test(cleanPhone)) {
      errors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)';
    }

    // 3. Email optional, but if provided must be valid format
    const cleanEmail = email.trim();
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!validateForm()) return;

    setLoading(true);
    setGeneralError(null);
    setDuplicateResult(null);

    const cleanName = displayName.trim();
    const cleanPhone = normalizeThaiPhone(phone);
    const cleanEmail = email.trim() ? email.trim().toLowerCase() : null;
    const cleanDob = dateOfBirth || null;

    try {
      const rpcName = role === 'ADMIN' ? 'admin_create_customer' : 'artist_create_customer';

      const { data, error } = await supabase.rpc(rpcName, {
        p_display_name: cleanName,
        p_phone: cleanPhone,
        p_email: cleanEmail,
        p_date_of_birth: cleanDob,
      });

      if (error) {
        console.error(`[AddCustomerModal] RPC ${rpcName} error:`, error);
        if (error.code === '42501' || error.message?.includes('FORBIDDEN')) {
          setGeneralError('ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบใหม่');
        } else {
          setGeneralError(error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }
        setLoading(false);
        return;
      }

      // Handle Structured Response
      if (!data) {
        setGeneralError('ไม่ได้รับข้อมูลตอบกลับจากระบบ');
        setLoading(false);
        return;
      }

      // Case 1: Duplicate Conflict (Phone belongs to A, Email belongs to B)
      if (data.error_code === 'DUPLICATE_CONFLICT') {
        setDuplicateResult({
          type: 'CONFLICT',
          title: 'ตรวจพบข้อมูลขัดแย้ง',
          message: 'เบอร์โทรและอีเมลตรงกับข้อมูลลูกค้าคนละรายในระบบ กรุณาตรวจสอบข้อมูลก่อนบันทึก (ระบบไม่อนุญาตให้รวมข้อมูลอัตโนมัติ)',
        });
        setLoading(false);
        return;
      }

      // Case 2: Duplicate Email (Email already taken by another customer)
      if (data.error_code === 'DUPLICATE_EMAIL') {
        setDuplicateResult({
          type: 'EMAIL_MATCH',
          title: 'อีเมลนี้มีอยู่ในระบบแล้ว',
          message: `อีเมลนี้ถูกใช้งานโดยลูกค้า "${data.existing_display_name || 'ลูกค้าท่านอื่น'}" แล้ว ไม่สามารถใช้อีเมลซ้ำได้`,
          customer: {
            id: data.existing_customer_id,
            display_name: data.existing_display_name,
            email: cleanEmail || undefined,
          },
        });
        setLoading(false);
        return;
      }

      // Case 3: Other Error Codes
      if (!data.success) {
        if (data.error_code === 'INVALID_PHONE') {
          setFieldErrors((prev) => ({ ...prev, phone: data.message }));
        } else if (data.error_code === 'NAME_REQUIRED') {
          setFieldErrors((prev) => ({ ...prev, displayName: data.message }));
        } else {
          setGeneralError(data.message || 'ไม่สามารถบันทึกข้อมูลลูกค้าได้');
        }
        setLoading(false);
        return;
      }

      // Case 4: Existing Phone Found (Reused Customer)
      if (data.is_duplicate) {
        setDuplicateResult({
          type: 'PHONE_MATCH',
          title: 'พบข้อมูลลูกค้านี้ในระบบแล้ว',
          message: role === 'ARTIST'
            ? 'พบข้อมูลลูกค้านี้ในระบบเรียบร้อย ระบบได้เพิ่มลูกค้ารายนี้เข้าแฟ้มลูกค้าของคุณแล้ว'
            : 'พบข้อมูลลูกค้านี้ในระบบแล้ว สามารถเปิดดูข้อมูลและประวัติการใช้บริการได้ทันที',
          customer: data.customer,
        });
        setLoading(false);
        return;
      }

      // Case 5: Brand New Customer Created Successfully
      onSuccess(data.customer);
      onClose();
    } catch (err: any) {
      console.error('[AddCustomerModal] Unexpected error:', err);
      setGeneralError('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  const handleAcknowledgeDuplicate = () => {
    if (duplicateResult?.customer) {
      onSuccess(duplicateResult.customer);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Modal Dialog Card */}
      <div 
        className="w-full max-w-lg bg-[#171512] border border-[#4A443A] rounded-[10px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-prompt"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#4A443A]/60 bg-[#0E0D0C]/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-[#9C2F2F]/20 border border-[#9C2F2F]/40 flex items-center justify-center text-[#D64545]">
              <User size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-[#ECE4D3] tracking-wide">
                เพิ่มลูกค้าใหม่
              </h2>
              <p className="text-[11px] text-[#A89F91]">
                {role === 'ADMIN' ? 'สร้างประวัติลูกค้า Walk-in / ติดต่อช่องทางอื่น' : 'เพิ่มลูกค้าเข้าแฟ้มประวัติของคุณ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#7A7265] hover:text-[#ECE4D3] hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Duplicate Result Card (If Duplicate detected) */}
          {duplicateResult && (
            <div className={`p-4 rounded-[8px] border ${
              duplicateResult.type === 'PHONE_MATCH'
                ? 'bg-[#1C1A16] border-[#7A7265]/40 text-[#ECE4D3]'
                : duplicateResult.type === 'CONFLICT'
                ? 'bg-[#2A1515] border-[#D64545]/50 text-[#ECE4D3]'
                : 'bg-[#251A14] border-amber-600/40 text-[#ECE4D3]'
            } space-y-3 animate-fadeIn`}>
              <div className="flex items-start space-x-3">
                {duplicateResult.type === 'PHONE_MATCH' ? (
                  <UserCheck className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                ) : duplicateResult.type === 'CONFLICT' ? (
                  <ShieldAlert className="text-[#D64545] shrink-0 mt-0.5" size={20} />
                ) : (
                  <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                )}
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-semibold tracking-wide">
                    {duplicateResult.title}
                  </h4>
                  <p className="text-xs text-[#A89F91] leading-relaxed">
                    {duplicateResult.message}
                  </p>
                </div>
              </div>

              {/* Matched Customer Info */}
              {duplicateResult.customer && (
                <div className="p-3 bg-[#0E0D0C]/70 rounded-[6px] border border-white/5 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[#7A7265]">ชื่อลูกค้า:</span>
                    <span className="text-[#ECE4D3] font-medium font-prompt">
                      {duplicateResult.customer.display_name || '-'}
                    </span>
                  </div>
                  {duplicateResult.customer.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#7A7265]">เบอร์โทรศัพท์:</span>
                      <span className="text-emerald-400">
                        {formatThaiPhoneForDisplay(duplicateResult.customer.phone)}
                      </span>
                    </div>
                  )}
                  {duplicateResult.customer.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#7A7265]">อีเมล:</span>
                      <span className="text-[#ECE4D3]">
                        {duplicateResult.customer.email}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons for Duplicate Resolution */}
              {duplicateResult.type === 'PHONE_MATCH' && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAcknowledgeDuplicate}
                    className="px-4 py-2 bg-studio-red hover:bg-studio-red/90 text-[#ECE4D3] text-xs font-semibold rounded-[6px] transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>{role === 'ADMIN' ? 'เปิดดูข้อมูลลูกค้า' : 'ดูรายชื่อลูกค้า'}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* General Error Banner */}
          {generalError && (
            <div className="p-3 rounded-[6px] bg-[#2A1515] border border-[#D64545]/40 text-xs text-[#ECE4D3] flex items-start space-x-2">
              <AlertCircle size={16} className="text-[#D64545] shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Form */}
          {!duplicateResult && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field 1: Display Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#ECE4D3] flex items-center justify-between">
                  <span>ชื่อลูกค้า <span className="text-[#D64545]">*</span></span>
                  {fieldErrors.displayName && (
                    <span className="text-[11px] text-[#D64545]">{fieldErrors.displayName}</span>
                  )}
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (fieldErrors.displayName) setFieldErrors((p) => ({ ...p, displayName: undefined }));
                    }}
                    placeholder="เช่น สมชาย ใจดี"
                    disabled={loading}
                    className={`w-full h-[42px] pl-9 pr-3 bg-[#0E0D0C] border ${
                      fieldErrors.displayName ? 'border-[#D64545]' : 'border-[#4A443A] focus:border-[#9C2F2F]'
                    } rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors`}
                  />
                </div>
              </div>

              {/* Field 2: Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#ECE4D3] flex items-center justify-between">
                  <span>เบอร์โทรศัพท์ <span className="text-[#D64545]">*</span></span>
                  {fieldErrors.phone && (
                    <span className="text-[11px] text-[#D64545]">{fieldErrors.phone}</span>
                  )}
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: undefined }));
                    }}
                    placeholder="เช่น 0812345678 หรือ 081-234-5678"
                    disabled={loading}
                    className={`w-full h-[42px] pl-9 pr-3 bg-[#0E0D0C] border ${
                      fieldErrors.phone ? 'border-[#D64545]' : 'border-[#4A443A] focus:border-[#9C2F2F]'
                    } rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors font-mono`}
                  />
                </div>
                <p className="text-[10px] text-[#7A7265]">
                  ใช้ตัวเลข 10 หลัก (ระบบจะจัดการรูปแบบเบอร์ให้อัตโนมัติ)
                </p>
              </div>

              {/* Field 3: Email (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#ECE4D3] flex items-center justify-between">
                  <span>อีเมล <span className="text-[#7A7265] text-[10px] font-normal">(ไม่บังคับ)</span></span>
                  {fieldErrors.email && (
                    <span className="text-[11px] text-[#D64545]">{fieldErrors.email}</span>
                  )}
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                    }}
                    placeholder="เช่น customer@example.com"
                    disabled={loading}
                    className={`w-full h-[42px] pl-9 pr-3 bg-[#0E0D0C] border ${
                      fieldErrors.email ? 'border-[#D64545]' : 'border-[#4A443A] focus:border-[#9C2F2F]'
                    } rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors`}
                  />
                </div>
              </div>

              {/* Field 4: Date of Birth (Optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#ECE4D3] flex items-center justify-between">
                  <span>วันเกิด <span className="text-[#7A7265] text-[10px] font-normal">(ไม่บังคับ)</span></span>
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={loading}
                    className="w-full h-[42px] pl-9 pr-3 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end space-x-2.5 border-t border-[#4A443A]/40">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 bg-[#0E0D0C] hover:bg-[#1C1A16] border border-[#4A443A] text-xs text-[#ECE4D3] rounded-[6px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-studio-red hover:bg-studio-red/90 text-xs font-semibold text-[#ECE4D3] rounded-[6px] border border-studio-red-bright/30 transition-colors flex items-center space-x-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-[#D64545]" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>เพิ่มลูกค้า</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
