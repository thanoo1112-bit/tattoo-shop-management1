export function translateInviteError(errorMessage: string | undefined | null): string {
  if (!errorMessage) return 'เกิดข้อผิดพลาดในการดำเนินการ โปรดลองอีกครั้ง'

  // Map known RPC errors to Thai messages
  const errorMap: Record<string, string> = {
    'UNAUTHORIZED': 'ไม่มีสิทธิ์ในการดำเนินการนี้',
    'INVITE_NOT_FOUND': 'ไม่พบคำเชิญนี้',
    'INVITE_NOT_PENDING': 'คำเชิญนี้ถูกใช้งานหรือยกเลิกไปแล้ว',
    'INVITE_EXPIRED': 'ลิงก์เชิญนี้หมดอายุแล้ว',
    'ALREADY_MEMBER': 'คุณเป็นสมาชิกของร้านนี้อยู่แล้ว',
    'PROFILE_NOT_FOUND': 'ไม่พบข้อมูลโปรไฟล์ของคุณ โปรดลองเข้าสู่ระบบใหม่',
    'OWNER_SHOP_ALREADY_EXISTS': 'คุณมีร้านที่จัดการอยู่แล้ว ไม่สามารถสร้างเพิ่มได้',
    'MULTIPLE_OWNER_SHOPS_NOT_SUPPORTED': 'ระบบยังไม่รองรับการจัดการหลายร้าน',
    'INVALID_SLUG': 'รูปแบบ Slug ของร้านไม่ถูกต้อง'
  }

  // Check if error message contains any of the known error keys
  for (const [key, value] of Object.entries(errorMap)) {
    if (errorMessage.includes(key)) {
      return value
    }
  }

  // Fallback for unexpected errors
  console.error('[Invite Error] Unexpected error:', errorMessage)
  return 'เกิดข้อผิดพลาดในการดำเนินการ โปรดลองอีกครั้ง'
}
