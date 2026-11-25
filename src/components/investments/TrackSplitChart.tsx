import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  balanceInTrack,
  buildSplitSegments,
  trackTypeColor,
  unallocatedPct,
  type TrackAllocationRow,
} from "@/lib/track-splits";
import { formatILS } from "@/lib/finance";
import { maskAmountText } from "@/lib/privacy";

/**
 * Empower-style track-split view for a private account: a donut of the
 * balance split (center = total balance), a segmented stacked bar, and
 * a legend table — one row per track (color chip, name, % of balance,
 * ₪ in track, annual return, deposits % when set). Tracks without a
 * percentage (imported from a statement, which never lists them) show
 * just the name — no % or ₪ cells, since no share can be computed —
 * and fold into the gray "unallocated" remainder.
 */
export function TrackSplitChart({
  allocations,
  balanceIls,
  hidden = false,
  onEdit,
}: {
  allocations: TrackAllocationRow[];
  /** The account's current balance in ₪ (the donut's center). */
  balanceIls: number;
  /** Privacy mode: mask all digits (amounts and percentages). */
  hidden?: boolean;
  /** Opens the track editor. */
  onEdit?: () => void;
}) {
  const segments = useMemo(
    () => buildSplitSegments(allocations, balanceIls),
    [allocations, balanceIls],
  );
  const remainder = useMemo(
    () => unallocatedPct(allocations, "allocation_pct_balance"),
    [allocations],
  );
  // Legend: every track, largest share first, unknown percentages last.
  const legendRows = useMemo(
    () =>
      [...allocations].sort(
        (a, b) => (b.allocation_pct_balance ?? -1) - (a.allocation_pct_balance ?? -1),
      ),
    [allocations],
  );

  if (allocations.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <PieChartIcon className="size-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-semibold mt-3">אין פיצול מסלולים עדיין</p>
        <p className="text-xs text-muted-foreground mt-1">
          אפשר לפצל את החשבון בין כמה מסלולים — למשל 20% מניות ו־80% מחקה מדד S&amp;P 500.
        </p>
        {onEdit && (
          <Button size="sm" className="mt-4" onClick={onEdit}>
            הוסף מסלולים
          </Button>
        )}
      </div>
    );
  }

  // The section header ("פיצול מסלולים" + edit button) lives on the
  // account page, above this card — the chart itself starts with the donut.
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-56 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="pct"
              nameKey="name"
              innerRadius={58}
              outerRadius={90}
              paddingAngle={3}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {segments.map((s) => (
                <Cell key={s.id} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[11px] text-muted-foreground">סך יתרה</p>
          <p className="text-lg font-bold tabular-nums">
            {maskAmountText(formatILS(balanceIls), hidden)}
          </p>
        </div>
      </div>

      {/* Segmented stacked bar — the same split, at a glance. */}
      <div className="flex h-3 w-full overflow-hidden rounded-full mt-2" dir="ltr">
        {segments.map((s) => (
          <div
            key={s.id}
            style={{ width: `${s.pct}%`, background: s.color }}
            title={`${s.name}: ${s.pct}%`}
          />
        ))}
      </div>

      <div className="divide-y mt-3">
        {legendRows.map((a) => {
          const pct = a.allocation_pct_balance;
          const amount = balanceInTrack(balanceIls, pct);
          return (
            <div key={a.id} className="py-2.5 flex items-center gap-2.5 text-sm">
              <span
                className="size-3 rounded-full shrink-0"
                style={{ background: trackTypeColor(a.track_type) }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{a.track_name}</p>
                {a.allocation_pct_deposits != null && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    הפקדות: {maskAmountText(`${a.allocation_pct_deposits}%`, hidden)}
                  </p>
                )}
              </div>
              {a.return_year_pct != null && (
                <span
                  className={`text-xs tabular-nums shrink-0 ${
                    a.return_year_pct >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {maskAmountText(
                    `${a.return_year_pct >= 0 ? "+" : ""}${a.return_year_pct}%`,
                    hidden,
                  )}
                </span>
              )}
              {pct != null && (
                <>
                  <span className="text-xs tabular-nums shrink-0 w-14 text-start">
                    {maskAmountText(`${pct}%`, hidden)}
                  </span>
                  <span className="font-semibold tabular-nums shrink-0 w-24 text-start">
                    {maskAmountText(formatILS(amount), hidden)}
                  </span>
                </>
              )}
            </div>
          );
        })}
        {remainder > 0 && (
          <div className="py-2.5 flex items-center gap-2.5 text-sm">
            <span
              className="size-3 rounded-full shrink-0 border"
              style={{ background: "#e2e8f0" }}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground">לא מוקצה</p>
              <p className="text-[11px] text-muted-foreground">
                אחוזים שעדיין לא הוגדרו — מהדוח, מהאזור האישי או מהמסלקה הפנסיונית
              </p>
            </div>
            <span className="text-xs tabular-nums shrink-0 w-14 text-start">
              {maskAmountText(`${remainder}%`, hidden)}
            </span>
            <span className="font-semibold tabular-nums shrink-0 w-24 text-start">
              {maskAmountText(formatILS(balanceInTrack(balanceIls, remainder)), hidden)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
