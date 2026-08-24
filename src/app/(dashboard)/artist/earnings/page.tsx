import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ArtistEarningsClient } from './ArtistEarningsClient'

export default async function ArtistearningsPage() {
  const { user } = await requireArtist()
  const supabase = await createClient()

  // Load all projects of the logged-in artist to parse financial stats
  const { data: projects, error } = await supabase
    .from('tattoo_projects')
    .select(`
      id,
      name,
      status,
      agreed_price,
      created_at,
      completed_at,
      customer:customers(id, full_name),
      payments(
        id,
        amount,
        status,
        payment_type,
        paid_at,
        created_at
      ),
      booking_requests(
        id,
        payments(
          id,
          amount,
          status,
          payment_type,
          paid_at,
          created_at
        )
      )
    `)
    .eq('artist_id', user.id)

  if (error) {
    console.error('Error fetching artist earnings:', error)
    throw new Error('ไม่สามารถดึงข้อมูลรายได้ได้ กรุณาลองใหม่อีกครั้ง')
  }

  const flatPayments: any[] = []
  let fullyPaidProjectsCount = 0

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

    const allPayments = [...directPayments, ...brPayments]
    const uniquePayments = Array.from(new Map(allPayments.map(pay => [pay.id, pay])).values())
    const paidPayments = uniquePayments.filter(pay => pay.status === 'paid')
    const customerObj = Array.isArray(p.customer) ? p.customer[0] : p.customer
    const customerName = (customerObj as any)?.full_name || 'ไม่ระบุชื่อ'

    for (const pay of paidPayments) {
      flatPayments.push({
        id: pay.id,
        amount: Number(pay.amount),
        payment_type: pay.payment_type,
        paid_at: pay.paid_at || pay.created_at,
        projectName: p.name || 'งานสักไม่มีชื่อ',
        customerName,
        projectId: p.id,
        agreedPrice: p.agreed_price !== null ? Number(p.agreed_price) : null
      })
    }

    const totalPaid = paidPayments.reduce((sum, pay) => sum + Number(pay.amount), 0)
    if (p.agreed_price !== null && totalPaid >= Number(p.agreed_price)) {
      fullyPaidProjectsCount++
    }
  }

  // Sort by paid_at desc
  flatPayments.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
        <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">รายได้ของฉัน</h2>
      </div>

      <ArtistEarningsClient
        flatPayments={flatPayments}
        totalProjectsCount={projects?.length || 0}
        fullyPaidProjectsCount={fullyPaidProjectsCount}
      />
    </div>
  )
}
