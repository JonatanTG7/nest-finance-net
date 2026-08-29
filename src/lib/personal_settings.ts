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
