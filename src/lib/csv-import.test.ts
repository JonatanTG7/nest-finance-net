import { describe, expect, it } from "vitest";
import { parseAmount, parseDate, parseExpenseCsv } from "./csv-import";

describe("csv import", () => {
  it("reads Israeli day/month/year dates", () => {
    expect(parseDate("05/03/2026")).toBe("2026-03-05");
    expect(parseDate("5.3.26")).toBe("2026-03-05");
  });
  it("reads amounts with thousands separators and symbols", () => {
    expect(parseAmount("€1,234.50")).toEqual({ amount: 1234.5, currency: "EUR" });
  });
  it("parses Hebrew-header CSV with currency column", () => {
    const rows = parseExpenseCsv('תאריך,בית עסק,סכום,מטבע\n01/08/2026,"Cafe, Rome",12.5,EUR\nבלי,שורה,x,\n');
    expect(rows).toEqual([{ date: "2026-08-01", title: "Cafe, Rome", amount: 12.5, currency: "EUR" }]);
  });
});

describe("TravelSpend home currency", () => {
  it("uses amountInHomeCurrency and homeCurrency", () => {
    const csv = 'amount,amountInHomeCurrency,category,datePaid,homeCurrency,localCurrency,notes\n"500.00","70.25","Restaurants","07/05/2026","ILS","CZK","בירות"\n"3,127.00","783.80","Flights","07/10/2022","EUR","ILS","מלונות"';
    const rows = parseExpenseCsv(csv);
    expect(rows.map((r) => [r.amount, r.currency])).toEqual([[70.25, "ILS"], [783.8, "EUR"]]);
  });
});
