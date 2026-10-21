import { describe, expect, it } from "vitest";
import { matchReceiptCard, parseReceiptFields, receiptTitle } from "./receipt-rules";

describe("receipt extraction", () => {
  it("keeps the merchant and area together in the name", () => {
    expect(receiptTitle("סופר", "תל אביב")).toBe("סופר · תל אביב");
    expect(receiptTitle("סופר תל אביב", "תל אביב")).toBe("סופר תל אביב");
    expect(receiptTitle("סופר", null)).toBe("סופר");
  });
  it("matches only a unique exact last-four card", () => {
    const cards = [{ id: "a", last_four: "1234" }, { id: "b", last_four: "5678" }];
    expect(matchReceiptCard("1234", cards)?.id).toBe("a");
    expect(matchReceiptCard(null, cards)).toBeNull();
    expect(matchReceiptCard("9999", cards)).toBeNull();
    expect(matchReceiptCard("1234", [...cards, { id: "c", last_four: "1234" }])).toBeNull();
  });
  it("extracts cash and credit without guessing an unidentified method", () => {
    expect(parseReceiptFields({ paymentMethod: "cash" }, []).paymentMethod).toBe("cash");
    expect(parseReceiptFields({ paymentMethod: "credit", cardLastFour: "1234" }, []).cardLastFour).toBe("1234");
    expect(parseReceiptFields({ paymentMethod: "maybe", cardLastFour: "12" }, []).paymentMethod).toBeNull();
  });
  it("rejects invalid amounts, dates and categories", () => {
    const fields = parseReceiptFields({ amount: -2, date: "2026-02-30", category: "unknown" }, ["סופר"]);
    expect(fields.amount).toBeNull();
    expect(fields.date).toBeNull();
    expect(fields.category).toBeNull();
    expect(parseReceiptFields({ amount: 123.45, category: "סופר" }, ["סופר"]).amount).toBe(123.45);
  });
});