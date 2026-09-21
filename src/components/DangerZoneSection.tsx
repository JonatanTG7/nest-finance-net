import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  useMyProfile,
  useMyHousehold,
  useInvalidateMe,
  leaveHousehold,
  deleteMyHousehold,
  listHouseholdMembers,
} from "@/lib/household";
import { useQuery } from "@tanstack/react-query";

export function DangerZoneSection() {
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { data: household, isLoading: householdLoading } = useMyHousehold();
  const invalidate = useInvalidateMe();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["me", "household_members", profile?.household_id],
    queryFn: () => listHouseholdMembers(profile!.household_id!),
    enabled: !!profile?.household_id,
  });

  if (profileLoading || householdLoading) {
    return (
      <section className="px-5 mt-8">
        <p className="text-sm text-muted-foreground text-center py-6">טוען…</p>
      </section>
    );
  }
  if (!profile?.household_id || !household) return null;

  const isSoleMember = members.length <= 1;
  const householdName = household.name ?? "";

  function closeConfirm() {
    setConfirmOpen(false);
    setConfirmText("");
  }

  async function confirm() {
    setBusy(true);
    try {
      if (isSoleMember) {
        await deleteMyHousehold();
        toast.success("משק הבית נמחק. אפשר להתחיל מחדש");
      } else {
        await leaveHousehold();
        toast.success("עזבת את משק הבית. אפשר להצטרף לאחר או ליצור חדש");
      }
      invalidate();
      closeConfirm();
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בביצוע הפעולה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-4" />
        אזור מסוכן
      </h2>
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {isSoleMember
            ? "אתה החבר היחיד במשק הבית הזה. אפשר למחוק אותו לצמיתות (כל התנועות, ההשקעות והנתונים) ולהתחיל מחדש — למשל כדי ליצור משק בית חדש עם בן/בת הזוג."
            : "אפשר לעזוב את משק הבית הזה ולהתחיל מחדש (ליצור חדש או להצטרף לאחר עם קוד הזמנה). הנתונים הקיימים יישארו אצל שאר החברים."}
        </p>

        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full h-11 rounded-xl border border-destructive text-destructive font-semibold text-sm"
          >
            {isSoleMember ? "מחק את משק הבית והתחל מחדש" : "עזוב את משק הבית והתחל מחדש"}
          </button>
        ) : (
          // Confirmation happens inline, right here — no modal/portal, so
          // there's nothing that can silently fail to appear.
          <div className="rounded-xl border border-destructive/40 bg-background p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">
                {isSoleMember ? "למחוק את משק הבית לצמיתות?" : "לעזוב את משק הבית?"}
              </p>
              <button
                type="button"
                onClick={closeConfirm}
                className="p-1 -m-1 text-muted-foreground shrink-0"
                aria-label="ביטול"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {isSoleMember
                ? `הפעולה תמחק לצמיתות את "${householdName}" ואת כל התנועות, ההשקעות והנתונים שבו. לא ניתן לשחזר. חשבון הגוגל שלך יישאר פעיל — פשוט תוכל ליצור או להצטרף למשק בית חדש.`
                : `תוסר מ-"${householdName}" ותוכל ליצור או להצטרף למשק בית אחר. הנתונים הקיימים לא יימחקו.`}
            </p>

            {isSoleMember && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  הקלד/י את שם משק הבית ("{householdName}") לאישור:
                </label>
                <Input
                  dir="rtl"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="flex-1 h-10 rounded-xl border text-sm font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy || (isSoleMember && confirmText.trim() !== householdName)}
                onClick={() => void confirm()}
                className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "מבצע…" : isSoleMember ? "מחק לצמיתות" : "עזוב"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
