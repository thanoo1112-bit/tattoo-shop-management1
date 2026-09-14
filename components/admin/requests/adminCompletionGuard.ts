import { BookingItem } from './types';

export interface CompletionGuardResult {
  allowed: boolean;
  title?: string;
  reason?: string;
}

/**
 * Client-side UI guard for Admin Booking Completion.
 * Aligned with Server Integrity Trigger rules from Phase 7G3A.
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

  // 2. Actual Price Guard: quoted_price must be set and > 0
  // System estimated min/max price snapshots strictly DO NOT COUNT as actual price.
  const quotedPrice = booking.financial?.quoted_price ?? (booking as any)?.quoted_price;
  const hasActualPrice =
    quotedPrice !== null && quotedPrice !== undefined && Number(quotedPrice) > 0;

  if (!hasActualPrice) {
    return {
      allowed: false,
      title: 'ยังไม่ได้กำหนดราคางาน',
      reason: 'ไม่สามารถจบงานได้จนกว่าช่างผู้รับผิดชอบจะกำหนดราคางานสัก',
    };
  }

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

  return { allowed: true };
}

/**
 * Maps raw database trigger and RPC error messages to user-friendly Thai text.
 */
export function mapServerCompletionError(rawErrorMsg: string | null | undefined): string {
  if (!rawErrorMsg) return 'เกิดข้อผิดพลาดในการปิดงาน';

  if (rawErrorMsg.includes('ACTUAL_PRICE_REQUIRED')) {
    return 'ยังไม่ได้กำหนดราคางาน กรุณาให้ช่างผู้รับผิดชอบกำหนดราคาก่อนจบงาน';
  }
  if (rawErrorMsg.includes('no sessions found')) {
    return 'ยังไม่มีข้อมูลรอบสักสำหรับงานนี้';
  }
  if (
    rawErrorMsg.includes('at least one session must be COMPLETED') ||
    rawErrorMsg.includes('no completed sessions found')
  ) {
    return 'ยังไม่มีรอบสักที่เสร็จสิ้นสำหรับงานนี้';
  }
  if (
    rawErrorMsg.includes(
      'all scheduled or in-progress sessions must be completed or cancelled first'
    )
  ) {
    return 'ยังมีรอบสักที่ยังไม่เสร็จ กรุณาจบรอบหรือยกเลิกรอบที่ไม่ใช้ก่อนจบงาน';
  }
  if (
    rawErrorMsg.includes('Invalid status transition') ||
    rawErrorMsg.includes('must be IN_PROGRESS')
  ) {
    return 'ไม่สามารถจบงานจากสถานะปัจจุบันได้';
  }
  if (rawErrorMsg.includes('Only active Admin') || rawErrorMsg.includes('Unauthorized')) {
    return 'คุณไม่มีสิทธิ์ในการปิดงานสักนี้';
  }

  return 'เกิดข้อผิดพลาดในการปิดงาน กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง';
}
