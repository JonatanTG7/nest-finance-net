import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthHebrew, parseMonthKey, shiftMonth } from "@/lib/finance";

export function MonthPicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const date = parseMonthKey(value);
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-card border h-10 px-1 ${className}`}
    >
      {/* RTL: previous month should be on the right (chevron pointing right) */}
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, -1))}
        aria-label="חודש קודם"
        className="size-8 rounded-full hover:bg-accent flex items-center justify-center"
      >
        <ChevronRight className="size-4" />
      </button>
      <span className="px-2 text-sm font-semibold tabular-nums min-w-[8rem] text-center">
        {formatMonthHebrew(date)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        aria-label="חודש הבא"
        className="size-8 rounded-full hover:bg-accent flex items-center justify-center"
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}
