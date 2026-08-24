'use server';

import { createClient } from '@/lib/supabase/server';
import { requireArtist } from '@/lib/auth/membership';
import { revalidatePath } from 'next/cache';

export async function updateArtistProfile(formData: FormData) {
  const { user } = await requireArtist();
  const supabase = await createClient();

  const fullName = formData.get('displayName')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();
  const avatarUrl = formData.get('avatarUrl')?.toString().trim();

  if (!fullName) {
    return { error: 'กรุณากรอกชื่อที่ใช้แสดง' };
  }

  if (!phone) {
    return { error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }

  const updateData: any = {
    full_name: fullName,
    phone: phone
  };

  if (avatarUrl !== undefined) {
    updateData.avatar_url = avatarUrl;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);

  if (profileError) {
    console.error('Failed to update artist profile:', profileError);
    return { error: 'ไม่สามารถบันทึกข้อมูลส่วนตัวได้: ' + profileError.message };
  }

  const acceptsBlackGrey = formData.get('acceptsBlackGrey') === 'on' || formData.get('acceptsBlackGrey') === 'true';
  const acceptsColor = formData.get('acceptsColor') === 'on' || formData.get('acceptsColor') === 'true';

  const { membership } = await requireArtist();
  
  if (acceptsBlackGrey || acceptsColor) {
    const { error: memberError } = await supabase.rpc('update_my_artist_color_settings', {
      p_shop_id: membership.shop_id,
      p_accepts_black_grey: acceptsBlackGrey,
      p_accepts_color: acceptsColor
    });

    if (memberError) {
      console.error('Failed to update color settings:', memberError);
      return { error: 'ไม่สามารถบันทึกประเภทสีงานได้: ' + memberError.message };
    }
  }
  
  const acceptsNewWork = formData.get('acceptsNewWork') === 'on' || formData.get('acceptsNewWork') === 'true';
  const acceptsExtension = formData.get('acceptsExtension') === 'on' || formData.get('acceptsExtension') === 'true';
  const acceptsTouchUp = formData.get('acceptsTouchUp') === 'on' || formData.get('acceptsTouchUp') === 'true';
  const acceptsCoverUp = formData.get('acceptsCoverUp') === 'on' || formData.get('acceptsCoverUp') === 'true';
  const acceptsScarCover = formData.get('acceptsScarCover') === 'on' || formData.get('acceptsScarCover') === 'true';

  if (acceptsNewWork || acceptsExtension || acceptsTouchUp || acceptsCoverUp || acceptsScarCover) {
    const { error: workTypeError } = await supabase.rpc('update_my_artist_work_type_settings', {
      p_shop_id: membership.shop_id,
      p_accepts_new_work: acceptsNewWork,
      p_accepts_extension: acceptsExtension,
      p_accepts_touch_up: acceptsTouchUp,
      p_accepts_cover_up: acceptsCoverUp,
      p_accepts_scar_cover: acceptsScarCover
    });

    if (workTypeError) {
      console.error('Failed to update work type settings:', workTypeError);
      return { error: 'ไม่สามารถบันทึกประเภทงานที่รับได้: ' + workTypeError.message };
    }
  }

  revalidatePath('/artist/profile');
  revalidatePath('/artist', 'layout'); // Revalidate the entire artist layout
  revalidatePath('/owner/artists');
  return { success: true };
}

export async function updateArtistAvatar(avatarUrl: string) {
  const { user } = await requireArtist();
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update avatar:', error);
    return { error: 'ไม่สามารถอัปเดตรูปโปรไฟล์ได้' };
  }

  revalidatePath('/artist/profile');
  revalidatePath('/artist', 'layout');
  revalidatePath('/owner/artists');
  return { success: true };
}

export async function addArtistSpecialty(styleName: string) {
  const { membership } = await requireArtist();
  const supabase = await createClient();

  const name = styleName.trim();
  if (!name) return { error: 'กรุณาระบุสไตล์' };

  const { error } = await supabase.rpc('add_my_artist_specialty', {
    p_shop_id: membership.shop_id,
    p_style_name: name
  });

  if (error) {
    console.error('Failed to add specialty:', error);
    return { error: 'ไม่สามารถเพิ่มสไตล์ได้: ' + error.message };
  }

  revalidatePath('/artist/profile');
  return { success: true };
}

export async function removeArtistSpecialty(styleId: string) {
  const { membership } = await requireArtist();
  const supabase = await createClient();

  const { error } = await supabase.rpc('remove_my_artist_specialty', {
    p_shop_id: membership.shop_id,
    p_style_id: styleId
  });

  if (error) {
    console.error('Failed to remove specialty:', error);
    return { error: 'ไม่สามารถลบสไตล์ได้: ' + error.message };
  }

  revalidatePath('/artist/profile');
  return { success: true };
}
