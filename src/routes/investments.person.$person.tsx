import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PrivateAccountDialog } from "@/components/investments/PrivateAccountDialog";
import {
  fetchInvestmentAccounts,
  fetchInvestmentTransactions,
  type InvestmentAccount,
} from "@/lib/db";
import { fetchAllTradeJournalEntries } from "@/lib/trade-journal";
import { computeAccountTotals } from "@/lib/account-totals";
import { accountsOfPerson, kindColor, kindLabel } from "@/lib/private-accounts";
import { personAccentColor, useHouseholdPersons, type Person } from "@/lib/person";
import { useUsdIlsRate } from "@/lib/fx";
import { formatILS, formatMoney } from "@/lib/finance";
import { maskAmountText, usePrivacyMode } from "@/lib/privacy";

export const Route = createFileRoute("/investments/person/$person")({
  head: () => ({ meta: [{ title: "חשבונות פרטיים" }] }),
  component: PersonPage,
});

function PersonPage() {
  const { person: personParam } = Route.useParams();
  const { hidden, toggle: togglePrivacy } = usePrivacyMode();
  const { persons, isLoading: personsLoading } = useHouseholdPersons();
  const personIndex = persons.findIndex((p) => p.person === personParam);
  const person = personIndex >= 0 ? persons[personIndex] : null;
  const accent = personAccentColor(Math.max(personIndex, 0));

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InvestmentAccount | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["investments", "txs"],
    queryFn: fetchInvestmentTransactions,
  });
  const { data: journalEntries = [] } = useQuery({
    queryKey: ["trade-journal", "all"],
    queryFn: fetchAllTradeJournalEntries,
  });
  const { rate: fxRate } = useUsdIlsRate();

  const totals = useMemo(
    () =>
      computeAccountTotals({
        accounts,
        transactions: txs,
        journalEntries,
        fxRate: fxRate ?? null,
      }),
    [accounts, txs, journalEntries, fxRate],
  );

  const myAccounts = useMemo(
    () => (person ? accountsOfPerson(accounts, person.person as Person) : []),
    [accounts, person],
  );
  const totalIls = useMemo(
    () => myAccounts.reduce((sum, a) => sum + (totals.get(a.id)?.ils ?? 0), 0),
    [myAccounts, totals],
  );

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {person && (
            <span
              className="relative size-10 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 overflow-hidden"
              style={{ background: accent }}
              aria-hidden
            >
              {person.label.trim().charAt(0) || "?"}
              {person.avatarUrl && (
                <img
                  src={person.avatarUrl}
                  alt=""
                  className="absolute inset-0 size-10 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {person?.label ?? (personsLoading ? "טוען…" : "לא נמצא")}
            </h1>
            <p className="text-xs text-muted-foreground">חשבונות פרטיים</p>
          </div>
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

      {!person && !personsLoading ? (
        <section className="px-5 md:px-0">
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <p className="mb-3">האדם הזה לא נמצא במשק הבית.</p>
            <Link to="/investments">
              <Button size="sm">חזרה לנכסים</Button>
            </Link>
          </div>
        </section>
      ) : (
        person && (
          <>
            <section className="px-5 md:px-0">
              <div
                className="rounded-3xl border p-6"
                style={{
                  background: `linear-gradient(135deg, ${accent}26, ${accent}0d)`,
                  borderColor: `${accent}55`,
                }}
              >
                <p className="text-sm opacity-80">סך חשבונות פרטיים (ש"ח)</p>
                <p className="text-4xl font-bold mt-2 tabular-nums">
                  {maskAmountText(formatILS(totalIls), hidden)}
                </p>
                <div className="mt-5">
                  <Button size="sm" onClick={() => setAdding(true)}>
                    <Plus className="size-4" />
                    חשבון פרטי חדש
                  </Button>
                </div>
              </div>
            </section>

            <section className="px-5 md:px-0 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {myAccounts.length === 0 ? (
                <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground md:col-span-2">
                  <p>אין עדיין חשבונות פרטיים.</p>
                  <p className="mt-1">כאן אפשר להוסיף קרן פנסיה, קרן השתלמות, קופת גמל ועוד.</p>
                  <Button size="sm" className="mt-4" onClick={() => setAdding(true)}>
                    <Plus className="size-4" />
                    הוסף חשבון פרטי
                  </Button>
                </div>
              ) : (
                myAccounts.map((a) => {
                  const t = totals.get(a.id) ?? { native: 0, ils: 0 };
                  const color = kindColor(a.kind);
                  return (
                    <div key={a.id} className="rounded-2xl border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-3 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                        <p className="text-sm font-semibold truncate flex-1">{a.name}</p>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: `${color}22`, color }}
                        >
                          {kindLabel(a.kind)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => setEditing(a)}
                          aria-label={`ערוך את ${a.name}`}
                          title="ערוך"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                      <Link
                        to="/investments/$accountId"
                        params={{ accountId: a.id }}
                        className="block active:scale-[0.99] transition-transform"
                      >
                        <p
                          className="text-2xl font-bold mt-2 tabular-nums"
                          dir={a.currency !== "ILS" ? "ltr" : undefined}
                        >
                          {maskAmountText(formatMoney(t.native, a.currency), hidden)}
                        </p>
                        {a.currency !== "ILS" && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {t.ils != null ? (
                              <>≈ {maskAmountText(formatILS(t.ils), hidden)}</>
                            ) : (
                              "שער דולר לא זמין"
                            )}
                          </p>
                        )}
                        <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                          {a.company && (
                            <p>
                              חברה: <span className="text-foreground">{a.company}</span>
                            </p>
                          )}
                          {a.track && (
                            <p>
                              מסלול: <span className="text-foreground">{a.track}</span>
                            </p>
                          )}
                          {(a.fee_from_balance != null || a.fee_from_deposits != null) && (
                            <p className="tabular-nums">
                              דמי ניהול:{" "}
                              <span className="text-foreground">
                                {a.fee_from_balance != null
                                  ? `מצבירה ${maskAmountText(`${a.fee_from_balance}%`, hidden)}`
                                  : "—"}
                                {" · "}
                                {a.fee_from_deposits != null
                                  ? `מהפקדות ${maskAmountText(`${a.fee_from_deposits}%`, hidden)}`
                                  : "—"}
                              </span>
                            </p>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })
              )}
            </section>

            <PrivateAccountDialog
              open={adding || editing != null}
              onOpenChange={(v) => {
                if (!v) {
                  setAdding(false);
                  setEditing(null);
                }
              }}
              person={person.person as Person}
              account={editing}
            />
          </>
        )
      )}
    </AppShell>
  );
}
