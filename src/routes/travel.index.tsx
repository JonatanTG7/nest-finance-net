import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Plane } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TripCard } from "@/components/travel/TripCard";
import { TripDialog } from "@/components/travel/TripDialog";
import { fetchAllTransactions } from "@/lib/db";
import { createTrip, useInvalidateTrips, useTrips, tripStatus, type TripInput } from "@/lib/trips";

export const Route = createFileRoute("/travel/")({
  head: () => ({
    meta: [
      { title: "טיולים — מרכז הטיולים" },
      { name: "description", content: "כל הטיולים שלכם עם תקציב, הוצאות והתקדמות." },
      { property: "og:title", content: "טיולים — מרכז הטיולים" },
      { property: "og:description", content: "כל הטיולים שלכם עם תקציב, הוצאות והתקדמות." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TravelHub,
});

function TravelHub() {
  const { data: trips = [], isLoading } = useTrips();
  const invalidate = useInvalidateTrips();
  const [open, setOpen] = useState(false);

  // Same transaction rows as Cash Flow — only aggregated by trip here.
  const { data: txs = [] } = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: () => fetchAllTransactions(1000),
  });

  const spentByTrip = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txs) {
      if (!t.trip_id || t.type === "income") continue;
      map.set(t.trip_id, (map.get(t.trip_id) ?? 0) + Number(t.amount_ils));
    }
    return map;
  }, [txs]);

  const ordered = useMemo(() => {
    const rank = { active: 0, upcoming: 1, completed: 2 } as const;
    return [...trips].sort((a, b) => rank[tripStatus(a)] - rank[tripStatus(b)]);
  }, [trips]);

  async function save(input: TripInput) {
    await createTrip(input);
    invalidate();
    toast.success("הטיול נוסף");
  }

  return (
    <AppShell>
      <div className="px-5 md:px-0 pt-5 pb-8">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">מרכז הטיולים</p>
            <h1 className="text-2xl font-bold">טיולים</h1>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 active:scale-95 transition"
          >
            <Plus className="size-4" />
            טיול חדש
          </button>
        </header>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">טוען…</p>
        ) : ordered.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-10 text-center">
            <Plane className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-semibold">אין טיולים עדיין</p>
            <p className="mt-1 text-sm text-muted-foreground">
              צרו טיול ואז שייכו לו תנועות מתוך טופס ההוצאה.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ordered.map((trip) => (
              <TripCard key={trip.id} trip={trip} spent={spentByTrip.get(trip.id) ?? 0} />
            ))}
          </div>
        )}
      </div>

      <TripDialog open={open} onOpenChange={setOpen} trip={null} onSave={save} />
    </AppShell>
  );
}
