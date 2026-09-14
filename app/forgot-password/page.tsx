'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('กรุณากรอกอีเมล');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${origin}/reset-password`,
      });

      setLoading(false);

      if (resetErr) {
        // Handle rate limiting gracefully without exposing enumeration
        const msg = resetErr.message.toLowerCase();
        if (msg.includes('rate limit') || resetErr.status === 429) {
          setError('คุณได้ขอส่งลิงก์บ่อยเกินไป กรุณารอแป๊บหนึ่งแล้วลองใหม่อีกครั้ง');
          return;
        }
      }

      // Account Enumeration Protection: Always show success state for valid email format
      setIsSuccess(true);
    } catch (_) {
      setLoading(false);
      // Fallback: Account enumeration protection
      setIsSuccess(true);
    }
  };

  return (
    <div className="min-h-screen bg-studio-main flex items-center justify-center p-4 sm:p-6 font-prompt animate-fadeIn">
      <div className="w-full max-w-md bg-studio-card border border-studio-border p-6 sm:p-10 rounded-[8px] shadow-2xl space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-1.5">
          <span className="text-xs uppercase tracking-[0.25em] text-studio-secondary font-heading block">
            PASSWORD RECOVERY
          </span>
          <h1 className="text-3xl sm:text-4xl font-heading font-normal tracking-[0.1em] text-studio-primary">
            157 <span className="text-studio-red">TATTOO</span>
          </h1>
          <h2 className="text-lg font-semibold text-studio-primary pt-2">
            ลืมรหัสผ่าน
          </h2>
          <p className="text-xs sm:text-sm text-studio-secondary font-light max-w-xs mx-auto leading-relaxed">
            กรอกอีเมลที่ใช้สมัครสมาชิก เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ
          </p>
        </div>

        {/* Inline Error State */}
        {error && (
          <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[4px] flex items-start space-x-2.5 text-xs text-red-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Success State */}
        {isSuccess ? (
          <div className="space-y-6 pt-2 text-center animate-fadeIn">
            <div className="bg-emerald-950/40 border border-emerald-900/60 p-5 rounded-[6px] space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-emerald-900/30 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
                <Mail size={24} />
              </div>
              <h3 className="text-sm font-semibold text-emerald-300">
                ✓ ตรวจสอบอีเมลของคุณ
              </h3>
              <p className="text-xs text-studio-secondary leading-relaxed max-w-xs">
                หากอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้แล้ว กรุณาตรวจสอบกล่องข้อความหรืออีเมลขยะของคุณ
              </p>
            </div>

            <Link
              href="/login"
              className="min-h-[50px] w-full bg-studio-sec border border-studio-border hover:border-studio-primary text-studio-primary text-xs sm:text-sm uppercase tracking-wider font-medium transition-colors rounded-[4px] flex items-center justify-center space-x-2"
            >
              <ArrowLeft size={16} />
              <span>กลับไปเข้าสู่ระบบ</span>
            </Link>
          </div>
        ) : (
          /* Request Form */
          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            <div>
              <label 
                htmlFor="forgot-email-input"
                className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium"
              >
                อีเมล (EMAIL ADDRESS)
              </label>
              <input
                id="forgot-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@example.com"
                disabled={loading}
                autoComplete="email"
                className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary px-4 py-3 outline-none rounded-[4px] transition-colors disabled:opacity-50"
              />
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="min-h-[52px] w-full bg-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider font-semibold transition-all rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center border border-studio-red"
              >
                {loading ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
              </button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-primary transition-colors py-1"
                >
                  <ArrowLeft size={14} />
                  <span>กลับไปเข้าสู่ระบบ</span>
                </Link>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
