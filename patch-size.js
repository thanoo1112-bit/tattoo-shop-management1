const fs = require('fs');

// 1. ArtistBookingRequestsList.tsx (Collapsed Card Summary)
let file1 = 'src/components/artist/booking-requests/ArtistBookingRequestsList.tsx';
let code1 = fs.readFileSync(file1, 'utf8');
const target1 = `                  {project.width_cm && project.height_cm ? \`ก x ย: \${project.width_cm} × \${project.height_cm} ซม.\` : 'ไม่ระบุขนาด'}
                  {project.body_placement && \` · \${project.body_placement}\`}`;
const replacement1 = `                  {project.width_cm && project.height_cm ? \`ขนาด: กว้าง \${project.width_cm} ซม. × สูง \${project.height_cm} ซม.\` : 'ขนาด: ไม่ระบุ'}
                  {project.body_placement && \` · \${project.body_placement}\`}`;
code1 = code1.replace(target1, replacement1);
fs.writeFileSync(file1, code1);

// 2. ArtistBookingRequestDetail.tsx (Expanded Details)
let file2 = 'src/components/artist/booking-requests/ArtistBookingRequestDetail.tsx';
let code2 = fs.readFileSync(file2, 'utf8');
const target2 = `                  {project.width_cm && project.height_cm 
                    ? \`\${project.width_cm} × \${project.height_cm} ซม.\` 
                    : 'ไม่ระบุขนาด'}
                  {project.body_placement && \` · \${project.body_placement}\`}`;
const replacement2 = `                  {project.width_cm && project.height_cm 
                    ? \`ขนาด: กว้าง \${project.width_cm} ซม. × สูง \${project.height_cm} ซม.\` 
                    : 'ขนาด: ไม่ระบุ'}
                  {project.body_placement && \` · \${project.body_placement}\`}`;
code2 = code2.replace(target2, replacement2);
fs.writeFileSync(file2, code2);

// 3. ArtistCalendar.tsx
let file3 = 'src/components/artist/calendar/ArtistCalendar.tsx';
let code3 = fs.readFileSync(file3, 'utf8');
const target3 = `                            {(app.project.width_cm || app.project.height_cm || app.project.body_placement) && (
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                                {(app.project.width_cm || app.project.height_cm) && (
                                  <span>{app.project.width_cm || '?'} × {app.project.height_cm || '?'} ซม.</span>
                                )}
                                {app.project.body_placement && (
                                  <>
                                    {(app.project.width_cm || app.project.height_cm) && <span className="text-[#333]">·</span>}
                                    <span>{app.project.body_placement}</span>
                                  </>
                                )}
                              </div>
                            )}`;
const replacement3 = `                            {(app.project.width_cm || app.project.height_cm || app.project.body_placement) && (
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[#747C85]">
                                {(app.project.width_cm || app.project.height_cm) && (
                                  <span>ขนาด: กว้าง {app.project.width_cm || '?'} ซม. × สูง {app.project.height_cm || '?'} ซม.</span>
                                )}
                                {app.project.body_placement && (
                                  <>
                                    {(app.project.width_cm || app.project.height_cm) && <span className="text-[#333]">·</span>}
                                    <span>{app.project.body_placement}</span>
                                  </>
                                )}
                              </div>
                            )}`;
code3 = code3.replace(target3, replacement3);
fs.writeFileSync(file3, code3);

// 4. BookingSummaryFlow.tsx
let file4 = 'src/components/booking/BookingSummaryFlow.tsx';
let code4 = fs.readFileSync(file4, 'utf8');
const target4 = `            <div className="flex justify-between gap-4 border-b border-[#262626] pb-4">
              <span className="text-[#A3A3A3] whitespace-nowrap">ขนาดงาน</span>
              <span className="text-[#F5F5F5] text-right">{formData.widthCm} × {formData.heightCm} cm · ขนาด{sizeCategory}</span>
            </div>`;
const replacement4 = `            <div className="flex flex-col sm:flex-row justify-between gap-2 border-b border-[#262626] pb-4">
              <span className="text-[#A3A3A3] whitespace-nowrap">ขนาดงาน</span>
              <span className="text-[#F5F5F5] sm:text-right">ขนาด: กว้าง {formData.widthCm} ซม. × สูง {formData.heightCm} ซม.</span>
            </div>`;
code4 = code4.replace(target4, replacement4);
fs.writeFileSync(file4, code4);
