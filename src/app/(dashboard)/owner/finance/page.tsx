import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerFinanceClient } from './OwnerFinanceClient'

export default async function FinancePage() {
  const { membership } = await requireOwner()
  const supabase = await createClient()

  // Fetch all projects in the owner's shop, along with payments, customer, artist, and booking requests payments
  const { data: projects, error } = await supabase
    .from('tattoo_projects')
    .select(`
      id,
      name,
      status,
      agreed_price,
      created_at,
      completed_at,
      artist_id,
      artist:profiles(id, full_name, email),
      customer:customers!tattoo_projects_shop_id_customer_id_fkey(id, full_name, phone_normalized),
      payments(
        id,
        amount,
        status,
        payment_type,
        paid_at,
        created_at,
        verified_at
      ),
      booking_requests(
        id,
        payments(
          id,
          amount,
          status,
          payment_type,
          paid_at,
          created_at,
          verified_at
        )
      )
    `)
    .eq('shop_id', membership.shop_id)

  if (error) {
    console.error('Error fetching owner finance data:', error)
    throw new Error('ไม่สามารถดึงข้อมูลทางการเงินได้ กรุณาลองใหม่อีกครั้ง')
  }

  const flatPayments: any[] = []

  for (const p of (projects || [])) {
    const directPayments = p.payments || []
    const brPayments: any[] = []

    if (p.booking_requests) {
      for (const br of p.booking_requests) {
        if (br.payments) {
          brPayments.push(...br.payments)
        }
      }
    }

    // Deduplicate payments by id (since deposit payments link to both project and booking request and may appear twice)
    const uniquePaymentsMap = new Map()
    for (const pay of directPayments) {
      if (pay?.id) uniquePaymentsMap.set(pay.id, pay)
    }
    for (const pay of brPayments) {
      if (pay?.id) uniquePaymentsMap.set(pay.id, pay)
    }
    const allPayments = Array.from(uniquePaymentsMap.values())
    
    // Resolve customer info
    const customerObj = Array.isArray(p.customer) ? p.customer[0] : p.customer
    const customerName = (customerObj as any)?.full_name || 'ไม่ระบุชื่อ'
    const phoneNormalized = (customerObj as any)?.phone_normalized || null

    const artistObj = Array.isArray(p.artist) ? p.artist[0] : p.artist
    const artistName = (artistObj as any)?.full_name || (artistObj as any)?.email || 'ไม่ระบุชื่อช่าง'

    for (const pay of allPayments) {
      flatPayments.push({
        id: pay.id,
        amount: Number(pay.amount),
        status: pay.status,
        payment_type: pay.payment_type,
        paid_at: pay.paid_at,
        created_at: pay.created_at,
        verified_at: pay.verified_at,
        projectName: p.name || 'งานสักไม่มีชื่อ',
        customerName,
        projectId: p.id,
        agreedPrice: p.agreed_price !== null ? Number(p.agreed_price) : null,
        artistId: p.artist_id,
        artistName,
        phoneNormalized
      })
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
        <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">การเงิน</h2>
      </div>

      <OwnerFinanceClient flatPayments={flatPayments} />
    </div>
  )
}
