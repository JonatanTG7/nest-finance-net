import { Link, useLocation } from "@tanstack/react-router";
import { Home, ListIcon, Plane, Plus, Settings as SettingsIcon, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyHousehold } from "@/lib/household";

type NavTo = "/" | "/transactions" | "/travel" | "/investments" | "/settings";
type NavItem = { to: NavTo; label: string; icon: typeof Home; exact?: boolean };

const items: NavItem[] = [
  { to: "/", label: "בית", icon: Home, exact: true },
  { to: "/transactions", label: "תנועות", icon: ListIcon },
  { to: "/investments", label: "השקעות", icon: TrendingUp },
  { to: "/travel", label: "טיולים", icon: Plane },
  { to: "/settings", label: "הגדרות", icon: SettingsIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { data: household } = useMyHousehold();
  const showQuickAdd = pathname !== "/transactions/new" && !pathname.startsWith("/investments/ib");

  // On a trip's own dashboard, "add transaction" should pre-link to that trip.
  const tripMatch = pathname.match(/^\/travel\/([^/]+)$/);
  const addTransactionSearch = tripMatch ? { trip: tripMatch[1] } : undefined;

  const isActive = (it: NavItem) =>
    it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
      <aside className="hidden md:flex w-64 shrink-0 border-l bg-card/40 flex-col">
        <div className="px-6 py-6">
          <p className="text-xs text-muted-foreground">כסף משפחתי</p>
          <h1 className="text-xl font-bold mt-1 truncate">{household?.name ?? "משק הבית שלי"}</h1>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = isActive(it);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-3 px-3 h-11 rounded-xl text-sm transition",
                  active
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "hover:bg-accent text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Link
            to="/transactions/new"
            search={addTransactionSearch}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:opacity-95"
          >
            <Plus className="size-5" />
            הוסף תנועה
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-24 md:pb-0">
        <div className="md:max-w-6xl md:mx-auto md:px-8 md:py-6">{children}</div>
      </main>

      {showQuickAdd && (
        <Link
          to="/transactions/new"
          search={addTransactionSearch}
          aria-label="הוספת תנועה"
          className="fixed bottom-20 left-1/2 z-20 flex size-16 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-95 md:hidden"
        >
          <Plus className="size-7" />
        </Link>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex h-16 items-stretch justify-around">
          {items.map((it) => {
            const Icon = it.icon;
            const active = isActive(it);
            return (
              <li key={it.to} className="flex-1">
                <Link
                  to={it.to}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-xs",
                    active ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  <span>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
