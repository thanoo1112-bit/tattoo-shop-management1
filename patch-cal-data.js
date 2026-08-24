const fs = require('fs');
let code = fs.readFileSync('src/app/(dashboard)/artist/calendar/page.tsx', 'utf8');

const target = `  // 5. Get Appointments
  const { data: appointmentsData } = await supabase
    .from('appointments')
    .select(\`
      id, start_at, status,
      project:tattoo_projects!appointments_shop_id_project_id_fkey (name, tattoo_style)
    \`)
    .eq('shop_id', membership.shop_id)
    .eq('artist_id', user.id)
    .in('status', ['scheduled', 'in_progress', 'completed'])
    .gte('start_at', startDate)
    .lte('start_at', endDate);

  const appointments = (appointmentsData || []).map((a: any) => ({
    id: a.id,
    start_at: a.start_at,
    status: a.status,
    project: Array.isArray(a.project) ? a.project[0] || null : a.project || null
  }));`;

const replacement = `  // 5. Get Appointments
  const { data: appointmentsData } = await supabase
    .from('appointments')
    .select(\`
      id, start_at, end_at, status,
      customer:customers(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(
        name, tattoo_style, work_type, color_mode, width_cm, height_cm, body_placement, agreed_price
      ),
      booking_request:booking_requests(
        payments(status, amount, payment_type)
      )
    \`)
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
    project: Array.isArray(a.project) ? a.project[0] || null : a.project || null,
    booking_request: Array.isArray(a.booking_request) ? a.booking_request[0] || null : a.booking_request || null
  }));`;

code = code.replace(target, replacement);

fs.writeFileSync('src/app/(dashboard)/artist/calendar/page.tsx', code);
