import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ArtistCustomersClient } from './ArtistCustomersClient'

export default async function ArtistcustomersPage() {
  const { user } = await requireArtist()
  const supabase = await createClient()

  // Load customers that have at least one project assigned to the logged-in artist
  const { data: customers, error } = await supabase
    .from('customers')
    .select(`
      id,
      full_name,
      phone_normalized,
      created_at,
      tattoo_projects!inner(
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
    .eq('tattoo_projects.artist_id', user.id)

  if (error) {
    console.error('Error fetching artist customers:', error)
    throw new Error('ไม่สามารถดึงข้อมูลลูกค้าได้ กรุณาลองใหม่อีกครั้ง')
  }

  // Pre-sort customers alphabetically by full_name
  const sortedCustomers = [...(customers || [])].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'th')
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
        <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ลูกค้าของฉัน</h2>
      </div>

      <ArtistCustomersClient customers={sortedCustomers as any[]} />
    </div>
  )
}
