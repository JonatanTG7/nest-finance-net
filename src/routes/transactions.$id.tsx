import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { deleteTransaction, fetchTransaction } from "@/lib/db";
import { formatILS, txTypeLabel } from "@/lib/finance";
import { personLabel } from "@/lib/person";

export const Route = createFileRoute("/transactions/$id")({
  head: () => ({ meta: [{ title: "פרטי תנועה" }] }),
  component: ViewTx,
});

function ViewTx() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: tx, isLoading } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => fetchTransaction(id),
  });

  async function handleDelete() {
    if (!tx) return;
    if (!confirm("למחוק את התנועה?")) return;
    try {
      await deleteTransaction(tx.id);
      toast.success("נמחק");
      navigate({ to: "/transactions" });
    } catch {
      toast.error("שגיאה במחיקה");
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="p-6 text-center text-sm text-muted-foreground">טוען…</p>
      </AppShell>
    );
  }
  if (!tx) {
    return (
      <AppShell>
        <p className="p-6 text-center text-sm text-muted-foreground">לא נמצא</p>
      </AppShell>
    );
  }

  const isIn = tx.type === "income";
  const color = tx.category?.color ?? "#888";
  const tags = tx.transaction_tags?.map((tt) => tt.tag.name) ?? [];

  return (
    <AppShell>
      <div className="px-5 md:px-0 pt-6 pb-8 max-w-2xl mx-auto space-y-5">
        <header className="flex items-center justify-between">
          <Link to="/transactions" className="text-sm text-muted-foreground flex items-center gap-1">
            <ArrowRight className="size-4" />
            חזרה
          </Link>
          <div className="flex gap-2">
            <Link
              to="/transactions/$id_/edit"
              params={{ id: tx.id }}
              className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5"
            >
              <Pencil className="size-4" />
              ערוך
            </Link>
            <button
              onClick={handleDelete}
              className="h-10 px-3 rounded-full bg-destructive/10 text-destructive text-sm font-semibold flex items-center gap-1.5"
            >
              <Trash2 className="size-4" />
              מחק
            </button>
          </div>
        </header>

        {/* Hero amount */}
        <div className="rounded-3xl border bg-card p-6 text-center">
          <div
            className="mx-auto size-14 rounded-full flex items-center justify-center text-white text-lg font-bold mb-3"
            style={{ background: color }}
          >
            {tx.title.slice(0, 1)}
          </div>
          <h1 className="text-xl font-semibold">{tx.title}</h1>
          <p className={`text-4xl font-bold mt-3 tabular-nums ${isIn ? "text-income" : "text-foreground"}`}>
            {isIn ? "+" : "−"}{formatILS(Number(tx.amount_ils))}
          </p>
          {tx.currency !== "ILS" && (
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              {Number(tx.amount).toLocaleString("he-IL")} {tx.currency} · שער {Number(tx.fx_rate_to_ils)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border bg-card divide-y">
          <Detail label="סוג">{txTypeLabel[tx.type]}</Detail>
          <Detail label="קטגוריה">
            {tx.category ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: tx.category.color }} />
                {tx.category.name}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Detail>
          {tx.investment_account && (
            <Detail label="חשבון השקעה">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: tx.investment_account.color }} />
                {tx.investment_account.name}
              </span>
            </Detail>
          )}
          <Detail label="תאריך">
            {new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(tx.occurred_at))}
          </Detail>
          <Detail label="הוזן ע״י">{personLabel[tx.entered_by]}</Detail>
          <Detail label="תגיות">
            {tags.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="px-2.5 h-6 inline-flex items-center rounded-full bg-accent text-accent-foreground text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Detail>
          {tx.note && <Detail label="הערה"><span className="whitespace-pre-wrap">{tx.note}</span></Detail>}
        </div>
      </div>
    </AppShell>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-end">{children}</span>
    </div>
  );
}
