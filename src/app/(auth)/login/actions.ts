'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentMembership } from '@/lib/auth/membership'

export async function login(formData: FormData) {
  const email = (formData.get('email') as string).trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'กรุณากรอกอีเมลและรหัสผ่าน' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  }

  // After login, handle returnTo if valid
  const returnTo = formData.get('returnTo') as string
  if (returnTo && returnTo.startsWith('/invite/')) {
    redirect(returnTo)
  }

  // We must check their role to redirect
  const membership = await getCurrentMembership()
  
  if (!membership) {
    return { error: 'บัญชีนี้ไม่ได้เป็นสมาชิกของร้าน' }
  }
  
  if (membership.role === 'owner') {
    redirect('/owner/dashboard')
  } else if (membership.role === 'artist') {
    redirect('/artist/dashboard')
  }
  
  return { error: 'Role ไม่ถูกต้อง' }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
