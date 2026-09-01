import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DangerZoneSection } from "@/components/DangerZoneSection";

export const Route = createFileRoute("/settings/danger")({
  head: () => ({ meta: [{ title: "אזור מתקדם" }] }),
  component: AdvancedSettings,
});

function AdvancedSettings() {
  return (
    <AppShell>
      <header className="px-5 md:px-0 pt-6 pb-3 flex items-center gap-2">
        <Link to="/settings" className="p-2 rounded-lg hover:bg-accent">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">אזור מתקדם</h1>
          <p className="text-xs text-muted-foreground">
            פעולות בלתי הפיכות — קרא/י בעיון לפני שממשיכים
          </p>
        </div>
      </header>

      <div className="pb-8">
        <DangerZoneSection />
      </div>
    </AppShell>
  );
}
