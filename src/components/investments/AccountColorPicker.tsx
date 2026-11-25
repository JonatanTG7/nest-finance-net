import { ACCOUNT_COLORS, kindColor } from "@/lib/private-accounts";

/**
 * The 18-color swatch row for picking an account's card color — the same
 * palette the app uses for categories (CategoryDialog). The selected
 * swatch is the hand-picked color, or the kind default when none was
 * picked yet. Shared by the private-account dialog and the index
 * "new account" dialog so both offer the same choices.
 */
export function AccountColorPicker({
  value,
  kind,
  onChange,
}: {
  /** Hand-picked color, or null/undefined to show the kind default. */
  value: string | null | undefined;
  kind: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="block text-sm">
      <span className="block mb-1.5">צבע</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="צבע החשבון">
        {ACCOUNT_COLORS.map((c) => {
          const selected = (value ?? kindColor(kind)) === c;
          return (
            <button
              key={c}
              type="button"
              aria-label={`צבע ${c}`}
              aria-pressed={selected}
              onClick={() => onChange(c)}
              className={
                selected
                  ? "size-8 rounded-full ring-2 ring-offset-2 ring-foreground"
                  : "size-8 rounded-full hover:scale-110 transition"
              }
              style={{ background: c }}
            />
          );
        })}
      </div>
    </div>
  );
}
