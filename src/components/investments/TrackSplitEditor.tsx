import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrackPicker } from "@/components/investments/TrackPicker";
import { saveTrackAllocations, type TrackAllocationRow } from "@/lib/track-splits";
import { rowFromAllocation, rowsToInputs, splitCanSave, type PickerRow } from "@/lib/track-picker";
import { usePrivacyMode } from "@/lib/privacy";

/**
 * Edit a private account's track split: pick tracks from preset chips
 * or add custom ones, set each track's share of the balance (and,
 * optionally, a different share of future deposits — the Migdal model)
 * and its annual return. The live sum indicator warns when a split is
 * incomplete (allowed — the user may only know some tracks) and blocks
 * saving when a split exceeds 100% (always a mistake). An empty
 * percentage means "unknown", not zero.
 */
export function TrackSplitEditor({
  open,
  onOpenChange,
  accountId,
  accountName,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  initial: TrackAllocationRow[];
}) {
  const qc = useQueryClient();
  const { hidden } = usePrivacyMode();
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [depositsEnabled, setDepositsEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(initial.map(rowFromAllocation));
    setDepositsEnabled(initial.some((a) => a.allocation_pct_deposits != null));
  }, [open, initial]);

  const canSave = splitCanSave(rows, depositsEnabled);

  const save = useMutation({
    mutationFn: async () => {
      await saveTrackAllocations(accountId, rowsToInputs(rows, depositsEnabled ? "keep" : "clear"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["track-allocations", accountId] });
      qc.invalidateQueries({ queryKey: ["track-allocations", "all"] });
      toast.success("פיצול המסלולים נשמר");
      onOpenChange(false);
    },
    onError: () => toast.error("לא הצלחנו לשמור את הפיצול"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>פיצול מסלולים — {accountName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <TrackPicker
            rows={rows}
            onChange={setRows}
            depositsEnabled={depositsEnabled}
            onDepositsEnabledChange={setDepositsEnabled}
            showDepositsToggle
            showReturn
            hidden={hidden}
          />

          {!canSave && (
            <p className="text-xs text-destructive">
              אי אפשר לשמור: לכל מסלול צריך שם, ואסור שהסכום יעבור 100%.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              ביטול
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!canSave || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "שומר…" : "שמור פיצול"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
