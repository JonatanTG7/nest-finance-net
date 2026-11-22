import { Link } from "@tanstack/react-router";
import { ChevronLeft, User } from "lucide-react";
import { formatILS } from "@/lib/finance";
import { maskAmountText } from "@/lib/privacy";
import type { HouseholdPerson } from "@/lib/person";

/**
 * Entry card for one household member on the assets index: tapping it
 * opens that person's private tab (pension, study fund...). The accent
 * color comes from the card's position in the list, not from the member
 * — nothing here is tied to a specific person.
 */
export function PersonEntryCard({
  person,
  count,
  totalIls,
  color,
  hidden = false,
}: {
  person: HouseholdPerson;
  count: number;
  totalIls: number;
  color: string;
  /** Privacy mode: mask the total with asterisks. */
  hidden?: boolean;
}) {
  const initial = person.label.trim().charAt(0) || "?";
  return (
    <Link
      to="/investments/person/$person"
      params={{ person: person.person }}
      className="block active:scale-[0.99] transition-transform"
    >
      <div className="rounded-2xl border bg-card p-4 h-full">
        <div className="flex items-center gap-3">
          <span
            className="relative size-10 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 overflow-hidden"
            style={{ background: color }}
            aria-hidden
          >
            {initial}
            {person.avatarUrl && (
              // Avatar URLs are either the auth provider's photo (e.g.
              // Google) or a signed URL for an uploaded picture — both are
              // resolved in useHouseholdPersons. The initial stays
              // underneath: if the photo fails to load, hiding it reveals
              // the initial.
              <img
                src={person.avatarUrl}
                alt=""
                className="absolute inset-0 size-10 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{person.label}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="size-3" />
              {count === 0
                ? "אין חשבונות פרטיים"
                : count === 1
                  ? "חשבון פרטי אחד"
                  : `${count} חשבונות פרטיים`}
            </p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
        </div>
        <p className="text-2xl font-bold mt-3 tabular-nums">
          {maskAmountText(formatILS(totalIls), hidden)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">סך חשבונות פרטיים</p>
      </div>
    </Link>
  );
}
