/**
 * Thai Phone Number Normalization Utility
 * Converts standard Thai mobile numbers (e.g. 0812345678, 081-234-5678)
 * to E.164 international format (+66812345678) required by Supabase Auth.
 */

/**
 * Strips all non-digit characters and limits to max 10 characters
 */
export function sanitizeDigitsOnly(input: string): string {
  if (!input) return '';
  return input.replace(/\D/g, '').slice(0, 10);
}

/**
 * Validates local 10-digit Thai phone input for Customer UI
 */
export function validateCustomerPhone(input: string): { valid: boolean; error?: string } {
  if (!input || input.trim() === '') {
    return { valid: false, error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }

  const cleaned = input.trim();

  // If input contains non-digits
  if (/\D/.test(cleaned)) {
    return { valid: false, error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (กรอกเฉพาะตัวเลข)' };
  }

  if (cleaned.length < 10 || cleaned.length > 10) {
    return { valid: false, error: 'กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก' };
  }

  if (!/^0[0-9]{9}$/.test(cleaned)) {
    return { valid: false, error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' };
  }

  return { valid: true };
}

export function normalizeThaiPhone(input: string): { valid: boolean; normalized: string; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, normalized: '', error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }

  // Remove whitespace, dashes, parentheses
  const cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned === '') {
    return { valid: false, normalized: '', error: 'กรุณากรอกเบอร์โทรศัพท์' };
  }

  // Format 1: Thai domestic 10 digits starting with 0
  if (/^0[0-9]{9}$/.test(cleaned)) {
    return { valid: true, normalized: '+66' + cleaned.substring(1) };
  }

  // Format 2: Already in E.164 format with +66 (10-digit mobile equivalent)
  if (/^\+66[0-9]{9}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }

  // Format 3: 66 without leading plus
  if (/^66[0-9]{9}$/.test(cleaned)) {
    return { valid: true, normalized: '+' + cleaned };
  }

  if (cleaned.replace(/\D/g, '').length < 10) {
    return { valid: false, normalized: '', error: 'กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก' };
  }

  return {
    valid: false,
    normalized: '',
    error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'
  };
}

/**
 * Format E.164 or raw phone for clean UI display (e.g. 081-234-5678)
 */
export function formatThaiPhoneForDisplay(phone?: string | null): string {
  if (!phone) return 'ไม่ระบุเบอร์โทรศัพท์';
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+66')) {
    cleaned = '0' + cleaned.substring(3);
  } else if (cleaned.startsWith('66') && cleaned.length === 11) {
    cleaned = '0' + cleaned.substring(2);
  }
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
  }
  return phone;
}
