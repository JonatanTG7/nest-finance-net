import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  fetchMyAuthEmail,
  saveEmailDigestPreference,
  useEmailDigestPreference,
  useInvalidateEmailDigestPreference,
  WEEKDAY_LABELS_HE,
} from "@/lib/email-digest";

type Draft = {
  email: string;
  enabled: boolean;
  weekly_enabled: boolean;
  weekly_weekday: number;
  monthly_enabled: boolean;
  monthly_day: string;
};

const emptyDraft: Draft = {
  email: "",
  enabled: true,
  weekly_enabled: false,
  weekly_weekday: 0,
  monthly_enabled: false,
  monthly_day: "1",
};

/**
 * Settings → Email: each household member sets their own digest
 * preferences — email address, on/off, weekly (weekday) and/or monthly
 * (day of month). Generic: the row belongs to the signed-in profile.
 */
export function EmailDigestSection() {
  const { data: prefs, isLoading } = useEmailDigestPreference();
  const invalidate = useInvalidateEmailDigestPreference();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (prefs) {
      setDraft({
        email: prefs.email,
        enabled: prefs.enabled,
        weekly_enabled: prefs.weekly_enabled,
        weekly_weekday: prefs.weekly_weekday ?? 0,
        monthly_enabled: prefs.monthly_enabled,
        monthly_day: String(prefs.monthly_day ?? 1),
      });
      setLoaded(true);
      return;
    }
    // No row yet: prefill the login email so saving is one tap.
    let cancelled = false;
    fetchMyAuthEmail()
      .then((email) => {
        if (!cancelled && email) setDraft((d) => ({ ...d, email }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [prefs, isLoading]);

  async function save() {
    const day = Number(draft.monthly_day);
    setSaving(true);
    try {
      await saveEmailDigestPreference({
        email: draft.email,
        enabled: draft.enabled,
        weekly_enabled: draft.weekly_enabled,
        weekly_weekday: draft.weekly_weekday,
        monthly_enabled: draft.monthly_enabled,
        monthly_day: draft.monthly_enabled ? day : null,
      });
      invalidate();
      toast.success("העדפות המייל נשמרו");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  const lastSent =
    prefs?.last_sent_at != null
      ? `${new Date(prefs.last_sent_at).toLocaleDateString("he-IL")} (${prefs.last_digest_kind === "monthly" ? "חודשי" : "שבועי"})`
      : null;

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Mail className="size-4" />
        מייל
      </h2>
      <div className="rounded-2xl bg-card border p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          סיכום תקופתי למייל: הוצאות מול תקציב, שינוי בשווי הנכסים, חיובים קרובים ורווח/הפסד ביומן
          המסחר.
        </p>

        {!loaded ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : (
          <>
            <div>
              <label className="text-xs text-muted-foreground">כתובת מייל לסיכומים</label>
              <input
                type="email"
                dir="ltr"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="name@example.com"
                maxLength={200}
                className="w-full h-11 mt-1 rounded-xl bg-background border px-3 text-sm outline-none text-left"
              />
            </div>

            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              קבל סיכומים במייל
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                aria-label="קבל סיכומים במייל"
              />
            </label>

            <div className={draft.enabled ? "space-y-4" : "space-y-4 opacity-50"}>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center justify-between gap-3 text-sm font-medium flex-1">
                  סיכום שבועי
                  <Switch
                    checked={draft.weekly_enabled}
                    onCheckedChange={(v) => setDraft({ ...draft, weekly_enabled: v })}
                    disabled={!draft.enabled}
                    aria-label="סיכום שבועי"
                  />
                </label>
                <select
                  value={draft.weekly_weekday}
                  onChange={(e) => setDraft({ ...draft, weekly_weekday: Number(e.target.value) })}
                  disabled={!draft.enabled || !draft.weekly_enabled}
                  aria-label="יום בשבוע לסיכום השבועי"
                  className="h-11 w-36 rounded-xl bg-background border px-3 text-sm outline-none disabled:opacity-60"
                >
                  {WEEKDAY_LABELS_HE.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center justify-between gap-3 text-sm font-medium flex-1">
                  סיכום חודשי
                  <Switch
                    checked={draft.monthly_enabled}
                    onCheckedChange={(v) => setDraft({ ...draft, monthly_enabled: v })}
                    disabled={!draft.enabled}
                    aria-label="סיכום חודשי"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  ביום
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.monthly_day}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        monthly_day: e.target.value.replace(/\D/g, "").slice(0, 2),
                      })
                    }
                    disabled={!draft.enabled || !draft.monthly_enabled}
                    aria-label="יום בחודש לסיכום החודשי"
                    dir="ltr"
                    className="w-20 h-11 rounded-xl bg-background border px-3 text-sm outline-none disabled:opacity-60"
                  />
                  בחודש
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                בחודשים קצרים הסיכום החודשי נשלח ביום האחרון של החודש. אם סיכום שבועי וחודשי נופלים
                באותו יום — נשלח רק החודשי.
              </p>
            </div>

            {lastSent && (
              <p className="text-xs text-muted-foreground">סיכום אחרון נשלח ב-{lastSent}</p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {saving ? "שומר…" : "שמור העדפות מייל"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
