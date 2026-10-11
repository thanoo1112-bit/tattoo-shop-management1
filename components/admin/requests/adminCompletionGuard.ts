import { BookingItem } from './types';

export interface CompletionGuardResult {
  allowed: boolean;
  title?: string;
  reason?: string;
}

/**
 * Client-side UI guard for Admin Booking Completion.
 * Aligned with Server Integrity Trigger rules from Phase 7G3A & Multi-session guard.
 */
export function checkAdminCompletionEligibility(
  booking: Partial<BookingItem> | null | undefined
): CompletionGuardResult {
  if (!booking) {
    return {
      allowed: false,
      title: 'ไม่พบข้อมูลการจอง',
      reason: 'ไม่พบข้อมูลการจองในระบบ',
    };
  }

  // 1. Status Rule: Must be CONFIRMED or IN_PROGRESS
  if (booking.status !== 'CONFIRMED' && booking.status !== 'IN_PROGRESS') {
    return {
      allowed: false,
      title: 'ไม่สามารถจบงานได้',
      reason: 'ไม่สามารถจบงานจากสถานะปัจจุบันได้ (ต้องอยู่ในสถานะยืนยันคิวแล้วหรือกำลังดำเนินงาน)',
    };
  }

  // 2. Price Input Note: If quoted_price is not yet set, CompleteBookingDialog will prompt artist to enter it.
  const sessions = booking.sessions || [];

  // 3. Zero Session Guard: Must have at least 1 session
  if (sessions.length === 0) {
    return {
      allowed: false,
      title: 'ยังไม่มีข้อมูลรอบสัก',
      reason: 'ยังไม่มีข้อมูลรอบสักสำหรับงานนี้',
    };
  }

  // 4. Session Validation: Must have at least one valid session (not all cancelled)
  const validSessions = sessions.filter((s) => s.status !== 'CANCELLED');
  if (validSessions.length === 0) {
    return {
      allowed: false,
      title: 'ไม่มีรอบสักที่สามารถใช้ได้',
      reason: 'รอบสักทั้งหมดถูกยกเลิก ไม่สามารถจบงานได้',
    };
  }

  // 5. Active Sessions Guard: All active non-cancelled sessions must be COMPLETED
  const hasActiveSession = validSessions.some(
    (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
  );
  if (hasActiveSession) {
    return {
      allowed: false,
      title: 'ยังมีรอบนัดที่ยังไม่เสร็จ',
      reason: 'ยังมีรอบนัดที่ยังไม่เสร็จ กรุณาเสร็จสิ้นรอบนัดทั้งหมดก่อนปิดงาน',
    };
  }

  return { allowed: true };
}

/**
 * Maps raw database trigger and RPC error messages to user-friendly Thai text.
 */
export function mapServerCompletionError(
  rawErrorMsg?: string | null,
  errorCode?: string | null
): string {
  if (!rawErrorMsg && !errorCode) return 'เกิดข้อผิดพลาดในการปิดงาน';

  const msg = rawErrorMsg || '';
  if (
    errorCode === '22023' ||
    msg.includes('กรุณาเสร็จสิ้นรอบสักให้ครบทุกรอบก่อนปิดงาน') ||
    msg.includes('เสร็จสิ้นรอบสักให้ครบทุกรอบก่อนปิดงาน') ||
    msg.includes('all scheduled or in-progress sessions must be completed or cancelled first')
  ) {
    return 'ยังมีรอบนัดที่ยังไม่เสร็จ กรุณาเสร็จสิ้นทุกรอบก่อนปิดงาน';
  }

  if (msg.includes('ACTUAL_PRICE_REQUIRED')) {
    return 'ยังไม่ได้กำหนดราคางาน กรุณาให้ช่างผู้รับผิดชอบกำหนดราคาก่อนจบงาน';
  }
  if (msg.includes('no sessions found')) {
    return 'ยังไม่มีข้อมูลรอบสักสำหรับงานนี้';
  }
  if (
    msg.includes('at least one session must be COMPLETED') ||
    msg.includes('no completed sessions found')
  ) {
    return 'ยังไม่มีรอบสักที่เสร็จสิ้นสำหรับงานนี้';
  }
  if (
    msg.includes('Invalid status transition') ||
    msg.includes('must be IN_PROGRESS')
  ) {
    return 'ไม่สามารถจบงานจากสถานะปัจจุบันได้';
  }
  if (msg.includes('Only active Admin') || msg.includes('Unauthorized')) {
    return 'คุณไม่มีสิทธิ์ในการปิดงานสักนี้';
  }

  return 'เกิดข้อผิดพลาดในการปิดงาน กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง';
}

