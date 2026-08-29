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

  // Resolve booking ID from public_token
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('id')
    .eq('public_token', token)
    .maybeSingle()

  if (booking) {
    redirect(`/customer/bookings/${booking.id}`)
  } else {
    redirect('/customer/bookings')
  }
}
