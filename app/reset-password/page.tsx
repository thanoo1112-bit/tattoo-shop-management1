'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, CheckCircle, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();

  // Form State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Recovery Session & UI State
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let resolved = false;
    const supabase = createClient();

    const markValidSession = () => {
      if (isMounted && !resolved) {
        resolved = true;
        setHasValidSession(true);
        setIsVerifying(false);
      }
    };

    const markInvalidSession = () => {
      if (isMounted && !resolved) {
        resolved = true;
        setHasValidSession(false);
        setIsVerifying(false);
      }
    };

    const verifySession = async () => {
      try {
        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search);
          const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
          const hashParams = new URLSearchParams(hashStr);

          // 1. Check PKCE code in query or hash
          const code = searchParams.get('code') || hashParams.get('code');
          if (code) {
            const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (!codeErr && codeData.session) {
              markValidSession();
              return;
            }
          }

          // 2. Check token_hash in query or hash (OTP recovery)
          const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
          const type = searchParams.get('type') || hashParams.get('type');
          if (tokenHash && (type === 'recovery' || !type)) {
            const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'recovery',
            });
            if (!otpErr && otpData.session) {
              markValidSession();
              return;
            }
          }

          // 3. Check access_token & refresh_token in hash (Implicit Flow)
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          if (accessToken && refreshToken) {
            const { data: setSesData, error: setSesErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!setSesErr && setSesData.session) {
              markValidSession();
              return;
            }
          }
        }

        // 4. Check active session in Supabase Auth client
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          markValidSession();
          return;
        }

        // 5. Subscribe to Auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, eventSession) => {
          if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && eventSession) {
            markValidSession();
          }
        });

        // 6. Final fallback timeout if no session is obtained within 2 seconds
        setTimeout(() => {
          if (isMounted && !resolved) {
            subscription.unsubscribe();
            markInvalidSession();
          }
        }, 2000);
      } catch (_) {
        markInvalidSession();
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || password.trim() === '') {
      setError('กรุณากรอกรหัสผ่านใหม่');
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (!confirmPassword || confirmPassword.trim() === '') {
      setError('กรุณายืนยันรหัสผ่านใหม่');
      return;
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateErr) {
        setLoading(false);
        setError(updateErr.message || 'เกิดข้อผิดพลาดในการอัปเดตรหัสผ่าน');
        return;
      }

      // Password updated successfully
      // Sign out recovery session to ensure user logs in cleanly with new password
      await supabase.auth.signOut();
      
      setLoading(false);
      setIsSuccess(true);
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่');
    }
  };

  return (
    <div className="min-h-screen bg-studio-main flex items-center justify-center p-4 sm:p-6 font-prompt animate-fadeIn">
      <div className="w-full max-w-md bg-studio-card border border-studio-border p-6 sm:p-10 rounded-[8px] shadow-2xl space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-1.5">
          <span className="text-xs uppercase tracking-[0.25em] text-studio-secondary font-heading block">
            SET NEW PASSWORD
          </span>
          <h1 className="text-3xl sm:text-4xl font-heading font-normal tracking-[0.1em] text-studio-primary">
            157 <span className="text-studio-red">TATTOO</span>
          </h1>
          <h2 className="text-lg font-semibold text-studio-primary pt-2">
            ตั้งรหัสผ่านใหม่
          </h2>
        </div>

        {/* Verifying Session State */}
        {isVerifying ? (
          <div className="py-8 text-center space-y-3">
            <RefreshCw size={24} className="animate-spin text-studio-red mx-auto" />
            <p className="text-xs text-studio-secondary">
              กำลังตรวจสอบสิทธิ์การตั้งรหัสผ่านใหม่...
            </p>
          </div>
        ) : !hasValidSession && !isSuccess ? (
          /* Expired or Invalid Recovery Session State */
          <div className="space-y-6 pt-2 text-center animate-fadeIn">
            <div className="bg-red-950/40 border border-red-900/60 p-5 rounded-[6px] space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-800/50 flex items-center justify-center text-red-400">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-sm font-semibold text-red-400">
                ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว
              </h3>
              <p className="text-xs text-studio-secondary leading-relaxed max-w-xs">
                ลิงก์สำหรับการตั้งรหัสผ่านใหม่อาจถูกใช้งานไปแล้วหรือหมดอายุ กรุณาทำรายการขอส่งลิงก์ใหม่อีกครั้ง
              </p>
            </div>

            <Link
              href="/forgot-password"
              className="min-h-[50px] w-full bg-studio-red text-studio-paper hover:bg-tattoo-red-dark text-xs sm:text-sm uppercase tracking-wider font-semibold transition-colors rounded-[4px] flex items-center justify-center space-x-2 border border-studio-red"
            >
              <span>ขอส่งลิงก์ใหม่</span>
            </Link>
          </div>
        ) : isSuccess ? (
          /* Reset Password Success State */
          <div className="space-y-6 pt-2 text-center animate-fadeIn">
            <div className="bg-emerald-950/40 border border-emerald-900/60 p-5 rounded-[6px] space-y-3 flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-emerald-900/30 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
                <CheckCircle size={24} />
              </div>
              <h3 className="text-sm font-semibold text-emerald-300">
                ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว
              </h3>
              <p className="text-xs text-studio-secondary leading-relaxed max-w-xs">
                รหัสผ่านของคุณได้รับการเปลี่ยนเรียบร้อยแล้ว สามารถใช้รหัสผ่านใหม่เพื่อเข้าสู่ระบบได้ทันที
              </p>
            </div>

            <Link
              href="/login"
              className="min-h-[52px] w-full bg-studio-red text-studio-paper hover:bg-tattoo-red-dark text-xs sm:text-sm uppercase tracking-wider font-semibold transition-colors rounded-[4px] flex items-center justify-center space-x-2 border border-studio-red"
            >
              <span>เข้าสู่ระบบด้วยรหัสผ่านใหม่</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          /* Reset Password Form */
          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            {error && (
              <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[4px] flex items-start space-x-2.5 text-xs text-red-400">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div>
              <label 
                htmlFor="new-password-input"
                className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium"
              >
                รหัสผ่านใหม่ (NEW PASSWORD)
              </label>
              <div className="relative">
                <input
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary pl-4 pr-12 py-3 outline-none rounded-[4px] transition-colors disabled:opacity-50"
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

            <div>
              <label 
                htmlFor="confirm-password-input"
                className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-medium"
              >
                ยืนยันรหัสผ่านใหม่ (CONFIRM NEW PASSWORD)
              </label>
              <div className="relative">
                <input
                  id="confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full min-h-[50px] bg-studio-main border border-studio-border focus:border-studio-red text-sm text-studio-primary pl-4 pr-12 py-3 outline-none rounded-[4px] transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center text-studio-secondary hover:text-studio-primary transition-colors focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="min-h-[52px] w-full bg-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider font-semibold transition-all rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center border border-studio-red"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
