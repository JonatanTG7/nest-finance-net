import { History } from "lucide-react";
import {
  PRIVATE_FIELD_LABELS,
  kindLabel,
  type PrivateAccountField,
  type PrivateAccountHistoryRow,
} from "@/lib/private-accounts";
import { useMemberLabels } from "@/lib/person";
import { maskAmountText } from "@/lib/privacy";

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

const FEE_FIELDS: PrivateAccountField[] = ["fee_from_balance", "fee_from_deposits"];

/**
 * History of metadata changes for a private account (company, fees,
 * track...) — so past values can be looked up later. Each row shows one
 * changed field, old → new, who changed it and when.
 */
export function PrivateAccountHistoryList({
  rows,
  hidden = false,
}: {
  rows: PrivateAccountHistoryRow[];
  /** Privacy mode: mask the digits in values (fees are percentages). */
  hidden?: boolean;
}) {
  const labels = useMemberLabels();

  const displayValue = (field: string, value: string | null): string => {
    if (value == null) return "—";
    // Owner values are raw owner ids ("shared", a slot, or
    // "person:<id>") — the labels map covers all of them.
    if (field === "owner") return labels[value] ?? value;
    if (field === "kind") return kindLabel(value);
    if (FEE_FIELDS.includes(field as PrivateAccountField)) return `${value}%`;
    return value;
  };

  return (
    <section className="px-5 md:px-0 mt-6 mb-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <History className="size-4" />
        היסטוריית פרטי החשבון
      </h2>
      <div className="rounded-2xl border bg-card divide-y">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            אין שינויים מתועדים עדיין.
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {PRIVATE_FIELD_LABELS[r.field as PrivateAccountField] ?? r.field}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                  {maskAmountText(displayValue(r.field, r.old_value), hidden)} →{" "}
                  {maskAmountText(displayValue(r.field, r.new_value), hidden)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r.changed_by ? labels[r.changed_by] : "לא ידוע"} · {fmtDate(r.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
