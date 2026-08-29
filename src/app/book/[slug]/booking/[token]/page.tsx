import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{
    slug: string
    token: string
  }>
}

export default async function BookingStatusPage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  // Resolve booking and its phone number from public_token
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('submitted_phone')
    .eq('public_token', token)
    .maybeSingle()

  if (booking && booking.submitted_phone) {
    redirect(`/track?phone=${encodeURIComponent(booking.submitted_phone)}`)
  } else {
    redirect('/track')
  }
}
