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
    row.amount = "abc";
    expect(draftError(row)).toBe("הזן סכום תקין (0 ומעלה)");
    row.amount = "0"; // zero rows are kept for documentation
    expect(draftError(row)).toBeNull();
  });
});
import { parseExpenseCsv } from "./csv-import";
import { matchCategoryId } from "./trip-csv-review";
describe("TravelSpend export import", () => {
  const csv = `amount,amountInHomeCurrency,category,conversionRate,country,countryCode,datePaid,homeCurrency,localCurrency,description,notes,paidBy,paidFor,x,paymentMethod,photo,place,latitude,longitude,type
"500.00","70.25","Restaurants","7.118","Czechia","CZ","07/05/2026","ILS","CZK","","2 בירות ונקניקיה","a","a","70.25","Cash","","Prague 6, Czechia","50.11","14.269","Expense"
"7,300.00","7,300.00","General","1","Israel","IL","25/06/2026","ILS","ILS","","חבילה","a","a","7300","Credit Card","","Holon, Israel","","","Expense"
"0.00","0.00","Shopping","0.292","Germany","DE","07/05/2026","ILS","EUR","","zero","a","a","0","Cash","","","","","Expense"`;
  const cats = [{ id: "r", name: "מסעדות" }, { id: "g", name: "הוצאות כללי" }];
  it("reads local amount, currency, notes title, payment and place; keeps zero rows", () => {
    const rows = parseExpenseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ amount: 500, currency: "CZK", title: "2 בירות ונקניקיה", date: "2026-05-07", paymentMethod: "cash", location: "Prague 6, Czechia", category: "Restaurants" });
    expect(rows[1]).toMatchObject({ amount: 7300, currency: "ILS", paymentMethod: "credit" });
    expect(rows[2]).toMatchObject({ amount: 0, currency: "EUR", title: "zero" });
  });
  it("maps categories and marks every row shared", () => {
    const d = tripCsvDrafts(parseExpenseCsv(csv), "ILS", "shared", cats);
    expect(d.map((r) => r.categoryId)).toEqual(["r", "g", ""]);
    expect(d.every((r) => r.person === "shared")).toBe(true);
    expect(matchCategoryId("Flights", cats)).toBe("");
  });
});
