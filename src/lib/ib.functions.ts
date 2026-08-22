import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarketPhase = "REGULAR" | "PRE" | "POST" | "CLOSED";

export type Quote = {
  symbol: string;
  last: number | null;
  prevClose: number | null;
  phase: MarketPhase;
  dailyChange: number | null;
  dailyChangePct: number | null;
};

// In-worker cache to soften rate limits.
const cache = new Map<string, { at: number; q: Quote }>();
const TTL_MS = 10_000;

type FinnhubQuote = {
  c?: number; // current
  d?: number; // change
  dp?: number; // change percent
  pc?: number; // previous close
  h?: number;
  l?: number;
  o?: number;
  t?: number;
};

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<Quote | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as FinnhubQuote;
    
    // התיקון: התמודדות עם סופי שבוע בהם המחיר הנוכחי מדווח כ-0
    const cValid = typeof j.c === "number" && j.c > 0;
    const pcValid = typeof j.pc === "number" && j.pc > 0;

    const last = cValid ? j.c : (pcValid ? j.pc : null);
    const prevClose = pcValid ? j.pc : null;

    if (last == null && prevClose == null) return null;

    // Determine phase from the current NY time
    const phase: MarketPhase = last != null ? guessPhaseNY() : "CLOSED";
    return {
      symbol,
      last,
      prevClose,
      phase,
      dailyChange: typeof j.d === "number" ? j.d : null,
      dailyChangePct: typeof j.dp === "number" ? j.dp : null,
    };
  } catch (e) {
    console.error("[ib] finnhub error", symbol, e);
    return null;
  }
}

function guessPhaseNY(): MarketPhase {
  // NY time via toLocaleString.
  const now = new Date();
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay(); // 0=Sun..6=Sat
  if (day === 0 || day === 6) return "CLOSED";
  const minutes = ny.getHours() * 60 + ny.getMinutes();
  const preOpen = 4 * 60; // 04:00
  const regOpen = 9 * 60 + 30; // 09:30
  const regClose = 16 * 60; // 16:00
  const postClose = 20 * 60; // 20:00
  if (minutes >= regOpen && minutes < regClose) return "REGULAR";
  if (minutes >= preOpen && minutes < regOpen) return "PRE";
  if (minutes >= regClose && minutes < postClose) return "POST";
  return "CLOSED";
}

export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { symbols: string[] }) => data)
  .handler(async ({ data }): Promise<Quote[]> => {
    const syms = Array.from(
      new Set(data.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    );
    if (syms.length === 0) return [];

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error("[ib] FINNHUB_API_KEY missing");
      return syms.map((s) => ({
        symbol: s,
        last: null,
        prevClose: null,
        phase: "CLOSED" as MarketPhase,
        dailyChange: null,
        dailyChangePct: null,
      }));
    }

    const now = Date.now();
    const results: Quote[] = [];
    const toFetch: string[] = [];
    for (const s of syms) {
      const hit = cache.get(s);
      if (hit && now - hit.at < TTL_MS) results.push(hit.q);
      else toFetch.push(s);
    }

    const fetched = await Promise.all(
      toFetch.map(async (s) => {
        const q = await fetchFinnhubQuote(s, apiKey);
        if (q) {
          cache.set(s, { at: now, q });
          return q;
        }
        return {
          symbol: s,
          last: null,
          prevClose: null,
          phase: "CLOSED" as MarketPhase,
          dailyChange: null,
          dailyChangePct: null,
        };
      }),
    );
    results.push(...fetched);

    // Preserve requested order.
    const by = new Map(results.map((r) => [r.symbol, r]));
    return syms.map((s) => by.get(s)!);
  });