import { describe, expect, it } from "vitest";
import { categoryIdForSync } from "./subscriptions";

describe("categoryIdForSync", () => {
  it("keeps the subscription's own category when it has one", () => {
    expect(categoryIdForSync("cat-own", "cat-subs")).toBe("cat-own");
  });
  it("falls back to the global מנויים category when the subscription has none", () => {
    expect(categoryIdForSync(null, "cat-subs")).toBe("cat-subs");
  });
  it("keeps the old behavior (null) when there is no fallback either", () => {
    expect(categoryIdForSync(null, null)).toBeNull();
  });
});
