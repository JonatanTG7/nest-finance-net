import { describe, expect, it } from "vitest";
import { monthEvents } from "./calendar-events";

describe("monthEvents", () => {
  it("marks Shiri's payday on the 1st and Yonatan's on the 10th", () => {
    const ev = monthEvents(2026, 10, [], [], []).filter((e) => e.kind === "salary");
    expect(ev.map((e) => e.date)).toEqual(["2026-11-01", "2026-11-10"]);
  });
  it("sums card charges due on the billing date", () => {
    const card = { id: "c", name: "ויזה", last_four: "1234", billing_day: 10 };
    const txs = [
      { occurred_at: "2026-10-20", amount_ils: 100, credit_card_id: "c", type: "expense" },
      { occurred_at: "2026-11-05", amount_ils: 50, credit_card_id: "c", type: "expense" },
      { occurred_at: "2026-11-15", amount_ils: 70, credit_card_id: "c", type: "expense" },
    ];
    const ev = monthEvents(2026, 10, [card], [], txs).find((e) => e.kind === "card");
    expect(ev).toMatchObject({ date: "2026-11-10", amount: 150 });
  });
  it("skips subscriptions past their payment count", () => {
    const sub = { name: "ביטוח", emoji: "🚗", amount: 400, currency: "ILS", billing_day: 19, start_date: "2026-10-19", end_date: null, payment_count: 2, active: true };
    expect(monthEvents(2026, 10, [], [sub], []).some((e) => e.kind === "sub")).toBe(true);
    expect(monthEvents(2026, 11, [], [sub], []).some((e) => e.kind === "sub")).toBe(false);
  });
});
