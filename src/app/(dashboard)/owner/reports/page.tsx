import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerReportsClient } from './OwnerReportsClient'

export default async function ReportsPage() {
  const { membership } = await requireOwner()
  const supabase = await createClient()

  // 1. Fetch all projects in shop
  const { data: projects, error: projectsErr } = await supabase
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
      customer:customers!tattoo_projects_shop_id_customer_id_fkey(id, full_name),
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

  if (projectsErr) {
    console.error('Error fetching owner reports projects:', projectsErr)
    throw new Error('ไม่สามารถดึงข้อมูลรายงานโครงการได้')
  }

  // 2. Fetch all appointments in shop
  const { data: appointments, error: apptsErr } = await supabase
    .from('appointments')
    .select('id, status, start_at, end_at, artist_id, actual_started_at, actual_ended_at')
    .eq('shop_id', membership.shop_id)

  if (apptsErr) {
    console.error('Error fetching owner reports appointments:', apptsErr)
    throw new Error('ไม่สามารถดึงข้อมูลรายงานการนัดหมายได้')
  }

  // 3. Fetch all customers in shop
  const { data: customers, error: custsErr } = await supabase
    .from('customers')
    .select('id, created_at')
    .eq('shop_id', membership.shop_id)

  if (custsErr) {
    console.error('Error fetching owner reports customers:', custsErr)
    throw new Error('ไม่สามารถดึงข้อมูลรายงานลูกค้าได้')
  }

  const flatPayments: any[] = []
  const mappedProjects: any[] = []

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
    
    // Resolve artist & customer names
    const artistObj = Array.isArray(p.artist) ? p.artist[0] : p.artist
    const artistName = (artistObj as any)?.full_name || (artistObj as any)?.email || 'ไม่ระบุชื่อช่าง'

    const customerObj = Array.isArray(p.customer) ? p.customer[0] : p.customer
    const customerName = (customerObj as any)?.full_name || 'ไม่ระบุชื่อ'

    mappedProjects.push({
      id: p.id,
      name: p.name,
      status: p.status,
      agreed_price: p.agreed_price,
      created_at: p.created_at,
      completed_at: p.completed_at,
      artist_id: p.artist_id,
      artistName,
      customerName
    })

    for (const pay of allPayments) {
      flatPayments.push({
        id: pay.id,
        amount: Number(pay.amount),
        status: pay.status,
        payment_type: pay.payment_type,
        paid_at: pay.paid_at,
        created_at: pay.created_at,
        verified_at: pay.verified_at,
        projectId: p.id,
        artistId: p.artist_id,
        artistName,
        customerName
      })
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
        <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">รายงานและสถิติ</h2>
      </div>

      <OwnerReportsClient
        flatPayments={flatPayments}
        projects={mappedProjects}
        appointments={appointments as any[]}
        customers={customers as any[]}
      />
    </div>
  )
}
