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
 * Per PRD: savings/investments are asset transfers, not "burnt money".
 * Available balance = income - expense - fixed.
 */
export function isCashflowOut(t: TxType) {
  return t === "expense" || t === "fixed";
}

export function formatILS(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
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
