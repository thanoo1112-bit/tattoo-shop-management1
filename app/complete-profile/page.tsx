'use client';

import React, { useState, useEffect } from 'react';
import { useApp, checkIsCustomerProfileComplete } from '@/components/AppContext';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Phone, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  LogOut,
  ArrowRight
} from 'lucide-react';

export default function CompleteProfilePage() {
  const { 
    supabase,
    user, 
    profile, 
    customerName, 
    customerPhone, 
    customerProfileCompletedAt,
    customerEligibilityConfirmedAt,
    isCustomerProfileComplete,
    isLoggedIn, 
    authLoading, 
    completeCustomerProfile, 
    logoutCustomer 
  } = useApp();
  
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Final Complete Profile Guard:
  // - If not logged in -> redirect to /login
  // - If profile is already complete -> redirect to /portal immediately
  useEffect(() => {
    let isCancelled = false;

    async function checkLiveStatus() {
      if (!isLoggedIn || !user) {
        router.replace('/login');
        return;
      }

      if (isCustomerProfileComplete) {
        router.replace('/portal');
        return;
      }

      // Query live customer master to prevent showing form if already complete
      try {
        const { data: cData } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (isCancelled) return;

        const effectivePhone = pData?.phone || cData?.phone || '';
        const isComplete = checkIsCustomerProfileComplete(
          pData?.role,
          pData?.is_active,
          effectivePhone,
          cData?.profile_completed_at,
          cData?.eligibility_confirmed_at
        );

        if (isComplete) {
          router.replace('/portal');
        }
      } catch (_) {}
    }

    if (!authLoading) {
      checkLiveStatus();
    }

    return () => {
      isCancelled = true;
    };
  }, [authLoading, isLoggedIn, isCustomerProfileComplete, router, user, supabase]);

  // 2. Prefill name and phone from Google / Profile
  useEffect(() => {
    if (!displayName) {
      const initialName = profile?.display_name || 
        user?.user_metadata?.full_name || 
        user?.user_metadata?.name || 
        (customerName && customerName !== 'ลูกค้า 157 TATTOO' ? customerName : '') || 
        user?.email?.split('@')[0] || 
        '';
      if (initialName) {
        setDisplayName(initialName);
      }
    }
    if (!phone && customerPhone) {
      setPhone(customerPhone.replace(/\D/g, '').slice(0, 10));
    }
  }, [profile, user, customerName, customerPhone, displayName, phone]);

  // Handle phone input: allow only digits, max 10 digits
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(raw);
    if (phoneError) setPhoneError('');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    if (nameError) setNameError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setPhoneError('');
    setServerError('');

    let hasError = false;

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError('กรุณากรอกชื่อผู้ใช้งาน');
      hasError = true;
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setPhoneError('กรุณากรอกเบอร์โทรศัพท์');
      hasError = true;
    } else if (!/^0[0-9]{9}$/.test(trimmedPhone)) {
      setPhoneError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก');
      hasError = true;
    }

    if (!disclaimerAccepted) {
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);
    // Single Authority: Call RPC with eligibilityConfirmed = true
    // NO direct update fallback
    const res = await completeCustomerProfile(trimmedName, trimmedPhone, true);
    setLoading(false);

    if (res.success) {
      setIsSuccess(true);
      setTimeout(() => {
        router.replace('/portal');
      }, 500);
    } else {
      setServerError(res.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0E0D0C] flex flex-col justify-center items-center font-prompt">
        <span className="text-sm text-[#A89F91] animate-pulse">
          กำลังตรวจสอบสถานะบัญชี...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt flex flex-col justify-center items-center px-4 py-8 relative">
      {/* Background Subtle Gradient */}
      <div className="absolute inset-0 bg-radial-vignette opacity-70 pointer-events-none" />

      {/* Main Centered Setup Card */}
      <div className="w-full max-w-md bg-[#171512] border border-[#4A443A] rounded-[12px] p-6 sm:p-8 shadow-2xl shadow-black/80 relative z-10 animate-fadeIn">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 bg-[#0E0D0C] border border-[#4A443A] px-3 py-1 rounded-full text-[10px] tracking-widest text-[#ECE4D3] uppercase font-mono mb-3">
            <Sparkles size={12} className="text-[#9C2F2F]" />
            <span>157 TATTOO • FIRST PROFILE SETUP</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            ตั้งค่าบัญชีของคุณ
          </h1>
          <p className="text-xs sm:text-sm text-[#A89F91] mt-1.5 font-light">
            กรอกข้อมูลสำหรับใช้ติดต่อและจัดการการจอง
          </p>
        </div>

        {/* Global Server Error Alert */}
        {serverError && (
          <div className="mb-5 p-3.5 bg-[#9C2F2F]/10 border border-[#9C2F2F]/40 rounded-[6px] flex items-start space-x-2.5 text-xs text-[#ECE4D3] animate-fadeIn">
            <AlertCircle size={15} className="text-[#9C2F2F] shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Success Alert */}
        {isSuccess && (
          <div className="mb-5 p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-[6px] flex items-center space-x-2.5 text-xs text-emerald-300 animate-fadeIn">
            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            <span>บันทึกข้อมูลเรียบร้อย กำลังเข้าสู่ระบบ...</span>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Display Name Field */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              ชื่อผู้ใช้งาน <span className="text-[#9C2F2F]">*</span>
            </label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
              <input
                type="text"
                value={displayName}
                onChange={handleNameChange}
                placeholder="ชื่อ-นามสกุล หรือชื่อเรียก"
                className={`w-full h-11 pl-9 pr-3.5 bg-[#0E0D0C] border ${
                  nameError ? 'border-[#9C2F2F]' : 'border-[#4A443A]'
                } hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors`}
              />
            </div>
            {nameError && (
              <p className="text-[11px] text-[#9C2F2F] mt-1 flex items-center space-x-1">
                <AlertCircle size={12} />
                <span>{nameError}</span>
              </p>
            )}
          </div>

          {/* 2. Phone Field */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              เบอร์โทรศัพท์ <span className="text-[#9C2F2F]">*</span>
            </label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="08xxxxxxxx"
                inputMode="numeric"
                className={`w-full h-11 pl-9 pr-3.5 bg-[#0E0D0C] border ${
                  phoneError ? 'border-[#9C2F2F]' : 'border-[#4A443A]'
                } hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs font-mono text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors`}
              />
            </div>
            {phoneError ? (
              <p className="text-[11px] text-[#9C2F2F] mt-1 flex items-center space-x-1">
                <AlertCircle size={12} />
                <span>{phoneError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-[#7A7265] mt-1 font-light">
                * ใช้สำหรับการติดต่อและยืนยันคิวสักเท่านั้น (เบอร์ไทย 10 หลัก)
              </p>
            )}
          </div>

          {/* 3. Disclaimer Checkbox */}
          <div className="pt-2">
            <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[#4A443A] bg-[#0E0D0C] text-[#9C2F2F] focus:ring-[#9C2F2F] focus:ring-offset-0 transition-colors shrink-0 accent-[#9C2F2F]"
              />
              <span className="text-xs text-[#A89F91] leading-relaxed group-hover:text-[#ECE4D3] transition-colors">
                ฉันยืนยันว่ามีอายุ 18 ปีบริบูรณ์ขึ้นไป และได้แจ้งข้อมูลสุขภาพที่อาจเกี่ยวข้องกับการรับบริการสักอย่างถูกต้อง
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={!disclaimerAccepted || loading || isSuccess}
              className={`w-full h-11 rounded-[6px] text-xs font-semibold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all ${
                !disclaimerAccepted || loading || isSuccess
                  ? 'bg-[#1C1A16] border border-[#4A443A] text-[#7A7265] cursor-not-allowed'
                  : 'bg-[#9C2F2F] hover:bg-[#852525] border border-[#9C2F2F] text-[#ECE4D3] shadow-lg shadow-[#9C2F2F]/20'
              }`}
            >
              {loading ? (
                <span className="inline-flex items-center space-x-2">
                  <span className="w-3.5 h-3.5 border-2 border-[#ECE4D3]/20 border-t-[#ECE4D3] rounded-full animate-spin" />
                  <span>กำลังบันทึกข้อมูล...</span>
                </span>
              ) : (
                <>
                  <span>ยืนยันข้อมูล</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer / Cancel Logout Option */}
        <div className="mt-6 pt-4 border-t border-[#4A443A]/50 text-center">
          <button
            type="button"
            onClick={() => logoutCustomer()}
            className="text-[11px] text-[#7A7265] hover:text-[#ECE4D3] inline-flex items-center space-x-1.5 transition-colors"
          >
            <LogOut size={12} />
            <span>ออกจากระบบ / ใช้บัญชีอื่น</span>
          </button>
        </div>
      </div>
    </div>
  );
}
