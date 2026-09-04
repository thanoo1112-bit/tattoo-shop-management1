'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Sparkles, ShieldCheck, Eye, EyeOff, CheckCircle, Shield, ArrowRight } from 'lucide-react';
import { sanitizeDigitsOnly, validateCustomerPhone } from '@/lib/phoneUtils';

interface CustomerLoginPageProps {
  initialFlipped?: boolean;
}

export default function CustomerLoginPage({ initialFlipped = false }: CustomerLoginPageProps) {
  const { 
    loginCustomer, 
    signUpCustomer, 
    loginWithGoogle, 
    loginStaff,
    isLoggedIn, 
    isStaffLoggedIn,
    staffRole,
    isCustomerProfileComplete 
  } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Flip State (false = Customer Front, true = Staff Back)
  const initialMode = searchParams.get('mode') === 'staff' || initialFlipped;
  const [isFlipped, setIsFlipped] = useState(initialMode);

  // Customer State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  
  const [successMessage, setSuccessMessage] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Staff State
  const [staffEmail, setStaffEmail] = useState('admin@157tattoo.com');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  const redirectUrl = searchParams.get('redirect') || '/portal';

  // Auto redirect if already logged in as Customer
  useEffect(() => {
    if (isLoggedIn && !customerLoading && !isStaffLoggedIn) {
      if (!isCustomerProfileComplete) {
        router.replace('/complete-profile');
      } else {
        router.replace(redirectUrl);
      }
    }
  }, [isLoggedIn, isCustomerProfileComplete, customerLoading, isStaffLoggedIn, redirectUrl, router]);

  // Auto redirect if already logged in as Staff
  useEffect(() => {
    if (isStaffLoggedIn && staffRole) {
      if (staffRole === 'ADMIN') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/admin/dashboard');
      }
    }
  }, [isStaffLoggedIn, staffRole, router]);

  // --- CUSTOMER LOGIN HANDLERS ---
  const handleGoogleSignIn = async () => {
    setCustomerError('');
    setGoogleLoading(true);
    const res = await loginWithGoogle();
    if (!res.success) {
      setCustomerError(res.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Google');
      setGoogleLoading(false);
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerError('');

    if (!email || email.trim() === '') {
      setCustomerError('กรุณากรอกอีเมล');
      return;
    }

    if (authMode === 'register') {
      if (!displayName || displayName.trim() === '') {
        setCustomerError('กรุณากรอกชื่อ-นามสกุล หรือชื่อเรียก');
        return;
      }
      const phoneValidation = validateCustomerPhone(phone);
      if (!phoneValidation.valid) {
        setCustomerError(phoneValidation.error || 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก');
        return;
      }
      if (!consentAccepted) {
        setCustomerError('กรุณายืนยันว่ามีอายุ 18 ปีบริบูรณ์ขึ้นไป และได้แจ้งข้อมูลสุขภาพถูกต้อง');
        return;
      }
    }

    if (!password || password.trim() === '') {
      setCustomerError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setCustomerLoading(true);
    setSuccessMessage('');

    if (authMode === 'login') {
      const res = await loginCustomer(email, password);
      setCustomerLoading(false);
      if (res.success) {
        if (res.isProfileComplete) {
          router.replace(redirectUrl);
        } else {
          router.replace('/complete-profile');
        }
      } else {
        let msg = res.error || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        }
        setCustomerError(msg);
      }
    } else {
      // Register Mode
      const res = await signUpCustomer(email, password, displayName, phone, consentAccepted);
      setCustomerLoading(false);
      if (res.success) {
        setAuthMode('login');
        setSuccessMessage('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ');
        setPassword('');
        setDisplayName('');
        setPhone('');
        setConsentAccepted(false);
        setCustomerError('');
      } else {
        let msg = res.error || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
        if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'บัญชีนี้ถูกสร้างก่อนการเปลี่ยนการตั้งค่าระบบ กรุณาใช้บัญชีใหม่หรือแจ้งผู้ดูแล';
        }
        setCustomerError(msg);
      }
    }
  };

  // --- STAFF LOGIN HANDLER ---
  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');

    const cleanEmail = staffEmail.trim();
    if (!cleanEmail) {
      setStaffError('กรุณากรอกอีเมลพนักงาน');
      return;
    }

    if (!staffPassword) {
      setStaffError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setStaffLoading(true);

    try {
      const res = await loginStaff(cleanEmail, staffPassword);
      if (res.success) {
        if (res.role === 'ADMIN') {
          router.replace('/admin/dashboard');
        } else {
          router.replace('/admin/dashboard');
        }
      } else {
        setStaffLoading(false);
        setStaffError(res.error || 'ไม่พบผู้ใช้ในระบบ หรืออีเมลและรหัสผ่านไม่ถูกต้อง (สำหรับพนักงานเท่านั้น)');
      }
    } catch (err: any) {
      setStaffLoading(false);
      setStaffError(err?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  return (
    <div className="min-h-screen bg-studio-main flex flex-col lg:flex-row animate-fadeIn font-prompt">
      
      {/* LEFT 50%: Hero Panel with Dynamic Crossfade on Flip */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden bg-studio-sec border-r border-studio-border flex-col justify-between p-12 xl:p-16">
        <img
          src={isFlipped 
            ? "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1600&auto=format&fit=crop&q=80"
            : "https://images.unsplash.com/photo-1560707303-4e980c87f92e?w=1600&auto=format&fit=crop&q=80"
          }
          alt="157 Tattoo Studio"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-30 filter grayscale contrast-125 transition-opacity duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-studio-main/90 via-studio-main/60 to-studio-main/95" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center space-x-2 text-xs text-studio-secondary hover:text-studio-red transition-colors">
            <ArrowLeft size={14} />
            <span>กลับสู่หน้าแรก</span>
          </Link>
        </div>

        {/* Dynamic Hero Text Content */}
        <div className="relative z-10 space-y-4 max-w-md min-h-[220px] flex flex-col justify-center">
          <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-3 py-1 rounded text-studio-paper text-[11px] uppercase font-heading tracking-widest self-start transition-all duration-300">
            {isFlipped ? (
              <>
                <Shield size={12} className="text-studio-red" />
                <span>Staff Management Portal</span>
              </>
            ) : (
              <>
                <Sparkles size={12} className="text-studio-red" />
                <span>Customer Experience Portal</span>
              </>
            )}
          </div>

          <h1 className="text-4xl xl:text-6xl font-heading font-normal tracking-[0.1em] text-studio-primary">
            157 <span className="text-studio-red">TATTOO</span>
          </h1>

          <p className="text-sm text-studio-secondary leading-relaxed font-light transition-opacity duration-300">
            {isFlipped 
              ? 'จัดการคิวงาน ลูกค้า ตารางงาน Flash และการดำเนินงานของร้านสำหรับทีมงานสตูดิโอ'
              : 'เข้าสู่ระบบเพื่อติดตามสถานะคิวงาน จัดการการแจ้งชำระมัดจำ และตรวจสอบใบเสนอราคาจากช่างสักที่คุณเลือก'
            }
          </p>
        </div>

        <div className="relative z-10 text-xs text-studio-muted flex items-center space-x-2">
          {isFlipped ? (
            <span className="font-heading tracking-wider">157 TATTOO STUDIO • BANGKOK, THAILAND</span>
          ) : (
            <>
              <ShieldCheck size={15} className="text-studio-red" />
              <span>มาตรฐานความสะอาด ปลอดภัย และระบบจัดการระดับมืออาชีพ</span>
            </>
          )}
        </div>
      </div>

      {/* RIGHT 50%: 3D Flip Card Container */}
      <div className="w-full lg:w-[50%] flex flex-col justify-center items-center px-4 sm:px-8 py-8 sm:py-12 lg:px-12 xl:px-16 bg-studio-main min-h-screen overflow-y-auto">
        
        {/* Mobile Back Link */}
        <div className="w-full max-w-md lg:hidden mb-4">
          <Link href="/" className="inline-flex items-center space-x-2 text-xs text-studio-secondary hover:text-studio-red transition-colors min-h-[40px]">
            <ArrowLeft size={15} />
            <span>กลับสู่หน้าแรก</span>
          </Link>
        </div>

        {/* 3D Perspective Wrapper */}
        <div className="w-full max-w-md [perspective:1400px]">
          
          {/* Card Rotator */}
          <div 
            className={`w-full transition-transform duration-500 [transform-style:preserve-3d] relative ${
              isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
            }`}
            style={{
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            
            {/* ============================================================ */}
            {/* FRONT FACE: CUSTOMER LOGIN & REGISTRATION */}
            {/* ============================================================ */}
            <div 
              className={`w-full bg-studio-card border border-studio-border p-6 sm:p-8 md:p-10 rounded-[8px] shadow-2xl [backface-visibility:hidden] ${
                isFlipped ? 'pointer-events-none' : 'pointer-events-auto'
              }`}
            >
              {/* Header Section */}
              <div className="text-center space-y-1.5 pb-2">
                <span className="text-xs uppercase tracking-[0.25em] text-studio-secondary font-heading block">
                  {authMode === 'login' ? 'CUSTOMER ACCOUNT' : 'REGISTER ACCOUNT'}
                </span>
                <h2 className="text-3xl sm:text-4xl font-heading font-normal tracking-[0.1em] text-studio-primary">
                  157 <span className="text-studio-red">TATTOO</span>
                </h2>
                <p className="text-xs text-studio-secondary font-light">
                  {authMode === 'login' ? 'เข้าสู่ระบบเพื่อเข้าถึงประวัติและการจอง' : 'สมัครสมาชิกเพื่อจองนัดหมายออนไลน์'}
                </p>
              </div>

              {successMessage && (
                <div className="mt-4 bg-emerald-950/40 border border-emerald-900/60 p-3.5 rounded-[4px] flex items-start space-x-2.5 text-xs text-emerald-400">
                  <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{successMessage}</span>
                </div>
              )}

              {customerError && (
                <div className="mt-4 bg-red-950/40 border border-red-900/60 p-3.5 rounded-[4px] flex items-start space-x-2.5 text-xs text-red-400">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{customerError}</span>
                </div>
              )}

              {isLoggedIn ? (
                <div className="text-center py-10 space-y-3">
                  <span className="text-xs text-studio-secondary animate-pulse block">
                    เข้าสู่ระบบสำเร็จ กำลังนำคุณไปยังหน้าต่างบริการลูกค้า...
                  </span>
                </div>
              ) : (
                <form onSubmit={handleCustomerSubmit} className="mt-6 sm:mt-7 space-y-4">
                  {authMode === 'register' && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                        ชื่อ-นามสกุล หรือชื่อเรียก
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                      อีเมล
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="customer@example.com"
                      className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
                    />
                  </div>

                  {authMode === 'register' && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                        เบอร์โทรศัพท์
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(sanitizeDigitsOnly(e.target.value))}
                        required
                        placeholder="0812345678"
                        className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                      รหัสผ่าน
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary pl-4 pr-12 py-3 outline-none rounded-[4px] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center text-studio-secondary hover:text-studio-primary transition-colors focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={customerLoading || (authMode === 'register' && !consentAccepted)}
                      className="w-full min-h-[52px] bg-studio-red border border-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider px-4 font-semibold transition-all duration-200 rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center"
                    >
                      {customerLoading ? 'กำลังดำเนินการ...' : authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
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
                        disabled={customerLoading || googleLoading}
                        className="w-full min-h-[50px] bg-studio-sec border border-studio-border hover:border-studio-primary/40 hover:bg-studio-main text-studio-primary active:scale-[0.99] text-xs sm:text-sm font-medium transition-all duration-200 rounded-[4px] shadow-sm flex items-center justify-center space-x-3 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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

                  {/* Register Toggle */}
                  <div className="pt-3 border-t border-studio-border/60 text-center">
                    {authMode === 'login' ? (
                      <p className="text-xs text-studio-secondary">
                        ยังไม่มีบัญชี?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('register');
                            setCustomerError('');
                            setSuccessMessage('');
                          }}
                          className="text-studio-red hover:underline font-semibold ml-1 py-1"
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
                            setCustomerError('');
                            setSuccessMessage('');
                          }}
                          className="text-studio-red hover:underline font-semibold ml-1 py-1"
                        >
                          เข้าสู่ระบบ
                        </button>
                      </p>
                    )}
                  </div>
                </form>
              )}

              {/* 3D Flip Action: Switch to Staff Login */}
              <div className="mt-5 pt-3 border-t border-studio-border/40 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsFlipped(true);
                    setCustomerError('');
                    setStaffError('');
                  }}
                  className="group inline-flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-primary transition-colors py-1.5 px-3 rounded hover:bg-studio-sec/60"
                >
                  <span className="font-light">สำหรับทีมงาน</span>
                  <ArrowRight size={14} className="text-studio-red transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            {/* ============================================================ */}
            {/* BACK FACE: STAFF LOGIN */}
            {/* ============================================================ */}
            <div 
              className={`w-full bg-studio-card border border-studio-border p-6 sm:p-8 md:p-10 rounded-[8px] shadow-2xl absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col justify-between overflow-y-auto ${
                isFlipped ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* Top Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-studio-red rounded-t-[8px]" />

              <div>
                {/* Header */}
                <div className="text-center space-y-1 pb-1">
                  <div className="mx-auto w-10 h-10 bg-studio-red/15 border border-studio-red/30 rounded-full flex items-center justify-center text-studio-red mb-2">
                    <ShieldCheck size={20} />
                  </div>
                  <span className="text-xs uppercase tracking-[0.25em] text-studio-paper font-heading block">
                    STAFF PORTAL
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-[0.1em] text-studio-primary">
                    157 <span className="text-studio-red">TATTOO</span>
                  </h2>
                  <p className="text-xs text-studio-secondary font-light">
                    เข้าสู่ระบบสำหรับเจ้าของร้านและช่างสัก
                  </p>
                </div>

                {staffError && (
                  <div className="mt-3 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{staffError}</span>
                  </div>
                )}

                <form onSubmit={handleStaffSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                      Staff Email
                    </label>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      required
                      placeholder="staff@157tattoo.com"
                      className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showStaffPassword ? 'text' : 'password'}
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary pl-4 pr-12 py-3 outline-none rounded-[4px] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        aria-label={showStaffPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center text-studio-secondary hover:text-studio-primary transition-colors focus:outline-none"
                      >
                        {showStaffPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={staffLoading}
                      className="w-full min-h-[52px] bg-studio-red border border-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider px-4 font-semibold transition-all duration-200 rounded-[4px] disabled:opacity-50 shadow-md flex items-center justify-center"
                    >
                      {staffLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบทีมงาน'}
                    </button>
                  </div>
                </form>
              </div>

              {/* 3D Flip Back Action: Return to Customer Login */}
              <div className="mt-6 pt-3 border-t border-studio-border/40 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsFlipped(false);
                    setStaffError('');
                    setCustomerError('');
                  }}
                  className="group inline-flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-primary transition-colors py-1.5 px-3 rounded hover:bg-studio-sec/60"
                >
                  <ArrowLeft size={14} className="text-studio-red transition-transform group-hover:-translate-x-0.5" />
                  <span className="font-light">กลับเข้าสู่ระบบลูกค้า</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}

