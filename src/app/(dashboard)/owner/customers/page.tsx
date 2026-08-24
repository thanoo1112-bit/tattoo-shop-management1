import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerCustomersClient } from './OwnerCustomersClient'

export default async function OwnerCustomersPage() {
  const { membership } = await requireOwner()
  const supabase = await createClient()

  // Load all customers in the owner's shop along with their tattoo projects, appointments, and payments
  const { data: customers, error } = await supabase
    .from('customers')
    .select(`
      id,
      full_name,
      phone_normalized,
      created_at,
      email,
      tattoo_projects(
        id,
        name,
        status,
        agreed_price,
        tattoo_style,
        work_type,
        color_mode,
        width_cm,
        height_cm,
        body_placement,
        completed_at,
        created_at,
        artist_id,
        artist:profiles(id, full_name, email),
        appointments(
          id,
          session_number,
          status,
          start_at,
          end_at,
          notes,
          actual_started_at,
          actual_ended_at
        ),
        payments(
          id,
          amount,
          status,
          payment_type
        )
      )
    `)
    .eq('shop_id', membership.shop_id)

  if (error) {
    console.error('Error fetching owner customers:', error)
    throw new Error('ไม่สามารถดึงข้อมูลลูกค้าได้ กรุณาลองใหม่อีกครั้ง')
  }

  // Pre-sort customers alphabetically by full_name
  const sortedCustomers = [...(customers || [])].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'th')
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#FFFFFF] mb-1">ลูกค้า</h1>
          <p className="text-sm text-[#A3A3A3]">ดูข้อมูลและประวัติการใช้บริการของลูกค้าทั้งร้าน</p>
        </div>
      </div>

      <OwnerCustomersClient customers={sortedCustomers as any[]} />
    </div>
  )
}
