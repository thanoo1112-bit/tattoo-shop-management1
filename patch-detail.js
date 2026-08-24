const fs = require('fs');

let file2 = 'src/components/artist/booking-requests/ArtistBookingRequestDetail.tsx';
let code2 = fs.readFileSync(file2, 'utf8');
const target2 = `                  {project.width_cm && project.height_cm 
                    ? \`\${project.width_cm} × \${project.height_cm} ซม.\` 
                    : 'ไม่ระบุ'}`;
const replacement2 = `                  {project.width_cm && project.height_cm 
                    ? \`กว้าง \${project.width_cm} ซม. × สูง \${project.height_cm} ซม.\` 
                    : 'ไม่ระบุ'}`;
code2 = code2.replace(target2, replacement2);
fs.writeFileSync(file2, code2);
