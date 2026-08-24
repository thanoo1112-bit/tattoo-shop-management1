import { createClient } from '@/lib/supabase/server'
import { requireArtist } from '@/lib/auth/membership'
import ArtistOnboardingFlow from '@/components/artist/ArtistOnboardingFlow'

export default async function ArtistOnboardingPage() {
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, email')
    .eq('id', user.id)
    .single()

  const { data: mySpecialties } = await supabase
    .rpc('get_my_artist_specialties', { p_shop_id: membership.shop_id })

  const { data: catalog } = await supabase
    .rpc('get_artist_specialty_catalog', { p_shop_id: membership.shop_id })

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 font-sans text-[#F3F3F3]">
      <ArtistOnboardingFlow 
        initialProfile={profile || { full_name: '', phone: '', email: user.email }}
        initialSpecialties={mySpecialties || []}
        catalog={catalog || []}
      />
    </div>
  )
}
