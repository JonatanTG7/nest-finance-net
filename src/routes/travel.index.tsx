import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Plane } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  fetchTrips,
  fetchTripSpending,
  tripDurationDays,
  tripStatus,
  tripStatusLabel,
  type Trip,
} from "@/lib/trips";
import { fetchRateToIls } from "@/lib/fx";
import { countryFlag } from "@/lib/flags";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/travel/")({
  head: () => ({ meta: [{ title: "טיולים" }] }),
  component: TravelHub,
});

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #7c3aed 0%, #db2777 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)",
  "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
  "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
];

function ilsFmt(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

function TravelHub() {
  const { data: trips = [], isLoading } = useQuery({ queryKey: ["trips"], queryFn: fetchTrips });

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">טיולים</h1>
          <p className="text-xs text-muted-foreground">מעקב הוצאות לפי טיול</p>
        </div>
        <Link
          to="/travel/new"
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1.5"
        >
          <Plus className="size-4" />
          טיול חדש
        </Link>
      </header>

      <div className="px-5 md:px-0 pb-8">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-16">טוען…</p>
        ) : trips.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Plane className="size-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">עוד לא הוספת טיולים</p>
            <Link to="/travel/new" className="text-primary text-sm font-medium">
              + הוספת טיול ראשון
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {trips.map((t, i) => (
              <TripCard
                key={t.id}
                trip={t}
                fallbackGradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TripCard({ trip, fallbackGradient }: { trip: Trip; fallbackGradient: string }) {
  const { data: spending } = useQuery({
    queryKey: ["trip", trip.id, "spending"],
    queryFn: () => fetchTripSpending(trip.id),
  });
  const { data: rate } = useQuery({
    queryKey: ["fx", trip.currency],
    queryFn: () => fetchRateToIls(trip.currency),
    staleTime: 60 * 60 * 1000,
  });

  const status = tripStatus(trip);
  const hasBudget = trip.budget > 0;
  const budgetIls = hasBudget && rate != null ? trip.budget * rate : null;
  const spentIls = spending?.totalIls ?? 0;
  const pct =
    budgetIls && budgetIls > 0 ? Math.min(100, Math.round((spentIls / budgetIls) * 100)) : 0;
  const overBudget = budgetIls != null && spentIls > budgetIls;

  const dateFmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "short" });

  return (
    <Link
      to="/travel/$tripId"
      params={{ tripId: trip.id }}
      className="block rounded-3xl overflow-hidden border relative h-56 group active:scale-[0.99] transition-transform"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={
          trip.cover_image
            ? { backgroundImage: `url(${trip.cover_image})` }
            : { background: fallbackGradient }
        }
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

      <div className="relative h-full flex flex-col justify-between p-4 text-white">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "text-[11px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm",
              status === "active" && "bg-emerald-500/80",
              status === "upcoming" && "bg-sky-500/80",
              status === "completed" && "bg-white/20",
            )}
          >
            {tripStatusLabel[status]}
          </span>
        </div>

        <div>
          <h3 className="text-xl font-bold flex items-center gap-1.5">
            <span>{countryFlag(trip.country)}</span>
            {trip.name}
          </h3>
          <p className="text-xs text-white/80 mt-0.5">
            {dateFmt(trip.start_date)} – {dateFmt(trip.end_date)} · {tripDurationDays(trip)} ימים
          </p>

          <div className="mt-3">
            {hasBudget && (
              <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div
                  className={cn("h-full rounded-full", overBudget ? "bg-rose-400" : "bg-white")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <p className="text-xs text-white/90 mt-1.5 tabular-nums">
              {budgetIls != null
                ? `${ilsFmt(spentIls)} / ${ilsFmt(budgetIls)}`
                : `הוצא: ${ilsFmt(spentIls)}`}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
