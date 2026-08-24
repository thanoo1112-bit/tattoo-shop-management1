import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ArtistProfileClient } from '@/components/artist/ArtistProfileClient'

export default async function ArtistprofilePage() {
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  const [profileRes, memberRes, mySpecialtiesRes, catalogRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, phone, email, avatar_url')
      .eq('id', user.id)
      .single(),
    supabase
      .from('shop_members')
      .select('accepts_black_grey, accepts_color, accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover')
      .eq('id', membership.id)
      .single(),
    supabase.rpc('get_my_artist_specialties', { p_shop_id: membership.shop_id }),
    supabase.rpc('get_artist_specialty_catalog', { p_shop_id: membership.shop_id })
  ])

  const profile = profileRes.data
  const member = memberRes.data
  const mySpecialties = mySpecialtiesRes.data || []
  const catalog = catalogRes.data || []

  const initialData = {
    displayName: profile?.full_name || '',
    phone: profile?.phone || '',
    email: profile?.email || user.email || '',
    avatarUrl: profile?.avatar_url || null,
    bio: '', // mock
    acceptsBlackGrey: member?.accepts_black_grey ?? true,
    acceptsColor: member?.accepts_color ?? false,
    acceptsNewWork: member?.accepts_new_work ?? true,
    acceptsExtension: member?.accepts_extension ?? false,
    acceptsTouchUp: member?.accepts_touch_up ?? false,
    acceptsCoverUp: member?.accepts_cover_up ?? false,
    acceptsScarCover: member?.accepts_scar_cover ?? false
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ArtistProfileClient 
        initialData={initialData} 
        initialSpecialties={mySpecialties} 
        catalog={catalog} 
      />
    </div>
  )
}
