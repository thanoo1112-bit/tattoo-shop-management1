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

  // Validate phone: must have at least 9 digits after stripping non-digits
  const phoneNorm = phone.replace(/\D/g, '')
  if (phoneNorm.length < 9) {
    return { error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (อย่างน้อย 9 หลัก)' }
  }

  const supabase = await createClient()

  // 1. Resolve shop_id from slug using public SECURITY DEFINER RPC (bypasses RLS for anon)
  const { data: shopData, error: shopErr } = await supabase
    .rpc('get_public_shop_by_slug', { p_slug: shopSlug })

  if (shopErr || !shopData || shopData.length === 0) {
    return { error: 'ไม่พบข้อมูลร้านสักในระบบ' }
  }
  const shop = shopData[0]

  // 2. Perform Supabase signup — store full_name AND phone in user_metadata
  //    so they survive email confirmation and are available during first login.
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone: phoneNorm,  // normalised digits-only phone
      }
    }
  })

  if (signUpErr) {
    if (signUpErr.message.toLowerCase().includes('already registered') ||
        signUpErr.message.toLowerCase().includes('user already registered')) {
      return { error: 'อีเมลนี้ถูกใช้งานแล้ว' }
    }
    return { error: signUpErr.message }
  }

  // 3. Check if we have a session (email confirmation OFF) or not (email confirmation ON)
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // Email confirmation is OFF — user is signed in immediately.
    // Call ensure_customer_account to create/link the customer record with real phone & name.
    const { error: rpcErr } = await supabase.rpc('ensure_customer_account', {
      p_shop_id: shop.id,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email
    })

    if (rpcErr) {
      if (rpcErr.message.includes('already associated') ||
          rpcErr.message.includes('Phone number is already associated')) {
        return { error: 'เบอร์โทรศัพท์นี้มีข้อมูลอยู่ในระบบแล้ว กรุณาติดต่อร้าน' }
      }
      return { error: rpcErr.message }
    }
  } else {
    // Email confirmation is ON — no session yet.
    // full_name and phone are already saved in user_metadata above.
    // loginCustomer will read these on first login and create the real customer record.
    return {
      error: 'กรุณาตรวจสอบอีเมลของคุณและยืนยันการสมัคร จากนั้นกลับมาล็อกอินได้เลยครับ'
    }
  }

  // Enforce safe internal relative paths only, fallback to shop storefront
  const isSafeReturnTo = returnTo && 
                         returnTo.startsWith('/') && 
                         !returnTo.startsWith('//') && 
                         !/^(https?:)?\/\//i.test(returnTo)

  const destination = isSafeReturnTo ? returnTo : `/shop/${shopSlug}`
  
  console.log(`[registerCustomer] Redirecting to destination: ${destination} (returnTo: ${returnTo}, safe: ${isSafeReturnTo})`)
  redirect(destination)
}

