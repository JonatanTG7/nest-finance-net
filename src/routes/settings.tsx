import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Copy,
  LogOut,
  Users,
  Plus,
  ArrowLeft,
  ShieldAlert,
  Coins,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { MobileLayout } from "@/components/MobileLayout";
import { CreditCardsSection } from "@/components/CreditCardsSection";

import { getDefaultPerson, setDefaultPerson, useMemberLabels, type Person } from "@/lib/person";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import {
  getDefaultCurrency,
  setDefaultCurrency,
  getCardLast4,
  setCardLast4,
} from "@/lib/personal_settings";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  generateInviteCode,
  updateHouseholdName,
  useMyHousehold,
  useMyProfile,
  useInvalidateMe,
} from "@/lib/household";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות" }] }),
  component: Settings,
});

function Settings() {
  const [person, setPerson] = useState<Person>("yonatan");
  const [theme, setThemeState] = useState<Theme>("light");
  const [currency, setCurrencyState] = useState("ILS");
  const [cardLast4, setCardLast4State] = useState("");
  const memberLabels = useMemberLabels();

  useEffect(() => {
    setPerson(getDefaultPerson());
    setThemeState(getTheme());
    setCurrencyState(getDefaultCurrency());
    setCardLast4State(getCardLast4());
  }, []);

  function choose(p: Person) {
    setPerson(p);
    setDefaultPerson(p);
  }

  function chooseTheme(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  function chooseCurrency(c: string) {
    setCurrencyState(c);
    setDefaultCurrency(c);
  }

  function chooseCardLast4(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setCardLast4State(digits);
    setCardLast4(digits);
  }

  return (
    <MobileLayout>
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-bold">הגדרות</h1>
      </header>

      <section className="px-5 mt-2">
        <h2 className="text-sm font-semibold mb-2">מי אני?</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["yonatan", "shiri"] as Person[]).map((p) => (
            <button
              key={p}
              onClick={() => choose(p)}
              className={cn(
                "h-14 rounded-xl border text-base font-semibold transition",
                person === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border",
              )}
            >
              {memberLabels[p]}
            </button>
          ))}
        </div>
        {/* <p className="mt-2 text-xs text-muted-foreground">
          ערך זה ייבחר אוטומטית במסך הוספת תנועה. תמיד אפשר לשנות לפני שמירה.
        </p> */}
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">הגדרות אישיות</h2>
        <div className="rounded-2xl bg-card border p-4 space-y-4">
          <div>
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Coins className="size-3.5 text-muted-foreground" />
              מטבע ברירת מחדל
            </label>
            <select
              value={currency}
              onChange={(e) => chooseCurrency(e.target.value)}
              className="w-full h-11 mt-1.5 rounded-xl bg-background border px-3 text-sm outline-none"
            >
              {[
                "ILS",
                "USD",
                "EUR",
                "GBP",
                "JPY",
                "THB",
                "CHF",
                "CAD",
                "AUD",
                "AED",
                "TRY",
                "MXN",
                "INR",
                "CNY",
                "EGP",
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {/* <p className="mt-1.5 text-xs text-muted-foreground">
              כשתוסיפו תנועה חדשה, המטבע הזה יהיה מסומן מראש — אפשר תמיד לשנות לפני שמירה.
            </p> */}
          </div>

          <div className="border-t pt-4">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <CreditCard className="size-3.5 text-muted-foreground" />4 ספרות אחרונות של כרטיס
              אשראי (רשות)
            </label>
            <input
              value={cardLast4}
              onChange={(e) => chooseCardLast4(e.target.value)}
              placeholder="1234"
              inputMode="numeric"
              maxLength={4}
              dir="ltr"
              className="w-full h-11 mt-1.5 rounded-xl bg-background border px-3 text-sm outline-none tracking-widest"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              רק תזכורת אישית לעצמכם (למשל בזמן התאמת תנועות מול דף חשבון) — נשמר על המכשיר שלכם
              בלבד,
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">מצב תצוגה</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => chooseTheme("light")}
            className={cn(
              "h-14 rounded-xl border text-base font-semibold transition flex items-center justify-center gap-2",
              theme === "light"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border",
            )}
          >
            <Sun className="size-5" />
            בהיר
          </button>
          <button
            onClick={() => chooseTheme("dark")}
            className={cn(
              "h-14 rounded-xl border text-base font-semibold transition flex items-center justify-center gap-2",
              theme === "dark"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border",
            )}
          >
            <Moon className="size-5" />
            כהה
          </button>
        </div>
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">התקנה כאפליקציה</h2>
        <div className="rounded-2xl bg-card border p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground mb-1">להוספה למסך הבית:</p>
          <p>
            📱 <b>אייפון:</b> פתח בספארי → לחץ על כפתור השיתוף → "הוסף למסך הבית"
          </p>
          <p className="mt-1">
            🤖 <b>אנדרואיד:</b> פתח בכרום → תפריט (⋮) → "הוסף למסך הבית"
          </p>
        </div>
      </section>

      {/* <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">קטגוריות</h2>
        <Link
          to="/settings/categories"
          className="flex items-center justify-between rounded-2xl bg-card border p-4 text-sm"
        >
          <span>ניהול קטגוריות · איחוד והסתרה</span>
          <ArrowLeft className="size-4 text-muted-foreground rotate-180" />
        </Link>
      </section> */}

      {/* <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">סנכרון</h2>
        <div className="rounded-2xl bg-card border p-4 text-sm text-muted-foreground">
          ✨ כל תנועה שתזינו תופיע מיד גם במכשיר השני, בזמן אמת.
        </div>
      </section> */}

      <CreditCardsSection />

      <HouseholdSection />


      <section className="px-5 mt-8">
        <Link
          to="/settings/danger"
          className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShieldAlert className="size-4" />
            אזור מתקדם ומחיקת חשבון
          </span>
          <ArrowLeft className="size-4 rotate-180" />
        </Link>
      </section>

      <section className="px-5 mt-8 mb-8">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
          }}
          className="w-full h-12 rounded-xl border border-destructive/40 text-destructive font-semibold flex items-center justify-center gap-2"
        >
          <LogOut className="size-5" />
          התנתק
        </button>
      </section>
    </MobileLayout>
  );
}

