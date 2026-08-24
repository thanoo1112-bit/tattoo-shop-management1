const fs = require('fs');
let code = fs.readFileSync('src/components/artist/calendar/ArtistCalendar.tsx', 'utf8');

const targetInt = `  customer?: { full_name: string | null } | null;
  project?: {`;

const replacementInt = `  customer?: { full_name: string | null } | null;
  artist?: { full_name: string | null } | null;
  project?: {`;

code = code.replace(targetInt, replacementInt);

const targetHeader = `                        {/* Header */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-semibold text-[#F3F3F3] block">
                              {app.customer?.full_name || 'ไม่ทราบชื่อลูกค้า'}
                            </span>
                            {timeStr && (
                              <span className="text-xs text-[#9CA3AB] mt-0.5 block font-medium">
                                {timeStr}
                              </span>
                            )}
                          </div>`;

const replacementHeader = `                        {/* Header */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-semibold text-[#F3F3F3] block">
                              {app.customer?.full_name || 'ไม่ทราบชื่อลูกค้า'}
                            </span>
                            {timeStr && (
                              <span className="text-xs text-[#9CA3AB] mt-0.5 block font-medium">
                                {timeStr}
                              </span>
                            )}
                            {app.artist?.full_name && (
                              <span className="text-[11px] text-[#747C85] mt-1 block">
                                ช่าง: {app.artist.full_name}
                              </span>
                            )}
                          </div>`;

code = code.replace(targetHeader, replacementHeader);
fs.writeFileSync('src/components/artist/calendar/ArtistCalendar.tsx', code);
