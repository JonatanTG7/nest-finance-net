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

/**
 * Moves one card one step up or down among a SUBSET of the full order
 * (e.g. one person's accounts on their tab), keeping every other card
 * exactly where it was. The card swaps with the previous/next card of
 * the same subset — never with a card that isn't shown here. No-op at
 * the subset edges and for unknown ids; never mutates the input.
 */
export function moveCardWithinSubset(
  fullOrder: string[],
  subsetIds: string[],
  id: string,
  direction: "up" | "down",
): string[] {
  const subset = new Set(subsetIds);
  const positions = fullOrder.map((x, i) => (subset.has(x) ? i : -1)).filter((i) => i >= 0);
  const at = positions.findIndex((i) => fullOrder[i] === id);
  if (at === -1) return [...fullOrder];
  const target = direction === "up" ? at - 1 : at + 1;
  if (target < 0 || target >= positions.length) return [...fullOrder];
  const next = [...fullOrder];
  const a = positions[at];
  const b = positions[target];
  [next[a], next[b]] = [next[b], next[a]];
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
 * Reactive card order over a FULL id list (every account + the vouchers
 * card). The saved order is re-merged against it every render, so new
 * cards land at the end automatically. `moveWithin` moves one card
 * inside a subset of the full list — the person pages show a subset,
 * but the move is saved against the full order, so arranging in one
 * place arranges in the other and nothing else moves.
 */
export function useSharedCardOrder(allIds: string[]) {
  const [saved, setSaved] = useState<string[] | null>(null);

  useEffect(() => {
    setSaved(loadCardOrder());
  }, []);

  const orderedIds = useMemo(
    () => mergeCardOrder(saved, allIds),
    // Callers pass a memoized id list.
    [saved, allIds],
  );

  const moveWithin = useCallback(
    (subsetIds: string[], id: string, direction: "up" | "down") => {
      const next = moveCardWithinSubset(orderedIds, subsetIds, id, direction);
      setSaved(next);
      saveCardOrder(next);
    },
    [orderedIds],
  );

  return { orderedIds, moveWithin };
}

/**
 * Reactive card order for the investments index. `currentIds` may change
 * as accounts load; the saved order is re-merged against them every
 * render, so new cards land at the end automatically.
 */
export function useCardOrder(currentIds: string[]) {
  const { orderedIds, moveWithin } = useSharedCardOrder(currentIds);
  const move = useCallback(
    (id: string, direction: "up" | "down") => moveWithin(currentIds, id, direction),
    [moveWithin, currentIds],
  );
  return { orderedIds, move };
}
