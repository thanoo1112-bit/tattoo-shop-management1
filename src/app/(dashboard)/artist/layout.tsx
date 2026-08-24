import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ArtistSidebar } from '@/components/artist/dashboard/artist-sidebar'
import { ArtistMobileNav } from '@/components/artist/dashboard/artist-mobile-nav'
import { ArtistTopbar } from '@/components/artist/dashboard/artist-topbar'
import { ArtistPresenceTracker } from '@/components/artist/ArtistPresenceTracker'
import { getCurrentArtistOnboardingStatus } from '@/lib/auth/onboarding'
import { ArtistRouteGuard } from '@/components/artist/ArtistRouteGuard'

export default async function ArtistLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  const artistName = profile?.full_name || user.email || 'Artist'
  const avatarUrl = profile?.avatar_url || null

  const isComplete = await getCurrentArtistOnboardingStatus(membership.shop_id)

  return (
    <ArtistRouteGuard isComplete={isComplete}>
      <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex flex-col md:flex-row font-sans relative">
        <ArtistPresenceTracker userId={user.id} shopId={membership.shop_id} />
        <ArtistSidebar artistName={artistName} avatarUrl={avatarUrl} />
        <ArtistMobileNav artistName={artistName} avatarUrl={avatarUrl} />
        
        <div className="flex-1 md:pl-64 flex flex-col min-h-screen selection:bg-[#8E232B] selection:text-white relative z-10">
          <ArtistTopbar />
          
          <main className="flex-1 p-4 md:p-8 relative">
            <div className="max-w-[1400px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ArtistRouteGuard>
  )
}
