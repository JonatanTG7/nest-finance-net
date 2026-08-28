import { createFileRoute } from "@tanstack/react-router";
import { TripForm } from "@/components/trips/TripForm";

export const Route = createFileRoute("/travel/new")({
  head: () => ({ meta: [{ title: "טיול חדש" }] }),
  component: () => <TripForm />,
});
