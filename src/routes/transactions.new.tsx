import { createFileRoute } from "@tanstack/react-router";
import { TransactionForm } from "@/components/TransactionForm";

export const Route = createFileRoute("/transactions/new")({
  validateSearch: (search: Record<string, unknown>): { trip?: string } => ({
    trip: typeof search.trip === "string" ? search.trip : undefined,
  }),
  head: () => ({ meta: [{ title: "תנועה חדשה" }] }),
  component: NewTransaction,
});

function NewTransaction() {
  const { trip } = Route.useSearch();
  return <TransactionForm defaultTripId={trip ?? null} />;
}
