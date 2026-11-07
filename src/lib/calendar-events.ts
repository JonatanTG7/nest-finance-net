import { billingDateIn, isScheduledBilling, type SubscriptionSchedule } from "./subscription-schedule";
import { chargeDateFor } from "./credit_cards";

export type CalendarEvent =
  | { kind: "card"; date: string; label: string; amount: number }
  | { kind: "sub"; date: string; label: string; emoji: string; amount: number; currency: string }
  | { kind: "salary"; date: string; label: string };

/** Fixed household paydays: Shiri on the 1st, Yonatan on the 10th. */
export const PAYDAYS = [
  { day: 1, label: "משכורת שירי" },
  { day: 10, label: "משכורת יונתן" },
];

type Card = { id: string; name: string; last_four: string; billing_day: number };
type Sub = SubscriptionSchedule & { name: string; emoji: string; amount: number; currency: string };
type Tx = { occurred_at: string; amount_ils: number | string; credit_card_id?: string | null; type: string };

/** Expected events for a month (year, 0-based month). Card totals sum credit txs charged on that billing date. */
export function monthEvents(year: number, month: number, cards: Card[], subs: Sub[], txs: Tx[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const p of PAYDAYS) out.push({ kind: "salary", date: billingDateIn({ billing_day: p.day }, year, month), label: p.label });
  for (const c of cards) {
    const date = billingDateIn({ billing_day: c.billing_day }, year, month);
    const amount = txs
      .filter((t) => t.credit_card_id === c.id && t.type !== "income" && chargeDateFor(t.occurred_at, c.billing_day) === date)
      .reduce((s, t) => s + Number(t.amount_ils), 0);
    out.push({ kind: "card", date, label: c.last_four ? `${c.name} *${c.last_four}` : c.name, amount });
  }
  for (const s of subs) {
    if (!s.active) continue;
    const date = billingDateIn(s, year, month);
    if (isScheduledBilling(s, date)) out.push({ kind: "sub", date, label: s.name, emoji: s.emoji, amount: s.amount, currency: s.currency });
  }
  return out;
}
