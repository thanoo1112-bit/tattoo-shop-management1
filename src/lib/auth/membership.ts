import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from './get-current-user'
import { redirect } from 'next/navigation'

export type Membership = {
  id: string
  shop_id: string
  user_id: string
  role: 'owner' | 'artist'
  status: 'active' | 'inactive'
}

export type Shop = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  phone: string | null
  address: string | null
  created_by: string
}

export async function getCurrentMembership() {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()

  // Find active membership
  const { data: membership, error } = await supabase
    .from('shop_members')
    .select(`
      id, shop_id, user_id, role, status
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .single()

  if (error || !membership) return null

  return membership as Membership
}

export async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const membership = await getCurrentMembership()
  
  if (!membership) {
    redirect('/login?error=no_active_shop')
  }

  if (membership.role !== 'owner') {
    redirect('/artist/dashboard')
  }

  return { user, membership }
}

export async function requireArtist() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const membership = await getCurrentMembership()
  
  if (!membership) {
    redirect('/login?error=no_active_shop')
  }

  if (membership.role !== 'artist' && membership.role !== 'owner') {
    redirect('/owner/dashboard')
  }

  return { user, membership }
}

export async function getShopDetails(shopId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', shopId)
    .single()
    
  if (error || !data) return null
  return data as Shop
}
