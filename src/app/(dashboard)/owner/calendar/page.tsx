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
    .in('role', ['artist', 'owner']);

  const artists = (artistsData || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || 'Unknown Artist'
  }));

  // 2. Fetch appointments with complete detailed fields
  const { data: appointmentsData, error: appointmentsError } = await supabase
    .from('appointments')
    .select(`
      id,
      session_number,
      status,
      start_at,
      end_at,
      artist_id,
      notes,
      artist:profiles!appointments_artist_id_fkey (id, full_name, email),
      customer:customers!appointments_shop_id_customer_id_fkey (id, full_name, phone_normalized),
      project:tattoo_projects!appointments_shop_id_project_id_fkey (
        id,
        name,
        agreed_price,
        tattoo_style,
        body_placement,
        width_cm,
        height_cm,
        flash_design_id,
        payments(id, amount, status, payment_type),
        booking_requests(id, payments(id, amount, status, payment_type))
      )
    `)
    .eq('shop_id', membership.shop_id);

  if (appointmentsError) {
    console.error('Owner calendar appointments query error:', appointmentsError);
  }

  const appointments = (appointmentsData || []).map((a: any) => {
    let dateKey = '';
    let startStr = '';
    let endStr = '';
    
    if (a.start_at) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(new Date(a.start_at));
      const y = parts.find(p => p.type === 'year')?.value || '';
      const m = parts.find(p => p.type === 'month')?.value || '';
      const d = parts.find(p => p.type === 'day')?.value || '';
      const h = parts.find(p => p.type === 'hour')?.value || '';
      const min = parts.find(p => p.type === 'minute')?.value || '';
      dateKey = `${y}-${m}-${d}`;
      startStr = `${h}:${min}`;
    }

    if (a.end_at) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(new Date(a.end_at));
      const h = parts.find(p => p.type === 'hour')?.value || '';
      const min = parts.find(p => p.type === 'minute')?.value || '';
      endStr = `${h}:${min}`;
    }

    return {
      id: a.id,
      artist_id: a.artist_id,
      request_date: dateKey,
      preferred_time: startStr || null,
      end_time_str: endStr || null,
      status: a.status,
      session_number: a.session_number,
      customer_name: a.customer?.full_name || 'ไม่ระบุชื่อ',
      customer_phone: a.customer?.phone_normalized || '',
      artist_name: a.artist?.full_name || 'ช่างสัก',
      is_flash: !!a.project?.flash_design_id,
      project_name: a.project?.name || 'งานสัก',
      tattoo_style: a.project?.tattoo_style || 'ไม่ระบุ',
      body_placement: a.project?.body_placement || 'ไม่ระบุ',
      width_cm: a.project?.width_cm || null,
      height_cm: a.project?.height_cm || null,
      agreed_price: a.project?.agreed_price || null,
      project_payments: a.project?.payments || [],
      booking_requests: a.project?.booking_requests || []
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
