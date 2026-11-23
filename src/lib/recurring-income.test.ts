import { describe, expect, it } from "vitest";
import {
  missingOccurrences,
  saveRecurringIncome,
  monthStatus,
  type RecurringIncome,
} from "./recurring-income";

const allowance: RecurringIncome = {
  id: "r1",
  name: "קצבת ילדים",
  emoji: "👶",
  category_id: null,
  amount: 115,
  currency: "ILS",
  billing_day: 20,
  entered_by: "shared",
  start_date: "2026-10-20",
  end_date: null,
  payment_count: null,
  active: true,
};

describe("missingOccurrences", () => {
  it("plans every due date that has no transaction yet", () => {
    expect(missingOccurrences([allowance], [], "2026-12-20")).toEqual([
      { item: allowance, date: "2026-10-20" },
      { item: allowance, date: "2026-11-20" },
      { item: allowance, date: "2026-12-20" },
    ]);
  });
  it("never plans future dates", () => {
    expect(missingOccurrences([allowance], [], "2026-11-19")).toEqual([
      { item: allowance, date: "2026-10-20" },
    ]);
  });
  it("skips dates already recorded (dedup)", () => {
    const existing = [{ recurring_income_id: "r1", occurred_at: "2026-11-20" }];
    expect(missingOccurrences([allowance], existing, "2026-12-20")).toEqual([
      { item: allowance, date: "2026-10-20" },
      { item: allowance, date: "2026-12-20" },
    ]);
  });
  it("skips paused items", () => {
    expect(missingOccurrences([{ ...allowance, active: false }], [], "2026-12-20")).toEqual([]);
  });
  it("respects a finite occurrence limit", () => {
    const limited = { ...allowance, payment_count: 2 };
    expect(missingOccurrences([limited], [], "2027-06-20")).toEqual([
      { item: limited, date: "2026-10-20" },
      { item: limited, date: "2026-11-20" },
    ]);
  });
  it("dedups per item, not per date", () => {
    const other: RecurringIncome = { ...allowance, id: "r2", name: "שכר דירה נכנס" };
    const existing = [{ recurring_income_id: "r1", occurred_at: "2026-10-20" }];
    expect(missingOccurrences([allowance, other], existing, "2026-10-20")).toEqual([
      { item: other, date: "2026-10-20" },
    ]);
  });
});

describe("monthStatus for income", () => {
  it("marks the month's occurrence received once its date passed", () => {
    const st = monthStatus(allowance, new Date(2026, 10, 21));
    expect(st.date).toBe("2026-11-20");
    expect(st.inRange).toBe(true);
    expect(st.charged).toBe(true);
  });
  it("counts days until the next occurrence", () => {
    const st = monthStatus(allowance, new Date(2026, 10, 15));
    expect(st.charged).toBe(false);
    expect(st.daysLeft).toBe(5);
  });
});

describe("saveRecurringIncome validation", () => {
  const input = { ...allowance, id: undefined } as unknown as Parameters<
    typeof saveRecurringIncome
  >[0];
  it("rejects a non-positive payment count", async () => {
    await expect(saveRecurringIncome({ ...input, payment_count: 0 })).rejects.toThrow(
      "מספר התשלומים",
    );
    await expect(saveRecurringIncome({ ...input, payment_count: 1.5 })).rejects.toThrow(
      "מספר התשלומים",
    );
  });
  it("rejects an end date before the start date", async () => {
    await expect(
      saveRecurringIncome({ ...input, start_date: "2026-11-01", end_date: "2026-10-01" }),
    ).rejects.toThrow("תאריך הסיום");
  });
});
