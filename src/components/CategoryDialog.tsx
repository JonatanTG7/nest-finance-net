import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createCategory, type Category } from "@/lib/db";
import { txTypeLabel, type TxType } from "@/lib/finance";
import { cn } from "@/lib/utils";

const EMOJIS = [
  "🛒","🍔","☕","🍺","🛍️","👕","🎬","🎮","✈️","🏨","🚗","⛽","🚌","🚕",
  "🏠","💡","💧","📶","📱","📺","🎓","📚","🧾","🛡️","🏥","💊","💇","🏋️",
  "🐶","🐱","🎁","🎉","🧹","🔧","🌱","💰","💸","📊","🏦","💼","↩️","📦",
];

const COLORS = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981",
  "#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef",
  "#ec4899","#f43f5e","#64748b","#94a3b8",
];

export function CategoryDialog({
  type,
  onClose,
  onCreated,
}: {
  type: TxType;
  onClose: () => void;
  onCreated: (c: Category) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("צריך שם לקטגוריה");
      return;
    }
    setSaving(true);
    try {
      const c = await createCategory({ name, type, emoji, color });
      toast.success("הקטגוריה נוספה");
      onCreated(c);
    } catch {
      toast.error("שגיאה בשמירת הקטגוריה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-6">
      <div className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl bg-card border p-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">קטגוריה חדשה · {txTypeLabel[type]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="size-9 rounded-full bg-accent flex items-center justify-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
            style={{ background: color + "22" }}
          >
            {emoji}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הקטגוריה"
            className="flex-1 h-12 rounded-xl bg-background border px-4 text-base outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <p className="text-xs text-muted-foreground mt-4 mb-2">אימוג׳י</p>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={cn(
                "aspect-square rounded-xl text-xl flex items-center justify-center border",
                emoji === e ? "border-primary bg-primary/10" : "border-transparent bg-accent/50",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          placeholder="או הדבק אימוג׳י משלך"
          className="mt-2 w-full h-10 rounded-xl bg-background border px-3 text-sm outline-none"
        />

        <p className="text-xs text-muted-foreground mt-4 mb-2">צבע</p>
        <div className="grid grid-cols-9 gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={cn(
                "aspect-square rounded-full border-2",
                color === c ? "border-foreground" : "border-transparent",
              )}
              style={{ background: c }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-5 w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {saving ? "שומר…" : "הוסף קטגוריה"}
        </button>
      </div>
    </div>
  );
}
