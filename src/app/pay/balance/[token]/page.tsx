import { BalancePaymentPageClient } from '@/components/payment/BalancePaymentPageClient'
import PublicBookingHeader from '@/components/booking/PublicBookingHeader'

type PageProps = {
  params: Promise<{
    token: string
  }>
}

export default async function BalancePaymentPage({ params }: PageProps) {
  const { token } = await params
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <PublicBookingHeader hideTrackButton />
      <main className="max-w-[620px] mx-auto px-4 sm:px-6 py-8">
        <BalancePaymentPageClient token={token} />
      </main>
    </div>
  )
}
