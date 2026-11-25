import type { Transaction } from "@/lib/db";

/** One day's aggregated transactions in the month calendar. */
export type CalendarDayData = { out: number; inc: number; list: Transaction[] };

export type CalendarStats = {
  noSpend: number;
  avg: number;
  /** The heaviest outflow day so far, or null when no day has outflow yet —
   *  the "היום הכבד" KPI is hidden in that case instead of showing "—". */
  heavy: { day: string; out: number } | null;
};

/** KPI stats for the month calendar: spend-free days, average daily outflow
 *  and the heaviest day — counting only days up to (and including) today. */
export function computeCalendarStats(
  cells: (string | null)[],
  byDay: Map<string, CalendarDayData>,
  today: string,
): CalendarStats {
  let noSpend = 0;
  let total = 0;
  let elapsed = 0;
  let heavy: { day: string; out: number } | null = null;
  for (const c of cells) {
    if (!c || c > today) continue;
    elapsed++;
    const out = byDay.get(c)?.out ?? 0;
    total += out;
    if (out === 0) noSpend++;
    if (out > 0 && (!heavy || out > heavy.out)) heavy = { day: c, out };
  }
  return { noSpend, avg: elapsed ? total / elapsed : 0, heavy };
}
