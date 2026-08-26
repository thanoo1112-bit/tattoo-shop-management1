import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import OwnerFlashManager from './OwnerFlashManager'

export const revalidate = 0

export default async function OwnerFlashPage() {
  const { membership } = await requireOwner()
  const shopId = membership.shop_id
  const supabase = await createClient()

  // 1. Fetch flash designs with artist names
  const { data: flashItems } = await supabase
    .from('flash_designs')
    .select(`
      *,
      profiles (
        full_name
      )
    `)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })

  // 2. Fetch active artist-capable members (artist + owner roles)
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

  const typedFlash = (flashItems || []).map((item: any) => ({
    ...item,
    artist_name: item.profiles?.full_name || 'ช่างนิรนาม',
    style_name: item.style_name || '-',
  }))

  const typedArtists = (artists || []).map((item: any) => ({
    id: item.user_id,
    name: item.profiles?.full_name || 'ช่างนิรนาม',
  }))

  return (
    <OwnerFlashManager
      shopId={shopId}
      initialItems={typedFlash}
      artists={typedArtists}
    />
  )
}
