import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Up/down buttons for reorder mode. Plain buttons, not drag-and-drop —
 * HTML5 drag-and-drop doesn't work on mobile touch, and these are
 * reliable everywhere. Shared by the assets index and the person pages.
 */
export function ReorderControls({
  onUp,
  onDown,
  disableUp,
  disableDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUp}
        disabled={disableUp}
        aria-label="הזז למעלה"
        className="flex-1"
      >
        <ChevronUp className="size-4" />
        למעלה
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDown}
        disabled={disableDown}
        aria-label="הזז למטה"
        className="flex-1"
      >
        <ChevronDown className="size-4" />
        למטה
      </Button>
    </div>
  );
}
