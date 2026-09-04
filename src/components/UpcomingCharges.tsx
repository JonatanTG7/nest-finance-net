import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatILS } from "@/lib/finance";
import {
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
        const byDate = new Map<string, number>();
        for (const r of rows) {
          if (r.credit_card_id !== card.id) continue;
          const charge = chargeDateFor(r.occurred_at, card.billing_day);
          // Past cycles were already deducted — leave them untouched.
          if (charge < today) continue;
          byDate.set(charge, (byDate.get(charge) ?? 0) + Number(r.amount_ils));
        }
        const dates = Array.from(byDate.keys()).sort();
        if (dates.length === 0) return null;
        const nextDate = dates[0];
        const nextTotal = byDate.get(nextDate) ?? 0;
        const laterTotal = dates.slice(1).reduce((s, d) => s + (byDate.get(d) ?? 0), 0);
        return { card, nextDate, nextTotal, laterTotal };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
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
          {groups.map(({ card, nextDate, nextTotal, laterTotal }) => (
            <li key={card.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cardLabel(card)}</p>
                <p className="text-xs text-muted-foreground">
                  חיוב ב-{formatChargeDate(nextDate)}
                  {laterTotal > 0 ? ` · עוד ${formatILS(laterTotal)} בהמשך` : ""}
                </p>
              </div>
              <p className="text-sm font-bold tabular-nums shrink-0">{formatILS(nextTotal)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
