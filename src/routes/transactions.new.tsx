import { createFileRoute } from "@tanstack/react-router";
import { TransactionForm } from "@/components/TransactionForm";

export const Route = createFileRoute("/transactions/new")({
  validateSearch: (search: Record<string, unknown>): { trip?: string; date?: string } => ({
    trip: typeof search.trip === "string" ? search.trip : undefined,
    date:
      typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
        ? search.date
        : undefined,
  }),
  head: () => ({ meta: [
    { title: "תנועה חדשה וסריקת חשבונית — Family Spend" },
    { name: "description", content: "הוספת תנועה משפחתית מצילום חשבונית או מהגלריה, עם פרטי העסק והתשלום." },
    { property: "og:title", content: "תנועה חדשה — Family Spend" },
    { property: "og:description", content: "סריקת חשבונית והוספת הוצאה למשק הבית." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewTransaction,
});

function NewTransaction() {
  const { trip, date } = Route.useSearch();
  return <TransactionForm defaultTripId={trip ?? null} defaultDate={date} />;
}
