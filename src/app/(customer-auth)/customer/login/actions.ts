'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginCustomer(formData: FormData) {
  const email = (formData.get('email') as string || '').trim()
  const password = formData.get('password') as string
  const shopSlug = (formData.get('shopSlug') as string || '157-tattoo').trim()
  const returnTo = (formData.get('returnTo') as string || '').trim()

  if (!email || !password) {
    return { error: 'กรุณากรอกอีเมลและรหัสผ่าน' }
  }

  const supabase = await createClient()

  // 1. Sign in with Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authErr) {
    return { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
  }

  const user = authData.user
  if (!user) {
    return { error: 'เข้าสู่ระบบล้มเหลว' }
  }

  // 2. Check if they are a shop member (Staff)
  const { data: membership } = await supabase
    .from('shop_members')
    .select('role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membership) {
    if (membership.role === 'owner') {
      redirect('/owner/dashboard')
    } else if (membership.role === 'artist') {
      redirect('/artist/dashboard')
    }
  }

  // 3. Resolve shop_id
  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', shopSlug)
    .single()

  if (!shop) {
    return { error: 'ไม่พบข้อมูลร้านสักในระบบ' }
  }

  // 4. Ensure customer record exists for this customer (without creating for Owner/Artist)
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('shop_id', shop.id)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!customer) {
    // Check if there is an existing customer record with the same email that is NOT yet linked
    const { data: existingEmailCustomer } = await supabase
      .from('customers')
      .select('id, auth_user_id')
      .eq('shop_id', shop.id)
      .eq('email', email)
      .maybeSingle()

    if (existingEmailCustomer) {
      if (!existingEmailCustomer.auth_user_id) {
        // Link it!
        await supabase
          .from('customers')
          .update({ auth_user_id: user.id })
          .eq('id', existingEmailCustomer.id)
      } else if (existingEmailCustomer.auth_user_id !== user.id) {
        return { error: 'อีเมลนี้ถูกใช้งานร่วมกับบัญชีอื่นแล้ว' }
      }
    } else {
      // Create a default customer record with placeholder phone, user can update in Profile
      const fullName = user.user_metadata?.full_name || 'Customer'
      await supabase
        .from('customers')
        .insert({
          shop_id: shop.id,
          auth_user_id: user.id,
          full_name: fullName,
          phone_normalized: '0000000000', // placeholder
          email: email,
          source: 'online'
        })
    }
  }

  // Redirect to storefront or returnPath (enforcing internal relative paths)
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !/^(https?:)?\/\//i.test(returnTo)) {
    redirect(returnTo)
  } else {
    redirect(`/shop/${shopSlug}`)
  }
}
