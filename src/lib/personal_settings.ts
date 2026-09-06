import { useEffect, useState } from "react";

const CURRENCY_KEY = "default_currency";
const CARD_LAST4_KEY = "card_last4";

export function getDefaultCurrency(): string {
  if (typeof window === "undefined") return "ILS";
  return window.localStorage.getItem(CURRENCY_KEY) || "ILS";
}

export function setDefaultCurrency(currency: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CURRENCY_KEY, currency);
  }
}

/**
 * Purely a personal memory aid (e.g. "1234") — not linked to any bank data,
 * not shown to other household members, not used anywhere automatically.
 * Stored only on this device.
 */
export function getCardLast4(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CARD_LAST4_KEY) || "";
}

export function setCardLast4(digits: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CARD_LAST4_KEY, digits.replace(/\D/g, "").slice(0, 4));
  }
}

/* ------------------------------------------------------------------ *
 * Financial month: calendar (1st → end of month) or cash-flow cycle
 * (starts on a chosen day, e.g. payday, and runs until the same day
 * of the next month). Stored per device.
 * ------------------------------------------------------------------ */

export type PeriodMode = "calendar" | "cycle";

const PERIOD_MODE_KEY = "period_mode";
const CYCLE_START_DAY_KEY = "cycle_start_day";
const PERIOD_EVENT = "period-settings-change";

export function getPeriodMode(): PeriodMode {
  if (typeof window === "undefined") return "calendar";
  return window.localStorage.getItem(PERIOD_MODE_KEY) === "cycle" ? "cycle" : "calendar";
}

export function getCycleStartDay(): number {
  if (typeof window === "undefined") return 1;
  const n = Number(window.localStorage.getItem(CYCLE_START_DAY_KEY));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? Math.round(n) : 1;
}

export function setPeriodMode(mode: PeriodMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERIOD_MODE_KEY, mode);
  window.dispatchEvent(new Event(PERIOD_EVENT));
}

export function setCycleStartDay(day: number) {
  if (typeof window === "undefined") return;
  const d = Math.max(1, Math.min(28, Math.round(day) || 1));
  window.localStorage.setItem(CYCLE_START_DAY_KEY, String(d));
  window.dispatchEvent(new Event(PERIOD_EVENT));
}

/** Reactive read of the financial-month settings (safe for SSR/hydration). */
export function usePeriodSettings() {
  const [state, setState] = useState<{ mode: PeriodMode; startDay: number }>({
    mode: "calendar",
    startDay: 1,
  });

  useEffect(() => {
    const read = () => setState({ mode: getPeriodMode(), startDay: getCycleStartDay() });
    read();
    window.addEventListener(PERIOD_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PERIOD_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return state;
}
