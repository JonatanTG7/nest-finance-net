import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, FileUp, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PrivateAccountCard } from "@/components/investments/PrivateAccountCard";
import { PrivateAccountDialog } from "@/components/investments/PrivateAccountDialog";
import { StatementImportDialog } from "@/components/investments/StatementImportDialog";
import {
  fetchInvestmentAccounts,
  fetchInvestmentTransactions,
  type InvestmentAccount,
} from "@/lib/db";
import { fetchAllTradeJournalEntries } from "@/lib/trade-journal";
import { fetchAllTrackAllocations } from "@/lib/track-splits";
import { computeAccountTotals } from "@/lib/account-totals";
import { accountsOfPerson } from "@/lib/private-accounts";
import { personAccentColor, useHouseholdPersons, type Person } from "@/lib/person";
import { useUsdIlsRate } from "@/lib/fx";
import { formatILS } from "@/lib/finance";
import { maskAmountText, usePrivacyMode } from "@/lib/privacy";

export const Route = createFileRoute("/investments/person/$person")({
  head: () => ({ meta: [{ title: "חשבונות פרטיים" }] }),
  component: PersonPage,
});

function PersonPage() {
  const { person: personParam } = Route.useParams();
  const navigate = useNavigate();
  const { hidden, toggle: togglePrivacy } = usePrivacyMode();
  const { persons, isLoading: personsLoading } = useHouseholdPersons();
  const personIndex = persons.findIndex((p) => p.person === personParam);
  const person = personIndex >= 0 ? persons[personIndex] : null;
  const accent = personAccentColor(Math.max(personIndex, 0));

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
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
  const { data: allAllocations = [] } = useQuery({
    queryKey: ["track-allocations", "all"],
    queryFn: fetchAllTrackAllocations,
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
  const allocationsByAccount = useMemo(() => {
    const map = new Map<string, typeof allAllocations>();
    for (const a of allAllocations) {
      const list = map.get(a.investment_account_id) ?? [];
      list.push(a);
      map.set(a.investment_account_id, list);
    }
    return map;
  }, [allAllocations]);
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
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAdding(true)}>
                    <Plus className="size-4" />
                    חשבון פרטי חדש
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
                    <FileUp className="size-4" />
                    ייבוא מדוח שנתי
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
                myAccounts.map((a) => (
                  <PrivateAccountCard
                    key={a.id}
                    account={a}
                    total={totals.get(a.id) ?? { native: 0, ils: 0 }}
                    allocations={allocationsByAccount.get(a.id) ?? []}
                    hidden={hidden}
                    onEdit={() => setEditing(a)}
                  />
                ))
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

            <StatementImportDialog
              open={importing}
              onOpenChange={setImporting}
              person={person.person as Person}
              account={null}
              onCreated={(newId) => {
                navigate({
                  to: "/investments/$accountId",
                  params: { accountId: newId },
                });
              }}
            />
          </>
        )
      )}
    </AppShell>
  );
}
