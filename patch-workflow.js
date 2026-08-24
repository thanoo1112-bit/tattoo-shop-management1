const fs = require('fs');

let file = 'src/components/artist/calendar/ArtistCalendar.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
const importsTarget = `import { useState, useMemo, useTransition } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, AlertCircle } from 'lucide-react';
import { updateArtistDefaultCapacity, updateArtistDailyOverride } from '@/app/(dashboard)/artist/calendar/actions';`;

const importsReplacement = `import { useState, useMemo, useTransition } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { updateArtistDefaultCapacity, updateArtistDailyOverride } from '@/app/(dashboard)/artist/calendar/actions';`;

code = code.replace(importsTarget, importsReplacement);

// 2. Add state and handlers
const stateTarget = `  const [isClosed, setIsClosed] = useState(false);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();`;

const stateReplacement = `  const [isClosed, setIsClosed] = useState(false);

  // Workflow State
  const router = useRouter();
  const supabase = createClient();
  const [confirmApp, setConfirmApp] = useState<Appointment | null>(null);
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const handleConfirmWorkflow = async () => {
    if (!confirmApp) return;
    setIsSubmittingWorkflow(true);
    setWorkflowError(null);
    
    const targetStatus = confirmApp.status === 'scheduled' ? 'in_progress' : 'completed';
    
    const { error } = await supabase.rpc('update_appointment_status', {
      p_appointment_id: confirmApp.id,
      p_status: targetStatus
    });

    if (error) {
      console.error('Workflow error:', error);
      setWorkflowError('ไม่สามารถอัปเดตสถานะคิวได้ กรุณาลองใหม่อีกครั้ง');
      setIsSubmittingWorkflow(false);
    } else {
      router.refresh();
      setConfirmApp(null);
      setIsSubmittingWorkflow(false);
    }
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();`;

code = code.replace(stateTarget, stateReplacement);

// 3. Add buttons to each app
const appEndTarget = `                            {depositPayment && (
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
                      );`;

const appEndReplacement = `                            {depositPayment && (
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
                        
                        {(app.status === 'scheduled' || app.status === 'in_progress') && (
                          <div className="pt-3 border-t border-[#262626]">
                            <button
                              onClick={() => setConfirmApp(app)}
                              className="w-full py-2.5 rounded-md text-sm font-medium bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] transition-colors"
                            >
                              {app.status === 'scheduled' ? 'เริ่มงาน' : 'เสร็จงาน'}
                            </button>
                          </div>
                        )}
                      </div>
                      );`;

code = code.replace(appEndTarget, appEndReplacement);

// 4. Add Workflow Confirmation Modal
const modalTarget = `      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">`;

const modalReplacement = `      {/* Workflow Confirmation Modal */}
      {confirmApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#F3F3F3]">
                {confirmApp.status === 'scheduled' ? 'เริ่มงานสัก' : 'ยืนยันเสร็จงาน'}
              </h3>
            </div>
            <div className="p-5">
              <p className="text-[#A3A3A3] text-sm">
                {confirmApp.status === 'scheduled' 
                  ? 'ยืนยันว่าต้องการเริ่มงานสำหรับคิวนี้' 
                  : 'ยืนยันว่า Session นี้ดำเนินการเสร็จแล้ว'}
              </p>
              
              {workflowError && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{workflowError}</span>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-[#262626] flex justify-end gap-3 bg-[#121212]">
              <button 
                onClick={() => { setConfirmApp(null); setWorkflowError(null); }}
                disabled={isSubmittingWorkflow}
                className="px-4 py-2 text-sm font-medium text-[#F3F3F3] hover:bg-[#262626] rounded-md transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleConfirmWorkflow}
                disabled={isSubmittingWorkflow}
                className="px-4 py-2 text-sm font-medium bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] rounded-md transition-colors disabled:opacity-50"
              >
                {isSubmittingWorkflow 
                  ? (confirmApp.status === 'scheduled' ? 'กำลังเริ่มงาน...' : 'กำลังบันทึก...') 
                  : (confirmApp.status === 'scheduled' ? 'เริ่มงาน' : 'ยืนยันเสร็จงาน')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDate && selectedDateObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">`;

code = code.replace(modalTarget, modalReplacement);

fs.writeFileSync(file, code);
