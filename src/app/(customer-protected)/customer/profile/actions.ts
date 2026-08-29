'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentCustomer } from '@/lib/auth/customer'
import { revalidatePath } from 'next/cache'

export async function updateProfile(formData: FormData) {
  const customer = await getCurrentCustomer()
  if (!customer) {
    return { error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' }
  }

  const fullName = (formData.get('fullName') as string || '').trim()
  const phone = (formData.get('phone') as string || '').trim()

  if (!fullName || !phone) {
    return { error: 'กรุณากรอกข้อมูลชื่อและเบอร์โทรศัพท์' }
  }

  const phoneNorm = phone.replace(/\D/g, '')
  if (phoneNorm.length < 9) {
    return { error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' }
  }

  const supabase = await createClient()

  // Update customer record
  const { error } = await supabase
    .from('customers')
    .update({
      full_name: fullName,
      phone_normalized: phoneNorm,
      updated_at: new Date().toISOString()
    })
    .eq('id', customer.id)

  if (error) {
    if (error.message.includes('unique') || error.message.includes('phone_normalized')) {
      return { error: 'เบอร์โทรศัพท์นี้ถูกใช้งานโดยบัญชีอื่นแล้ว' }
    }
    return { error: error.message }
  }

  revalidatePath('/customer/profile')
  return { success: true }
}
