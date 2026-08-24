'use server';

import { createClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/membership';
import { revalidatePath } from 'next/cache';

export async function updateOwnerProfile(formData: FormData) {
  const { user } = await requireOwner();
  const supabase = await createClient();

  const fullName = formData.get('full_name')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();

  if (!fullName) {
    return { error: 'กรุณากรอกชื่อที่ใช้แสดง' };
  }

  if (!phone) {
    return { error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: phone,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update owner profile:', error);
    return { error: 'ไม่สามารถบันทึกข้อมูลได้: ' + error.message };
  }

  revalidatePath('/owner/settings');
  revalidatePath('/owner', 'layout'); // Revalidate the entire owner layout to update sidebar and header
  return { success: true };
}

export async function updateShopDetails(formData: FormData) {
  const { membership } = await requireOwner();
  const supabase = await createClient();

  const name = formData.get('name')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim() || null;
  const address = formData.get('address')?.toString().trim() || null;

  if (!name) {
    return { error: 'กรุณากรอกชื่อร้าน' };
  }

  const { error } = await supabase
    .from('shops')
    .update({
      name,
      phone,
      address,
      updated_at: new Date().toISOString()
    })
    .eq('id', membership.shop_id);

  if (error) {
    console.error('Failed to update shop details:', error);
    return { error: 'ไม่สามารถบันทึกข้อมูลได้: ' + error.message };
  }

  revalidatePath('/owner/settings');
  revalidatePath('/owner', 'layout');
  return { success: true };
}

