import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { MobileLayout } from "@/components/MobileLayout";
import { getDefaultPerson, personLabel, setDefaultPerson, type Person } from "@/lib/person";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "הגדרות" }] }),
  component: Settings,
});

function Settings() {
  const [person, setPerson] = useState<Person>("yonatan");
  const [theme, setThemeState] = useState<Theme>("light");

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
              {personLabel[p]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ערך זה ייבחר אוטומטית במסך הוספת תנועה. תמיד אפשר לשנות לפני שמירה.
        </p>
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
    </MobileLayout>
  );
}
