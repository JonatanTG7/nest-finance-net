import { useEffect, useState } from "react";
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
import { KID_PORTFOLIO_NAME } from "@/lib/ib";
import { OwnerPicker } from "@/components/investments/OwnerPicker";
import { SHARED_OWNER, type OwnerId } from "@/lib/person";

/** Create a new IB portfolio (e.g. the child's portfolio). */
export function NewPortfolioDialog({
  open,
  onOpenChange,
  existingNames,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingNames: string[];
  onSave: (name: string, owner: OwnerId) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<OwnerId>(SHARED_OWNER);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Default suggestion: the child's portfolio. If it already exists, leave
    // the field empty so the user picks another name.
    setName(existingNames.includes(KID_PORTFOLIO_NAME) ? "" : KID_PORTFOLIO_NAME);
    setOwner(SHARED_OWNER);
  }, [open, existingNames]);

  const duplicate = name.trim() !== "" && existingNames.includes(name.trim());

  async function submit() {
    if (!name.trim() || duplicate) return;
    setBusy(true);
    try {
      await onSave(name.trim(), owner);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>תיק מסחר חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="portfolio-name">שם התיק</Label>
          <Input
            id="portfolio-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={KID_PORTFOLIO_NAME}
            maxLength={100}
          />
          {duplicate && <p className="text-xs text-destructive">כבר קיים תיק בשם הזה</p>}
          <Label htmlFor="portfolio-owner">בעלים</Label>
          <OwnerPicker value={owner} onChange={setOwner} ariaLabel="בעלים" />
          <p className="text-xs text-muted-foreground">
            כל תיק מחזיק את המניות והמזומן שלו בנפרד, ומופיע ככרטיס נפרד במסך הנכסים. תיק של אדם
            מסוים מופיע בלשונית שלו.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim() || duplicate}>
            צור תיק
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
