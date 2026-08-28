import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const { data: profile } = useMyProfile();
  const { data: household } = useMyHousehold();
  const invalidate = useInvalidateMe();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["me", "household_members", profile?.household_id],
    queryFn: () => listHouseholdMembers(profile!.household_id!),
    enabled: !!profile?.household_id,
  });

  if (!profile?.household_id || !household) return null;

  const isSoleMember = members.length <= 1;
  const householdName = household.name ?? "";

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
      setConfirmOpen(false);
      setConfirmText("");
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
        <button
          onClick={() => setConfirmOpen(true)}
          className="w-full h-11 rounded-xl border border-destructive text-destructive font-semibold text-sm"
        >
          {isSoleMember ? "מחק את משק הבית והתחל מחדש" : "עזוב את משק הבית והתחל מחדש"}
        </button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(v) => {
          setConfirmOpen(v);
          if (!v) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSoleMember ? "למחוק את משק הבית לצמיתות?" : "לעזוב את משק הבית?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSoleMember
                ? `הפעולה תמחק לצמיתות את "${householdName}" ואת כל התנועות, ההשקעות והנתונים שבו. לא ניתן לשחזר. חשבון הגוגל שלך יישאר פעיל — פשוט תוכל ליצור או להצטרף למשק בית חדש.`
                : `תוסר מ-"${householdName}" ותוכל ליצור או להצטרף למשק בית אחר. הנתונים הקיימים לא יימחקו.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

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

          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (isSoleMember && confirmText.trim() !== householdName)}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSoleMember ? "מחק לצמיתות" : "עזוב"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
