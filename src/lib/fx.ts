/**
 * Fetch a USD→ILS rate. Uses exchangerate.host (free, no API key, CORS friendly).
 * Falls back to a sensible default if the network fails.
 */
export async function fetchUsdIlsRate(): Promise<number> {
  try {
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=ILS");
    const j = (await r.json()) as { rates?: { ILS?: number } };
    const rate = j?.rates?.ILS;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    // ignore
  }
  return 3.7;
}
