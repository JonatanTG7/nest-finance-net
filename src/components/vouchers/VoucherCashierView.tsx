import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markVoucherUsed, type Voucher } from "@/lib/vouchers";

export function VoucherCashierView({
  vouchers,
  startIndex,
  onClose,
  onChanged,
}: {
  vouchers: Voucher[];
  startIndex: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [list] = useState(vouchers);
  const [index, setIndex] = useState(startIndex);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const v = list[index];
  const allUsed = list.every((x) => usedIds.has(x.id));
  const go = (d: number) => setIndex((i) => Math.min(list.length - 1, Math.max(0, i + d)));

  async function markUsed() {
    if (!v) return;
    setBusy(true);
    try {
      await markVoucherUsed(v);
      setUsedIds((s) => new Set(s).add(v.id));
      onChanged();
      const next = list.findIndex((x, i) => i > index && !usedIds.has(x.id));
      if (next >= 0) setIndex(next);
    } finally {
      setBusy(false);
    }
  }

  if (!v) return null;
  const isUsed = usedIds.has(v.id) || Number(v.remaining_value) <= 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" dir="rtl">
      <header className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b">
        <button onClick={onClose} className="size-10 rounded-full bg-muted flex items-center justify-center" aria-label="סגור">
          <X className="size-5" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="font-bold truncate">{v.label}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            שובר {index + 1} מתוך {list.length} · {isUsed ? "נוצל" : `${Number(v.remaining_value)} ₪`}
          </p>
        </div>
        <span className="size-10" />
      </header>

      {allUsed ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <CheckCircle2 className="size-14 text-primary" />
          <p className="text-lg font-semibold">כל השוברים נוצלו</p>
          <Button onClick={onClose}>חזרה לרשימה</Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 relative flex items-center justify-center p-2 overflow-hidden">
            {v.image_url && !usedIds.has(v.id) ? (
              <ZoomImage key={v.id} src={v.image_url} alt={v.label} />
            ) : (
              <p className="text-muted-foreground text-sm">{isUsed ? "השובר נוצל" : "אין תמונה לשובר זה"}</p>
            )}
            {index > 0 && (
              <button onClick={() => go(-1)} className="absolute start-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-card/90 border shadow flex items-center justify-center" aria-label="שובר קודם">
                <ChevronRight className="size-6" />
              </button>
            )}
            {index < list.length - 1 && (
              <button onClick={() => go(1)} className="absolute end-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-card/90 border shadow flex items-center justify-center" aria-label="שובר הבא">
                <ChevronLeft className="size-6" />
              </button>
            )}
          </div>

          {v.barcode && (
            <p className="text-center text-3xl font-bold tracking-[0.15em] tabular-nums px-4 break-all" dir="ltr">
              {v.barcode}
            </p>
          )}

          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="w-full h-14 text-base" disabled={busy || isUsed} onClick={markUsed}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : isUsed ? "נוצל" : "נוצל במלואו ← לשובר הבא"}
            </Button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
