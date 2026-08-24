'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptInviteAction } from '@/app/invite/[token]/actions'
import { translateInviteError } from '@/lib/errors/invite-errors'
import { Loader2, User, Phone, Info } from 'lucide-react'

export function ProfileRecoveryForm({ token, userMetadata }: { token: string, userMetadata: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    fullName: userMetadata?.full_name || '',
    phone: userMetadata?.phone || ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    let phone = formData.phone.trim()
    
    // Only validate phone if provided
    if (phone) {
      const phoneRegex = /^(0\d{9}|\+66\d{8})$/
      if (!phoneRegex.test(phone)) {
        setError('เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาระบุเบอร์ 10 หลัก (เช่น 0812345678)')
        return
      }
    }

    startTransition(async () => {
      const supabase = createClient()
      
      // Step A: Recover Profile using RPC
      const { error: rpcError } = await supabase.rpc('recover_own_profile', {
        p_full_name: formData.fullName.trim() || 'Unknown User',
        p_phone: phone || null
      })

      if (rpcError) {
        setError('ไม่สามารถสร้างโปรไฟล์ได้: ' + rpcError.message)
        return
      }

      // Step B: Accept Invite
      const acceptRes = await acceptInviteAction(token)
      if (!acceptRes.success) {
        setError(translateInviteError(acceptRes.error))
        return
      }

      // Success
      router.push(acceptRes.redirectUrl || '/artist/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#171717] p-4 rounded-lg border border-[#262626] flex items-start gap-3">
        <Info className="w-5 h-5 text-[#3B82F6] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-[#E5E5E5] font-medium">กู้คืนข้อมูลโปรไฟล์</p>
          <p className="text-sm text-[#A3A3A3] mt-0.5">พบบัญชีของคุณในระบบ แต่ขาดข้อมูลโปรไฟล์ กรุณากรอกข้อมูลเพื่อดำเนินการต่อ</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-[#262626] rounded-md text-red-400 text-sm">
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
          <label className="block text-sm font-medium text-[#A3A3A3] mb-1.5">เบอร์โทรศัพท์ (ไม่บังคับ)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
              <Phone className="h-4 w-4" />
            </div>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="block w-full pl-10 bg-[#121212] border border-[#262626] rounded-md py-2.5 text-[#FFFFFF] placeholder-[#737373] focus:ring-1 focus:ring-[#FFFFFF] focus:border-[#FFFFFF] transition-colors"
              placeholder="0812345678"
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
              กำลังดำเนินการ...
            </>
          ) : (
            'ยืนยันข้อมูลและเข้าร่วม'
          )}
        </button>
      </form>
    </div>
  )
}