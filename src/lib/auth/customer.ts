import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from './get-current-user'
import { redirect } from 'next/navigation'

export type Customer = {
  id: string
  shop_id: string
  auth_user_id: string
  full_name: string
  phone_normalized: string
  email: string | null
  created_at: string
}

export async function getCurrentCustomer(shopSlug?: string) {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()

  let shopId: string | null = null

  if (shopSlug) {
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('slug', shopSlug)
      .single()
    if (shop) shopId = shop.id
  } else {
    // Default to the first shop
    const { data: shops } = await supabase
      .from('shops')
      .select('id')
      .limit(1)
    if (shops && shops.length > 0) {
      shopId = shops[0].id
    }
  }

  if (!shopId) return null

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return customer as Customer | null
}

export async function requireCustomer(shopSlug?: string, returnToPath?: string) {
  const customer = await getCurrentCustomer(shopSlug)
  if (!customer) {
    let returnTo = returnToPath || ''
    if (!returnTo && typeof window !== 'undefined') {
      returnTo = window.location.pathname + window.location.search
    }

    // Safety validation: enforce internal relative paths only
    if (returnTo) {
      try {
        returnTo = decodeURIComponent(returnTo)
      } catch {}

      // Must start with a single / and not start with // or any protocol
      if (!returnTo.startsWith('/') || returnTo.startsWith('//') || /^(https?:)?\/\//i.test(returnTo)) {
        returnTo = ''
      }
    }

    const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    const shopParam = shopSlug ? (params ? `&shop=${shopSlug}` : `?shop=${shopSlug}`) : ''
    redirect(`/customer/login${params}${shopParam}`)
  }
  return customer
}
