import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  PencilLine,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
import { useState } from "react";
import { fetchTransactionsForTrip, type Transaction } from "@/lib/db";
import {
  deleteTrip,
  fetchTrip,
  fetchTripSpending,
  tripDurationDays,
  tripStatus,
  tripStatusLabel,
} from "@/lib/trips";
import { fetchRateToIls } from "@/lib/fx";
import { countryFlag } from "@/lib/flags";
import { txTypeLabel } from "@/lib/finance";
import { usePaymentMethods } from "@/lib/payment_methods";
import { useMemberLabels } from "@/lib/person";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/travel/$tripId")({
  head: () => ({ meta: [{ title: "טיול" }] }),
  component: TripDashboard,
});

function ils(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

function TripDashboard() {
  const { tripId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const memberLabels = useMemberLabels();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: trip, isLoading: tripLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => fetchTrip(tripId),
    enabled: !!tripId,
  });
  const { data: spending } = useQuery({
    queryKey: ["trip", tripId, "spending"],
    queryFn: () => fetchTripSpending(tripId),
    enabled: !!tripId,
  });
  const { data: txs = [], isLoading: txLoading } = useQuery({
    queryKey: ["trip", tripId, "transactions"],
    queryFn: () => fetchTransactionsForTrip(tripId),
    enabled: !!tripId,
  });
  const { data: rate } = useQuery({
    queryKey: ["fx", trip?.currency],
    queryFn: () => fetchRateToIls(trip!.currency),
    enabled: !!trip?.currency,
    staleTime: 60 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTrip(tripId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("הטיול נמחק");
      navigate({ to: "/travel" });
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה במחיקה");
    },
  });

  if (tripLoading) {
    return (
      <AppShell>
        <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
      </AppShell>
    );
  }
  if (!trip) return null;

  const status = tripStatus(trip);
  const durationDays = tripDurationDays(trip);
  const spentIls = spending?.totalIls ?? 0;
  const hasBudget = trip.budget > 0;
  const budgetIls = hasBudget && rate != null ? trip.budget * rate : null;
  const remainingIls = budgetIls != null ? budgetIls - spentIls : null;
  const avgDaily = durationDays > 0 ? spentIls / durationDays : 0;

  const dateFmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/travel" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate flex items-center gap-1.5">
            <span>{countryFlag(trip.country)}</span>
            {trip.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {dateFmt(trip.start_date)} – {dateFmt(trip.end_date)} · {tripStatusLabel[status]}
          </p>
        </div>
        <Link
          to="/travel/$tripId/edit"
          params={{ tripId }}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
        >
          <PencilLine className="size-4" />
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
        >
          <Trash2 className="size-4" />
        </button>
      </header>

      <div className="px-5 md:px-0 pb-8 space-y-6">
        {/* Overview */}
        <div className="grid grid-cols-2 gap-3">
          {hasBudget && (
            <StatBox
              icon={Wallet}
              label="תקציב"
              value={budgetIls != null ? ils(budgetIls) : "…"}
              sub={`${trip.budget.toLocaleString()} ${trip.currency}`}
            />
          )}
          <StatBox icon={TrendingUp} label="הוצא בפועל" value={ils(spentIls)} />
          {hasBudget && (
            <StatBox
              icon={Wallet}
              label="נותר"
              value={remainingIls != null ? ils(remainingIls) : "…"}
              valueClassName={
                remainingIls != null && remainingIls < 0 ? "text-destructive" : undefined
              }
            />
          )}
          <StatBox icon={Receipt} label="תנועות" value={String(txs.length)} />
          <StatBox icon={CalendarDays} label="משך הטיול" value={`${durationDays} ימים`} />
          <StatBox icon={TrendingUp} label="ממוצע יומי" value={ils(avgDaily)} />
        </div>

        {/* Timeline */}
        <div>
          <h2 className="text-sm font-semibold mb-2">תנועות הטיול</h2>
          <div className="rounded-2xl bg-card border divide-y overflow-hidden">
            {txLoading ? (
              <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
            ) : txs.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm text-muted-foreground">אין עדיין תנועות משויכות לטיול הזה</p>
                <Link
                  to="/transactions/new"
                  search={{ trip: tripId }}
                  className="text-primary text-sm font-medium"
                >
                  + הוספת הוצאה
                </Link>
              </div>
            ) : (
              txs.map((tx) => (
                <TripTxRow
                  key={tx.id}
                  tx={tx}
                  memberLabels={memberLabels}
                  paymentMethods={paymentMethods}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את "{trip.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              התנועות המשויכות לא יימחקו — הן פשוט יפסיקו להיות מקושרות לטיול. לא ניתן לשחזר את
              הטיול עצמו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  sub,
  valueClassName,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn("text-lg font-bold mt-1 tabular-nums", valueClassName)}>{value}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums" dir="ltr">
          {sub}
        </p>
      )}
    </div>
  );
}

function TripTxRow({
  tx,
  memberLabels,
  paymentMethods,
}: {
  tx: Transaction;
  memberLabels: Record<string, string>;
  paymentMethods: { key: string; label: string }[];
}) {
  const isIn = tx.type === "income";
  const pmLabel = paymentMethods.find((p) => p.key === tx.payment_method)?.label;
  const dateFmt = new Date(tx.occurred_at + "T00:00:00").toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  });

  return (
    <Link
      to="/transactions/edit/$id"
      params={{ id: tx.id }}
      className="flex items-center gap-3 p-4 hover:bg-accent/50 active:bg-accent/50"
    >
      <div
        className="size-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ background: tx.category?.color ?? "#888" }}
      >
        {tx.category?.emoji ?? tx.title.slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{tx.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {tx.category?.name ?? txTypeLabel[tx.type]} · {dateFmt}
          {pmLabel ? ` · ${pmLabel}` : ""}
        </p>
      </div>
      <p
        className={cn("font-bold tabular-nums shrink-0", isIn ? "text-income" : "text-foreground")}
      >
        {isIn ? "+" : "−"}
        {ils(Number(tx.amount_ils))}
      </p>
    </Link>
  );
}
