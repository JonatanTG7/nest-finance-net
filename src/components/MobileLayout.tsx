import { Link, useLocation } from "@tanstack/react-router";
import { Home, ListIcon, Plus, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { to: "/" | "/transactions" | "/settings"; label: string; icon: typeof Home; exact?: boolean };
const items: NavItem[] = [
  { to: "/", label: "בית", icon: Home, exact: true },
  { to: "/transactions", label: "תנועות", icon: ListIcon },
  { to: "/settings", label: "הגדרות", icon: SettingsIcon },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <main className="flex-1 pb-28">{children}</main>

      {/* Floating add button */}
      <Link
        to="/transactions/new"
        aria-label="הוספת תנועה"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 size-16 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="size-7" />
      </Link>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 inset-x-0 z-10 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch justify-around h-16">
          {items.map((it) => {
            const Icon = it.icon;
            const active = it.exact
              ? pathname === it.to
              : pathname === it.to || pathname.startsWith(it.to + "/");
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
