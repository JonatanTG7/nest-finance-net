import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CreditCard, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatILS } from "@/lib/finance";
import {
  CREDIT_PM_KEY,
  cardLabel,
  chargeDateFor,
  formatChargeDate,
  todayISO,
  useCreditCards,
} from "@/lib/credit_cards";

type Row = { amount_ils: number; occurred_at: string; credit_card_id: string | null };

/** All card-linked transactions from the last 3 months forward — enough to cover any pending cycle. */
async function fetchCardTransactions(): Promise<Row[]> {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("transactions")
    .select("amount_ils, occurred_at, credit_card_id")
    .not("credit_card_id", "is", null)
    .gte("occurred_at", from);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export function UpcomingCharges() {
  const { data: cards = [] } = useCreditCards();
  const { data: rows = [] } = useQuery({
    queryKey: ["upcoming_charges"],
    queryFn: fetchCardTransactions,
  });

  const groups = useMemo(() => {
    const today = todayISO();
    return cards
      .map((card) => {
        const byDate = new Map<string, { total: number; count: number }>();
        for (const r of rows) {
          if (r.credit_card_id !== card.id) continue;
          const charge = chargeDateFor(r.occurred_at, card.billing_day);
          // Past cycles were already deducted — leave them untouched.
          if (charge < today) continue;
          const prev = byDate.get(charge) ?? { total: 0, count: 0 };
          prev.total += Number(r.amount_ils);
          prev.count += 1;
          byDate.set(charge, prev);
        }
        const dates = Array.from(byDate.keys()).sort();
        const nextDate = dates[0] ?? null;
        const next = nextDate ? byDate.get(nextDate)! : { total: 0, count: 0 };
        const laterTotal = dates
          .slice(1)
          .reduce((s, d) => s + (byDate.get(d)?.total ?? 0), 0);
        return {
          card,
          nextDate,
          nextTotal: next.total,
          nextCount: next.count,
          laterTotal,
        };
      })
      .sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
  }, [cards, rows]);

  if (groups.length === 0) return null;

  const total = groups.reduce((s, g) => s + g.nextTotal, 0);

  return (
    <section className="px-5 md:px-0 mt-4">
      <div className="rounded-2xl bg-card border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="size-4" />
            חיובים קרובים
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">{formatILS(total)}</span>
        </div>
        <ul className="divide-y -my-1">
          {groups.map(({ card, nextDate, nextTotal, nextCount, laterTotal }) => (
            <li key={card.id}>
              <Link
                to="/transactions"
                search={{ method: CREDIT_PM_KEY, card: card.id, range: "3m" }}
                className="flex items-center gap-3 py-2.5 hover:bg-accent/40 rounded-lg px-1 -mx-1"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cardLabel(card)}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextDate
                      ? `חיוב ב-${formatChargeDate(nextDate)} · ${nextCount} תנועות`
                      : "אין חיובים ממתינים"}
                    {laterTotal > 0 ? ` · עוד ${formatILS(laterTotal)} בהמשך` : ""}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0">{formatILS(nextTotal)}</p>
                <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
