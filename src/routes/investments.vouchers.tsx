import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { VoucherUploadDialog } from "@/components/vouchers/VoucherUploadDialog";
import { VoucherDetailDialog } from "@/components/vouchers/VoucherDetailDialog";
import { fetchVouchers, isExpired, type Voucher } from "@/lib/vouchers";
import { formatILS } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investments/vouchers")({
  head: () => ({
    meta: [
      { title: "שוברים — כסף משפחתי" },
      { name: "description", content: "מעקב על שוברים וגיפט קארד: יתרה, ברקוד ותוקף." },
      { property: "og:title", content: "שוברים — כסף משפחתי" },
      { property: "og:description", content: "מעקב על שוברים וגיפט קארד: יתרה, ברקוד ותוקף." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VouchersPage,
});

function matches(label: string, q: string): boolean {
  const hay = label.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function VouchersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Voucher | null>(null);

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ["vouchers"],
    queryFn: fetchVouchers,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["vouchers"] });

  const filtered = useMemo(() => {
    const needle = q.trim();
    return needle ? vouchers.filter((v) => matches(v.label, needle)) : vouchers;
  }, [vouchers, q]);

  const totals = useMemo(() => {
    const remaining = filtered.reduce((a, v) => a + Number(v.remaining_value), 0);
    return { count: filtered.length, remaining };
  }, [filtered]);

  const groups = useMemo(() => {
    if (!q.trim()) return [];
    const m = new Map<string, { label: string; count: number; remaining: number }>();
    for (const v of filtered) {
      const cur = m.get(v.label) ?? { label: v.label, count: 0, remaining: 0 };
      cur.count += 1;
      cur.remaining += Number(v.remaining_value);
      m.set(v.label, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.remaining - a.remaining);
  }, [filtered, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, Voucher[]>();
    for (const v of filtered) {
      const arr = m.get(v.occurred_at) ?? [];
      arr.push(v);
      m.set(v.occurred_at, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/investments"
            className="size-9 rounded-xl border bg-card flex items-center justify-center"
            aria-label="חזרה"
          >
            <ChevronRight className="size-4" />
          </Link>
          <h1 className="text-2xl font-bold flex-1">שוברים</h1>
          <button
            onClick={() => setAddOpen(true)}
            className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"
            aria-label="שובר חדש"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שובר: תו זהב, תן ביס…"
            className="w-full rounded-xl bg-card border ps-4 pe-10 h-11 text-base outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </header>

      <section className="px-5 md:px-0 mt-2 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">שוברים</p>
          <p className="text-xl font-bold tabular-nums mt-1">{totals.count}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">סך יתרה</p>
          <p className="text-xl font-bold tabular-nums mt-1">{formatILS(totals.remaining)}</p>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="px-5 md:px-0 mt-3 flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <span
              key={g.label}
              className="shrink-0 rounded-full border bg-card px-3 h-9 flex items-center gap-2 text-xs"
            >
              <span className="font-medium">{g.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {g.count} · {formatILS(g.remaining)}
              </span>
            </span>
          ))}
        </section>
      )}

      <div className="px-5 md:px-0 mt-4 pb-6 space-y-5">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">טוען…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">לא נמצאו שוברים</p>
        ) : (
          grouped.map(([date, items]) => (
            <div key={date}>
              <p className="text-xs text-muted-foreground mb-2">{formatDate(date)}</p>
              <ul className="rounded-2xl bg-card border divide-y">
                {items.map((v) => {
                  const used = Number(v.remaining_value) <= 0;
                  const expired = isExpired(v);
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => setSelected(v)}
                        className="w-full flex items-center gap-3 p-4 text-start hover:bg-accent/50"
                      >
                        {v.image_url ? (
                          <img
                            src={v.image_url}
                            alt={v.label}
                            className="size-11 rounded-xl object-cover shrink-0 border"
                          />
                        ) : (
                          <span className="size-11 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0">
                            🎟️
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{v.label}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {used && (
                              <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                נוצל
                              </span>
                            )}
                            {expired && (
                              <span className="text-[10px] rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                                פג תוקף
                              </span>
                            )}
                            {v.barcode && (
                              <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                                {v.barcode.slice(-6)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          className={cn("text-sm font-semibold tabular-nums", used && "text-muted-foreground")}
                          dir="ltr"
                        >
                          {Number(v.remaining_value)} / {Number(v.face_value)} ₪
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <VoucherUploadDialog open={addOpen} onOpenChange={setAddOpen} onSaved={invalidate} />
      <VoucherDetailDialog
        voucher={selected}
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
        onChanged={invalidate}
      />
    </AppShell>
  );
}
