import type { Database } from "@/integrations/supabase/types";

export type TxType = Database["public"]["Enums"]["transaction_type"];

export const txTypeLabel: Record<TxType, string> = {
  income: "הכנסה",
  expense: "הוצאה",
  fixed: "קבועה",
  savings: "חיסכון",
  investment: "השקעה",
};

export const txTypeColorVar: Record<TxType, string> = {
  income: "var(--income)",
  expense: "var(--expense)",
  fixed: "var(--fixed)",
  savings: "var(--savings)",
  investment: "var(--savings)",
};

export const txTypeBgClass: Record<TxType, string> = {
  income: "bg-income text-income-foreground",
  expense: "bg-expense text-expense-foreground",
  fixed: "bg-fixed text-fixed-foreground",
  savings: "bg-savings text-savings-foreground",
  investment: "bg-savings text-savings-foreground",
};

/**
 * Per user decision: savings + investments are tracked as monthly outflows
 * (money that leaves the checking account, even if it accumulates as wealth).
 * Available balance = income - (expense + fixed + savings + investment).
 */
export function isCashflowOut(t: TxType) {
  return t === "expense" || t === "fixed" || t === "savings" || t === "investment";
}

export function formatILS(n: number): string {
  // Force the minus sign to lead the number (Hebrew/RTL preference).
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(abs);
  return n < 0 ? `-${formatted}` : formatted;
}

export function formatMoney(n: number, currency: string): string {
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ILS" ? 0 : 2,
  }).format(abs);
  return n < 0 ? `-${formatted}` : formatted;
}

export function formatMonthHebrew(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(d);
}

export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), startDate: start };
}

/** "2026-04" → Date for the first of that month (local time). */
export function parseMonthKey(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

export function formatMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  return formatMonthKey(new Date());
}

export function shiftMonth(key: string, delta: number): string {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() + delta);
  return formatMonthKey(d);
}

export function monthRangeFromKey(key: string) {
  const startDate = parseMonthKey(key);
  const end = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(startDate), end: iso(end), startDate };
}

/**
 * Returns a distinct color per category, derived from the category's base
 * color by rotating hue/lightness based on its UUID. This keeps the type
 * "family color" recognisable while making each slice in a pie/bar chart
 * visually distinct.
 */
export function categoryShade(baseHex: string, id: string, index = 0): string {
  // hash the id into a small offset
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const offset = ((h % 60) - 30 + index * 13) | 0; // -30..+30 hue shift
  const lightShift = ((h >> 5) % 20) - 10; // -10..+10 lightness shift
  const { r, g, b } = hexToRgb(baseHex);
  const hsl = rgbToHsl(r, g, b);
  hsl.h = (hsl.h + offset + 360) % 360;
  hsl.l = Math.max(30, Math.min(70, hsl.l + lightShift));
  const out = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(out.r, out.g, out.b);
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToRgb(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}
