/**
 * Fetch live exchange rates to ILS from Frankfurter (free, no auth, CORS-friendly).
 * Falls back to sensible defaults if the network fails.
 */

const FALLBACK: Record<string, number> = { USD: 3.7, EUR: 4.0, GBP: 4.7, ILS: 1 };

export async function fetchRateToIls(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  if (cur === "ILS") return 1;
  // Frankfurter: rate of 1 <cur> → ILS
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${cur}&to=ILS`);
    const j = (await r.json()) as { rates?: { ILS?: number } };
    const rate = j?.rates?.ILS;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    // ignore
  }
  // Fallback: exchangerate.host
  try {
    const r = await fetch(`https://api.exchangerate.host/latest?base=${cur}&symbols=ILS`);
    const j = (await r.json()) as { rates?: { ILS?: number } };
    const rate = j?.rates?.ILS;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    // ignore
  }
  return FALLBACK[cur] ?? 1;
}

/** Back-compat alias: USD → ILS. */
export function fetchUsdIlsRate(): Promise<number> {
  return fetchRateToIls("USD");
}
