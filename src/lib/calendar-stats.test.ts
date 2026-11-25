import { describe, expect, it } from "vitest";
import { computeCalendarStats, type CalendarDayData } from "./calendar-stats";
import type { Transaction } from "./db";

function day(out: number, inc = 0): CalendarDayData {
  return { out, inc, list: [] as Transaction[] };
}

describe("month calendar stats", () => {
  it("reports no heaviest day when no day has outflow yet", () => {
    const cells = ["2026-11-01", "2026-11-02", "2026-11-03", null];
    const byDay = new Map<string, CalendarDayData>([
      ["2026-11-01", day(0)],
      ["2026-11-02", day(0)],
    ]);
    const r = computeCalendarStats(cells, byDay, "2026-11-03");
    expect(r.heavy).toBeNull();
    expect(r.noSpend).toBe(3);
    expect(r.avg).toBe(0);
  });

  it("picks the day with the largest outflow as the heaviest day", () => {
    const cells = ["2026-11-01", "2026-11-02", "2026-11-03"];
    const byDay = new Map<string, CalendarDayData>([
      ["2026-11-01", day(120)],
      ["2026-11-02", day(450)],
      ["2026-11-03", day(80)],
    ]);
    const r = computeCalendarStats(cells, byDay, "2026-11-03");
    expect(r.heavy).toEqual({ day: "2026-11-02", out: 450 });
    expect(r.noSpend).toBe(0);
    expect(r.avg).toBeCloseTo(650 / 3);
  });

  it("ignores future days when counting elapsed days and the heaviest day", () => {
    const cells = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
    const byDay = new Map<string, CalendarDayData>([
      ["2026-11-01", day(100)],
      ["2026-11-04", day(9999)],
    ]);
    const r = computeCalendarStats(cells, byDay, "2026-11-03");
    expect(r.heavy).toEqual({ day: "2026-11-01", out: 100 });
    expect(r.avg).toBeCloseTo(100 / 3);
  });
});
