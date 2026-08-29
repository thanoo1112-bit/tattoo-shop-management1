import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import OwnerPortfolioManager from './OwnerPortfolioManager'

export const revalidate = 0

export default async function OwnerPortfolioPage() {
  const { membership } = await requireOwner()
  const shopId = membership.shop_id
  const supabase = await createClient()

  // 1. Fetch portfolio items
  const { data: portfolioItems } = await supabase
    .from('portfolio_items')
    .select(`
      *,
      profiles (
        full_name
      ),
      tattoo_styles (
        name
      )
    `)
    .eq('shop_id', shopId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  // 2. Fetch active artists of the shop
  const { data: artists } = await supabase
    .from('shop_members')
    .select(`
      user_id,
      profiles (
        full_name
      )
    `)
    .eq('shop_id', shopId)
    .in('role', ['artist', 'owner'])
    .eq('status', 'active')

  // 3. Fetch styles of the shop
  const { data: styles } = await supabase
    .from('tattoo_styles')
    .select('id, name')
    .eq('shop_id', shopId)

  // 4. Fetch artist-to-styles mapping
  const { data: artistStyles } = await supabase
    .from('artist_tattoo_styles')
    .select('artist_id, style_id')
    .eq('shop_id', shopId)

  const typedItems = (portfolioItems || []).map((item: any) => ({
    ...item,
    artist_name: item.profiles?.full_name || null,
    style_name: item.tattoo_styles?.name || null
  }))

  const typedArtists = (artists || []).map((item: any) => ({
    id: item.user_id,
    name: item.profiles?.full_name || 'ช่างนิรนาม'
  }))

  const typedStyles = (styles || []).map((item: any) => ({
    id: item.id,
    name: item.name
  }))

  const typedArtistStyles = (artistStyles || []).map((item: any) => ({
    artistId: item.artist_id,
    styleId: item.style_id
  }))

  return (
    <OwnerPortfolioManager
      shopId={shopId}
      initialItems={typedItems}
      artists={typedArtists}
      styles={typedStyles}
      artistStyles={typedArtistStyles}
    />
  )
}
