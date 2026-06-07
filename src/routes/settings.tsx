import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sun, Moon, Copy, LogOut, Users, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { MobileLayout } from "@/components/MobileLayout";
import { getDefaultPerson, setDefaultPerson, useMemberLabels, type Person } from "@/lib/person";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchInvestmentAccounts } from "@/lib/db";
import { fetchUsdIlsRate } from "@/lib/fx";
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
  const memberLabels = useMemberLabels();

  useEffect(() => {
    setPerson(getDefaultPerson());
    setThemeState(getTheme());
  }, []);

  function choose(p: Person) {
    setPerson(p);
    setDefaultPerson(p);
  }

  function chooseTheme(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  return (
    <MobileLayout>
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-bold">הגדרות</h1>
      </header>

      <section className="px-5 mt-2">
        <h2 className="text-sm font-semibold mb-2">מי אני בטלפון הזה?</h2>
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
        <p className="mt-2 text-xs text-muted-foreground">
          ערך זה ייבחר אוטומטית במסך הוספת תנועה. תמיד אפשר לשנות לפני שמירה.
        </p>
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
          <p>📱 <b>אייפון:</b> פתח בספארי → לחץ על כפתור השיתוף → "הוסף למסך הבית"</p>
          <p className="mt-1">🤖 <b>אנדרואיד:</b> פתח בכרום → תפריט (⋮) → "הוסף למסך הבית"</p>
        </div>
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold mb-2">סנכרון</h2>
        <div className="rounded-2xl bg-card border p-4 text-sm text-muted-foreground">
          ✨ כל תנועה שתזינו תופיע מיד גם במכשיר השני, בזמן אמת.
        </div>
      </section>

      <HouseholdSection />

      <InvestmentBalancesSection />

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
            <div className="text-xs text-muted-foreground mb-1">קוד הזמנה חדש (חד־פעמי, בתוקף לשבוע):</div>
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

function InvestmentBalancesSection() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({
    queryKey: ["investment_accounts"],
    queryFn: fetchInvestmentAccounts,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fxDrafts, setFxDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(id: string, currency: string) {
  async function save(id: string, currency: string) {
    // Input is ALWAYS in ILS; for non-ILS accounts we divide by FX to get native.
    const ils = parseFloat(drafts[id] ?? "");
    if (isNaN(ils)) return;
    let native = ils;
    if (currency !== "ILS") {
      let rate = parseFloat(fxDrafts[id] ?? "");
      if (!rate || rate <= 0) rate = await fetchUsdIlsRate();
      native = ils / rate;
    }
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("investment_accounts")
        .update({ starting_balance: native, starting_balance_ils: ils })
        .eq("id", id);
      if (error) throw error;
      // Zero out historical transactions so they keep their count but stop
      // adding to the displayed balance (the new balance IS the source of truth).
      const { error: zeroErr } = await supabase
        .from("transactions")
        .update({ amount: 0, amount_ils: 0 })
        .eq("investment_account_id", id);
      if (zeroErr) throw zeroErr;
      qc.invalidateQueries({ queryKey: ["investment_accounts"] });
      qc.invalidateQueries({ queryKey: ["investments", "txs"] });
      toast.success("הסכום עודכן");
      setDrafts((d) => ({ ...d, [id]: "" }));
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בעדכון");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Wallet className="size-4" />
        סכומים — השקעות וחיסכון
      </h2>
      <div className="rounded-2xl bg-card border divide-y">
        {accounts.map((a) => (
          <div key={a.id} className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="size-2.5 rounded-full" style={{ background: a.color }} />
              <p className="text-sm font-semibold">{a.name}</p>
              <span className="ms-auto text-xs text-muted-foreground">
                {a.currency === "ILS" ? "₪" : a.currency}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                placeholder="סכום בש״ח"
                value={drafts[a.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                className="flex-1 h-10 rounded-lg bg-background border px-3 outline-none text-sm"
                dir="ltr"
              />
              {a.currency !== "ILS" && (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  placeholder="שער $"
                  value={fxDrafts[a.id] ?? ""}
                  onChange={(e) => setFxDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  className="w-20 h-10 rounded-lg bg-background border px-2 outline-none text-sm"
                  dir="ltr"
                />
              )}
              <button
                onClick={() => save(a.id, a.currency)}
                disabled={savingId === a.id || !drafts[a.id]?.trim()}
                className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                שמור
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              סכום נוכחי: {Number(a.starting_balance_ils ?? 0).toLocaleString("he-IL")} ₪
              {a.currency !== "ILS" && (
                <> · {Number(a.starting_balance ?? 0).toLocaleString("he-IL", { maximumFractionDigits: 2 })} {a.currency}</>
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2 px-1">
        מזינים תמיד בש״ח. בחשבון דולרי המערכת מחלקת בשער היומי. כל עדכון מאפס תנועות קודמות אבל שומר על המספר שלהן.
      </p>
    </section>
  );
}
