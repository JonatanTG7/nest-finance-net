import {
  billingDateIn,
  isScheduledBilling,
  type SubscriptionSchedule,
} from "./subscription-schedule";

export type CalendarEvent =
  | { kind: "card"; date: string; label: string; amount: number }
  | {
      kind: "sub";
      date: string;
      label: string;
      emoji: string;
      amount: number;
      currency: string;
      subscriptionId: string;
      /** Display name of the subscription's category, null when it has none. */
      category?: string | null;
    }
  | { kind: "salary"; date: string; label: string };

/** Fixed household paydays: Shiri on the 1st, Yonatan on the 10th. */
export const PAYDAYS = [
  { day: 1, label: "משכורת שירי" },
  { day: 10, label: "משכורת יונתן" },
];

type Card = { id: string; name: string; last_four: string; billing_day: number };
type Sub = SubscriptionSchedule & {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  currency: string;
  category_id?: string | null;
};
type Tx = {
  occurred_at: string;
  amount_ils: number | string;
  credit_card_id?: string | null;
  type: string;
  subscription_id?: string | null;
};

export type CategoryRef = { id: string; name: string };

/** Expected events for a month (year, 0-based month). Card totals sum credit txs charged on that billing date. A subscription event carries its category's display name when the subscription has one (resolved from `categories`); otherwise the category is null — never guessed. */
export function monthEvents(
  year: number,
  month: number,
  cards: Card[],
  subs: Sub[],
  txs: Tx[],
  categories: CategoryRef[] = [],
): CalendarEvent[] {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
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
    if (isScheduledBilling(s, date))
      out.push({
        kind: "sub",
        date,
        label: s.name,
        emoji: s.emoji,
        amount: s.amount,
        currency: s.currency,
        subscriptionId: s.id,
        category: s.category_id ? (categoryName.get(s.category_id) ?? null) : null,
      });
  }
  return out;
}

export type PendingFixedCharge = {
  date: string;
  label: string;
  emoji: string;
  amount: number;
  currency: string;
  /** Display name of the subscription's category, null when it has none. */
  category?: string | null;
};

/**
 * Fixed charges expected this month that have NOT been recorded as a
 * transaction yet (future billing dates, or dates the sync hasn't run for).
 * A charge counts as recorded only when a transaction carries the same
 * subscription_id on the same billing date — matching on name or amount
 * would double-count a charge that was already generated.
 * Card charges and salaries are never pending here: card amounts are sums
 * of transactions already counted on their purchase dates, and salaries
 * carry no amount.
 */
export function pendingFixedCharges(events: CalendarEvent[], txs: Tx[]): PendingFixedCharge[] {
  const recorded = new Set(
    txs.filter((t) => t.subscription_id).map((t) => `${t.subscription_id}|${t.occurred_at}`),
  );
  return events
    .filter((e): e is Extract<CalendarEvent, { kind: "sub" }> => e.kind === "sub")
    .filter((e) => !recorded.has(`${e.subscriptionId}|${e.date}`))
    .map((e) => ({
      date: e.date,
      label: e.label,
      emoji: e.emoji,
      amount: e.amount,
      currency: e.currency,
      category: e.category ?? null,
    }));
}

function chargeDateFor(iso: string, billingDay: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const day = Math.max(1, Math.min(31, billingDay));
  return d > day ? billingDateIn({ billing_day: day }, y, m + 1) : billingDateIn({ billing_day: day }, y, m);
}
