import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { getTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { AuthGate } from "@/components/AuthGate";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">העמוד לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">העמוד שחיפשת לא קיים.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">משהו השתבש</h1>
        <p className="mt-2 text-sm text-muted-foreground">נסה שוב בעוד רגע.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            נסה שוב
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            דף הבית
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "ControlFlow-Finance" },
      {
        name: "description",
        content:
          "A smart platform for couples to manage household finances, track spending, and monitor investments.",
      },
      { name: "theme-color", content: "#fbfaf6" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "כסף" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "ControlFlow-Finance" },
      { name: "twitter:title", content: "ControlFlow-Finance" },
      {
        property: "og:description",
        content:
          "A smart platform for couples to manage household finances, track spending, and monitor investments.",
      },
      {
        name: "twitter:description",
        content:
          "A smart platform for couples to manage household finances, track spending, and monitor investments.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("public:transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_tags" }, () =>
        qc.invalidateQueries({ queryKey: ["transactions"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "category_budgets" }, () => qc.invalidateQueries({ queryKey: ["category_budgets"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "investment_accounts" }, () => qc.invalidateQueries({ queryKey: ["investment_accounts"] }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", getTheme() === "dark");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeSync />
      <AuthGate>
        <Outlet />
      </AuthGate>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
