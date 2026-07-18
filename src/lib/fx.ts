/**
 * Live exchange rates to ILS. Uses open.er-api.com (free, no auth, CORS-friendly)
 * with Frankfurter as a secondary source. Throws when both fail so callers can
 * surface the error instead of displaying stale/mock numbers.
 */

export async function fetchRateToIls(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  if (cur === "ILS") return 1;

  // Primary: open.er-api.com — updates daily, CORS-enabled, no key.
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
    if (r.ok) {
      const j = (await r.json()) as { result?: string; rates?: { ILS?: number } };
      const rate = j?.rates?.ILS;
      if (j?.result === "success" && typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    /* fall through */
  }

  // Secondary: exchangerate-api.com public endpoint
  try {
    const r = await fetch(`https://api.exchangerate-api.com/v4/latest/${cur}`);
    if (r.ok) {
      const j = (await r.json()) as { rates?: { ILS?: number } };
      const rate = j?.rates?.ILS;
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    /* fall through */
  }

  // Tertiary: Frankfurter (ECB reference rates)
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${cur}&to=ILS`);
    if (r.ok) {
      const j = (await r.json()) as { rates?: { ILS?: number } };
      const rate = j?.rates?.ILS;
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    /* fall through */
  }

  throw new Error(`Failed to fetch live ${cur}→ILS exchange rate`);
}

/** Back-compat alias: USD → ILS. */
export function fetchUsdIlsRate(): Promise<number> {
  return fetchRateToIls("USD");
}
