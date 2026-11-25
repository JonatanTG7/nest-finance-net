import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MAX_CUSTOM_FIELD_LABEL,
  MAX_CUSTOM_FIELD_VALUE,
  customFieldsCanSave,
  saveCustomFields,
  type CustomFieldInput,
  type CustomFieldRow,
} from "@/lib/account-details";

/**
 * Edit a private account's custom fields: free-text label + value rows
 * the owner adds themselves (fund number, contact, anything). Rows with
 * an empty label or value are dropped on save; a half-filled row blocks
 * saving. Changes are recorded in the account metadata history.
 */
export function CustomFieldsEditor({
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
  initial: CustomFieldRow[];
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<CustomFieldInput[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(initial.map((r) => ({ id: r.id, label: r.label, value: r.value })));
  }, [open, initial]);

  const canSave = customFieldsCanSave(rows);

  const save = useMutation({
    mutationFn: () => saveCustomFields(accountId, initial, rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-custom-fields", accountId] });
      qc.invalidateQueries({ queryKey: ["private-account-history", accountId] });
      toast.success("השדות הנוספים נשמרו");
      onOpenChange(false);
    },
    onError: () => toast.error("לא הצלחנו לשמור את השדות"),
  });

  const setRow = (index: number, patch: Partial<CustomFieldInput>) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>שדות נוספים — {accountName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              אין שדות נוספים. הוסיפו כל נתון שחשוב לכם על החשבון — מספר קופה, איש קשר, תאריך, כל
              דבר.
            </p>
          )}
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="flex items-start gap-2">
              <div className="flex-1 space-y-2 min-w-0">
                <Input
                  aria-label="שם השדה"
                  value={r.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                  maxLength={MAX_CUSTOM_FIELD_LABEL}
                  placeholder="שם השדה — לדוגמה: מספר קופה"
                />
                <Input
                  aria-label="ערך השדה"
                  value={r.value}
                  onChange={(e) => setRow(i, { value: e.target.value })}
                  maxLength={MAX_CUSTOM_FIELD_VALUE}
                  placeholder="ערך — לדוגמה: 168"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-destructive"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label={`מחק את השדה ${r.label || "החדש"}`}
                title="מחק שדה"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}
          >
            <Plus className="size-4" />
            הוסף שדה
          </Button>
          {!canSave && (
            <p className="text-xs text-destructive">
              אי אפשר לשמור: לכל שדה צריך גם שם וגם ערך — מלאו את שניהם או השאירו את השורה ריקה.
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
              {save.isPending ? "שומר…" : "שמור שדות"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
