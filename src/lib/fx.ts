/**
 * Live exchange rates to ILS. Uses open.er-api.com (free, no auth, CORS-friendly)
 * with Frankfurter as a secondary source. Throws when both fail so callers can
 * surface the error instead of displaying stale/mock numbers.
 *
 * FX rule (applies everywhere): a missing rate is NEVER replaced by 1 or by a
 * hardcoded guess. useUsdIlsRate() falls back to the last-known-good rate
 * (with its timestamp, marked stale) and returns null when even that is
 * missing — the UI then shows "rate unavailable" instead of a wrong ₪ number.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isFxRateUsable } from "@/lib/ib-rules";

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

const FX_CACHE_KEY = "fx.usdils.lastKnown.v1";

export interface LastKnownRate {
  rate: number;
  at: number;
}

function loadLastKnownRate(): LastKnownRate | null {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rate?: unknown; at?: unknown };
    if (!isFxRateUsable(parsed.rate) || typeof parsed.at !== "number") return null;
    return { rate: parsed.rate, at: parsed.at };
  } catch {
    return null;
  }
}

function saveLastKnownRate(rate: number, at: number) {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, at }));
  } catch {
    /* ignore */
  }
}

export interface UsdIlsRateState {
  /** Live rate, or the last-known-good rate when live fetch fails. Null when neither exists. */
  rate: number | null;
  /** True when `rate` is a cached value because the live fetch failed. */
  stale: boolean;
  /** When `rate` was fetched (live) or last cached. Null when no rate at all. */
  updatedAt: number | null;
  isFetching: boolean;
}

/**
 * USD→ILS rate that refreshes in the background (every 30 min) and survives
 * outages via the last-known-good rate. Never returns a guessed rate.
 */
export function useUsdIlsRate(): UsdIlsRateState {
  const [lastKnown, setLastKnown] = useState<LastKnownRate | null>(() => loadLastKnownRate());
  const q = useQuery({
    queryKey: ["fx", "usdils"],
    queryFn: fetchUsdIlsRate,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchIntervalInBackground: true,
    retry: 1,
  });

  useEffect(() => {
    if (q.data != null && isFxRateUsable(q.data)) {
      const at = q.dataUpdatedAt || Date.now();
      saveLastKnownRate(q.data, at);
      setLastKnown({ rate: q.data, at });
    }
  }, [q.data, q.dataUpdatedAt]);

  if (q.data != null && isFxRateUsable(q.data)) {
    return {
      rate: q.data,
      stale: false,
      updatedAt: q.dataUpdatedAt || Date.now(),
      isFetching: q.isFetching,
    };
  }
  if (lastKnown) {
    return { rate: lastKnown.rate, stale: true, updatedAt: lastKnown.at, isFetching: q.isFetching };
  }
  return { rate: null, stale: false, updatedAt: null, isFetching: q.isFetching };
}
