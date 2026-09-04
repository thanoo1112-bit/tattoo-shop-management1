export type PaymentType = 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'OTHER';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'QR' | 'OTHER';
export type PaymentStatus = 'RECORDED' | 'VOIDED';

export interface RevenueRecord {
  id: string;
  booking_id: string;
  payment_type: PaymentType;
  amount: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  paid_at: string;
  reference_no: string | null;
  note: string | null;
  created_at: string;
  customer_name: string;
  customer_phone?: string;
  artist_id: string | null;
  artist_name: string;
  artist_nickname: string | null;
  booking_status: string;
}

export interface ArtistRevenueItem {
  artist_id: string;
  name: string;
  nickname: string | null;
  booking_count: number;
  revenue: number;
  percentage: number;
}

export interface PaymentTypeSummary {
  type: PaymentType;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface PaymentMethodSummary {
  method: PaymentMethod;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface DailyRevenueItem {
  date: string; // YYYY-MM-DD in Asia/Bangkok
  displayDate: string; // e.g., '3 ก.ย.'
  amount: number;
  count: number;
}

export type DateFilterPreset = 'today' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom';

export interface RevenueKpiData {
  todayRevenue: number;
  monthRevenue: number;
  monthDepositRevenue: number;
  currentOutstanding: number;
  todayTransactionCount: number;
  monthTransactionCount: number;
}

// ------------------------------------------------------------------
// Timezone Utilities (Asia/Bangkok = UTC+07:00)
// ------------------------------------------------------------------

/**
 * Returns a 'YYYY-MM-DD' date string strictly in Asia/Bangkok timezone.
 */
export function toBangkokDate(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns current date string 'YYYY-MM-DD' in Asia/Bangkok.
 */
export function getBangkokToday(): string {
  return toBangkokDate(new Date());
}

/**
 * Returns 'YYYY-MM' prefix for the current month in Asia/Bangkok.
 */
export function getBangkokCurrentMonth(): string {
  return getBangkokToday().slice(0, 7);
}

/**
 * Returns 'YYYY-MM' prefix for previous month in Asia/Bangkok.
 */
export function getBangkokPreviousMonth(): string {
  const [yearStr, monthStr] = getBangkokCurrentMonth().split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/**
 * Formats Thai currency number cleanly.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
