'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { X, AlertTriangle, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { sanitizeDigitsOnly, validateCustomerPhone, normalizeThaiPhone } from '@/lib/phoneUtils';

interface CustomerLoginModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CustomerLoginModal({ onClose, onSuccess }: CustomerLoginModalProps) {
  const { loginCustomer, signUpCustomer, loginWithGoogle } = useApp();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Tab: login, register
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    const res = await loginWithGoogle();
    if (!res.success) {
      setError(res.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Google');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || email.trim() === '') {
      setError('กรุณากรอกอีเมล');
      return;
    }

    if (authMode === 'register') {
      if (!displayName || displayName.trim() === '') {
        setError('กรุณากรอกชื่อ-นามสกุล หรือชื่อเรียก');
        return;
      }
      const phoneValidation = validateCustomerPhone(phone);
      if (!phoneValidation.valid) {
        setError(phoneValidation.error || 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก');
        return;
      }
      if (!consentAccepted) {
        setError('กรุณายืนยันว่ามีอายุ 18 ปีบริบูรณ์ขึ้นไป และได้แจ้งข้อมูลสุขภาพถูกต้อง');
        return;
      }
    }

    if (!password || password.trim() === '') {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setLoading(true);
    setSuccessMessage('');

    if (authMode === 'login') {
      const res = await loginCustomer(email, password);
      setLoading(false);
      if (res.success) {
        if (!res.isProfileComplete) {
          window.location.href = '/complete-profile';
        } else if (onSuccess) {
          onSuccess();
        }
      } else {
        let msg = res.error || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        }
        setError(msg);
      }
    } else {
      // Register Mode
      const res = await signUpCustomer(email, password, displayName, phone, consentAccepted);
      setLoading(false);
      if (res.success) {
        // Enforce Register-then-Login:
        // Switch to login tab, prefill email, clear password & registration fields
        setAuthMode('login');
        setSuccessMessage('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ');
        setPassword('');
        setDisplayName('');
        setPhone('');
        setConsentAccepted(false);
        setError('');
      } else {
        let msg = res.error || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        }
        setError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-studio-main/90 backdrop-blur-md animate-fadeIn font-prompt">
      {/* Modal Container: Mobile Bottom Sheet / Desktop Centered Card */}
      <div className="relative w-full max-w-sm bg-studio-card border-t sm:border border-studio-border p-6 sm:p-8 rounded-t-[16px] sm:rounded-[8px] shadow-2xl flex flex-col space-y-5 max-h-[92vh] overflow-y-auto">
        
        {/* Close Button (44px tap target) */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-studio-secondary hover:text-studio-red transition-colors"
          title="ปิด"
        >
          <X size={18} />
        </button>

        {/* Branding header in Bebas Neue */}
        <div className="text-center pt-1 space-y-1">
          <span className="text-xs uppercase tracking-[0.25em] text-studio-secondary font-heading block">
            {authMode === 'login' ? 'CUSTOMER ACCOUNT' : 'REGISTER ACCOUNT'}
          </span>
          <h2 className="text-2xl font-heading font-normal tracking-[0.1em] text-studio-primary">
            157 <span className="text-studio-red">TATTOO</span>
          </h2>
          <p className="text-xs text-studio-secondary font-light pt-0.5">
            {authMode === 'login' ? 'เข้าสู่ระบบเพื่อเข้าถึงประวัติและการจอง' : 'สมัครสมาชิกเพื่อจองนัดหมายออนไลน์'}
          </p>
        </div>

        {successMessage && (
          <div className="bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-emerald-400">
            <CheckCircle size={15} className="shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-2 space-y-4 sm:space-y-4.5">
          {authMode === 'register' && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium">
                ชื่อ-นามสกุล หรือชื่อเรียก
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full min-h-[54px] sm:min-h-[56px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium">
              อีเมล
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              required
              className="w-full min-h-[54px] sm:min-h-[56px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
            />
          </div>

          {authMode === 'register' && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizeDigitsOnly(e.target.value))}
                placeholder="0812345678"
                required
                className="w-full min-h-[54px] sm:min-h-[56px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full min-h-[54px] sm:min-h-[56px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary pl-4 pr-14 py-3 outline-none rounded-[4px] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-1 top-1 bottom-1 w-12 min-w-[44px] flex items-center justify-center text-studio-secondary hover:text-studio-primary transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Consent Checkbox (Register Mode Only) */}
          {authMode === 'register' && (
            <div className="pt-1">
              <label className="flex items-start space-x-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  required
                  className="mt-0.5 w-4 h-4 rounded border-studio-border bg-studio-main text-studio-red focus:ring-studio-red focus:ring-offset-0 transition-colors shrink-0 accent-studio-red"
                />
                <span className="text-xs text-studio-secondary leading-relaxed group-hover:text-studio-primary transition-colors">
                  ฉันยืนยันว่ามีอายุ 18 ปีบริบูรณ์ขึ้นไป และได้แจ้งข้อมูลสุขภาพที่อาจเกี่ยวข้องกับการรับบริการสักอย่างถูกต้อง
                </span>
              </label>
            </div>
          )}

          {/* Primary Tattoo Red CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || (authMode === 'register' && !consentAccepted)}
              className="min-h-[56px] sm:min-h-[58px] w-full bg-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider px-4 font-semibold transition-all rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center border border-studio-red"
            >
              {loading ? 'กำลังดำเนินการ...' : authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          </div>

          {/* Google OAuth Button in Login Mode */}
          {authMode === 'login' && (
            <div className="space-y-3 pt-1">
              <div className="relative flex items-center justify-center">
                <div className="border-t border-studio-border/60 w-full" />
                <span className="bg-studio-card px-3 text-[11px] text-studio-secondary uppercase tracking-wider font-light shrink-0">
                  หรือ
                </span>
                <div className="border-t border-studio-border/60 w-full" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading}
                className="w-full min-h-[54px] sm:min-h-[56px] bg-studio-sec border border-studio-border hover:border-studio-primary/40 hover:bg-studio-main text-studio-primary active:scale-[0.99] text-xs sm:text-sm font-medium transition-all duration-200 rounded-[4px] shadow-sm flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2s.7 5.5 1.9 7.9l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
                  />
                </svg>
                <span>{googleLoading ? 'กำลังเชื่อมต่อ Google...' : 'เข้าสู่ระบบด้วย Google'}</span>
              </button>
            </div>
          )}
        </form>

        {/* Switch Mode */}
        <div className="text-center pt-1 border-t border-studio-border/60">
          {authMode === 'login' ? (
            <p className="text-xs text-studio-secondary">
              ยังไม่มีบัญชี?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                  setSuccessMessage('');
                }}
                className="text-studio-red hover:underline font-semibold"
              >
                สมัครสมาชิก
              </button>
            </p>
          ) : (
            <p className="text-xs text-studio-secondary">
              มีบัญชีอยู่แล้ว?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setSuccessMessage('');
                }}
                className="text-studio-red hover:underline font-semibold"
              >
                เข้าสู่ระบบ
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
