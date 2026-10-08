/**
 * Utility functions and data structures for resolving customer identity
 * supporting both registered auth users and walk-in/offline customers.
 */

export interface CustomerRecord {
  id: string;
  user_id?: string | null;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  medical_conditions?: string | null;
  allergies?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CustomerTargetItem {
  customer_id?: string | null;
  customer_user_id?: string | null;
  [key: string]: any;
}

export interface CustomerMaps {
  customersByIdMap: Map<string, CustomerRecord>;
  customersByUserIdMap: Map<string, CustomerRecord>;
}

/**
 * Builds dual lookup maps for efficient customer resolution:
 * 1. customersByIdMap: Map keyed by customers.id (Primary Key)
 * 2. customersByUserIdMap: Map keyed by customers.user_id (Only when user_id IS NOT NULL)
 */
export function buildCustomerMaps(customers: CustomerRecord[] | null | undefined): CustomerMaps {
  const customersByIdMap = new Map<string, CustomerRecord>();
  const customersByUserIdMap = new Map<string, CustomerRecord>();

  if (!customers || !Array.isArray(customers)) {
    return { customersByIdMap, customersByUserIdMap };
  }

  for (const c of customers) {
    if (!c || !c.id) continue;

    // Primary Map: Keyed by customers.id
    customersByIdMap.set(c.id, c);

    // Secondary Map: Keyed by customers.user_id (if present)
    if (c.user_id) {
      customersByUserIdMap.set(c.user_id, c);
    }
  }

  return { customersByIdMap, customersByUserIdMap };
}

/**
 * Resolves a customer record from a given item using dual lookup:
 * 1. Primary lookup by customer_id
 * 2. Fallback lookup by customer_user_id
 * 3. Returns null if not matched
 */
export function resolveCustomerInfo(
  item: CustomerTargetItem | null | undefined,
  customersByIdMap: Map<string, CustomerRecord>,
  customersByUserIdMap: Map<string, CustomerRecord>
): CustomerRecord | null {
  if (!item) return null;

  // Primary Lookup: Try customer_id first (Works for all customers including walk-ins)
  if (item.customer_id && customersByIdMap.has(item.customer_id)) {
    return customersByIdMap.get(item.customer_id) || null;
  }

  // Fallback Lookup: Try customer_user_id (Works for registered auth customers / legacy data)
  if (item.customer_user_id && customersByUserIdMap.has(item.customer_user_id)) {
    return customersByUserIdMap.get(item.customer_user_id) || null;
  }

  return null;
}

export interface AgeValidationResult {
  valid: boolean;
  age: number;
  error?: string;
}

/**
 * Validates whether a given date of birth string (YYYY-MM-DD or parseable ISO date)
 * represents an age of at least 18 years old in Asia/Bangkok time zone.
 */
export function validateCustomerAge(
  dateOfBirthStr: string | null | undefined,
  referenceDate: Date = new Date()
): AgeValidationResult {
  if (!dateOfBirthStr || typeof dateOfBirthStr !== 'string' || !dateOfBirthStr.trim()) {
    return { valid: false, age: 0, error: 'กรุณาระบุวัน/เดือน/ปีเกิด' };
  }

  const cleanDob = dateOfBirthStr.trim();
  const birth = new Date(cleanDob);
  if (isNaN(birth.getTime())) {
    return { valid: false, age: 0, error: 'กรุณาระบุวัน/เดือน/ปีเกิดที่ถูกต้อง' };
  }

  const getBkkParts = (d: Date) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(d);
    let year = 0, month = 0, day = 0;
    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
    }
    return { year, month, day };
  };

  const ref = getBkkParts(referenceDate);
  const bkkDob = getBkkParts(birth);

  // Check if birthdate is in the future
  if (
    bkkDob.year > ref.year ||
    (bkkDob.year === ref.year && bkkDob.month > ref.month) ||
    (bkkDob.year === ref.year && bkkDob.month === ref.month && bkkDob.day > ref.day)
  ) {
    return {
      valid: false,
      age: 0,
      error: 'ระบบเปิดให้บริการสำหรับผู้มีอายุ 18 ปีบริบูรณ์ขึ้นไป',
    };
  }

  // Calculate age in full years
  let age = ref.year - bkkDob.year;
  const monthDiff = ref.month - bkkDob.month;

  if (monthDiff < 0 || (monthDiff === 0 && ref.day < bkkDob.day)) {
    age--;
  }

  if (age < 18) {
    return {
      valid: false,
      age,
      error: 'ระบบเปิดให้บริการสำหรับผู้มีอายุ 18 ปีบริบูรณ์ขึ้นไป',
    };
  }

  return { valid: true, age };
}

