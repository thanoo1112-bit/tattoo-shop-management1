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
      created_at,
      artist_id,
      customer_id,
      project_id,
      artist:profiles!appointments_artist_id_fkey(id, full_name, email),
      customer:customers(id, full_name, phone_normalized),
      project:tattoo_projects(
        id,
        name,
        status,
        agreed_price,
        tattoo_style
      )
    `)
    .eq('shop_id', membership.shop_id)
    .order('start_at', { ascending: true })

  if (error) {
    console.error('OWNER APPOINTMENTS ERROR', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    })

    return (
      <div className="p-8 bg-red-950/20 border border-red-500/30 rounded-xl max-w-2xl mx-auto my-12 text-[#FCA5A5] space-y-4">
        <h2 className="text-xl font-semibold">Error Fetching Owner Appointments</h2>
        <div className="text-sm font-mono space-y-2 bg-black/40 p-4 rounded border border-red-500/10">
          <p><strong>Message:</strong> {error.message}</p>
          <p><strong>Code:</strong> {error.code}</p>
          <p><strong>Details:</strong> {error.details || 'none'}</p>
          <p><strong>Hint:</strong> {error.hint || 'none'}</p>
        </div>
        <p className="text-xs text-neutral-400">Please copy and send this error output to the assistant.</p>
      </div>
    )
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
