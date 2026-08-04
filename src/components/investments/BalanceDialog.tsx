import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/finance";

type Mode = "set" | "add" | "subtract";

const MODES: { key: Mode; label: string }[] = [
  { key: "set", label: "סכום חדש" },
  { key: "add", label: "הוספה" },
  { key: "subtract", label: "הפחתה" },
];

export function BalanceDialog({
  open,
  onOpenChange,
  accountName,
  currentIls,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountName: string;
  currentIls: number;
  onSave: (newIls: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("set");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("set");
      setValue("");
    }
  }, [open]);

  const nextIls = useMemo(() => {
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    if (mode === "set") return n;
    if (mode === "add") return currentIls + n;
    return currentIls - n;
  }, [value, mode, currentIls]);

  async function submit() {
    if (nextIls == null) return;
    setBusy(true);
    try {
      await onSave(Number(nextIls.toFixed(2)));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עדכון סכום · {accountName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">סכום נוכחי: </span>
            <span className="font-semibold tabular-nums">{formatILS(currentIls)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "h-11 rounded-xl border text-sm font-semibold transition",
                  mode === m.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bal">
              {mode === "set" ? "סכום חדש (₪)" : mode === "add" ? "סכום להוספה (₪)" : "סכום להפחתה (₪)"}
            </Label>
            <Input
              id="bal"
              type="number"
              inputMode="decimal"
              step="0.01"
              dir="ltr"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {nextIls != null && (
            <p className="text-xs text-muted-foreground">
              סכום לאחר השינוי:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatILS(nextIls)}
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={busy || nextIls == null}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