/**
 * Calculates customer age in full years from date of birth string (YYYY-MM-DD)
 * Returns null if missing or invalid date.
 */
export function calculateCustomerAgeYears(dateOfBirthStr?: string | null): number | null {
  if (!dateOfBirthStr || typeof dateOfBirthStr !== 'string' || !dateOfBirthStr.trim()) return null;
  const res = validateCustomerAge(dateOfBirthStr);
  if (res.age && res.age > 0) return res.age;
  try {
    const birth = new Date(dateOfBirthStr.trim());
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

/**
 * Formats customer age for display in headers: e.g. "อายุ 20 ปี" or "ไม่ระบุ"
 */
export function formatCustomerAgeDisplay(dateOfBirthStr?: string | null): string {
  const years = calculateCustomerAgeYears(dateOfBirthStr);
  if (years === null || years === undefined || isNaN(years)) {
    return 'ไม่พบข้อมูลวันเกิด';
  }
  return `${years} ปี`;
}

/**
 * Formats customer health information (medical conditions and allergies) for Admin/Artist display.
 * Resolves health disclosures from customer record or customer's estimate requests/bookings.
 * Returns "ไม่ระบุ" ONLY if no health disclosure data exists anywhere for that customer.
 */
export function formatCustomerHealthInfo(input?: {
  medical_conditions?: string | null;
  allergies?: string | null;
  medical_condition_note?: string | null;
  allergy_note?: string | null;
  has_medical_condition?: boolean | null;
  has_allergy?: boolean | null;
  estimates?: any[];
}) {
  let medicalCondition = 'ไม่ระบุ';
  let allergy = 'ไม่ระบุ';

  if (input) {
    // 1. Direct fields check on input object
    const directMed = (input.medical_conditions || input.medical_condition_note || '').trim();
    if (directMed) {
      medicalCondition = directMed;
    } else if (input.has_medical_condition === false) {
      medicalCondition = 'ไม่มี';
    }

    const directAllergy = (input.allergies || input.allergy_note || '').trim();
    if (directAllergy) {
      allergy = directAllergy;
    } else if (input.has_allergy === false) {
      allergy = 'ไม่มี';
    }

    // 2. Search across customer's estimate_requests if direct fields are empty
    if (Array.isArray(input.estimates) && input.estimates.length > 0) {
      if (medicalCondition === 'ไม่ระบุ') {
        for (const est of input.estimates) {
          const medNote = (est.medical_condition_note || est.medicalConditionNote || '').trim();
          const hasMed = est.has_medical_condition ?? est.hasMedicalCondition;
          if (medNote) {
            medicalCondition = medNote;
            break;
          } else if (hasMed === false) {
            medicalCondition = 'ไม่มี';
          } else if (hasMed === true) {
            medicalCondition = 'มี (ไม่ได้ระบุรายละเอียด)';
          }
        }
      }

      if (allergy === 'ไม่ระบุ') {
        for (const est of input.estimates) {
          const allNote = (est.allergy_note || est.allergyNote || '').trim();
          const hasAller = est.has_allergy ?? est.hasAllergy;
          if (allNote) {
            allergy = allNote;
            break;
          } else if (hasAller === false) {
            allergy = 'ไม่มี';
          } else if (hasAller === true) {
            allergy = 'มี (ไม่ได้ระบุรายละเอียด)';
          }
        }
      }
    }
  }

  return {
    medicalCondition,
    allergy,
  };
}
