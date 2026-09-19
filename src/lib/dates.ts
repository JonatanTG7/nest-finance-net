/**
 * Timezone-safe date helpers.
 *
 * `new Date().toISOString().slice(0, 10)` is a common but WRONG way to get
 * "today" as YYYY-MM-DD: toISOString() converts to UTC first. Israel is
 * UTC+2/+3 (ahead of UTC), so for the first 2-3 hours of every day, that
 * pattern silently returns YESTERDAY's date. The same bug applies to any
 * month/day boundary built from a local Date and then formatted via
 * toISOString() — which is exactly what caused transactions entered on the
 * last day of a month to appear under the next month.
 *
 * Always use these helpers (or the equivalent local y/m/d formatting)
 * instead of toISOString() for calendar-date strings.
 */

/** Formats a Date's LOCAL calendar date as "YYYY-MM-DD" — no UTC conversion. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's date, in local time, as "YYYY-MM-DD". */
export function todayISO(): string {
  return isoLocal(new Date());
}
