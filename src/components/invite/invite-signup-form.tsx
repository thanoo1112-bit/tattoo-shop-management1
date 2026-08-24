'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptInviteAction } from '@/app/invite/[token]/actions'
import { translateInviteError } from '@/lib/errors/invite-errors'
import { Loader2, Mail, Lock, User, Phone, Info } from 'lucide-react'
import { AcceptInviteButton } from '@/components/invite/accept-invite-button'
import { ProfileRecoveryForm } from '@/components/invite/profile-recovery-form'
import Link from 'next/link'

export function InviteSignupForm({ token, existingUser, hasProfile }: { token: string, existingUser: any, hasProfile: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'signup' | 'existing'>('signup')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleUseExisting = () => {
    if (existingUser) {
      setView('existing')
    } else {
      router.push(`/login?returnTo=/invite/${token}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const phone = formData.phone.trim()
    const email = formData.email.trim()
    const fullName = formData.fullName.trim()
    const password = formData.password

    const phoneRegex = /^(0\d{9}|\+66\d{8})$/
    if (!phoneRegex.test(phone)) {
      setError('เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาระบุเบอร์ 10 หลัก (เช่น 0812345678)')
      return
    }

    if (password !== formData.confirmPassword) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }

    startTransition(async () => {
      const supabase = createClient()

      // Sign out existing session before creating a new user
      if (existingUser) {
        await supabase.auth.signOut()
      }
      
      // Step A: Sign Up
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })

      if (authError || !authData.user) {
        setError(authError?.message || 'การสมัครสมาชิกล้มเหลว')
        return
      }

      // Update phone via RLS (Trigger already created the profile)
      const { error: phoneError } = await supabase
        .from('profiles')
        .update({ phone: phone })
        .eq('id', authData.user.id)

      // Step B: Accept Invite
      const acceptRes = await acceptInviteAction(token)
      if (!acceptRes.success) {
        setError(translateInviteError(acceptRes.error))
        return
      }

      if (phoneError) {
        console.error('Failed to update phone:', phoneError)
        // Partial failure: membership secured, but phone failed
        // Proceeding to dashboard anyway, user can edit phone later
      }

      // Success
      router.push(acceptRes.redirectUrl || '/artist/dashboard')
      router.refresh()
    })
  }

  if (view === 'existing' && existingUser) {
    return (
      <div className="space-y-6">
        {hasProfile ? (
          <>
            <div className="bg-[#171717] p-4 rounded-lg border border-[#262626] flex items-start gap-3">
              <Info className="w-5 h-5 text-[#A3A3A3] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[#E5E5E5] font-medium">เข้าสู่ระบบในชื่อ</p>
                <p className="text-sm text-[#A3A3A3] mt-0.5">{existingUser.email}</p>
              </div>
            </div>
            
            <AcceptInviteButton token={token} />
          </>
        ) : (
          <ProfileRecoveryForm token={token} userMetadata={existingUser.user_metadata || {}} />
        )}

        <div className="pt-4 border-t border-[#262626]">
          <p className="text-sm text-center text-[#A3A3A3]">
            ไม่ใช่บัญชีของคุณ? <Link href={`/login?returnTo=/invite/${token}`} className="text-[#FFFFFF] hover:underline transition-colors ml-1">สลับบัญชี</Link>
            <span className="mx-2 text-[#262626]">|</span>
            <button type="button" onClick={() => setView('signup')} className="text-[#A3A3A3] hover:text-[#FFFFFF] underline transition-colors">สร้างบัญชีใหม่</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">ชื่อ-นามสกุล</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <User className="h-4 w-4" />
            </div>
            <input
              type="text"
              name="fullName"
              required
              value={formData.fullName}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="John Doe"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">เบอร์โทรศัพท์</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Phone className="h-4 w-4" />
            </div>
            <input
              type="tel"
              name="phone"
              required
              value={formData.phone}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="0812345678"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">อีเมล</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Mail className="h-4 w-4" />
            </div>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="artist@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">รหัสผ่าน</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Lock className="h-4 w-4" />
            </div>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              value={formData.password}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">ยืนยันรหัสผ่าน</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Lock className="h-4 w-4" />
            </div>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              value={formData.confirmPassword}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center px-4 py-3 mt-6 text-sm font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              กำลังสร้างบัญชีและเข้าร่วม...
            </>
          ) : (
            'สร้างบัญชีช่างสัก'
          )}
        </button>
      </form>

      <div className="pt-4 border-t border-[#262626]">
        <p className="text-sm text-center text-[#A3A3A3]">
          มีบัญชีอยู่แล้ว?{' '}
          <button type="button" onClick={handleUseExisting} className="text-[#FFFFFF] hover:underline font-medium transition-colors">
            ใช้บัญชีเดิมเข้าร่วม
          </button>
        </p>
      </div>
    </div>
  )
}
