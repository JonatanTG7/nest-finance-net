import { useEffect, useState } from "react";
import { currentMonthKey } from "@/lib/finance";

const KEY = "selected_month";
const EVENT = "selected-month-change";

export function getSelectedMonth(): string {
  if (typeof window === "undefined") return currentMonthKey();
  const v = window.localStorage.getItem(KEY);
  return v && /^\d{4}-\d{2}$/.test(v) ? v : currentMonthKey();
}

export function setSelectedMonth(month: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, month);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: month }));
}

/**
 * Shared month selection across screens (dashboard, transactions…).
 * Persisted so moving between tabs keeps the month the user was looking at.
 */
export function useSelectedMonth(): [string, (m: string) => void] {
  const [month, setMonth] = useState<string>(currentMonthKey());

  useEffect(() => {
    setMonth(getSelectedMonth());
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (typeof next === "string") setMonth(next);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return [month, setSelectedMonth];
}
