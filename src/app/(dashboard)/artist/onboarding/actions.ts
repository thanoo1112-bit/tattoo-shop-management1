'use server'

import { createClient } from '@/lib/supabase/server'
import { requireArtist } from '@/lib/auth/membership'
import { getCurrentArtistOnboardingStatus } from '@/lib/auth/onboarding'

export async function updateArtistOnboarding(formData: { displayName: string; phone: string }) {
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  // 1. Update Profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ 
      full_name: formData.displayName.trim(),
      phone: formData.phone.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (profileError) {
    return { success: false, error: profileError.message }
  }

  // 2. Final Completeness Check
  const isComplete = await getCurrentArtistOnboardingStatus(membership.shop_id)

  return { success: isComplete }
}

export async function addArtistSpecialty(styleName: string) {
  const { membership } = await requireArtist()
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_my_artist_specialty', { p_shop_id: membership.shop_id, p_style_name: styleName.trim() })
  return { success: !error, error: error?.message }
}

export async function removeArtistSpecialty(styleId: string) {
  const { membership } = await requireArtist()
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_my_artist_specialty', { p_shop_id: membership.shop_id, p_style_id: styleId })
  return { success: !error, error: error?.message }
}
