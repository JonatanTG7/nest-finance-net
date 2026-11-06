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
            שובר {index + 1} מתוך {list.length} · {isUsed ? "נוצל" : `${Number(v.remaining_value)} ₪`} · נקנה ב-{new Date(v.occurred_at + "T00:00:00").toLocaleDateString("he-IL")}
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

function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ d: number; s: number; cx: number; cy: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  const snapshot = () => {
    const p = [...pts.current.values()];
    if (p.length === 2) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      start.current = { d, s: t.s, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, x: t.x, y: t.y };
    } else if (p.length === 1) {
      start.current = { d: 0, s: t.s, cx: p[0].x, cy: p[0].y, x: t.x, y: t.y };
    } else start.current = null;
  };
  const release = (id: number) => {
    pts.current.delete(id);
    snapshot();
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 1) {
          const now = Date.now();
          if (now - lastTap.current < 300) setT((c) => (c.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
          lastTap.current = now;
        }
        snapshot();
      }}
      onPointerMove={(e) => {
        const st = start.current;
        if (!pts.current.has(e.pointerId) || !st) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...pts.current.values()];
        if (p.length === 2 && st.d > 0) {
          const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          const cx = (p[0].x + p[1].x) / 2;
          const cy = (p[0].y + p[1].y) / 2;
          const s = Math.min(5, Math.max(1, (st.s * d) / st.d));
          setT(s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: st.x + cx - st.cx, y: st.y + cy - st.cy });
        } else if (p.length === 1 && t.s > 1) {
          setT((c) => ({ ...c, x: st.x + p[0].x - st.cx, y: st.y + p[0].y - st.cy }));
        }
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain rounded-xl"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
      />
    </div>
  );
}
