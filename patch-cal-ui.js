const fs = require('fs');
let code = fs.readFileSync('src/components/artist/calendar/ArtistCalendar.tsx', 'utf8');

const targetInt = `interface Appointment {
  id: string;
  start_at: string;
  status: string;
  project: { name: string, tattoo_style: string } | null;
}`;

const replacementInt = `interface Appointment {
  id: string;
  start_at: string;
  end_at?: string;
  status: string;
  customer?: { full_name: string | null } | null;
  project?: {
    name: string;
    tattoo_style: string;
    work_type?: string;
    color_mode?: string;
    width_cm?: number;
    height_cm?: number;
    body_placement?: string;
    agreed_price?: number | null;
  } | null;
  booking_request?: {
    payments?: { status: string; amount: number; payment_type: string }[] | null;
  } | null;
}`;

code = code.replace(targetInt, replacementInt);

const targetMap = `                    {appointmentsByDate.get(selectedDate)!.map(app => (
                      <div key={app.id} className="bg-[#121212] border border-[#262626] p-3 rounded-md">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-medium text-[#F3F3F3]">
                            {app.project?.name || 'ไม่ระบุงาน'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#262626] text-[#9CA3AB]">
                            {app.status}
                          </span>
                        </div>
                        {app.start_at && (
                          <div className="flex items-center text-[10px] text-[#747C85] gap-1">
                            <Clock size={10} />
                            {new Date(app.start_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    ))}`;

const replacementMap = `                    {appointmentsByDate.get(selectedDate)!.map(app => {
                      let uiStatus = app.status;
                      switch(app.status) {
                        case 'scheduled': uiStatus = 'ยืนยันแล้ว'; break;
                        case 'in_progress': uiStatus = 'กำลังดำเนินงาน'; break;
                        case 'completed': uiStatus = 'เสร็จสิ้น'; break;
                        case 'cancelled': uiStatus = 'ยกเลิก'; break;
                        case 'no_show': uiStatus = 'ไม่มาตามนัด'; break;
                      }

                      const depositPayment = app.booking_request?.payments?.find(p => p.payment_type === 'deposit');

                      const formatTime = (isoString: string) => {
                        return new Date(isoString).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                      };

                      const timeStr = app.start_at 
                        ? (app.end_at ? \`\${formatTime(app.start_at)} – \${formatTime(app.end_at)}\` : formatTime(app.start_at))
                        : '';

                      return (
                      <div key={app.id} className="bg-[#121212] border border-[#262626] p-4 rounded-md space-y-3">
                        {/* Header */}
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
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded-full bg-[#262626] text-[#F3F3F3] border border-[#333]">
                            {uiStatus}
                          </span>
                        </div>

                        {/* Project Details */}
                        {app.project && (
                          <div className="text-xs text-[#747C85] leading-relaxed">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {app.project.tattoo_style && <span>{app.project.tattoo_style}</span>}
                              {app.project.work_type && (
                                <>
                                  <span className="text-[#333]">·</span>
                                  <span>
                                    {app.project.work_type === 'new_work' ? 'งานใหม่' :
                                     app.project.work_type === 'extension' ? 'ต่อเติมลายเดิม' :
                                     app.project.work_type === 'touch_up' ? 'เก็บงาน/เติมสี' :
                                     app.project.work_type === 'cover_up' ? 'แก้/ทับลายเดิม' :
                                     app.project.work_type === 'scar_cover' ? 'สักทับรอยแผลเป็น' :
                                     app.project.work_type}
                                  </span>
                                </>
                              )}
                              {app.project.color_mode && (
                                <>
                                  <span className="text-[#333]">·</span>
                                  <span>
                                    {app.project.color_mode === 'black_grey' ? 'Black & Grey' :
                                     app.project.color_mode === 'color' ? 'Color' :
                                     app.project.color_mode}
                                  </span>
                                </>
                              )}
                            </div>
                            
                            {(app.project.width_cm || app.project.height_cm || app.project.body_placement) && (
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
                            )}
                          </div>
                        )}

                        {/* Financial Details */}
                        {((app.project && app.project.agreed_price) || depositPayment) && (
                          <div className="pt-2 border-t border-[#262626] flex justify-between items-center text-xs">
                            {app.project?.agreed_price ? (
                              <span className="text-[#9CA3AB]">
                                ราคางานสัก <strong className="text-[#F3F3F3] font-medium ml-1">฿{app.project.agreed_price.toLocaleString()}</strong>
                              </span>
                            ) : (
                              <span className="text-[#9CA3AB]">ราคา: ไม่ระบุ</span>
                            )}
                            
                            {depositPayment && (
                              <span className="text-[#9CA3AB] flex items-center gap-1">
                                มัดจำ 
                                <strong className="text-[#F3F3F3] font-medium">฿{depositPayment.amount.toLocaleString()}</strong>
                                {depositPayment.status === 'paid' && (
                                  <span className="text-[#10B981] ml-1">· ชำระแล้ว</span>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}`;

code = code.replace(targetMap, replacementMap);

fs.writeFileSync('src/components/artist/calendar/ArtistCalendar.tsx', code);
