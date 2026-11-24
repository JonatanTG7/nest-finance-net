import { SHARED_OWNER, useHouseholdPersons, useMemberLabels, type OwnerId } from "@/lib/person";
import { cn } from "@/lib/utils";

/**
 * Owner select for an account: Shared, or any person in the household
 * (login members + added people). Used everywhere an account's owner is
 * picked — at creation and when reassigning later. Renders only the
 * <select>; callers wrap it in their own label.
 */
export function OwnerPicker({
  value,
  onChange,
  ariaLabel = "בעלים",
  className,
}: {
  value: OwnerId;
  onChange: (owner: OwnerId) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const { persons } = useHouseholdPersons();
  const labels = useMemberLabels();
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full h-10 border rounded-md bg-background px-3", className)}
    >
      <option value={SHARED_OWNER}>{labels[SHARED_OWNER]}</option>
      {persons.map((p) => (
        <option key={p.person} value={p.person}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
