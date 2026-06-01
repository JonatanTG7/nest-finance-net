import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TransactionForm } from "@/components/TransactionForm";
import { fetchTransaction } from "@/lib/db";

export const Route = createFileRoute("/transactions/$id_/edit")({
  head: () => ({ meta: [{ title: "עריכת תנועה" }] }),
  component: EditTx,
});

function EditTx() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => fetchTransaction(id),
  });
  if (isLoading) {
    return (
      <AppShell>
        <p className="p-6 text-center text-sm text-muted-foreground">טוען…</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell>
        <p className="p-6 text-center text-sm text-muted-foreground">לא נמצא</p>
      </AppShell>
    );
  }
  return <TransactionForm existing={data} />;
}
