import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchAllIbHoldings, fetchAllIbPositions } from "@/lib/ib";
import { getQuotes } from "@/lib/ib.functions";
import { useUsdIlsRate } from "@/lib/fx";
import { computeIbTotals, type IbTotal } from "@/lib/net-worth";

/**
 * Live per-portfolio IB totals (cash + positions), keyed by account id —
 * shared by the assets index and the person pages, so an IB portfolio
 * shows the same value wherever it appears. IB portfolios are valued
 * from live positions, never from transactions, so callers overlay this
 * map on top of computeAccountTotals (which skips IB accounts).
 * No hardcoded fallback rate: when the rate is unavailable the ₪ values
 * come back null instead of a wrong number.
 */
export function useIbTotalsMap(): Map<string, IbTotal> {
  const getQuotesFn = useServerFn(getQuotes);
  const { data: ibHoldings = [] } = useQuery({
    queryKey: ["ib", "holdings", "all"],
    queryFn: fetchAllIbHoldings,
    refetchInterval: 10_000,
  });
  const { data: ibPositions = [] } = useQuery({
    queryKey: ["ib", "positions", "all"],
    queryFn: fetchAllIbPositions,
    refetchInterval: 15_000,
  });
  const { rate: fxRate } = useUsdIlsRate();
  const ibSymbols = useMemo(
    () => Array.from(new Set(ibPositions.map((p) => p.symbol))),
    [ibPositions],
  );
  const { data: ibQuotes = [] } = useQuery({
    queryKey: ["ib", "quotes", ibSymbols],
    queryFn: () => getQuotesFn({ data: { symbols: ibSymbols } }),
    enabled: ibSymbols.length > 0,
    staleTime: 5_000,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });

  return useMemo(
    () => computeIbTotals(ibHoldings, ibPositions, ibQuotes, fxRate),
    [ibHoldings, ibPositions, ibQuotes, fxRate],
  );
}
