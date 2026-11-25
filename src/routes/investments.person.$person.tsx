import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileUp,
  GraduationCap,
  GripVertical,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ReorderControls } from "@/components/investments/ReorderControls";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddPersonDialog } from "@/components/investments/AddPersonDialog";
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
import { accountsOfPerson, sumPrivateAccountExtras } from "@/lib/private-accounts";
import {
  ownerIdForAddedPerson,
  personAccentColor,
  resolvePersonPageTitle,
  useHouseholdPersons,
} from "@/lib/person";
import {
  deleteHouseholdPerson,
  useHouseholdPeople,
  useInvalidateHouseholdPeople,
} from "@/lib/household-people";
import { IB_KIND } from "@/lib/ib";
import { useIbTotalsMap } from "@/lib/use-ib-totals";
import { useSharedCardOrder, VOUCHERS_CARD_ID } from "@/lib/investments-order";
import { useUsdIlsRate } from "@/lib/fx";
import { formatILS } from "@/lib/finance";
import { maskAmountText, usePrivacyMode } from "@/lib/privacy";

export const Route = createFileRoute("/investments/person/$person")({
  head: () => ({ meta: [{ title: "חשבונות פרטיים" }] }),
  component: PersonPage,
});

/** Quick-add templates for the empty state: kind + editable name suggestion. */
const QUICK_ADD_TEMPLATES = [
  { kind: "pension", name: "קרן פנסיה", Icon: Landmark },
  { kind: "provident", name: "קרן השתלמות", Icon: GraduationCap },
  { kind: "provident", name: "קופת גמל", Icon: PiggyBank },
];

