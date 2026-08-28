import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TripForm } from "@/components/trips/TripForm";
import { fetchTrip } from "@/lib/trips";

export const Route = createFileRoute("/travel/$tripId/edit")({
  head: () => ({ meta: [{ title: "עריכת טיול" }] }),
  component: EditTrip,
});

function EditTrip() {
  const { tripId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => fetchTrip(tripId),
    enabled: !!tripId,
  });

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
      </AppShell>
    );
  }
  if (!data) return null;
  return <TripForm existing={data} />;
}
