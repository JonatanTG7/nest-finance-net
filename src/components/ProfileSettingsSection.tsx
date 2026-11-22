import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2, User } from "lucide-react";
import { removeMyAvatar, uploadMyAvatar, useResolvedAvatarUrl } from "@/lib/avatar";
import { updateMyProfile, useInvalidateMe, useMyProfile } from "@/lib/household";

/**
 * Settings → Personal → My profile: the signed-in member's picture and
 * display name. The picture is what the person tabs on the assets screen
 * show (with the initial as fallback); the name is what those tabs and
 * the "who am I" picker call the member. Generic: everything here belongs
 * to whoever is signed in.
 */
export function ProfileSettingsSection() {
  const { data: profile, isLoading } = useMyProfile();
  const invalidate = useInvalidateMe();
  const { data: avatarUrl } = useResolvedAvatarUrl(profile?.avatar_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (isLoading || nameLoaded) return;
    setNameDraft(profile?.display_name ?? "");
    setNameLoaded(true);
  }, [profile, isLoading, nameLoaded]);

  const initial = (profile?.display_name ?? "").trim().charAt(0) || "?";
  const hasAvatar = profile?.avatar_url != null;
  const nameChanged = nameDraft.trim() !== (profile?.display_name ?? "").trim();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await uploadMyAvatar(file);
      invalidate();
      toast.success("התמונה הועלתה");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "שגיאה בהעלאת התמונה");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await removeMyAvatar();
      invalidate();
      toast.success("התמונה הוסרה");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בהסרת התמונה");
    } finally {
      setRemoving(false);
    }
  }

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) {
      toast.error("נא להזין שם");
      return;
    }
    setSavingName(true);
    try {
      await updateMyProfile({ display_name: name });
      invalidate();
      toast.success("השם נשמר");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירת השם");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <User className="size-4" />
        הפרופיל שלי
      </h2>
      <div className="rounded-2xl bg-card border p-4 space-y-4">
        <div className="flex items-center gap-4">
          <span
            className="relative size-20 rounded-full bg-primary/15 flex items-center justify-center text-3xl font-bold text-primary shrink-0 overflow-hidden"
            aria-hidden
          >
            {initial}
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                className="absolute inset-0 size-20 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </span>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60"
            >
              <Camera className="size-4" />
              {uploading ? "מעלה…" : hasAvatar ? "החלף תמונה" : "העלה תמונה"}
            </button>
            {hasAvatar && (
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className="h-11 px-4 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {removing ? "מסיר…" : "הסר תמונה"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              aria-label="בחר תמונת פרופיל"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          התמונה מוצגת בכרטיסיות בני הבית במסך הנכסים. עד 5MB.
        </p>

        <div>
          <label className="text-xs text-muted-foreground">שם לתצוגה</label>
          <div className="mt-1 flex gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={100}
              placeholder="השם שלך"
              className="flex-1 h-11 rounded-xl bg-background border px-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingName || !nameChanged}
              className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
            >
              {savingName ? "שומר…" : "שמור"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
