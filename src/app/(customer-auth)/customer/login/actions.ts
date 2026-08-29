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

  // 4. Ensure customer record exists — use the RPC which handles all upsert/link logic
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('shop_id', shop.id)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!customer) {
    // Try to link an unlinked record that matches this email
    const { data: existingEmailCustomer } = await supabase
      .from('customers')
      .select('id, auth_user_id, phone_normalized')
      .eq('shop_id', shop.id)
      .eq('email', email)
      .maybeSingle()

    if (existingEmailCustomer) {
      if (!existingEmailCustomer.auth_user_id) {
        // Safe to link: this was a manually-entered customer record with no auth account yet
        await supabase
          .from('customers')
          .update({ auth_user_id: user.id })
          .eq('id', existingEmailCustomer.id)
      } else if (existingEmailCustomer.auth_user_id !== user.id) {
        return { error: 'อีเมลนี้ถูกใช้งานร่วมกับบัญชีอื่นแล้ว' }
      }
      // else already linked to current user — nothing to do
    } else {
      // No customer record at all — user signed up via Supabase but customer row was never created
      // (happens when email confirmation is enabled and register skipped ensure_customer_account)
      // Create a minimal record; user should complete phone in Profile page
      const fullName = (user.user_metadata?.full_name as string | undefined) || 'Customer'
      const randomSuffix = Math.floor(Math.random() * 900000 + 100000).toString()
      await supabase
        .from('customers')
        .insert({
          shop_id: shop.id,
          auth_user_id: user.id,
          full_name: fullName,
          phone_normalized: `placeholder_${user.id.slice(0, 8)}_${randomSuffix}`,
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
