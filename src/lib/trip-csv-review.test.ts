import { describe, expect, it } from "vitest";
import { draftError, tripCsvDrafts } from "./trip-csv-review";

describe("individual trip CSV review", () => {
  const source = Array.from({ length: 15 }, (_, i) => ({ title: `Store ${i}`, date: "2026-11-03", amount: 15 + i, currency: null }));
  it("keeps 15 independent drafts with no inferred categories or payment methods", () => {
    const drafts = tripCsvDrafts(source, "ILS", "shiri");
    drafts[0].categoryId = "food";
    drafts[0].paymentMethod = "cash";
    expect(drafts).toHaveLength(15);
    expect(new Set(drafts.map((r) => r.id)).size).toBe(15);
    expect(drafts[1]).toMatchObject({ categoryId: "", paymentMethod: "", currency: "ILS", person: "shiri", amount: "16" });
    expect(draftError(drafts[0])).toBeNull();
    expect(draftError(drafts[1])).toBe("בחר קטגוריה");
  });
  it("requires missing payment details and rejects invalid dates and amounts before saving", () => {
    const [row] = tripCsvDrafts(source, "EUR", "yonatan");
    if (!row) throw new Error("missing draft");
    row.categoryId = "food";
    expect(draftError(row)).toBe("בחר אמצעי תשלום");
    row.paymentMethod = "cash";
    row.date = "2026-02-31";
    expect(draftError(row)).toBe("בחר תאריך תקין");
    row.date = "2026-11-03";
    row.amount = "0";
    expect(draftError(row)).toBe("הזן סכום גדול מאפס");
  });
});