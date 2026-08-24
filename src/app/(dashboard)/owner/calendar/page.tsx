import { requireOwner } from '@/lib/auth/membership';
import { createClient } from '@/lib/supabase/server';
import { OwnerShopCalendar } from '@/components/owner/calendar/OwnerShopCalendar';

export default async function CalendarPage() {
  const { membership } = await requireOwner();
  const supabase = await createClient();

  // 1. Fetch active artists in the shop for the filter dropdown
  const { data: artistsData } = await supabase
    .from('shop_members')
    .select(`
      user_id,
      profiles!shop_members_user_id_fkey (id, full_name)
    `)
    .eq('shop_id', membership.shop_id)
    .eq('status', 'active')
    .eq('role', 'artist');

  const artists = (artistsData || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || 'Unknown Artist'
  }));

  // 2. Fetch appointments
  const { data: appointmentsData, error: appointmentsError } = await supabase
    .from('appointments')
    .select(`
      id, status, start_at, artist_id,
      profiles!appointments_artist_id_fkey (full_name)
    `)
    .eq('shop_id', membership.shop_id);

  if (appointmentsError) {
    console.error('Owner calendar appointments query error:', appointmentsError);
  }

  const appointments = (appointmentsData || []).map((a: any) => {
    let dateKey = '';
    let timeStr = '';
    
    if (a.start_at) {
      const startDate = new Date(a.start_at);
      const y = startDate.getFullYear();
      const m = String(startDate.getMonth() + 1).padStart(2, '0');
      const d = String(startDate.getDate()).padStart(2, '0');
      const h = String(startDate.getHours()).padStart(2, '0');
      const min = String(startDate.getMinutes()).padStart(2, '0');
      dateKey = `${y}-${m}-${d}`;
      timeStr = `${h}:${min}`;
    }

    return {
      id: a.id,
      artist_id: a.artist_id,
      request_date: dateKey,
      preferred_time: timeStr || null,
      status: a.status,
      artist: {
        display_name: a.profiles?.full_name || 'Unknown Artist'
      }
    };
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-light text-[#F3F3F3] mb-1 tracking-wide">ปฏิทินร้าน</h1>
        <p className="text-sm text-[#9CA3AB]">ดูและจัดการคิวงานของช่างทั้งหมดในร้าน</p>
      </div>

      <OwnerShopCalendar 
        artists={artists} 
        appointments={appointments} 
        dailyCapacities={{}} 
      />
    </div>
  );
}
