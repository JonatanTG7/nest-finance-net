import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileUp,
  Pencil,
  PieChart as PieChartIcon,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BalanceDialog } from "@/components/investments/BalanceDialog";
import { BalanceHistoryList } from "@/components/investments/BalanceHistoryList";
import { PrivateAccountDialog } from "@/components/investments/PrivateAccountDialog";
import { PrivateAccountHistoryList } from "@/components/investments/PrivateAccountHistoryList";
import { StatementImportDialog } from "@/components/investments/StatementImportDialog";
import { TrackSplitChart } from "@/components/investments/TrackSplitChart";
import { TrackSplitEditor } from "@/components/investments/TrackSplitEditor";
import { TradeJournalSection } from "@/components/investments/TradeJournalSection";
import { fetchInvestmentAccounts } from "@/lib/db";
import { fetchBalanceHistory, setAccountBalanceIls } from "@/lib/balance_history";
import {
  dataSourceLabel,
  feesAboveAverage,
  fetchPrivateAccountHistory,
  isSharedAccount,
  kindLabel,
} from "@/lib/private-accounts";
import { fetchTrackAllocations } from "@/lib/track-splits";
import { useMemberLabels, type Person } from "@/lib/person";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchUsdIlsRate, useUsdIlsRate } from "@/lib/fx";
import { fetchTradeJournalEntries, journalPnlUsdAfterReset } from "@/lib/trade-journal";
import { IB_KIND } from "@/lib/ib";
import { maskAmountText, usePrivacyMode } from "@/lib/privacy";

