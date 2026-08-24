/**
 * Centralized Date Utilities for 157 TATTOO
 * Formats all user-facing dates using the Thai Buddhist calendar (พ.ศ.)
 * while maintaining Gregorian dates internally.
 */

/**
 * Formats a date to Thai Buddhist Era date string (e.g. "25 ส.ค. 2569" or "25 สิงหาคม 2569")
 */
export function formatThaiDate(
  dateInput: string | Date | null | undefined,
  options?: { longMonth?: boolean }
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const monthStyle = options?.longMonth ? 'long' : 'short';
  const formatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: monthStyle,
    year: 'numeric',
    timeZone: 'Asia/Bangkok'
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const cleanYear = year.replace(/พ\.ศ\./g, '').trim();

  return `${day} ${month} ${cleanYear}`;
}

/**
 * Formats a date to numeric Thai Buddhist Era date string (e.g. "25/08/2569")
 */
export function formatThaiNumericDate(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Bangkok'
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const cleanYear = year.replace(/พ\.ศ\./g, '').trim();

  return `${day}/${month}/${cleanYear}`;
}

/**
 * Formats a date/time to Thai Buddhist Era datetime string (e.g. "25 ส.ค. 2569 เวลา 13:30 น.")
 */
export function formatThaiDateTime(
  dateInput: string | Date | null | undefined,
  options?: { longMonth?: boolean }
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const datePart = formatThaiDate(date, options);
  const timePart = formatThaiTime(date);
  return `${datePart} เวลา ${timePart}`;
}

/**
 * Formats a date/time to Thai Buddhist Era datetime string with a dot separator (e.g. "25 ส.ค. 2569 • 13:30 น.")
 */
export function formatThaiDateTimeDot(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const datePart = formatThaiDate(date);
  const timePart = formatThaiTime(date);
  return `${datePart} • ${timePart}`;
}

/**
 * Formats a date to Thai time string (e.g. "13:30 น.")
 */
export function formatThaiTime(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok'
  });

  return `${formatter.format(date)} น.`;
}

/**
 * Converts a Gregorian date string YYYY-MM-DD to a Buddhist Era string DD/MM/YYYY for UI display.
 */
export function gregorianToThaiNumeric(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const budYear = parseInt(y, 10) + 543;
  return `${d}/${m}/${budYear}`;
}

/**
 * Converts a Buddhist Era numeric date string DD/MM/YYYY to a Gregorian string YYYY-MM-DD for form state.
 */
export function thaiNumericToGregorian(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  const gregYear = parseInt(y, 10) - 543;
  return `${gregYear}-${m}-${d}`;
}
