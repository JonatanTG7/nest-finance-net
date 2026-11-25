import { describe, expect, it } from "vitest";
import { mergeCardOrder, moveCardOrder, moveCardWithinSubset } from "./investments-order";

describe("mergeCardOrder", () => {
  it("keeps the current order when nothing is saved", () => {
    expect(mergeCardOrder(null, ["a", "b", "vouchers"])).toEqual(["a", "b", "vouchers"]);
    expect(mergeCardOrder([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps the saved order for surviving cards", () => {
    expect(mergeCardOrder(["b", "a"], ["a", "b"])).toEqual(["b", "a"]);
    expect(mergeCardOrder(["vouchers", "a", "b"], ["a", "b", "vouchers"])).toEqual([
      "vouchers",
      "a",
      "b",
    ]);
  });

  it("appends new cards at the end in current order", () => {
    expect(mergeCardOrder(["b", "a"], ["a", "b", "c", "d"])).toEqual(["b", "a", "c", "d"]);
  });

  it("drops saved ids that no longer exist", () => {
    expect(mergeCardOrder(["gone", "b", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });

  it("never mutates its inputs", () => {
    const saved = ["b", "a"];
    const current = ["a", "b", "c"];
    mergeCardOrder(saved, current);
    expect(saved).toEqual(["b", "a"]);
    expect(current).toEqual(["a", "b", "c"]);
  });
});

describe("moveCardOrder", () => {
  it("moves a card one step up or down", () => {
    expect(moveCardOrder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveCardOrder(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the edges and for unknown ids", () => {
    expect(moveCardOrder(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveCardOrder(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(moveCardOrder(["a", "b"], "zzz", "up")).toEqual(["a", "b"]);
  });

  it("never mutates its input", () => {
    const order = ["a", "b", "c"];
    moveCardOrder(order, "b", "up");
    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("moveCardWithinSubset", () => {
  it("swaps with the adjacent card of the same subset, skipping others", () => {
    // Full order: shared a, person's b, shared c, person's d, vouchers.
    const full = ["a", "b", "c", "d", "vouchers"];
    expect(moveCardWithinSubset(full, ["b", "d"], "d", "up")).toEqual([
      "a",
      "d",
      "c",
      "b",
      "vouchers",
    ]);
    expect(moveCardWithinSubset(full, ["b", "d"], "b", "down")).toEqual([
      "a",
      "d",
      "c",
      "b",
      "vouchers",
    ]);
  });

  it("is a no-op at the subset edges and for unknown ids", () => {
    const full = ["a", "b", "c", "d"];
    expect(moveCardWithinSubset(full, ["b", "d"], "b", "up")).toEqual(full);
    expect(moveCardWithinSubset(full, ["b", "d"], "d", "down")).toEqual(full);
    expect(moveCardWithinSubset(full, ["b", "d"], "zzz", "up")).toEqual(full);
    expect(moveCardWithinSubset(full, ["b", "d"], "a", "up")).toEqual(full);
  });

  it("keeps cards outside the subset exactly where they were", () => {
    const full = ["a", "b", "c", "d", "vouchers"];
    const next = moveCardWithinSubset(full, ["b", "d"], "b", "down");
    expect(next.filter((id) => !["b", "d"].includes(id))).toEqual(["a", "c", "vouchers"]);
  });

  it("never mutates its input", () => {
    const full = ["a", "b", "c", "d"];
    moveCardWithinSubset(full, ["b", "d"], "d", "up");
    expect(full).toEqual(["a", "b", "c", "d"]);
  });
});
