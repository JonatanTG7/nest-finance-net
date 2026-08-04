import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { BalanceDialog } from "@/components/investments/BalanceDialog";
import { BalanceHistoryList } from "@/components/investments/BalanceHistoryList";
import { fetchInvestmentAccounts } from "@/lib/db";
import { fetchBalanceHistory, setAccountBalanceIls } from "@/lib/balance_history";
import { formatILS, formatMoney } from "@/lib/finance";
import { fetchUsdIlsRate } from "@/lib/fx";
import { IB_ACCOUNT_ID } from "@/lib/ib";

export const Route = createFileRoute("/investments/$accountId")({
  head: () => ({ meta: [{ title: "חשבון השקעה" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { accountId } = Route.useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const { data: history = [] } = useQuery({
    queryKey: ["balance_history", accountId],
    queryFn: () => fetchBalanceHistory(accountId),
  });
  const { data: fxRate } = useQuery({
    queryKey: ["fx", "usdils"],
    queryFn: fetchUsdIlsRate,
    staleTime: 60 * 60 * 1000,
  });

  const currentIls = Number(account?.starting_balance_ils ?? account?.starting_balance ?? 0);
  const currentNative = Number(account?.starting_balance ?? 0);

  const save = useMutation({
    mutationFn: (newIls: number) =>
      setAccountBalanceIls({
        accountId,
        currency: account?.currency ?? "ILS",
        oldIls: currentIls,
        newIls,
        fxRate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      qc.invalidateQueries({ queryKey: ["investments", "txs"] });
      qc.invalidateQueries({ queryKey: ["balance_history", accountId] });
      toast.success("הסכום עודכן");
    },
    onError: (e) => {
      console.error(e);
      toast.error("שגיאה בעדכון הסכום");
    },
  });

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/investments" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {account?.name ?? (isLoading ? "טוען…" : "חשבון לא נמצא")}
          </h1>
          <p className="text-xs text-muted-foreground">
            חשבון השקעה / חיסכון · {account?.currency ?? "ILS"}
          </p>
        </div>
      </header>

      {accountId === IB_ACCOUNT_ID ? (
        <section className="px-5 md:px-0">
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <p className="mb-3">חשבון Interactive Brokers מנוהל בעמוד תיק ההשקעות.</p>
            <Link to="/investments/ib">
              <Button size="sm">פתח את תיק ה-IB</Button>
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="px-5 md:px-0">
            <div className="rounded-3xl bg-gradient-to-br from-savings to-savings/70 text-foreground p-6">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ background: account?.color ?? "#eab308" }}
                />
                <p className="text-sm opacity-80">סכום נוכחי</p>
              </div>
              <p className="text-4xl font-bold mt-2 tabular-nums">{formatILS(currentIls)}</p>
              {account && account.currency !== "ILS" && (
                <p className="text-sm opacity-70 mt-1 tabular-nums" dir="ltr">
                  ≈ {formatMoney(currentNative, account.currency)}
                </p>
              )}
              <div className="mt-5">
                <Button size="sm" onClick={() => setOpen(true)} disabled={!account}>
                  <Pencil className="size-4 me-1" />
                  עדכון סכום
                </Button>
              </div>
            </div>
          </section>

          <BalanceDialog
            open={open}
            onOpenChange={setOpen}
            accountName={account?.name ?? ""}
            currentIls={currentIls}
            onSave={async (n) => {
              await save.mutateAsync(n);
            }}
          />
        </>
      )}

      <BalanceHistoryList rows={history} />
    </AppShell>
  );
}
