'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function registerCustomer(formData: FormData) {
  const fullName = (formData.get('fullName') as string || '').trim()
  const phone = (formData.get('phone') as string || '').trim()
  const email = (formData.get('email') as string || '').trim()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const shopSlug = (formData.get('shopSlug') as string || '157-tattoo').trim()

  const returnTo = (formData.get('returnTo') as string || '').trim()

  if (!fullName || !phone || !email || !password) {
    return { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }
  }

  if (password !== confirmPassword) {
    return { error: 'รหัสผ่านไม่ตรงกัน' }
  }

  const supabase = await createClient()

  // 1. Resolve shop_id from slug
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', shopSlug)
    .single()

  if (shopErr || !shop) {
    return { error: 'ไม่พบข้อมูลร้านสักในระบบ' }
  }

  // 2. Perform Supabase signup
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  })

  if (signUpErr) {
    if (signUpErr.message.includes('already registered')) {
      return { error: 'อีเมลนี้ถูกใช้งานแล้ว' }
    }
    return { error: signUpErr.message }
  }

  // 3. Ensure the customer record is created/linked using RPC ensure_customer_account
  // Since signup signs in the user automatically (or if email confirmation is off), auth.uid() will be available.
  // Wait! If email confirmation is ON, supabase.auth.signUp() does NOT sign the user in.
  // Let's check if the session is present.
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session) {
    const { data: customerId, error: rpcErr } = await supabase.rpc('ensure_customer_account', {
      p_shop_id: shop.id,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email
    })

    if (rpcErr) {
      if (rpcErr.message.includes('already associated') || rpcErr.message.includes('already registered')) {
        return { error: 'เบอร์โทรศัพท์นี้ถูกใช้งานในระบบแล้ว กรุณาติดต่อช่างสักเพื่อยืนยันตัวตน' }
      }
      return { error: rpcErr.message }
    }
  } else {
    // If email confirmation is ON, we might not have a session.
    // The user will need to confirm their email first.
    return { error: 'กรุณาตรวจสอบกล่องข้อความในอีเมลเพื่อยืนยันการสมัครสมาชิก' }
  }

  // Redirect to returnTo path (if relative/internal) or storefront home
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !/^(https?:)?\/\//i.test(returnTo)) {
    redirect(returnTo)
  } else {
    redirect(`/shop/${shopSlug}`)
  }
}
