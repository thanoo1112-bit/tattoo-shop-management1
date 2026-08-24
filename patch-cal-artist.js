const fs = require('fs');
let code = fs.readFileSync('src/app/(dashboard)/artist/calendar/page.tsx', 'utf8');

const target = `      id, start_at, end_at, status,
      customer:customers(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(
        name, tattoo_style, work_type, color_mode, width_cm, height_cm, body_placement, agreed_price
      ),
      booking_request:booking_requests(
        payments(status, amount, payment_type)
      )`;

const replacement = `      id, start_at, end_at, status,
      customer:customers(full_name),
      artist:profiles!appointments_artist_id_fkey(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(
        name, tattoo_style, work_type, color_mode, width_cm, height_cm, body_placement, agreed_price
      ),
      booking_request:booking_requests(
        payments(status, amount, payment_type)
      )`;

code = code.replace(target, replacement);

const targetMap = `    status: a.status,
    customer: Array.isArray(a.customer) ? a.customer[0] : a.customer,
    project: Array.isArray(a.project) ? a.project[0] || null : a.project || null,`;

const replacementMap = `    status: a.status,
    customer: Array.isArray(a.customer) ? a.customer[0] : a.customer,
    artist: Array.isArray(a.artist) ? a.artist[0] : a.artist,
    project: Array.isArray(a.project) ? a.project[0] || null : a.project || null,`;

code = code.replace(targetMap, replacementMap);
fs.writeFileSync('src/app/(dashboard)/artist/calendar/page.tsx', code);
