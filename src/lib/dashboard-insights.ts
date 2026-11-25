import type { Transaction } from "@/lib/db";
import { isCashflowOut } from "@/lib/finance";

/** At-a-glance facts for the dashboard: the largest single outflow and the
 *  average daily outflow over the elapsed part of the period. Deliberately
 *  no "top category" — the donut above already shows that. */
export type QuickInsights = {
  largest: Transaction | null;
  avgDaily: number;
};

export function computeQuickInsights(
  txs: Transaction[],
  start: string,
  end: string,
  today: string,
): QuickInsights {
  const spendTxs = txs.filter((t) => isCashflowOut(t.type));
  const largest =
    spendTxs.length > 0
      ? spendTxs.reduce(
          (max, t) => (Number(t.amount_ils) > Number(max.amount_ils) ? t : max),
          spendTxs[0],
        )
      : null;

  const outTotal = spendTxs.reduce((s, t) => s + Number(t.amount_ils), 0);
  const daysElapsed = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) -
      Math.max(0, Math.round((new Date(end).getTime() - new Date(today).getTime()) / 86_400_000)),
  );
  return { largest, avgDaily: outTotal / daysElapsed };
}
