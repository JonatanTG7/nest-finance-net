import { History } from "lucide-react";
import { formatILS } from "@/lib/finance";
import { useMemberLabels } from "@/lib/person";
import { cn } from "@/lib/utils";
import type { BalanceHistoryRow } from "@/lib/balance_history";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAmount(n: number, currency: string) {
  if (currency === "ILS") return formatILS(n);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

export function BalanceHistoryList({ rows }: { rows: BalanceHistoryRow[] }) {
  const labels = useMemberLabels();

  return (
    <section className="px-5 md:px-0 mt-6 mb-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <History className="size-4" />
        היסטוריית שינויים
      </h2>
      <div className="rounded-2xl border bg-card divide-y">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            אין שינויים מתועדים עדיין.
          </p>
        ) : (
          rows.map((r) => {
            const diff = r.new_amount - r.old_amount;
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {r.changed_by ? labels[r.changed_by] : "לא ידוע"}
                    {r.kind !== "balance" && (
                      <span className="text-xs text-muted-foreground"> · {r.kind}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5" dir="ltr">
                    {fmtAmount(r.old_amount, r.currency)} → {fmtAmount(r.new_amount, r.currency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(r.created_at)}</p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums shrink-0",
                    diff >= 0 ? "text-emerald-500" : "text-rose-400",
                  )}
                  dir="ltr"
                >
                  {diff >= 0 ? "+" : "-"}
                  {fmtAmount(Math.abs(diff), r.currency)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
