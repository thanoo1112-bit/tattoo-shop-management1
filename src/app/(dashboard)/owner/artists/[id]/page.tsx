import { requireOwner } from '@/lib/auth/membership';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Calendar, DollarSign, Image as ImageIcon } from 'lucide-react';
import { ArtistProfileClient } from '@/components/artist/ArtistProfileClient';
import { ArtistCalendar } from '@/components/artist/calendar/ArtistCalendar';

export default async function OwnerArtistDetailPage({ params }: { params: { id: string } }) {
  const { id: artistId } = params;
  const { membership } = await requireOwner();
  const shopId = membership.shop_id;
  const supabase = await createClient();

  // 1. Fetch target artist profile and shop membership
  const [profileRes, memberRes] = await Promise.all([
    supabase.from('profiles').select('full_name, phone, email, avatar_url').eq('id', artistId).single(),
    supabase.from('shop_members').select('*').eq('shop_id', shopId).eq('user_id', artistId).single()
  ]);

  const profile = profileRes.data;
  const member = memberRes.data;

  if (!profile || !member) {
    notFound();
  }

  // 2. Fetch specialties and catalog from database directly
  const { data: specialtiesData } = await supabase
    .from('artist_tattoo_styles')
    .select(`
      style_id,
      tattoo_styles:style_id (
        name
      )
    `)
    .eq('shop_id', shopId)
    .eq('artist_id', artistId);

  const mySpecialties = (specialtiesData || []).map((s: any) => ({
    style_id: s.style_id,
    name: s.tattoo_styles?.name || ''
  }));

  const { data: catalogData } = await supabase
    .from('tattoo_styles')
    .select('id, name')
    .eq('shop_id', shopId);

  const catalog = (catalogData || []).map((s: any) => ({
    style_id: s.id,
    name: s.name
  }));

  // 3. Fetch default capacity & daily overrides
  const { data: shopSettings } = await supabase
    .from('shop_booking_settings')
    .select('default_daily_capacity')
    .eq('shop_id', shopId)
    .single();

  const { data: artistSettings } = await supabase
    .from('artist_booking_settings')
    .select('daily_capacity')
    .eq('shop_id', shopId)
    .eq('artist_id', artistId)
    .maybeSingle();

  const defaultCapacity = artistSettings?.daily_capacity || shopSettings?.default_daily_capacity || 1;

  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split('T')[0];

  const { data: overridesData } = await supabase
    .from('artist_daily_overrides')
    .select('override_date, capacity, is_closed')
    .eq('shop_id', shopId)
    .eq('artist_id', artistId)
    .gte('override_date', startDate)
    .lte('override_date', endDate);

  const overridesMap: Record<string, { capacity: number, is_closed: boolean }> = {};
  if (overridesData) {
    overridesData.forEach(row => {
      overridesMap[row.override_date] = { capacity: row.capacity, is_closed: row.is_closed };
    });
  }

  // 4. Fetch occupied slots using RPC
  const { data: availabilityData } = await supabase
    .rpc('get_public_daily_availability', {
      p_shop_id: shopId,
      p_artist_id: artistId,
      p_start_date: startDate,
      p_end_date: endDate
    });

  const occupiedMap: Record<string, number> = {};
  if (availabilityData) {
    availabilityData.forEach((row: any) => {
      occupiedMap[row.date] = row.occupied;
    });
  }

  // 5. Fetch appointments
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
    .eq('shop_id', shopId)
    .eq('artist_id', artistId)
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

  const initialData = {
    displayName: profile.full_name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    avatarUrl: profile.avatar_url || null,
    bio: '',
    acceptsBlackGrey: member.accepts_black_grey ?? true,
    acceptsColor: member.accepts_color ?? false,
    acceptsNewWork: member.accepts_new_work ?? true,
    acceptsExtension: member.accepts_extension ?? false,
    acceptsTouchUp: member.accepts_touch_up ?? false,
    acceptsCoverUp: member.accepts_cover_up ?? false,
    acceptsScarCover: member.accepts_scar_cover ?? false
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20 px-4 sm:px-6">
      {/* Back Link and Header */}
      <div>
        <Link 
          href="/owner/artists" 
          className="inline-flex items-center gap-1 text-sm text-[#A3A3A3] hover:text-[#FFFFFF] mb-3 transition-colors min-h-[44px]"
        >
          <ChevronLeft size={16} /> กลับไปยังทีมช่างสัก
        </Link>
        <h1 className="text-2xl font-light text-[#FFFFFF] mb-1">จัดการข้อมูลช่างสัก: {profile.full_name}</h1>
        <p className="text-sm text-[#A3A3A3]">ตั้งค่าข้อมูลการให้บริการ ตารางรับงาน และตรวจสอบช่องทางดำเนินการอื่นๆ</p>
      </div>

      {/* Main Grid for Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Profile Settings Form (Sections A, B, C) */}
        <div className="lg:col-span-2 space-y-8">
          <ArtistProfileClient
            initialData={initialData}
            initialSpecialties={mySpecialties}
            catalog={catalog}
            mode="owner"
            artistId={artistId}
            shopId={shopId}
          />
        </div>

        {/* Sidebar for Availability and Links (Sections D, E) */}
        <div className="space-y-8">
          {/* Quick Operations Links */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-medium text-[#F3F3F3] border-b border-[#262626] pb-3">ทางลัดการตรวจสอบ</h3>
            <div className="flex flex-col gap-3">
              <Link
                href={`/owner/calendar?artistId=${artistId}`}
                className="w-full px-4 py-3 bg-[#262626] hover:bg-[#333] text-sm text-[#F3F3F3] font-medium rounded-lg text-center transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                <Calendar size={16} /> ดูคิวงานของช่าง
              </Link>
              <Link
                href={`/owner/finance?artistId=${artistId}`}
                className="w-full px-4 py-3 bg-[#262626] hover:bg-[#333] text-sm text-[#F3F3F3] font-medium rounded-lg text-center transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                <DollarSign size={16} /> ดูสรุปรายได้ของช่าง
              </Link>
              <Link
                href="/owner/portfolio"
                className="w-full px-4 py-3 bg-[#121212] border border-[#262626] hover:border-[#404040] text-sm text-[#A3A3A3] hover:text-[#FFFFFF] font-medium rounded-lg text-center transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                <ImageIcon size={16} /> ผลงานของช่างสัก
              </Link>
            </div>
          </div>

          {/* Availability Calendar setting */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm space-y-4 overflow-hidden">
            <h3 className="text-sm font-medium text-[#F3F3F3] border-b border-[#262626] pb-3">ปฏิทินวันปฏิบัติงาน (Availability)</h3>
            <ArtistCalendar
              defaultCapacity={defaultCapacity}
              overrides={overridesMap}
              occupied={occupiedMap}
              appointments={appointments}
              mode="owner"
              artistId={artistId}
              shopId={shopId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
