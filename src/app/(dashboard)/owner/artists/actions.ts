'use server'

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