function HouseholdSection() {
  const { data: profile } = useMyProfile();
  const { data: household } = useMyHousehold();
  const invalidate = useInvalidateMe();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  async function makeCode() {
    if (!profile?.household_id) return;
    setBusy(true);
    try {
      const c = await generateInviteCode(profile.household_id);
      setCode(c);
    } catch (e) {
      console.error(e);
      toast.error("שגיאה ביצירת קוד");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("הקוד הועתק");
    } catch {
      toast.error("לא הצלחתי להעתיק");
    }
  }

  async function saveName() {
    if (!household) return;
    const n = nameDraft.trim();
    if (!n) return;
    setSavingName(true);
    try {
      await updateHouseholdName(household.id, n);
      invalidate();
      setEditingName(false);
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בעדכון השם");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Users className="size-4" />
        משק הבית
      </h2>
      <div className="rounded-2xl bg-card border p-4 space-y-3">
        <div className="text-sm">
          <div className="text-muted-foreground">שם משק הבית</div>
          {editingName ? (
            <div className="mt-1 flex gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="flex-1 h-10 rounded-lg bg-background border px-3 outline-none"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                שמור
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="h-10 px-3 rounded-lg border text-sm"
              >
                ביטול
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{household?.name ?? "—"}</div>
              <button
                onClick={() => {
                  setNameDraft(household?.name ?? "");
                  setEditingName(true);
                }}
                className="text-xs text-primary"
              >
                ערוך
              </button>
            </div>
          )}
        </div>

        {code ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              קוד הזמנה חדש (חד־פעמי, בתוקף לשבוע):
            </div>
            <button
              onClick={copy}
              className="w-full h-14 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold tracking-widest text-xl flex items-center justify-center gap-2"
            >
              {code}
              <Copy className="size-4" />
            </button>
            <button
              onClick={makeCode}
              disabled={busy}
              className="mt-2 w-full h-10 text-xs text-muted-foreground"
            >
              צור קוד נוסף
            </button>
          </div>
        ) : (
          <button
            onClick={makeCode}
            disabled={busy || !profile?.household_id}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus className="size-5" />
            {busy ? "יוצר…" : "צור קוד הזמנה"}
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          שתפו את הקוד עם מי שתרצו להוסיף למשק הבית. הם נכנסים עם Google ומזינים אותו במסך הראשון.
        </p>
      </div>
    </section>
  );
}
