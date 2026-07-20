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

// In-worker cache to soften Yahoo rate limits.
const cache = new Map<string, { at: number; q: Quote }>();
const TTL_MS = 30_000;

type YahooQuote = {
  symbol: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
};

function classifyPhase(state?: string): MarketPhase {
  const s = (state || "").toUpperCase();
  if (s === "REGULAR") return "REGULAR";
  if (s === "PRE" || s === "PREPRE") return "PRE";
  if (s === "POST" || s === "POSTPOST" || s === "AFTERAFTER" || s === "AFTER") return "POST";
  return "CLOSED";
}

function pickActive(y: YahooQuote): {
  last: number | null;
  phase: MarketPhase;
  change: number | null;
  changePct: number | null;
} {
  const phase = classifyPhase(y.marketState);
  const reg = typeof y.regularMarketPrice === "number" ? y.regularMarketPrice : null;
  if (phase === "PRE" && typeof y.preMarketPrice === "number") {
    return {
      last: y.preMarketPrice,
      phase,
      change: y.preMarketChange ?? null,
      changePct: y.preMarketChangePercent ?? null,
    };
  }
  if (phase === "POST" && typeof y.postMarketPrice === "number") {
    return {
      last: y.postMarketPrice,
      phase,
      change: y.postMarketChange ?? null,
      changePct: y.postMarketChangePercent ?? null,
    };
  }
  if (phase === "REGULAR" && reg != null) {
    return {
      last: reg,
      phase,
      change: y.regularMarketChange ?? null,
      changePct: y.regularMarketChangePercent ?? null,
    };
  }
  // Closed → prefer post market, fallback to regular.
  const closedPrice =
    (typeof y.postMarketPrice === "number" ? y.postMarketPrice : null) ?? reg;
  return {
    last: closedPrice,
    phase: "CLOSED",
    change: y.regularMarketChange ?? null,
    changePct: y.regularMarketChangePercent ?? null,
  };
}

async function fetchYahooBatch(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  if (symbols.length === 0) return out;
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = (await r.json()) as { quoteResponse?: { result?: YahooQuote[] } };
  for (const q of j?.quoteResponse?.result ?? []) {
    if (q?.symbol) out.set(q.symbol.toUpperCase(), q);
  }
  return out;
}

export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { symbols: string[] }) => data)
  .handler(async ({ data }): Promise<Quote[]> => {
    const syms = Array.from(
      new Set(data.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    );
    if (syms.length === 0) return [];

    const now = Date.now();
    const fresh = new Map<string, Quote>();
    const stale: string[] = [];
    for (const s of syms) {
      const hit = cache.get(s);
      if (hit && now - hit.at < TTL_MS) fresh.set(s, hit.q);
      else stale.push(s);
    }

    if (stale.length > 0) {
      try {
        const batch = await fetchYahooBatch(stale);
        for (const s of stale) {
          const y = batch.get(s);
          if (!y) {
            fresh.set(s, {
              symbol: s,
              last: null,
              prevClose: null,
              phase: "CLOSED",
              dailyChange: null,
              dailyChangePct: null,
            });
            continue;
          }
          const active = pickActive(y);
          const q: Quote = {
            symbol: s,
            last: active.last,
            prevClose: y.regularMarketPreviousClose ?? null,
            phase: active.phase,
            dailyChange: active.change,
            dailyChangePct: active.changePct,
          };
          cache.set(s, { at: now, q });
          fresh.set(s, q);
        }
      } catch (e) {
        console.error("[ib] yahoo error", e);
        for (const s of stale) {
          fresh.set(s, {
            symbol: s,
            last: null,
            prevClose: null,
            phase: "CLOSED",
            dailyChange: null,
            dailyChangePct: null,
          });
        }
      }
    }

    return syms.map((s) => fresh.get(s)!);
  });
