'use server'

import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createArtistInvite() {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_artist_invite')

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/owner/artists')
  return { success: true, data }
}

export async function revokeArtistInvite(token: string) {
  const supabase = await createClient()

  const { error } = await supabase.rpc('revoke_artist_invite', { p_token: token })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/owner/artists')
  return { success: true }
}

export async function setArtistStatus(shopId: string, artistId: string, status: 'active' | 'inactive') {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_artist_member_status', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_status: status
  })

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/owner/artists')
  revalidatePath('/owner/dashboard')
  return { success: true }
}

export async function ownerUpdateArtistProfile(artistId: string, shopId: string, formData: FormData) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();

  const displayName = formData.get('displayName')?.toString().trim();
  const acceptsBlackGrey = formData.get('acceptsBlackGrey') === 'on' || formData.get('acceptsBlackGrey') === 'true';
  const acceptsColor = formData.get('acceptsColor') === 'on' || formData.get('acceptsColor') === 'true';

  if (!displayName) {
    return { error: 'กรุณากรอกชื่อที่ใช้แสดง' };
  }

  // Get current avatar url to pass if not updating
  const avatarUrl = formData.get('avatarUrl')?.toString().trim() || null;

  const { error: profileError } = await supabase.rpc('owner_update_artist_profile', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_display_name: displayName,
    p_avatar_url: avatarUrl
  });

  if (profileError) {
    console.error('Owner failed to update artist profile:', profileError);
    return { error: 'ไม่สามารถบันทึกข้อมูลส่วนตัวได้: ' + profileError.message };
  }

  const { error: colorError } = await supabase.rpc('owner_update_artist_color_settings', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_accepts_black_grey: acceptsBlackGrey,
    p_accepts_color: acceptsColor
  });

  if (colorError) {
    console.error('Owner failed to update color settings:', colorError);
    return { error: 'ไม่สามารถบันทึกประเภทสีงานได้: ' + colorError.message };
  }

  const acceptsNewWork = formData.get('acceptsNewWork') === 'on' || formData.get('acceptsNewWork') === 'true';
  const acceptsExtension = formData.get('acceptsExtension') === 'on' || formData.get('acceptsExtension') === 'true';
  const acceptsTouchUp = formData.get('acceptsTouchUp') === 'on' || formData.get('acceptsTouchUp') === 'true';
  const acceptsCoverUp = formData.get('acceptsCoverUp') === 'on' || formData.get('acceptsCoverUp') === 'true';
  const acceptsScarCover = formData.get('acceptsScarCover') === 'on' || formData.get('acceptsScarCover') === 'true';

  const { error: workTypeError } = await supabase.rpc('owner_update_artist_work_type_settings', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_accepts_new_work: acceptsNewWork,
    p_accepts_extension: acceptsExtension,
    p_accepts_touch_up: acceptsTouchUp,
    p_accepts_cover_up: acceptsCoverUp,
    p_accepts_scar_cover: acceptsScarCover
  });

  if (workTypeError) {
    console.error('Owner failed to update work type settings:', workTypeError);
    return { error: 'ไม่สามารถบันทึกประเภทงานได้: ' + workTypeError.message };
  }

  revalidatePath(`/owner/artists/${artistId}`);
  revalidatePath('/owner/artists');
  return { success: true };
}

export async function ownerUpdateArtistAvatar(artistId: string, shopId: string, avatarUrl: string) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', artistId).single();
  const currentName = profile?.full_name || 'ช่างสัก';

  const { error } = await supabase.rpc('owner_update_artist_profile', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_display_name: currentName,
    p_avatar_url: avatarUrl
  });

  if (error) {
    console.error('Owner failed to update avatar:', error);
    return { error: 'ไม่สามารถอัปเดตรูปโปรไฟล์ได้: ' + error.message };
  }

  revalidatePath(`/owner/artists/${artistId}`);
  revalidatePath('/owner/artists');
  return { success: true };
}

export async function ownerAddArtistSpecialty(artistId: string, shopId: string, styleName: string) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_add_artist_specialty', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_style_name: styleName
  });
  if (error) return { error: error.message };
  revalidatePath(`/owner/artists/${artistId}`);
  return { success: true };
}

export async function ownerRemoveArtistSpecialty(artistId: string, shopId: string, styleId: string) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_remove_artist_specialty', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_style_id: styleId
  });
  if (error) return { error: error.message };
  revalidatePath(`/owner/artists/${artistId}`);
  return { success: true };
}

export async function ownerUpdateArtistDefaultCapacity(artistId: string, shopId: string, capacity: number) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_update_artist_booking_settings', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_capacity: capacity
  });
  if (error) return { error: error.message };
  revalidatePath(`/owner/artists/${artistId}`);
  return { success: true };
}

export async function ownerUpdateArtistDailyOverride(artistId: string, shopId: string, date: string, capacity: number | null, isClosed: boolean) {
  const { membership } = await requireOwner();
  if (membership.shop_id !== shopId) {
    return { error: 'Unauthorized: Cross shop access denied' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_update_artist_daily_override', {
    p_shop_id: shopId,
    p_artist_id: artistId,
    p_date: date,
    p_capacity: capacity || 0,
    p_is_closed: isClosed,
    p_remove: capacity === null && !isClosed
  });
  if (error) return { error: error.message };
  revalidatePath(`/owner/artists/${artistId}`);
  return { success: true };
}
