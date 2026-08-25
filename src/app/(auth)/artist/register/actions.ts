'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function registerArtist(formData: FormData) {
  const fullName = (formData.get('fullName') as string || '').trim()
  const email = (formData.get('email') as string || '').trim()
  const phone = (formData.get('phone') as string || '').trim()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  // Server-side validation
  if (!fullName) {
    return { error: 'กรุณากรอกชื่อที่ใช้แสดง' }
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'กรุณากรอกอีเมลให้ถูกต้อง' }
  }
  if (!phone || !/^0[0-9]{9}$/.test(phone)) {
    return { error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (เช่น 0812345678)' }
  }
  if (!password || password.length < 6) {
    return { error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' }
  }
  if (password !== confirmPassword) {
    return { error: 'รหัสผ่านไม่ตรงกัน' }
  }

  const supabase = await createClient()

  // 1. Auth signUp
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  })

  if (signUpError) {
    if (signUpError.message.includes('already registered')) {
      return { error: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ' }
    }
    return { error: 'การสมัครสมาชิกล้มเหลว: ' + signUpError.message }
  }

  // 2. Resolve Session
  const session = signUpData.session
  if (session) {
    // 3. register_artist_directly RPC
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc('register_artist_directly', {
      p_phone: phone
    })

    if (rpcError) {
      console.error('RPC register_artist_directly failed:', rpcError)
      return {
        error: 'สมัครบัญชีสำเร็จ แต่ไม่สามารถผูกสิทธิ์ช่างสักได้: ' + rpcError.message,
        partialFailure: true
      }
    }

    // Success -> redirect
    redirect('/artist/dashboard')
  } else {
    // No session case
    return {
      success: true,
      message: 'สมัครบัญชีสำเร็จ กรุณายืนยันอีเมลก่อน'
    }
  }
}
