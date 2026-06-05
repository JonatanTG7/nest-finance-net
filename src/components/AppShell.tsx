import { Link, useLocation } from "@tanstack/react-router";
import { Home, ListIcon, Plus, Settings as SettingsIcon, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useMyHousehold } from "@/lib/household";

type NavTo = "/" | "/transactions" | "/investments" | "/settings";
type NavItem = { to: NavTo; label: string; icon: typeof Home; exact?: boolean };

const items: NavItem[] = [
  { to: "/", label: "בית", icon: Home, exact: true },
  { to: "/transactions", label: "תנועות", icon: ListIcon },
  { to: "/investments", label: "השקעות", icon: TrendingUp },
  { to: "/settings", label: "הגדרות", icon: SettingsIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { data: household } = useMyHousehold();

  const isActive = (it: NavItem) =>
    it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");

  if (isMobile) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
        <main className="flex-1 pb-28">{children}</main>

        <Link
          to="/transactions/new"
          aria-label="הוספת תנועה"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 size-16 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="size-7" />
        </Link>

        <nav
          className="fixed bottom-0 inset-x-0 z-10 border-t bg-card/95 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="flex items-stretch justify-around h-16">
            {items.map((it) => {
              const Icon = it.icon;
              const active = isActive(it);
              return (
                <li key={it.to} className="flex-1">
                  <Link
                    to={it.to}
                    className={cn(
                      "h-full flex flex-col items-center justify-center gap-1 text-xs",
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

  // Desktop: RTL sidebar on the right + wider content area
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex">
      <aside className="w-64 shrink-0 border-l bg-card/40 flex flex-col">
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
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:opacity-95"
          >
            <Plus className="size-5" />
            הוסף תנועה
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
