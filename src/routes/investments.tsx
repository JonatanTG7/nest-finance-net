import { useEffect } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { setPrivacyHidden } from "@/lib/privacy";

export const Route = createFileRoute("/investments")({
  head: () => ({ meta: [{ title: "נכסים" }] }),
  component: InvestmentsLayout,
});

/**
 * Entering the Investments area always starts masked: an eye reveal
 * never survives leaving the area. The layout stays mounted while
 * navigating between its children (index ↔ person ↔ account ↔ IB),
 * so toggling inside the area is untouched — only entering from
 * outside (mount) and leaving (unmount) re-mask. The mount reset
 * also covers a reload that lands directly on an investments route
 * with a revealed value still stored.
 */
function InvestmentsLayout() {
  useEffect(() => {
    setPrivacyHidden(true);
    return () => {
      setPrivacyHidden(true);
    };
  }, []);
  return <Outlet />;
}
