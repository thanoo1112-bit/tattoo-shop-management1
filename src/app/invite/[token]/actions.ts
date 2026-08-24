'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentArtistOnboardingStatus } from '@/lib/auth/onboarding'

export async function acceptInviteAction(token: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // Wait for profile trigger to finish just in case
    for (let i = 0; i < 4; i++) {
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
      if (profile) break
      await new Promise(r => setTimeout(r, 500))
    }
  }

  const { data, error } = await supabase.rpc('accept_artist_invite', { p_token: token })

  if (error) {
    return { success: false, error: error.message }
  }

  // The RPC accept_artist_invite returns shop_id or we can get it from membership
  const { data: membership } = await supabase
    .from('shop_members')
    .select('shop_id')
    .eq('user_id', user?.id)
    .single()

  if (membership?.shop_id) {
    const isComplete = await getCurrentArtistOnboardingStatus(membership.shop_id)
    return { success: true, redirectUrl: isComplete ? '/artist/dashboard' : '/artist/onboarding' }
  }

  return { success: true, redirectUrl: '/artist/onboarding' }
}


