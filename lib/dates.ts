/**
 * The business's calendar is Pakistan's (Asia/Karachi, UTC+5, no DST). "Today" for every
 * business date — defaults, "not in the future" validation, days-outstanding/ageing — is the
 * Pakistan calendar date, never the UTC date (ADR-0009). Safe on server and client: pure Intl,
 * no server-only imports.
 */
export const BUSINESS_TIME_ZONE = "Asia/Karachi";

/** Today's date in Pakistan as YYYY-MM-DD. */
export function todayInPakistan(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(new Date());
}

/** True when a YYYY-MM-DD (or ISO string starting with one) business date is not after
 * Pakistan's today. Compares calendar-date strings, so no timezone arithmetic is involved. */
export function isNotAfterTodayInPakistan(value: string): boolean {
  return value.slice(0, 10) <= todayInPakistan();
}
