'use client';

import React, { useState, useRef } from 'react';
import { useApp } from '../AppContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, ArrowLeft, Shield, Eye, EyeOff } from 'lucide-react';

export default function StaffLoginPage() {
  const { loginStaff } = useApp();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const togglePasswordVisibility = (e: React.MouseEvent) => {
    e.preventDefault();
    if (passwordRef.current) {
      const isCurrentText = passwordRef.current.type === 'text';
      passwordRef.current.type = isCurrentText ? 'password' : 'text';
      setShowPassword(!isCurrentText);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[STAFF-LOGIN 01] submit started');
    setError('');

    const email = emailRef.current?.value?.trim() || '';
    const password = passwordRef.current?.value || '';
    console.log('[STAFF-LOGIN 02] refs read');

    if (!email) {
      setError('กรุณากรอกอีเมลพนักงาน');
      return;
    }

    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setLoading(true);
    
    try {
      console.log('[STAFF-LOGIN 03] before loginStaff');
      const result = await loginStaff(email, password);
      console.log('[STAFF-LOGIN 11] handleLogin received result. Success:', result.success, 'Role:', result.role);
      
      if (result.success) {
        if (typeof window !== 'undefined') {
          if (result.role === 'ADMIN') {
            window.location.replace('/admin/dashboard');
          } else {
            window.location.replace('/admin/dashboard');
          }
        }
      } else {
        setLoading(false);
        setError(result.error || 'ไม่พบผู้ใช้ในระบบ หรืออีเมลและรหัสผ่านไม่ถูกต้อง (สำหรับพนักงานเท่านั้น)');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  return (
    <div className="min-h-screen bg-studio-main flex flex-col lg:flex-row animate-fadeIn font-prompt">
      
      {/* LEFT 55%: Studio Artwork Atmosphere */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-studio-sec border-r border-studio-border flex-col justify-between p-12 xl:p-16">
        <img
          src="https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1600&auto=format&fit=crop&q=80"
          alt="157 Tattoo Studio"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-25 filter grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-studio-main/90 via-studio-main/60 to-studio-main/95" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center space-x-2 text-xs text-studio-secondary hover:text-studio-red transition-colors">
            <ArrowLeft size={14} />
            <span>กลับสู่หน้าเว็บหลัก</span>
          </Link>
        </div>

        <div className="relative z-10 space-y-4 max-w-lg">
          <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-3 py-1 rounded text-studio-paper text-[11px] uppercase font-heading tracking-widest">
            <Shield size={12} className="text-studio-red" />
            <span>Internal Access Portal</span>
          </div>
          <h1 className="text-4xl xl:text-6xl font-heading font-normal tracking-[0.1em] text-studio-primary">
            157 <span className="text-studio-red">TATTOO</span>
          </h1>
          <p className="text-sm text-studio-secondary leading-relaxed font-light">
            ระบบบริหารจัดการคิวงานสัก ตารางปฏิบัติงานช่าง และการตรวจสอบเงินมัดจำสำหรับเจ้าของร้านและช่างสักประจำสตูดิโอ
          </p>
        </div>

        <div className="relative z-10 text-xs text-studio-muted font-heading tracking-wider">
          157 TATTOO STUDIO • BANGKOK, THAILAND
        </div>
      </div>

      {/* RIGHT 45%: Staff Login Form */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center items-center px-6 py-12 lg:px-12 xl:px-16 bg-studio-main">
        <div className="w-full max-w-md bg-studio-card border border-studio-border p-8 md:p-10 rounded-[8px] space-y-6 shadow-2xl relative">
          {/* Top red accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-studio-red rounded-t-[8px]"></div>

          {/* Header */}
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-studio-red/15 border border-studio-red/30 rounded-full flex items-center justify-center text-studio-red mb-3">
              <ShieldCheck size={24} />
            </div>
            <h2 className="text-2xl md:text-3xl font-heading font-normal tracking-[0.1em] text-studio-primary">
              157 <span className="text-studio-red">TATTOO</span>
            </h2>
            <span className="text-xs font-heading font-normal text-studio-paper uppercase tracking-[0.25em] block mt-1">
              STAFF PORTAL
            </span>
            <p className="text-xs text-studio-secondary mt-1 font-light">
              สำหรับเจ้าของร้านและช่างสัก
            </p>
          </div>

            <form id="staff-login-form" onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="staff-email" className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                  Staff Email
                </label>
                <input
                  ref={emailRef}
                  id="staff-email"
                  type="email"
                  name="email"
                  defaultValue="admin@157tattoo.com"
                  autoComplete="username"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  placeholder="staff@157tattoo.com"
                  className="min-h-[48px] w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs sm:text-sm text-studio-primary px-3.5 py-3 outline-none rounded-[4px] transition-colors"
                />
              </div>

              <div>
                <label htmlFor="staff-password" className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-medium">
                  Password
                </label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="staff-password"
                    type="password"
                    name="password"
                    defaultValue=""
                    autoComplete="current-password"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    placeholder="••••••••"
                    className="min-h-[48px] w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs sm:text-sm text-studio-primary pl-3.5 pr-12 py-3 outline-none rounded-[4px] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center text-studio-secondary hover:text-studio-primary transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[48px] sm:min-h-[50px] w-full bg-studio-red border border-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider py-3.5 px-4 font-semibold transition-all rounded-[4px] disabled:opacity-50 shadow-md flex items-center justify-center"
                >
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ STAFF'}
                </button>
              </div>
            </form>

          <div className="text-center pt-2">
            <Link href="/" className="text-xs text-studio-muted hover:text-studio-red transition-colors">
              ← กลับสู่หน้าร้านสำหรับลูกค้า
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
