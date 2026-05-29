import { createFileRoute } from "@tanstack/react-router";
import { TransactionForm } from "@/components/TransactionForm";

export const Route = createFileRoute("/transactions/new")({
  head: () => ({ meta: [{ title: "תנועה חדשה" }] }),
  component: () => <TransactionForm />,
});
