import { describe, expect, it } from "vitest";
import { monthEvents, pendingFixedCharges } from "./calendar-events";

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
    const sub = {
      id: "s1",
      name: "ביטוח",
      emoji: "🚗",
      amount: 400,
      currency: "ILS",
      billing_day: 19,
      start_date: "2026-10-19",
      end_date: null,
      payment_count: 2,
      active: true,
    };
    expect(monthEvents(2026, 10, [], [sub], []).some((e) => e.kind === "sub")).toBe(true);
    expect(monthEvents(2026, 11, [], [sub], []).some((e) => e.kind === "sub")).toBe(false);
  });
});

describe("pendingFixedCharges", () => {
  const sub = {
    id: "s1",
    name: "ביטוח",
    emoji: "🚗",
    amount: 400,
    currency: "ILS",
    billing_day: 19,
    start_date: "2026-10-19",
    end_date: null,
    payment_count: null,
    active: true,
  };
  it("reports a charge with no matching transaction as pending", () => {
    const ev = monthEvents(2026, 10, [], [sub], []);
    expect(pendingFixedCharges(ev, [])).toEqual([
      { date: "2026-11-19", label: "ביטוח", emoji: "🚗", amount: 400, currency: "ILS" },
    ]);
  });
  it("does not double-count a charge already recorded as a transaction", () => {
    const ev = monthEvents(2026, 10, [], [sub], []);
    const txs = [
      { occurred_at: "2026-11-19", amount_ils: 400, type: "fixed", subscription_id: "s1" },
    ];
    expect(pendingFixedCharges(ev, txs)).toEqual([]);
  });
  it("still pending when the transaction is for another subscription or another date", () => {
    const ev = monthEvents(2026, 10, [], [sub], []);
    const otherSub = [
      { occurred_at: "2026-11-19", amount_ils: 400, type: "fixed", subscription_id: "s2" },
    ];
    const otherDate = [
      { occurred_at: "2026-11-18", amount_ils: 400, type: "fixed", subscription_id: "s1" },
    ];
    expect(pendingFixedCharges(ev, otherSub)).toHaveLength(1);
    expect(pendingFixedCharges(ev, otherDate)).toHaveLength(1);
  });
  it("never treats card or salary events as pending", () => {
    const card = { id: "c", name: "ויזה", last_four: "1234", billing_day: 10 };
    const ev = monthEvents(2026, 10, [card], [], []);
    expect(pendingFixedCharges(ev, [])).toEqual([]);
  });
});
