import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Quote = { symbol: string; last: number | null; prevClose: number | null };

// Tiny in-worker cache (per instance) to avoid burning Finnhub quota.
const cache = new Map<string, { at: number; q: Quote }>();
const TTL_MS = 60_000;

async function fetchOne(symbol: string, apiKey: string): Promise<Quote> {
  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && now - hit.at < TTL_MS) return hit.q;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`finnhub ${r.status}`);
    const j = (await r.json()) as { c?: number; pc?: number };
    const q: Quote = {
      symbol,
      last: typeof j?.c === "number" && j.c > 0 ? j.c : null,
      prevClose: typeof j?.pc === "number" && j.pc > 0 ? j.pc : null,
    };
    cache.set(symbol, { at: now, q });
    return q;
  } catch (e) {
    console.error("[ib] quote error", symbol, e);
    return { symbol, last: null, prevClose: null };
  }
}

export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { symbols: string[] }) => data)
  .handler(async ({ data }): Promise<Quote[]> => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.warn("[ib] FINNHUB_API_KEY not set");
      return data.symbols.map((s) => ({ symbol: s, last: null, prevClose: null }));
    }
    const syms = Array.from(
      new Set(data.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    );
    return Promise.all(syms.map((s) => fetchOne(s, apiKey)));
  });
