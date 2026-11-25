import { Link } from "@tanstack/react-router";
import { Landmark, Pencil, PiggyBank, TriangleAlert, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feesAboveAverage, kindColor, kindLabel } from "@/lib/private-accounts";
import { buildSplitSegments, type TrackAllocationRow } from "@/lib/track-splits";
import { IB_KIND } from "@/lib/ib";
import type { InvestmentAccount } from "@/lib/db";
import { formatILS, formatMoney } from "@/lib/finance";
import { maskAmountText } from "@/lib/privacy";

const KIND_ICONS: Record<string, typeof Landmark> = {
  pension: Landmark,
  provident: PiggyBank,
  savings: Wallet,
  investment: TrendingUp,
  interactive: TrendingUp,
};

/**
 * A private account's collapsed card on the person page (Empower-style):
 * type icon + Hebrew label, managing company, balance in large numerals,
 * a one-line fee summary, and a slim segmented bar showing the track
 * split. When the account's fees are above the fund's average, the
 * statement's red fee balloon appears. IB portfolios link straight to
 * the IB screen and have no edit pencil — IB metadata is not editable
 * (ownership moves from the IB screen).
 */
export function PrivateAccountCard({
  account,
  total,
  allocations,
  hidden = false,
  onEdit,
  linkDisabled = false,
  footer,
}: {
  account: InvestmentAccount;
  /** ils is null when the FX rate is unavailable (USD account). */
  total: { native: number; ils: number | null };
  allocations: TrackAllocationRow[];
  /** Privacy mode: mask all digits. */
  hidden?: boolean;
  onEdit: () => void;
  /**
   * Reorder mode: no navigation and no edit pencil — tapping must not
   * open anything while the user is rearranging.
   */
  linkDisabled?: boolean;
  /** Extra content below the card body (e.g. reorder controls). */
  footer?: React.ReactNode;
}) {
  // The account's own picked color (kind default when never picked).
  const color = account.color ?? kindColor(account.kind);
  const Icon = KIND_ICONS[account.kind] ?? Wallet;
  const segments = buildSplitSegments(allocations, total.ils ?? 0);
  const feeAlert = feesAboveAverage(account);
  const isIb = account.kind === IB_KIND;
  const body = (
    <CardBody
      account={account}
      total={total}
      segments={segments}
      hasAllocations={allocations.length > 0}
      feeAlert={feeAlert}
      hidden={hidden}
    />
  );

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className="size-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}1f`, color }}
        >
          <Icon className="size-5" />
        </span>
        <p className="text-sm font-semibold truncate flex-1">{account.name}</p>
        <span
          className="text-xs px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${color}22`, color }}
        >
          {kindLabel(account.kind)}
        </span>
        {!isIb && !linkDisabled && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onEdit}
            aria-label={`ערוך את ${account.name}`}
            title="ערוך"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      {linkDisabled ? (
        body
      ) : isIb ? (
        <Link
          to="/investments/ib"
          search={{ account: account.id }}
          className="block active:scale-[0.99] transition-transform"
        >
          {body}
        </Link>
      ) : (
        <Link
          to="/investments/$accountId"
          params={{ accountId: account.id }}
          className="block active:scale-[0.99] transition-transform"
        >
          {body}
        </Link>
      )}
      {footer}
    </div>
  );
}

/** Balance + split bar + details — identical for both link targets. */
function CardBody({
  account,
  total,
  segments,
  hasAllocations,
  feeAlert,
  hidden,
}: {
  account: InvestmentAccount;
  total: { native: number; ils: number | null };
  segments: ReturnType<typeof buildSplitSegments>;
  hasAllocations: boolean;
  feeAlert: boolean;
  hidden: boolean;
}) {
  return (
    <>
      <p
        className="text-2xl font-bold mt-2 tabular-nums"
        dir={account.currency !== "ILS" ? "ltr" : undefined}
      >
        {maskAmountText(formatMoney(total.native, account.currency), hidden)}
      </p>
      {account.currency !== "ILS" && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {total.ils != null ? (
            <>≈ {maskAmountText(formatILS(total.ils), hidden)}</>
          ) : (
            "שער דולר לא זמין"
          )}
        </p>
      )}
      {segments.length > 0 && (
        <div className="flex h-2 w-full overflow-hidden rounded-full mt-3" dir="ltr">
          {segments.map((s) => (
            <div
              key={s.id}
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.name}: ${s.pct}%`}
            />
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
        {account.company && (
          <p>
            חברה: <span className="text-foreground">{account.company}</span>
          </p>
        )}
        {!hasAllocations && account.track && (
          <p>
            מסלול: <span className="text-foreground">{account.track}</span>
          </p>
        )}
        {(account.fee_from_balance != null || account.fee_from_deposits != null) && (
          <p className="tabular-nums">
            דמי ניהול:{" "}
            <span className="text-foreground">
              {account.fee_from_balance != null
                ? `מצבירה ${maskAmountText(`${account.fee_from_balance}%`, hidden)}`
                : "—"}
              {" · "}
              {account.fee_from_deposits != null
                ? `מהפקדות ${maskAmountText(`${account.fee_from_deposits}%`, hidden)}`
                : "—"}
            </span>
          </p>
        )}
        {feeAlert && (
          <p className="flex items-center gap-1 text-red-600 font-medium pt-0.5">
            <TriangleAlert className="size-3.5 shrink-0" />
            שים לב: דמי הניהול גבוהים מהממוצע בקרן
          </p>
        )}
      </div>
    </>
  );
}
