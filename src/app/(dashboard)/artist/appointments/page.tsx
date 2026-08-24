import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ArtistAppointmentsClient } from './ArtistAppointmentsClient'

export default async function ArtistappointmentsPage() {
  const { user } = await requireArtist()
  const supabase = await createClient()

  // Load projects assigned to the logged-in artist
  const { data: projects, error } = await supabase
    .from('tattoo_projects')
    .select(`
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
      customer:customers!tattoo_projects_shop_id_customer_id_fkey(id, full_name, phone_normalized),
      appointments(id, session_number, status, start_at, end_at, notes, actual_started_at, actual_ended_at),
      booking_requests(
        id,
        payments(id, amount, status, payment_type)
      ),
      payments(id, amount, status, payment_type)
    `)
    .eq('artist_id', user.id)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching artist projects:', error)
    // Throw error following standard Next.js error boundary pattern
    throw new Error('ไม่สามารถดึงข้อมูลงานสักได้ กรุณาลองใหม่อีกครั้ง')
  }

  // Pre-sort: active first, then created_at desc
  const sortedProjects = [...(projects || [])].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
        <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">งานสักของฉัน</h2>
      </div>
      
      <ArtistAppointmentsClient projects={sortedProjects as any[]} />
    </div>
  )
}
