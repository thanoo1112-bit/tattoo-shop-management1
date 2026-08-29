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

  // 3. Resolve shop_id using public definer RPC
  const { data: shopData, error: shopErr } = await supabase
    .rpc('get_public_shop_by_slug', { p_slug: shopSlug })

  if (shopErr || !shopData || shopData.length === 0) {
    return { error: 'ไม่พบข้อมูลร้านสักในระบบ' }
  }
  const shop = shopData[0]

  // 4. Check for existing customer record linked to this auth user
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('shop_id', shop.id)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!customer) {
    // No customer row linked to this auth_user_id yet.
    // Try to link an existing unlinked record with the same email first.
    const { data: existingEmailCustomer } = await supabase
      .from('customers')
      .select('id, auth_user_id')
      .eq('shop_id', shop.id)
      .eq('email', email)
      .maybeSingle()

    if (existingEmailCustomer) {
      // Email already exists in this shop — block regardless of whether auth_user_id is NULL or another user.
      // Auto-linking by email alone would allow history takeover of another customer's record.
      // Staff must verify identity manually at the studio.
      return { error: 'อีเมลนี้มีข้อมูลลูกค้าอยู่ในระบบแล้ว กรุณาติดต่อร้านเพื่อยืนยันข้อมูล' }
    } else {
      // No customer record at all.
      // This happens when email confirmation is ON and register couldn't call ensure_customer_account.
      // Read real full_name and phone from user_metadata (saved during signUp).
      const metaFullName = (user.user_metadata?.full_name as string | undefined)?.trim() || ''
      const metaPhone = (user.user_metadata?.phone as string | undefined)?.trim() || ''

      if (!metaPhone || metaPhone.replace(/\D/g, '').length < 9) {
        // user_metadata has no valid phone — cannot create customer record safely
        return { error: 'ไม่พบข้อมูลเบอร์โทรในบัญชีของคุณ กรุณาติดต่อร้านเพื่อเชื่อมข้อมูล' }
      }

      const phoneNorm = metaPhone.replace(/\D/g, '')

      // Check if this phone is already taken by a different customer in this shop
      const { data: phoneConflict } = await supabase
        .from('customers')
        .select('id, auth_user_id')
        .eq('shop_id', shop.id)
        .eq('phone_normalized', phoneNorm)
        .maybeSingle()

      if (phoneConflict) {
        // Phone already exists in this shop — block regardless of whether auth_user_id is NULL or another user.
        // Auto-linking by phone alone would allow history takeover of another customer's record.
        // Staff must verify identity manually at the studio.
        return { error: 'เบอร์โทรศัพท์นี้มีข้อมูลอยู่ในระบบแล้ว กรุณาติดต่อร้านเพื่อยืนยันข้อมูล' }
      } else {
        // Create a new customer record with real data from user_metadata
        const { error: insertErr } = await supabase
          .from('customers')
          .insert({
            shop_id: shop.id,
            auth_user_id: user.id,
            full_name: metaFullName || 'Customer',
            phone_normalized: phoneNorm,
            email: email,
            source: 'online'
          })

        if (insertErr) {
          if (insertErr.message.includes('unique') || insertErr.code === '23505') {
            return { error: 'เบอร์โทรศัพท์นี้มีข้อมูลอยู่ในระบบแล้ว กรุณาติดต่อร้าน' }
          }
          return { error: 'ไม่สามารถสร้างข้อมูลลูกค้าได้ กรุณาลองใหม่อีกครั้ง' }
        }
      }
    }
  }

  // Redirect to storefront or returnPath (enforcing internal relative paths)
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !/^(https?:)?\/\//i.test(returnTo)) {
    redirect(returnTo)
  } else {
    redirect(`/shop/${shopSlug}`)
  }
}
