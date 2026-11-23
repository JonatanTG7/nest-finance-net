import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecurringTab = "expenses" | "income";

const TABS: {
  id: RecurringTab;
  label: string;
  to: "/subscriptions" | "/recurring-income";
  Icon: typeof ArrowDownToLine;
}[] = [
  { id: "expenses", label: "הוצאות קבועות", to: "/subscriptions", Icon: ArrowUpFromLine },
  { id: "income", label: "הכנסות קבועות", to: "/recurring-income", Icon: ArrowDownToLine },
];

/** Shared tab bar between the subscriptions center and the recurring-income screen (same style as the Settings tabs). */
export function RecurringTabs({ active }: { active: RecurringTab }) {
  return (
    <nav className="flex gap-6 border-b text-base" aria-label="קבועות">
      {TABS.map(({ id, label, to, Icon }) => (
        <Link
          key={id}
          to={to}
          className={cn(
            "pb-2 -mb-px border-b-2 flex items-center gap-1.5",
            active === id
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
