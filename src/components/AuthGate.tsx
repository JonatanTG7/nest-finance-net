import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogIn, LogOut, Home, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { createHousehold, fetchMyProfile, redeemInvite, useInvalidateMe } from "@/lib/household";

/**
 * Full-page OAuth (phone browser / standalone tab) returns to the app with the
 * tokens in the URL. Nothing consumed them before, so the app stayed on the
 * sign-in screen after picking a Google account. Consume + clean the URL here.
 */
async function consumeOAuthRedirect(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const get = (k: string) => hash.get(k) ?? search.get(k);

  const access_token = get("access_token");
  const refresh_token = get("refresh_token");
  const err = get("error_description") ?? get("error");

  if (!access_token && !refresh_token && !err) return false;

  const clean = () =>
    window.history.replaceState({}, "", window.location.pathname || "/");

  if (!access_token || !refresh_token) {
    clean();
    toast.error("שגיאה בכניסה");
    return false;
  }
  try {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    clean();
    if (error) {
      toast.error("שגיאה בכניסה");
      return false;
    }
    return true;
  } catch {
    clean();
    toast.error("שגיאה בכניסה");
    return false;
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<unknown | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await consumeOAuthRedirect();
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setSession(data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <FullScreen>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </FullScreen>
    );
  }
  if (!session) return <SignIn />;
  return <HouseholdGate>{children}</HouseholdGate>;
}


function HouseholdGate({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: fetchMyProfile,
  });
  if (isLoading) {
    return (
      <FullScreen>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </FullScreen>
    );
  }
  // No profile row (or it couldn't be read) — never hang on a spinner.
  if (!profile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">לא הצלחנו לטעון את הפרופיל שלך.</p>
        <button
          onClick={() => window.location.reload()}
          className="h-12 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold"
        >
          נסה שוב
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <LogOut className="size-3.5" />
          התנתק
        </button>
      </div>
    );
  }
  if (!profile.household_id) return <Onboarding />;

  return <>{children}</>;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">{children}</div>
  );
}

function SignIn() {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (r.error) {
        toast.error("שגיאה בכניסה");
        setLoading(false);
      }
    } catch {
      toast.error("שגיאה בכניסה");
      setLoading(false);
    }
  }
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="text-5xl mb-4">💰</div>
      <h1 className="text-3xl font-bold">כסף משפחתי</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs">
        ניהול תקציב משותף ומאובטח לכל המשפחה. כניסה דרך Google כדי להגן על הנתונים שלכם.
      </p>
      <button
        onClick={go}
        disabled={loading}
        className="mt-8 h-12 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
        התחבר עם Google
      </button>
    </div>
  );
}

function Onboarding() {
  const invalidate = useInvalidateMe();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function doCreate() {
    setBusy(true);
    try {
      await createHousehold(name.trim() || "המשפחה שלי");
      invalidate();
    } catch (e) {
      console.error(e);
      toast.error("שגיאה ביצירת משק הבית");
    } finally {
      setBusy(false);
    }
  }
  async function doJoin() {
    setBusy(true);
    try {
      await redeemInvite(code.trim());
      toast.success("הצטרפת למשק הבית");
      invalidate();
    } catch (e) {
      console.error(e);
      const msg = (e as Error).message || "";
      toast.error(
        msg.includes("not_found")
          ? "קוד לא נמצא"
          : msg.includes("expired")
            ? "הקוד פג תוקף"
            : msg.includes("used_up")
              ? "הקוד נוצל"
              : "שגיאה בהצטרפות",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center">ברוכים הבאים 👋</h1>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          ניצור או נצטרף למשק בית כדי להתחיל
        </p>

        {mode === "choose" && (
          <div className="mt-8 space-y-3">
            <button
              onClick={() => setMode("join")}
              className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2"
            >
              <Users className="size-5" />
              יש לי קוד הזמנה
            </button>
            <button
              onClick={() => setMode("create")}
              className="w-full h-16 rounded-2xl bg-card border font-semibold flex items-center justify-center gap-2"
            >
              <Home className="size-5" />
              צור משק בית חדש
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="mt-8 space-y-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם משק הבית"
              className="w-full h-14 rounded-2xl bg-card border px-4 outline-none text-base"
            />
            <button
              onClick={doCreate}
              disabled={busy}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {busy ? "יוצר…" : "צור"}
            </button>
            <button
              onClick={() => setMode("choose")}
              className="w-full h-10 text-sm text-muted-foreground"
            >
              חזרה
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="mt-8 space-y-3">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="קוד הזמנה"
              maxLength={12}
              className="w-full h-14 rounded-2xl bg-card border px-4 outline-none text-center tracking-widest text-lg font-bold uppercase"
            />
            <button
              onClick={doJoin}
              disabled={busy || code.trim().length < 4}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {busy ? "מצטרף…" : "הצטרף"}
            </button>
            <button
              onClick={() => setMode("choose")}
              className="w-full h-10 text-sm text-muted-foreground"
            >
              חזרה
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <LogOut className="size-3.5" />
        התנתק והתחבר עם חשבון גוגל אחר
      </button>
    </div>
  );
}
