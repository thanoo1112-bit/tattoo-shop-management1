
function mapError(finalError) {
  let msg = 'ไม่สามารถส่งคำขอจองได้ กรุณาลองอีกครั้ง';
  const raw = finalError.message || '';
  if (raw.includes('FULL') || raw.includes('closed') || raw.includes('capacity')) msg = 'วันที่เลือกไม่สามารถรับคำขอเพิ่มเติมได้ กรุณาเลือกวันใหม่';
  else if (raw.includes('expired') || raw.includes('not active') || raw.includes('consumed') || raw.includes('session expired') || raw.includes('timeout')) msg = 'การส่งคำขอใช้เวลานานเกินไป กรุณาลองส่งอีกครั้ง';
  else if (raw.includes('rejects') || raw.includes('Style not supported')) msg = 'ข้อมูลที่เลือกมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง';
  else if (raw.includes('photo') || raw.includes('Max') || raw.includes('real area') || raw.includes('Duplicate')) msg = 'ข้อมูลรูปประกอบไม่ถูกต้อง กรุณาเลือกรูปใหม่';
  return msg;
}

const error = new Error('Could not find the function public.finalize_public_booking(p_session_id, ...) in the schema cache');
console.log('Result for PGRST202 with p_session_id:', mapError(error));

const timeoutError = new Error('Request timeout');
console.log('Result for timeout:', mapError(timeoutError));

const expiredError = new Error('session expired');
console.log('Result for session expired:', mapError(expiredError));

