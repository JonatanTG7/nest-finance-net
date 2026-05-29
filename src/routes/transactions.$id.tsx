import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { TransactionForm } from "@/components/TransactionForm";
import { fetchTransaction } from "@/lib/db";

export const Route = createFileRoute("/transactions/$id")({
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
      <MobileLayout>
        <p className="p-6 text-center text-sm text-muted-foreground">טוען…</p>
      </MobileLayout>
    );
  }
  if (!data) {
    return (
      <MobileLayout>
        <p className="p-6 text-center text-sm text-muted-foreground">לא נמצא</p>
      </MobileLayout>
    );
  }
  return <TransactionForm existing={data} />;
}
