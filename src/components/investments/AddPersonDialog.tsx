import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addHouseholdPerson,
  renameHouseholdPerson,
  useInvalidateHouseholdPeople,
  type HouseholdPersonRow,
} from "@/lib/household-people";

/**
 * Add / rename dialog for an added household person (a child with no app
 * login). Login members are never edited here — their names come from
 * their own profiles. Pass `existing` to rename, omit it to add.
 */
export function AddPersonDialog({
  open,
  onOpenChange,
  existing,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: HouseholdPersonRow | null;
  /** Called with the new person's id after a successful add. */
  onAdded?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const invalidate = useInvalidateHouseholdPeople();

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
  }, [open, existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        await renameHouseholdPerson(existing.id, name);
        return existing.id;
      }
      return addHouseholdPerson(name);
    },
    onSuccess: (id) => {
      invalidate();
      toast.success(existing ? "השם עודכן" : "האדם נוסף");
      onOpenChange(false);
      if (!existing) onAdded?.(id);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "לא הצלחנו לשמור. נסה שוב.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "שינוי שם" : "הוספת אדם למשק הבית"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-4"
        >
          <label className="block text-sm">
            שם
            <Input
              aria-label="שם"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="לדוגמה: איתן"
              autoFocus
            />
          </label>
          {!existing && (
            <p className="text-xs text-muted-foreground">
              אדם נוסף הוא מישהו בלי חשבון באפליקציה, כמו ילד — אפשר לשייך אליו חשבונות פרטיים (למשל
              תיק מסחר משלו), והם יופיעו בלשונית שלו.
            </p>
          )}
          <Button type="submit" disabled={save.isPending} className="w-full">
            {save.isPending ? "שומר…" : existing ? "שמור שם" : "הוסף אדם"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
