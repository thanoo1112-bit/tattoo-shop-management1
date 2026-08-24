import { createClient } from '@/lib/supabase/server'
import { InviteSignupForm } from '@/components/invite/invite-signup-form'
import { ShieldAlert, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

type Props = {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  // 1. Get Preview
  const { data, error: previewError } = await supabase
    .rpc('get_invite_preview', { p_token: token })
    .single()

  const previewData = data as any

  if (previewError || !previewData) {
    return <InvalidInviteState reason="invalid" />
  }

  if (!previewData.valid) {
    return <InvalidInviteState reason={previewData.reason} />
  }

  // 2. Check Auth Status
  const { data: { user } } = await supabase.auth.getUser()

  let hasProfile = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
    hasProfile = !!profile
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4 font-sans text-[#F3F3F3]">
      <div className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-xl shadow-2xl p-8 relative overflow-hidden">
        {/* Subtle top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FFFFFF]/20 to-transparent"></div>
        
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative w-12 h-12 mx-auto">
            <Image 
              src="/logo.png" 
              alt="157 TATTOO Logo" 
              fill
              className="object-contain"
              priority
            />
          </div>
          
          <span className="text-xl font-bold tracking-widest text-[#FFFFFF] mt-3">157 TATTOO</span>
          
          <h1 className="text-2xl font-light tracking-wide text-[#FFFFFF] mt-1 leading-tight">คำเชิญเข้าร่วมร้าน</h1>
          
          <p className="text-sm text-[#A3A3A3] mt-2 leading-snug">
            ในตำแหน่ง <span className="text-[#FFFFFF] font-medium capitalize">{previewData.role === 'artist' ? 'ช่างสัก' : previewData.role}</span>
          </p>
        </div>

        <InviteSignupForm token={token} existingUser={user} hasProfile={hasProfile} />
      </div>
    </div>
  )
}

function InvalidInviteState({ reason }: { reason: string }) {
  let message = 'ไม่พบคำเชิญนี้'
  if (reason === 'expired') message = 'ลิงก์เชิญนี้หมดอายุแล้ว'
  if (reason === 'revoked') message = 'ลิงก์เชิญนี้ถูกยกเลิกแล้ว'
  if (reason === 'accepted') message = 'ลิงก์เชิญนี้ถูกใช้งานไปแล้ว'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4 font-sans text-[#F3F3F3]">
      <div className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-xl shadow-2xl p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#A3A3A3]/20 to-transparent"></div>
        <div className="mx-auto w-16 h-16 rounded-full bg-[#171717] border border-[#333] flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-[#737373]" />
        </div>
        <h2 className="text-xl font-light text-[#FFFFFF] mb-3">ไม่สามารถดำเนินการได้</h2>
        <p className="text-[#A3A3A3] mb-8">{message}</p>
        <Link 
          href="/"
          className="inline-flex items-center text-sm font-medium text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors"
        >
          กลับหน้าหลัก <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </div>
  )
}
