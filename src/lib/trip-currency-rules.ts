export type TripAmount = { amount: number | string; currency: string; amount_ils: number | string };

/** Preserve recorded amounts; only mixed-currency trips need an ILS conversion fallback. */
export function tripSpendingInCurrency(rows: TripAmount[], currency: string, rateToIls?: number): number | null {
  if (rows.every((row) => row.currency === currency)) {
    return rows.reduce((sum, row) => sum + Number(row.amount), 0);
  }
  const totalIls = rows.reduce((sum, row) => sum + Number(row.amount_ils), 0);
  if (currency === "ILS") return totalIls;
  return rateToIls && rateToIls > 0 ? totalIls / rateToIls : null;
}

export function tripCurrencyLabel(currency: string): string {
  return ({ EUR: "ביורו €", ILS: "בשקלים ₪", USD: "בדולר $", GBP: "בליש״ט £" } as Record<string, string>)[currency] ?? currency;
}