function PersonPage() {
  const { person: personParam } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hidden, toggle: togglePrivacy } = usePrivacyMode();
  const { persons, isLoading: personsLoading } = useHouseholdPersons();
  const personIndex = persons.findIndex((p) => p.person === personParam);
  const person = personIndex >= 0 ? persons[personIndex] : null;
  const accent = personAccentColor(Math.max(personIndex, 0));

  // TRY-IT (2026-11-25): the browser tab shows the person's name instead
  // of the generic "חשבונות פרטיים". The static route `head` above can't
  // see the loaded label, so the title is set here once the person loads;
  // navigating away lets the next route's head take over again. If Jonatan
  // vetoes it after seeing it live, delete this effect (and the helper).
  useEffect(() => {
    document.title = resolvePersonPageTitle(person?.label);
  }, [person?.label]);

  const [adding, setAdding] = useState(false);
  const [template, setTemplate] = useState<{ kind: string; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<InvestmentAccount | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);

  // Added people (children) can be renamed and removed from their own
  // tab. Login members are never managed here — their names come from
  // their profiles.
  const { data: addedPeople = [] } = useHouseholdPeople();
  const addedRow = addedPeople.find((r) => ownerIdForAddedPerson(r.id) === person?.person) ?? null;
  const invalidatePeople = useInvalidateHouseholdPeople();

  const removePerson = useMutation({
    mutationFn: () => deleteHouseholdPerson(addedRow!.id),
    onSuccess: () => {
      invalidatePeople();
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      toast.success("האדם נמחק");
      setConfirmRemove(false);
      navigate({ to: "/investments" });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "לא הצלחנו למחוק. נסה שוב.");
    },
  });

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
  // IB portfolios are valued from live positions, never from
  // transactions — same overlay as the assets index, so an IB account
  // under this person shows its real value.
  const ibTotals = useIbTotalsMap();

  const totals = useMemo(() => {
    const m = computeAccountTotals({
      accounts,
      transactions: txs,
      journalEntries,
      fxRate: fxRate ?? null,
    });
    for (const a of accounts) {
      if (a.kind === IB_KIND) {
        const t = ibTotals.get(a.id);
        m.set(a.id, { native: t?.native ?? 0, ils: t?.ils ?? null });
      }
    }
    return m;
  }, [accounts, txs, journalEntries, fxRate, ibTotals]);

  const myAccounts = useMemo(
    () => (person ? accountsOfPerson(accounts, person.person) : []),
    [accounts, person],
  );

  // Card order — the SAME per-device store as the assets index, so
  // arranging here arranges there and vice versa. The full list (every
  // account + the vouchers card) is the order's scope: this page shows
  // only this person's subset, in their positions in the full order,
  // and a move swaps two cards of this subset without touching
  // anything else. The vouchers id stays in the list so its place on
  // the index never moves because of a reorder here.
  const allCardIds = useMemo(() => [...accounts.map((a) => a.id), VOUCHERS_CARD_ID], [accounts]);
  const { orderedIds, moveWithin } = useSharedCardOrder(allCardIds);
  const myAccountIds = useMemo(() => myAccounts.map((a) => a.id), [myAccounts]);
  const orderedMyAccounts = useMemo(() => {
    const byId = new Map(myAccounts.map((a) => [a.id, a]));
    return orderedIds.map((id) => byId.get(id)).filter((a): a is InvestmentAccount => a != null);
  }, [orderedIds, myAccounts]);
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
  const extras = useMemo(() => sumPrivateAccountExtras(myAccounts), [myAccounts]);

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
          size="sm"
          onClick={() => setEditingOrder((v) => !v)}
          aria-pressed={editingOrder}
        >
          {editingOrder ? (
            "סיום"
          ) : (
            <>
              <GripVertical className="size-4" />
              סדר כרטיסים
            </>
          )}
        </Button>
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
            {/* Account actions sit above the total — compact, always in reach. */}
            <section className="px-5 md:px-0">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" />
                  חשבון פרטי חדש
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
                  <FileUp className="size-4" />
                  ייבוא מדוח שנתי
                </Button>
              </div>
            </section>

            <section className="px-5 md:px-0 mt-4">
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
                {(extras.monthlyDeposits != null || extras.expectedPension != null) && (
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    {extras.monthlyDeposits != null && (
                      <div>
                        <p className="text-xs opacity-70">הפקדה חודשית כוללת</p>
                        <p className="text-base font-semibold tabular-nums">
                          {maskAmountText(formatILS(extras.monthlyDeposits), hidden)}
                        </p>
                      </div>
                    )}
                    {extras.expectedPension != null && (
                      <div>
                        <p className="text-xs opacity-70">קצבה חודשית צפויה</p>
                        <p className="text-base font-semibold tabular-nums">
                          {maskAmountText(formatILS(extras.expectedPension), hidden)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="px-5 md:px-0 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {myAccounts.length === 0 ? (
                <div className="rounded-2xl border bg-card p-6 text-center md:col-span-2">
                  <p className="font-semibold">כאן מרכזים את החסכונות הפרטיים</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    קרן פנסיה, קרן השתלמות, קופת גמל — עם החברה המנהלת, דמי הניהול ופיצול המסלולים.
                    אפשר להוסיף ידנית, או לייבא מדוח שנתי והפרטים יתמלאו לבד.
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    {QUICK_ADD_TEMPLATES.map(({ kind, name, Icon }) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setTemplate({ kind, name })}
                        className="rounded-2xl border bg-background p-3 flex flex-col items-center gap-2 hover:bg-accent active:scale-[0.98] transition-transform"
                      >
                        <span
                          className="size-10 rounded-xl flex items-center justify-center"
                          style={{ background: `${accent}1f`, color: accent }}
                        >
                          <Icon className="size-5" />
                        </span>
                        <span className="text-sm font-medium leading-tight">{name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                      <Plus className="size-4" />
                      חשבון מסוג אחר
                    </Button>
                  </div>
                </div>
              ) : (
                orderedMyAccounts.map((a, index) => (
                  <div
                    key={a.id}
                    className={cn(editingOrder && "rounded-2xl ring-2 ring-primary/50")}
                  >
                    <PrivateAccountCard
                      account={a}
                      total={totals.get(a.id) ?? { native: 0, ils: 0 }}
                      allocations={allocationsByAccount.get(a.id) ?? []}
                      hidden={hidden}
                      onEdit={() => setEditing(a)}
                      linkDisabled={editingOrder}
                      footer={
                        editingOrder ? (
                          <ReorderControls
                            onUp={() => moveWithin(myAccountIds, a.id, "up")}
                            onDown={() => moveWithin(myAccountIds, a.id, "down")}
                            disableUp={index === 0}
                            disableDown={index === orderedMyAccounts.length - 1}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                ))
              )}
            </section>

            {/* Settings — the least important things, at the very bottom
                (same pattern as the account page): renaming / removing an
                added person. Only the privacy eye stays at the top. */}
            {addedRow && (
              <section className="px-5 md:px-0 mt-6 mb-8">
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">הגדרות</h2>
                <div className="rounded-2xl border bg-card p-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>
                    <Pencil className="size-4" />
                    שנה שם
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 className="size-4" />
                    מחק אדם
                  </Button>
                </div>
              </section>
            )}

            <PrivateAccountDialog
              open={adding || template != null || editing != null}
              onOpenChange={(v) => {
                if (!v) {
                  setAdding(false);
                  setTemplate(null);
                  setEditing(null);
                }
              }}
              person={person.person}
              account={editing}
              initialKind={template?.kind}
              initialName={template?.name}
            />

            <StatementImportDialog
              open={importing}
              onOpenChange={setImporting}
              person={person.person}
              account={null}
              onCreated={(newId) => {
                navigate({
                  to: "/investments/$accountId",
                  params: { accountId: newId },
                });
              }}
            />

            <AddPersonDialog open={renaming} onOpenChange={setRenaming} existing={addedRow} />

            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>למחוק את {person.label}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {myAccounts.length > 0
                      ? `לא ניתן למחוק — ל${person.label} עדיין יש ${myAccounts.length === 1 ? "חשבון אחד" : `${myAccounts.length} חשבונות`}. העבירו אותם לבעלים אחר קודם (עריכת החשבון ← בעלים).`
                      : `האדם „${person.label}” יימחק ממשק הבית. אין לו חשבונות, אז לא יימחק שום דבר אחר.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  {myAccounts.length === 0 && (
                    <AlertDialogAction
                      onClick={() => removePerson.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      מחק
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )
      )}
    </AppShell>
  );
}
