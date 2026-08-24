const fs = require('fs');

let file1 = 'src/components/artist/booking-requests/ArtistBookingRequestsList.tsx';
let code1 = fs.readFileSync(file1, 'utf8');
const target1 = `                  {project.width_cm && project.height_cm ? \`ก x ย: \${project.width_cm} × \${project.height_cm} ซม.\` : 'ไม่ระบุขนาด'}`;
const replacement1 = `                  {project.width_cm && project.height_cm ? \`ขนาด: กว้าง \${project.width_cm} ซม. × สูง \${project.height_cm} ซม.\` : 'ขนาด: ไม่ระบุ'}`;
code1 = code1.replace(target1, replacement1);
fs.writeFileSync(file1, code1);
