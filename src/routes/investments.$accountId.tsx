import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileUp,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BalanceDialog } from "@/components/investments/BalanceDialog";
import { BalanceHistoryList } from "@/components/investments/BalanceHistoryList";
import { CustomFieldsEditor } from "@/components/investments/CustomFieldsEditor";
import { PrivateAccountDialog } from "@/components/investments/PrivateAccountDialog";
import { PrivateAccountHistoryList } from "@/components/investments/PrivateAccountHistoryList";
import { StatementImportDialog } from "@/components/investments/StatementImportDialog";
import { TrackSplitChart } from "@/components/investments/TrackSplitChart";
import { TradeJournalSection } from "@/components/investments/TradeJournalSection";
import { fetchInvestmentAccounts } from "@/lib/db";
import { fetchBalanceHistory, setAccountBalanceIls } from "@/lib/balance_history";
import {
  dataSourceLabel,
  feesAboveAverage,
  fetchPrivateAccountHistory,
  isSharedAccount,
  kindLabel,
  resolveAccountPageTitle,
  setAccountOwner,
  setHiddenDetailFields,
} from "@/lib/private-accounts";
import { arrangeDetailFields, fetchCustomFields, type DetailFieldDef } from "@/lib/account-details";
import { OwnerPicker } from "@/components/investments/OwnerPicker";
import { fetchTrackAllocations, hasTrackSplit } from "@/lib/track-splits";
import { resolveOwnerLabel, SHARED_OWNER, useMemberLabels, type OwnerId } from "@/lib/person";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchUsdIlsRate, useUsdIlsRate } from "@/lib/fx";
import {
  fetchTradeJournalEntries,
  journalPnlUsdAfterReset,
  showsTradeJournal,
} from "@/lib/trade-journal";
import { IB_KIND } from "@/lib/ib";
import { maskAmountText, accountPageHidden, usePrivacyMode } from "@/lib/privacy";

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
  const [importingStatement, setImportingStatement] = useState(false);
  const [editingCustomFields, setEditingCustomFields] = useState(false);
  const [showHiddenDetails, setShowHiddenDetails] = useState(false);
  // Private accounts reveal only here, per visit: this state is local
  // (never localStorage, never the global mode) and dies with the page,
  // so leaving the account re-masks everything. Shared accounts keep
  // the global privacy mode below.
  const [privateRevealed, setPrivateRevealed] = useState(false);
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
  // Browser tab shows the account's name once it loads (same pattern as
  // the person page title in PR #30). Navigating away lets the next
  // route's static head take over again.
  useEffect(() => {
    document.title = resolveAccountPageTitle(account?.name);
  }, [account?.name]);
  // Switching accounts directly (same route, new param) keeps this
  // component mounted — re-mask the private reveal for the new account.
  useEffect(() => {
    setPrivateRevealed(false);
  }, [accountId]);
  const isPrivate = !!account && !isSharedAccount(account);
  // Effective masking: a private account follows only the local reveal
  // above; a shared account follows the global privacy mode.
  const pageHidden = accountPageHidden(isPrivate, hidden, privateRevealed);
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
  // The split section shows only for accounts that have tracks; a
  // trackless account (e.g. a day-trading account) hides it entirely.
  // The unified edit dialog still offers track editing, so tracks can
  // be added later and the section appears then.
  const showTrackSplit = showMetadata && hasTrackSplit(allocations, account?.track);
  const { data: customFields = [] } = useQuery({
    queryKey: ["account-custom-fields", accountId],
    queryFn: () => fetchCustomFields(accountId),
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

  // Owner reassignment — the only edit path for plain shared accounts
  // without metadata (they have no "ערוך פרטים"). Moving the owner
  // moves the account between the shared list and that person's tab.
  const moveOwner = useMutation({
    mutationFn: (person: OwnerId) => setAccountOwner(account!, person),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      qc.invalidateQueries({ queryKey: ["private-account-history", accountId] });
      toast.success("הבעלים עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון הבעלים"),
  });

  // The details list, as data: fixed rows in canonical order + the
  // owner's custom fields. arrangeDetailFields drops empty rows and
  // hidden rows, and puts the meta block (owner, data source) last —
  // account data first, always. Custom fields are account data: they
  // render with the account block, above the meta block.
  const hiddenDetailKeys = useMemo(
    () => account?.hidden_detail_fields ?? [],
    [account?.hidden_detail_fields],
  );
  const detailDefs = useMemo<DetailFieldDef[]>(() => {
    if (!account) return [];
    return [
      { key: "kind", label: "סוג חשבון", value: kindLabel(account.kind), group: "account" },
      { key: "company", label: "חברה מנהלת", value: account.company, group: "account" },
      {
        key: "fee_from_balance",
        label: "דמי ניהול מצבירה",
        value:
          account.fee_from_balance != null
            ? maskAmountText(`${account.fee_from_balance}%`, pageHidden)
            : null,
        group: "account",
      },
      {
        key: "fee_from_deposits",
        label: "דמי ניהול מהפקדות",
        value:
          account.fee_from_deposits != null
            ? maskAmountText(`${account.fee_from_deposits}%`, pageHidden)
            : null,
        group: "account",
      },
      {
        key: "track",
        label: "מסלול",
        value: allocations.length === 0 ? account.track : null,
        group: "account",
      },
      {
        key: "expected_monthly_pension",
        label: "קצבה חודשית צפויה",
        value:
          account.expected_monthly_pension != null
            ? maskAmountText(formatILS(account.expected_monthly_pension), pageHidden)
            : null,
        group: "account",
      },
      {
        key: "monthly_deposit",
        label: "הפקדה חודשית",
        value: depositSummary(account, pageHidden),
        group: "account",
      },
      {
        key: "treasury_code",
        label: "קוד האוצר",
        value: account.treasury_code,
        ltr: true,
        group: "account",
      },
      ...customFields.map((f): DetailFieldDef => ({
        key: `custom:${f.id}`,
        label: f.label,
        value: f.value,
        group: "account",
      })),
      { key: "data_source", label: "מקור הנתונים", value: sourceSummary(account), group: "meta" },
      {
        key: "owner",
        label: "בעלים",
        value: resolveOwnerLabel(labels, account.person),
        group: "meta",
      },
    ];
  }, [account, allocations, customFields, pageHidden, labels]);
  const { account: accountDetailRows, meta: metaDetailRows } = useMemo(
    () => arrangeDetailFields(detailDefs, hiddenDetailKeys),
    [detailDefs, hiddenDetailKeys],
  );
  // Fixed rows the owner hid, with their current values (or "—" when
  // empty) — the hidden section below the card restores them.
  const hiddenDetailDefs = useMemo(
    () =>
      detailDefs.filter((d) => !d.key.startsWith("custom:") && hiddenDetailKeys.includes(d.key)),
    [detailDefs, hiddenDetailKeys],
  );
  // The fee warning sits right after the last visible fee row — when a
  // fee row is hidden or empty, the warning moves up with the other
  // one; when both are gone the warning goes with them.
  const feeBalloonAfterKey = accountDetailRows.some((r) => r.key === "fee_from_deposits")
    ? "fee_from_deposits"
    : accountDetailRows.some((r) => r.key === "fee_from_balance")
      ? "fee_from_balance"
      : null;

  // Hide / restore one fixed detail row. The change is stored per
  // account and logged in the metadata history.
  const toggleHiddenDetail = useMutation({
    mutationFn: async (key: string) => {
      const next = hiddenDetailKeys.includes(key)
        ? hiddenDetailKeys.filter((k) => k !== key)
        : [...hiddenDetailKeys, key];
      await setHiddenDetailFields(account!, next);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      qc.invalidateQueries({ queryKey: ["private-account-history", accountId] });
    },
    onError: () => toast.error("שגיאה בעדכון השדות המוסתרים"),
  });

  return (
    <AppShell>
      {/* Sticky: the account name (and the privacy eye) stay visible
          while scrolling — the page is long and the name must never
          scroll away. */}
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {account?.name ?? (isLoading ? "טוען…" : "חשבון לא נמצא")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {account && isPrivate
              ? `${kindLabel(account.kind)} · ${resolveOwnerLabel(labels, account.person)} · ${account.currency}`
              : `חשבון השקעה / חיסכון · ${account?.currency ?? "ILS"}`}
          </p>
        </div>
        {/* A private account's eye toggles only the local per-visit
            reveal; a shared account's eye toggles the global mode. */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => (isPrivate ? setPrivateRevealed((v) => !v) : togglePrivacy())}
          aria-label={pageHidden ? "הצג סכומים" : "הסתר סכומים"}
          title={pageHidden ? "הצג סכומים" : "הסתר סכומים"}
        >
          {pageHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
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
                {maskAmountText(formatILS(currentIls), pageHidden)}
              </p>
              {account && account.currency !== "ILS" && (
                <p className="text-sm opacity-70 mt-1 tabular-nums" dir="ltr">
                  ≈ {maskAmountText(formatMoney(currentNative, account.currency), pageHidden)}
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

          {showTrackSplit && account && (
            <section className="px-5 md:px-0 mt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <PieChartIcon className="size-5" />
                  פיצול מסלולים
                </h2>
              </div>
              <TrackSplitChart
                allocations={allocations}
                balanceIls={currentIls}
                hidden={pageHidden}
                onEdit={() => setEditingDetails(true)}
              />
            </section>
          )}

          {showMetadata && account && (
            <section className="px-5 md:px-0 mt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold">פרטי החשבון</h2>
                {/* One edit entry for everything — details, track split,
                    color. The statement import lives at the bottom, with
                    the other rare actions. */}
                <Button size="sm" variant="outline" onClick={() => setEditingDetails(true)}>
                  <Pencil className="size-4" />
                  ערוך
                </Button>
              </div>
              <div className="rounded-2xl border bg-card divide-y text-sm">
                {accountDetailRows.map((row) => (
                  <Fragment key={row.key}>
                    <DetailRow
                      label={row.label}
                      value={row.value}
                      ltr={row.ltr}
                      onHide={
                        row.key.startsWith("custom:")
                          ? undefined
                          : () => toggleHiddenDetail.mutate(row.key)
                      }
                    />
                    {row.key === feeBalloonAfterKey && feesAboveAverage(account) && (
                      <div className="px-4 py-2.5 flex items-center gap-2 bg-red-50 dark:bg-red-950/30">
                        <TriangleAlert className="size-4 text-red-600 shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-400">
                          שים לב לגובה דמי הניהול — הם גבוהים מהממוצע בקרן
                        </p>
                      </div>
                    )}
                  </Fragment>
                ))}
                {metaDetailRows.map((row) => (
                  <DetailRow
                    key={row.key}
                    label={row.label}
                    value={row.value}
                    ltr={row.ltr}
                    onHide={() => toggleHiddenDetail.mutate(row.key)}
                  />
                ))}
                {hiddenDetailDefs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowHiddenDetails((v) => !v)}
                      aria-expanded={showHiddenDetails}
                      className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-muted-foreground hover:bg-accent"
                    >
                      <span>שדות מוסתרים ({hiddenDetailDefs.length})</span>
                      {showHiddenDetails ? (
                        <ChevronUp className="size-4 shrink-0" />
                      ) : (
                        <ChevronDown className="size-4 shrink-0" />
                      )}
                    </button>
                    {showHiddenDetails &&
                      hiddenDetailDefs.map((row) => (
                        <div
                          key={row.key}
                          className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm opacity-60"
                        >
                          <span className="text-muted-foreground shrink-0">{row.label}</span>
                          <span className="flex items-center gap-1 min-w-0">
                            <span className="text-muted-foreground truncate tabular-nums">
                              {row.value ?? "—"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0"
                              onClick={() => toggleHiddenDetail.mutate(row.key)}
                              aria-label={`הצג את ${row.label}`}
                              title="הצג שוב"
                            >
                              <Eye className="size-4" />
                            </Button>
                          </span>
                        </div>
                      ))}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setEditingCustomFields(true)}
                  className="w-full px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground hover:bg-accent"
                >
                  <Plus className="size-4 shrink-0" />
                  שדות נוספים
                </button>
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

      {/* The trading journal belongs to day-trading accounts (e.g. Colmex):
          non-IB investment-kind accounts, whatever their owner — moving
          Colmex from shared to a person must not hide it. A pension,
          study fund or savings account never has one. */}
      {/* A private account's journal P&L follows the same local reveal;
          a shared account's journal keeps today's always-visible
          behavior. */}
      {account && showsTradeJournal(account.kind) && (
        <TradeJournalSection accountId={accountId} hidden={isPrivate ? pageHidden : false} />
      )}

      {showMetadata && (isPrivate || metadataHistory.length > 0) && (
        <PrivateAccountHistoryList rows={metadataHistory} hidden={pageHidden} />
      )}

      <BalanceHistoryList rows={history} hidden={pageHidden} />

      {/* Settings — the least important things, at the very bottom:
          moving the account to another owner, and the rare annual-report
          import (a small, quiet action, not a header button). Only the
          privacy eye stays at the top. */}
      {account && (
        <section className="px-5 md:px-0 mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">הגדרות</h2>
          <div className="rounded-2xl border bg-card p-4">
            <label className="block text-sm">
              בעלים
              <div className="mt-1">
                <OwnerPicker
                  value={account.person ?? SHARED_OWNER}
                  onChange={(p) => moveOwner.mutate(p)}
                  ariaLabel="בעלים"
                />
              </div>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              שינוי הבעלים מעביר את החשבון בין הרשימה המשותפת ללשונית של אותו אדם.
            </p>
          </div>
          {showMetadata && (
            <button
              type="button"
              onClick={() => setImportingStatement(true)}
              className="mt-3 w-full px-4 py-2.5 rounded-2xl border bg-card text-sm text-muted-foreground hover:bg-accent flex items-center justify-center gap-2"
            >
              <FileUp className="size-4" />
              ייבוא מדוח שנתי
            </button>
          )}
        </section>
      )}

      {account && account.kind !== IB_KIND && (
        <PrivateAccountDialog
          open={editingDetails}
          onOpenChange={setEditingDetails}
          person={account.person ?? SHARED_OWNER}
          account={account}
          onDeleted={() => {
            if (isPrivate) {
              navigate({
                to: "/investments/person/$person",
                params: { person: account.person ?? SHARED_OWNER },
              });
            } else {
              navigate({ to: "/investments" });
            }
          }}
        />
      )}

      {account && showMetadata && (
        <CustomFieldsEditor
          open={editingCustomFields}
          onOpenChange={setEditingCustomFields}
          accountId={accountId}
          accountName={account.name}
          initial={customFields}
        />
      )}

      {account && showMetadata && (
        <StatementImportDialog
          open={importingStatement}
          onOpenChange={setImportingStatement}
          person={account.person ?? SHARED_OWNER}
          account={account}
        />
      )}
    </AppShell>
  );
}

/**
 * One labeled row in the account-details section. Empty values render
 * nothing at all — no "—" rows. Fixed rows get a hide button (custom
 * fields are removed in the fields editor instead).
 */
function DetailRow({
  label,
  value,
  ltr = false,
  onHide,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
  onHide?: () => void;
}) {
  if (value == null) return null;
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="flex items-center gap-1 min-w-0">
        <span
          className="font-medium text-start truncate tabular-nums"
          dir={ltr ? "ltr" : undefined}
        >
          {value}
        </span>
        {onHide && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={onHide}
            aria-label={`הסתר את ${label}`}
            title="הסתר שדה"
          >
            <EyeOff className="size-4" />
          </Button>
        )}
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
