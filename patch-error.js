const fs = require('fs');
let code = fs.readFileSync('src/components/artist/calendar/ArtistCalendar.tsx', 'utf8');

const target = `    if (error) {
      console.error('Workflow error:', error);
      setWorkflowError('ไม่สามารถอัปเดตสถานะคิวได้ กรุณาลองใหม่อีกครั้ง');
      setIsSubmittingWorkflow(false);
    } else {`;
    
const replacement = `    if (error) {
      console.error('Workflow error:', error);
      setWorkflowError('ไม่สามารถอัปเดตสถานะคิวได้ กรุณาลองใหม่อีกครั้ง');
      setIsSubmittingWorkflow(false);
      router.refresh();
    } else {`;
    
code = code.replace(target, replacement);
fs.writeFileSync('src/components/artist/calendar/ArtistCalendar.tsx', code);
