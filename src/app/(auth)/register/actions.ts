'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentMembership } from '@/lib/auth/membership'

export async function registerOwner(formData: FormData) {
  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  
  const shopName = formData.get('shopName') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string

  if (password !== confirmPassword) {
    return { error: 'รหัสผ่านไม่ตรงกัน' }
  }

  const supabase = await createClient()

  // STEP A: Auth Registration
  // First, check if the user is already logged in (maybe they registered but failed to create a shop)
  const { data: { session } } = await supabase.auth.getSession()
  
  let signUpError = null
  
  if (!session) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    })
    
    if (error) {
      if (error.message.includes('already registered')) {
         return { error: 'อีเมลนี้ถูกใช้งานแล้ว' }
      }
      return { error: error.message }
    }
  }

  // At this point, we should have a session (since confirm email is OFF)
  // Or if they were already logged in. 
  
  // Wait a moment for trigger to create profile, just in case (usually immediate)
  // Then proceed to create shop with owner.
  
  // STEP B: Create Shop (RPC will automatically use auth.uid() and create profile if needed)
  const shopSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  
  const { data: shopId, error: rpcError } = await supabase.rpc('create_shop_with_owner', {
    p_shop_name: shopName,
    p_shop_slug: shopSlug,
    p_phone: phone,
    p_address: address
  })

  if (rpcError) {
    // Handle specific DB errors gracefully
    if (rpcError.message.includes('OWNER_SHOP_ALREADY_EXISTS')) {
      return { error: 'คุณเป็นเจ้าของร้านอยู่แล้ว' }
    }
    if (rpcError.message.includes('INVALID_SLUG')) {
      return { error: 'ชื่อร้านไม่สามารถใช้เป็น URL ได้ กรุณาใช้ชื่ออื่น' }
    }
    if (rpcError.message.includes('PROFILE_NOT_FOUND')) {
      return { error: 'ไม่พบโปรไฟล์ผู้ใช้ (Profile Trigger อาจจะทำงานช้า) กรุณาลองใหม่อีกครั้ง' }
    }
    return { error: 'เกิดข้อผิดพลาดในการสร้างร้าน: ' + rpcError.message }
  }

  // Redirect on success
  redirect('/owner/dashboard')
}
