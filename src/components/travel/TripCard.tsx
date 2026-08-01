import { Link } from "@tanstack/react-router";
import {
  countryFlag,
  formatTripRange,
  tripGradient,
  tripStatus,
  tripStatusClass,
  tripStatusLabel,
  type Trip,
} from "@/lib/trips";
import { formatMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function TripCard({ trip, spent }: { trip: Trip; spent: number }) {
  const status = tripStatus(trip);
  const budget = Number(trip.budget) || 0;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const over = budget > 0 && spent > budget;

  return (
    <Link
      to="/travel/$id"
      params={{ id: trip.id }}
      className="group relative block overflow-hidden rounded-3xl border border-border/50 shadow-lg shadow-black/5 transition-transform active:scale-[0.985]"
      style={{ background: tripGradient(trip.id) }}
    >
      {trip.cover_image && (
        <img
          src={trip.cover_image}
          alt={trip.name}
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

      <div className="relative p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-bold truncate">
              <span className="text-xl">{countryFlag(trip.country)}</span>
              <span className="truncate">{trip.name}</span>
            </h3>
            {trip.cities && (
              <p className="mt-0.5 text-xs text-white/80 truncate">
                {trip.cities
                  .split(/[,،]/)
                  .map((c) => c.trim())
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
            <p className="mt-1 text-xs text-white/70">{formatTripRange(trip)}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur",
              tripStatusClass[status],
            )}
          >
            {tripStatusLabel[status]}
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-2 text-sm font-semibold tabular-nums">
            <span>{formatMoney(spent, trip.currency)}</span>
            <span className="text-white/70">{formatMoney(budget, trip.currency)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                over ? "bg-rose-400" : "bg-emerald-400",
              )}
              style={{ width: `${budget > 0 ? Math.max(pct, spent > 0 ? 4 : 0) : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-white/75">
            {budget > 0
              ? over
                ? `חריגה של ${formatMoney(spent - budget, trip.currency)}`
                : `נותרו ${formatMoney(budget - spent, trip.currency)} · ${Math.round(pct)}% נוצלו`
              : "לא הוגדר תקציב"}
          </p>
        </div>
      </div>
    </Link>
  );
}
