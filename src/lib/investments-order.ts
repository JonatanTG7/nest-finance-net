import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ *
 * Investments index card order: the user can reorder the account cards
 * and the vouchers card. The order is stored per device in localStorage
 * (like the other personal settings); new cards appear at the end.
 * The grand-total card is fixed at the top and is not part of the order.
 * ------------------------------------------------------------------ */

const ORDER_KEY = "investments_card_order";

/** Stable id of the vouchers card in the order list. */
export const VOUCHERS_CARD_ID = "vouchers";

/**
 * Merges a saved order with the cards that exist right now: keeps the
 * saved sequence for surviving cards, appends new cards at the end (in
 * their current order), and drops ids that no longer exist. With no
 * saved order the current order is kept as-is.
 */
export function mergeCardOrder(saved: string[] | null, currentIds: string[]): string[] {
  if (!saved || saved.length === 0) return [...currentIds];
  const current = new Set(currentIds);
  const kept = saved.filter((id) => current.has(id));
  const seen = new Set(kept);
  const appended = currentIds.filter((id) => !seen.has(id));
  return [...kept, ...appended];
}

/**
 * Moves one card one step up or down in the order. No-op at the edges
 * and for unknown ids; never mutates the input.
 */
export function moveCardOrder(order: string[], id: string, direction: "up" | "down"): string[] {
  const idx = order.indexOf(id);
  if (idx === -1) return [...order];
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function loadCardOrder(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCardOrder(order: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

/**
 * Reactive card order for the investments index. `currentIds` may change
 * as accounts load; the saved order is re-merged against them every
 * render, so new cards land at the end automatically.
 */
export function useCardOrder(currentIds: string[]) {
  const [saved, setSaved] = useState<string[] | null>(null);

  useEffect(() => {
    setSaved(loadCardOrder());
  }, []);

  const orderedIds = useMemo(
    () => mergeCardOrder(saved, currentIds),
    // Callers pass a memoized id list.
    [saved, currentIds],
  );

  const move = useCallback(
    (id: string, direction: "up" | "down") => {
      const next = moveCardOrder(orderedIds, id, direction);
      setSaved(next);
      saveCardOrder(next);
    },
    [orderedIds],
  );

  return { orderedIds, move };
}
