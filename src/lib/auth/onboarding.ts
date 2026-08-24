import { createClient } from '@/lib/supabase/server'

export async function getCurrentArtistOnboardingStatus(shopId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return false

  // Check profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .single()

  if (!profile) return false

  const hasName = profile.full_name && profile.full_name.trim().length > 0
  const hasPhone = profile.phone && profile.phone.trim().length > 0

  if (!hasName || !hasPhone) return false

  // Check specialties
  const { data: specialties } = await supabase
    .rpc('get_my_artist_specialties', { p_shop_id: shopId })

  const hasSpecialties = specialties && specialties.length > 0

  if (!hasSpecialties) return false

  return true
}