export const Route = createFileRoute("/investments/$accountId")({
  head: () => ({ meta: [{ title: "חשבון השקעה" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { accountId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingSplit, setEditingSplit] = useState(false);
  const [importingStatement, setImportingStatement] = useState(false);
  const { hidden, toggle: togglePrivacy } = usePrivacyMode();
  const labels = useMemberLabels();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );
  const isPrivate = !!account && !isSharedAccount(account);
  // The metadata section shows for private accounts (always — even
  // before any details were entered) and for shared accounts that
  // already have metadata. Shared accounts without metadata stay
  // exactly as they were.
  const hasMetadata =
    !!account &&
    (account.company != null ||
      account.track != null ||
      account.fee_from_balance != null ||
      account.fee_from_deposits != null);
  const showMetadata = !!account && account.kind !== IB_KIND && (isPrivate || hasMetadata);

  const { data: history = [] } = useQuery({
    queryKey: ["balance_history", accountId],
    queryFn: () => fetchBalanceHistory(accountId),
  });
  const { data: metadataHistory = [] } = useQuery({
    queryKey: ["private-account-history", accountId],
    queryFn: () => fetchPrivateAccountHistory(accountId),
    enabled: showMetadata,
  });
  const { data: allocations = [] } = useQuery({
    queryKey: ["track-allocations", accountId],
    queryFn: () => fetchTrackAllocations(accountId),
    enabled: showMetadata,
  });
  const { data: fxRate } = useQuery({
    queryKey: ["fx", "usdils"],
    queryFn: fetchUsdIlsRate,
    staleTime: 60 * 60 * 1000,
  });
  // Same query key as the journal section below, so the fetch is shared.
  // IB accounts never have a journal — their value comes from positions.
  const isIbAccount = account?.kind === IB_KIND;
  const { data: journalEntries = [] } = useQuery({
    queryKey: ["trade-journal", accountId],
    queryFn: () => fetchTradeJournalEntries(accountId),
    enabled: !!account && !isIbAccount,
  });
  // Display conversion uses the last-known-good fallback; the save
  // mutation above keeps the fresh rate (or fetches one itself).
  const { rate: displayFxRate } = useUsdIlsRate();

  // Journal P&L counts toward the displayed balance: trades logged after
  // the last manual balance reset add their P&L on top of the baseline
  // (a reset absorbs earlier trades). P&L is in USD — a USD account
  // takes it as-is; an ILS account converts at the USD→ILS rate. When
  // no rate is available the ILS part is left out rather than guessed.
  const journalPnlUsd = isIbAccount
    ? 0
    : journalPnlUsdAfterReset(journalEntries, account?.balance_reset_at ?? null);
  const pnlIls = displayFxRate != null ? journalPnlUsd * displayFxRate : 0;
  const baseIls = Number(account?.starting_balance_ils ?? account?.starting_balance ?? 0);
  const baseNative = Number(account?.starting_balance ?? 0);
  const currentIls = baseIls + pnlIls;
  const currentNative = baseNative + (account?.currency === "USD" ? journalPnlUsd : pnlIls);

  const save = useMutation({
    mutationFn: (newIls: number) =>
      setAccountBalanceIls({
        accountId,
        currency: account?.currency ?? "ILS",
        oldIls: currentIls,
        newIls,
        fxRate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      qc.invalidateQueries({ queryKey: ["investments", "txs"] });
      qc.invalidateQueries({ queryKey: ["balance_history", accountId] });
      toast.success("הסכום עודכן");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה בעדכון הסכום");
    },
  });

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {account?.name ?? (isLoading ? "טוען…" : "חשבון לא נמצא")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {account && isPrivate
              ? `${kindLabel(account.kind)} · ${labels[(account.person ?? "shared") as Person]} · ${account.currency}`
              : `חשבון השקעה / חיסכון · ${account?.currency ?? "ILS"}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={togglePrivacy}
          aria-label={hidden ? "הצג סכומים" : "הסתר סכומים"}
          title={hidden ? "הצג סכומים" : "הסתר סכומים"}
        >
          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </header>

      {account?.kind === IB_KIND ? (
        <section className="px-5 md:px-0">
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <p className="mb-3">חשבון Interactive Brokers מנוהל בעמוד תיק ההשקעות.</p>
            <Link to="/investments/ib" search={{ account: accountId }}>
              <Button size="sm">פתח את תיק ה-IB</Button>
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="px-5 md:px-0">
            <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ background: account?.color ?? "#eab308" }}
                />
                <p className="text-sm opacity-80">סכום נוכחי</p>
              </div>
              <p className="text-4xl font-bold mt-2 tabular-nums">
                {maskAmountText(formatILS(currentIls), hidden)}
              </p>
              {account && account.currency !== "ILS" && (
                <p className="text-sm opacity-70 mt-1 tabular-nums" dir="ltr">
                  ≈ {maskAmountText(formatMoney(currentNative, account.currency), hidden)}
                </p>
              )}
              <div className="mt-5">
                <Button size="sm" onClick={() => setOpen(true)} disabled={!account}>
                  <Pencil className="size-4 me-1" />
                  עדכון סכום
                </Button>
              </div>
            </div>
          </section>

          <BalanceDialog
            open={open}
            onOpenChange={setOpen}
            accountName={account?.name ?? ""}
            currentIls={currentIls}
            onSave={async (n) => {
              await save.mutateAsync(n);
            }}
          />

          {showMetadata && account && (
            <section className="px-5 md:px-0 mt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <PieChartIcon className="size-5" />
                  פיצול מסלולים
                </h2>
                {allocations.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setEditingSplit(true)}>
                    <Pencil className="size-4" />
                    ערוך פיצול
                  </Button>
                )}
              </div>
              <TrackSplitChart
                allocations={allocations}
                balanceIls={currentIls}
                hidden={hidden}
                onEdit={() => setEditingSplit(true)}
              />
            </section>
          )}

          {showMetadata && account && (
            <section className="px-5 md:px-0 mt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold">פרטי החשבון</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setImportingStatement(true)}>
                    <FileUp className="size-4" />
                    ייבוא מדוח
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingDetails(true)}>
                    <Pencil className="size-4" />
                    ערוך פרטים
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-card divide-y text-sm">
                <DetailRow label="סוג חשבון" value={kindLabel(account.kind)} />
                <DetailRow label="חברה מנהלת" value={account.company} />
                <DetailRow
                  label="דמי ניהול מצבירה"
                  value={
                    account.fee_from_balance != null
                      ? maskAmountText(`${account.fee_from_balance}%`, hidden)
                      : null
                  }
                />
                <DetailRow
                  label="דמי ניהול מהפקדות"
                  value={
                    account.fee_from_deposits != null
                      ? maskAmountText(`${account.fee_from_deposits}%`, hidden)
                      : null
                  }
                />
                {feesAboveAverage(account) && (
                  <div className="px-4 py-2.5 flex items-center gap-2 bg-red-50 dark:bg-red-950/30">
                    <TriangleAlert className="size-4 text-red-600 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      שים לב לגובה דמי הניהול — הם גבוהים מהממוצע בקרן
                      {account.avg_fee_from_balance != null ||
                      account.avg_fee_from_deposits != null ? (
                        <span className="tabular-nums">
                          {" "}
                          (ממוצע:{" "}
                          {account.avg_fee_from_balance != null
                            ? `${maskAmountText(`${account.avg_fee_from_balance}%`, hidden)} מצבירה`
                            : "—"}
                          {" · "}
                          {account.avg_fee_from_deposits != null
                            ? `${maskAmountText(`${account.avg_fee_from_deposits}%`, hidden)} מהפקדות`
                            : "—"}
                          )
                        </span>
                      ) : null}
                    </p>
                  </div>
                )}
                {allocations.length === 0 && <DetailRow label="מסלול" value={account.track} />}
                <DetailRow
                  label="קצבה חודשית צפויה"
                  value={
                    account.expected_monthly_pension != null
                      ? maskAmountText(formatILS(account.expected_monthly_pension), hidden)
                      : null
                  }
                />
                <DetailRow label="הפקדה חודשית" value={depositSummary(account, hidden)} />
                <DetailRow label="קוד האוצר" value={account.treasury_code} ltr />
                <DetailRow label="מקור הנתונים" value={sourceSummary(account)} />
                <DetailRow label="בעלים" value={labels[(account.person ?? "shared") as Person]} />
              </div>
              {account.notes && (
                <div className="rounded-2xl border bg-card p-4 mt-3">
                  <h3 className="text-sm font-semibold mb-1">הערות</h3>
                  <p className="text-sm whitespace-pre-wrap">{account.notes}</p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* The trading journal belongs to day-trading accounts (e.g. Colmex) —
          private accounts like a pension never have one. */}
      {account && account.kind !== IB_KIND && !isPrivate && (
        <TradeJournalSection accountId={accountId} />
      )}

      {showMetadata && (isPrivate || metadataHistory.length > 0) && (
        <PrivateAccountHistoryList rows={metadataHistory} hidden={hidden} />
      )}

      <BalanceHistoryList rows={history} hidden={hidden} />

      {account && account.kind !== IB_KIND && (
        <PrivateAccountDialog
          open={editingDetails}
          onOpenChange={setEditingDetails}
          person={(account.person ?? "shared") as Person}
          account={account}
          onDeleted={() => {
            if (isPrivate) {
              navigate({
                to: "/investments/person/$person",
                params: { person: (account.person ?? "shared") as string },
              });
            } else {
              navigate({ to: "/investments" });
            }
          }}
        />
      )}

      {account && showMetadata && (
        <TrackSplitEditor
          open={editingSplit}
          onOpenChange={setEditingSplit}
          accountId={accountId}
          accountName={account.name}
          initial={allocations}
        />
      )}

      {account && showMetadata && (
        <StatementImportDialog
          open={importingStatement}
          onOpenChange={setImportingStatement}
          person={(account.person ?? "shared") as Person}
          account={account}
        />
      )}
    </AppShell>
  );
}

/** One labeled row in the account-details section; empty values show "—". */
function DetailRow({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-start truncate tabular-nums" dir={ltr ? "ltr" : undefined}>
        {value ?? "—"}
      </span>
    </div>
  );
}

/** "עובד ₪500 · מעביד ₪700 · פיצויים ₪400" — only the set parts, masked in privacy mode. */
function depositSummary(
  account: {
    monthly_deposit_employee: number | null;
    monthly_deposit_employer: number | null;
    monthly_deposit_severance: number | null;
  },
  hidden: boolean,
): string | null {
  const parts = [
    account.monthly_deposit_employee != null &&
      `עובד ${maskAmountText(formatILS(account.monthly_deposit_employee), hidden)}`,
    account.monthly_deposit_employer != null &&
      `מעביד ${maskAmountText(formatILS(account.monthly_deposit_employer), hidden)}`,
    account.monthly_deposit_severance != null &&
      `פיצויים ${maskAmountText(formatILS(account.monthly_deposit_severance), hidden)}`,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "דוח שנתי · 22.11.2026" — where the numbers came from and when. */
function sourceSummary(account: {
  data_source: string | null;
  source_date: string | null;
}): string | null {
  const label = dataSourceLabel(account.data_source);
  if (!label) return null;
  if (!account.source_date) return label;
  const d = new Date(`${account.source_date}T00:00:00`);
  const date = Number.isNaN(d.getTime())
    ? account.source_date
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${label} · ${date}`;
}
