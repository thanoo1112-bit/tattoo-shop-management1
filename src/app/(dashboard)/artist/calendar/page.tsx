import { requireArtist } from '@/lib/auth/membership';
import { createClient } from '@/lib/supabase/server';
import { ArtistCalendar } from '@/components/artist/calendar/ArtistCalendar';

export default async function ArtistCalendarPage() {
  const { membership, user } = await requireArtist();
  const supabase = await createClient();

  // 1. Get Shop Default Capacity (Fallback)
  const { data: shopSettings } = await supabase
    .from('shop_booking_settings')
    .select('default_daily_capacity')
    .eq('shop_id', membership.shop_id)
    .single();

  // 2. Get Artist Default Capacity
  const { data: artistSettings } = await supabase
    .from('artist_booking_settings')
    .select('daily_capacity')
    .eq('shop_id', membership.shop_id)
    .eq('artist_id', user.id)
    .maybeSingle();

  const defaultCapacity = artistSettings?.daily_capacity || shopSettings?.default_daily_capacity || 1;

  // 3. Get Overrides
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split('T')[0];

  const { data: overridesData } = await supabase
    .from('artist_daily_overrides')
    .select('override_date, capacity, is_closed')
    .eq('shop_id', membership.shop_id)
    .eq('artist_id', user.id)
    .gte('override_date', startDate)
    .lte('override_date', endDate);

  const overridesMap: Record<string, { capacity: number, is_closed: boolean }> = {};
  if (overridesData) {
    overridesData.forEach(row => {
      overridesMap[row.override_date] = { capacity: row.capacity, is_closed: row.is_closed };
    });
  }

  // 4. Get Occupied Capacity using RPC
  const { data: availabilityData } = await supabase
    .rpc('get_public_daily_availability', {
      p_shop_id: membership.shop_id,
      p_artist_id: user.id,
      p_start_date: startDate,
      p_end_date: endDate
    });

  const occupiedMap: Record<string, number> = {};
  if (availabilityData) {
    availabilityData.forEach((row: any) => {
      occupiedMap[row.date] = row.occupied;
    });
  }

  // 5. Get Appointments
  const { data: appointmentsData } = await supabase
    .from('appointments')
    .select(`
      id, start_at, end_at, status,
      customer:customers(full_name),
      artist:profiles!appointments_artist_id_fkey(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(
        name, tattoo_style, work_type, color_mode, width_cm, height_cm, body_placement, agreed_price
      ),
      booking_request:booking_requests(
        payments(status, amount, payment_type)
      )
    `)
    .eq('shop_id', membership.shop_id)
    .eq('artist_id', user.id)
    .in('status', ['scheduled', 'in_progress', 'completed'])
    .gte('start_at', startDate)
    .lte('start_at', endDate);

  const appointments = (appointmentsData || []).map((a: any) => ({
    id: a.id,
    start_at: a.start_at,
    end_at: a.end_at,
    status: a.status,
    customer: Array.isArray(a.customer) ? a.customer[0] : a.customer,
    artist: Array.isArray(a.artist) ? a.artist[0] : a.artist,
    project: Array.isArray(a.project) ? a.project[0] || null : a.project || null,
    booking_request: Array.isArray(a.booking_request) ? a.booking_request[0] || null : a.booking_request || null
  }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-light text-[#F3F3F3] mb-1 tracking-wide">ปฏิทินงานของฉัน</h1>
        <p className="text-sm text-[#9CA3AB]">จัดการวันรับคิวและดูตารางงานของคุณ</p>
      </div>

      <ArtistCalendar 
        defaultCapacity={defaultCapacity}
        overrides={overridesMap}
        occupied={occupiedMap}
        appointments={appointments}
      />
    </div>
  );
}
