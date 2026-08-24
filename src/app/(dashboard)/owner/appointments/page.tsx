import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerAppointmentsClient } from './OwnerAppointmentsClient'

export default async function AppointmentsPage() {
  const { membership } = await requireOwner()
  const supabase = await createClient()

  // Fetch all appointments for this owner's shop along with artist details, customer details, and project details (including payment history)
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      session_number,
      status,
      start_at,
      end_at,
      notes,
      actual_started_at,
      actual_ended_at,
      created_at,
      artist_id,
      artist:profiles!appointments_artist_id_fkey(id, full_name, email),
      customer:customers!appointments_shop_id_customer_id_fkey(id, full_name, phone_normalized),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(
        id,
        name,
        status,
        agreed_price,
        tattoo_style,
        payments(
          id,
          amount,
          status,
          payment_type
        ),
        booking_requests(
          id,
          payments(
            id,
            amount,
            status,
            payment_type
          )
        )
      )
    `)
    .eq('shop_id', membership.shop_id)

  if (error) {
    console.error('Error fetching owner appointments:', error)
    throw new Error('ไม่สามารถดึงข้อมูลคิวงานได้ กรุณาลองใหม่อีกครั้ง')
  }

  // Pre-sort appointments by start_at ascending (upcoming first)
  const sortedAppointments = [...(appointments || [])].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#FFFFFF] mb-1">คิวงาน</h1>
          <p className="text-sm text-[#A3A3A3]">จัดการและติดตามคิวงานทั้งหมดของร้าน</p>
        </div>
      </div>

      <OwnerAppointmentsClient appointments={sortedAppointments as any[]} />
    </div>
  )
}
