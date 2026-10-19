import { describe, expect, it } from "vitest";
import { dueDates, monthStatus } from "./subscription-schedule";

const insurance = { billing_day: 19, start_date: "2026-10-19", end_date: null, payment_count: 5, active: true };

describe("subscription installments", () => {
  it("bills car insurance exactly five times without an end date", () => {
    expect(dueDates(insurance, "2028-12-31")).toEqual(["2026-10-19", "2026-11-19", "2026-12-19", "2027-01-19", "2027-02-19"]);
  });
  it("never generates future payments", () => {
    expect(dueDates(insurance, "2026-11-18")).toEqual(["2026-10-19"]);
  });
  it("counts from the first billing date on or after the start", () => {
    expect(dueDates({ ...insurance, start_date: "2026-10-20", payment_count: 2 }, "2027-03-01")).toEqual(["2026-11-19", "2026-12-19"]);
  });
  it("handles month-end and leap-year billing", () => {
    expect(dueDates({ ...insurance, billing_day: 31, start_date: "2028-01-31", payment_count: 3 }, "2028-05-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
  it("excludes completed installments from later monthly totals", () => {
    expect(monthStatus(insurance, new Date(2027, 2, 19)).inRange).toBe(false);
    expect(monthStatus(insurance, new Date(2027, 2, 19)).completed).toBe(true);
    expect(monthStatus(insurance, new Date(2027, 1, 18)).inRange).toBe(true);
  });
  it("preserves unlimited subscriptions and optional end dates", () => {
    expect(dueDates({ ...insurance, payment_count: null }, "2027-04-19")).toHaveLength(7);
    expect(dueDates({ ...insurance, end_date: "2026-11-19" }, "2027-04-19")).toEqual(["2026-10-19", "2026-11-19"]);
  });
  it("does not bill paused subscriptions", () => {
    expect(dueDates({ ...insurance, active: false }, "2027-04-19")).toEqual([]);
  });
});