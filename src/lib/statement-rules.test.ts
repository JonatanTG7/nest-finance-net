import { describe, expect, it } from "vitest";
import {
  hasAnyStatementData,
  mapStatementKind,
  parseStatementFields,
  parseTreasuryCode,
  statementAccountColumns,
} from "./statement-rules";

describe("parseTreasuryCode", () => {
  it("parses the dashed Menora example", () => {
    expect(parseTreasuryCode("520042540-00000240100121-2009-101XXXXXXX")).toEqual({
      companyNo: "520042540",
      productNo: "00000240100121",
      trackCode: "2009",
      insuranceTrackNo: "101",
      policyNo: "XXXXXXX",
    });
  });
  it("parses plain digits by fixed positions", () => {
    const parts = parseTreasuryCode("520042540000002401001212009101123456");
    expect(parts?.companyNo).toBe("520042540");
    expect(parts?.trackCode).toBe("2009");
    expect(parts?.insuranceTrackNo).toBe("101");
  });
  it("rejects malformed codes", () => {
    expect(parseTreasuryCode(null)).toBeNull();
    expect(parseTreasuryCode("")).toBeNull();
    expect(parseTreasuryCode("123-456")).toBeNull();
    expect(parseTreasuryCode("not a code")).toBeNull();
  });
});

describe("mapStatementKind", () => {
  it("maps Hebrew product types to account kinds", () => {
    expect(mapStatementKind("קרן פנסיה חדשה")).toBe("pension");
    expect(mapStatementKind("קרן השתלמות")).toBe("provident");
    expect(mapStatementKind("קופת גמל")).toBe("provident");
    expect(mapStatementKind("חיסכון לכל ילד")).toBe("savings");
    expect(mapStatementKind("קופת גמל להשקעה")).toBe("provident");
    expect(mapStatementKind("משהו אחר")).toBeNull();
    expect(mapStatementKind(null)).toBeNull();
  });
});

describe("parseStatementFields", () => {
  const raw = {
    company: "מנורה מבטחים",
    productType: "קרן פנסיה חדשה",
    treasuryCode: "520042540-00000240100121-2009-101XXXXXXX",
    balance: 131969,
    feeFromBalance: 0.1,
    feeFromDeposits: 1.5,
    investmentExpenses: 0.05,
    avgFeeFromBalance: 0.15,
    avgFeeFromDeposits: 1.73,
    expectedMonthlyPension: 4200,
    deposits: { employee: 500, employer: 700, severance: 400 },
    tracks: [
      { name: "מסלול מניות", returnYearPct: -9.39 },
      { name: "מסלול מחקה מדד S&P500", returnYearPct: -2.3 },
      { name: "מסלול לבני 50 ומטה", returnYearPct: null },
    ],
  };
  it("parses a full valid extraction, keeping negative returns", () => {
    const f = parseStatementFields(raw);
    expect(f.company).toBe("מנורה מבטחים");
    expect(f.productKind).toBe("pension");
    expect(f.treasuryCode).toBe(raw.treasuryCode);
    expect(f.balance).toBe(131969);
    expect(f.feeFromBalance).toBe(0.1);
    expect(f.avgFeeFromDeposits).toBe(1.73);
    expect(f.expectedMonthlyPension).toBe(4200);
    expect(f.deposits).toEqual({ employee: 500, employer: 700, severance: 400 });
    expect(f.tracks).toEqual([
      { name: "מסלול מניות", returnYearPct: -9.39 },
      { name: "מסלול מחקה מדד S&P500", returnYearPct: -2.3 },
      { name: "מסלול לבני 50 ומטה", returnYearPct: null },
    ]);
  });
  it("nulls out-of-range and garbage values instead of trusting them", () => {
    const f = parseStatementFields({
      balance: -5,
      feeFromBalance: 150,
      feeFromDeposits: "not a number",
      expectedMonthlyPension: "abc",
      treasuryCode: "garbage",
      deposits: { employee: -10, employer: "x" },
      tracks: [
        { name: "  ", returnYearPct: 5 },
        { name: "מסלול תקין", returnYearPct: 250 },
        "not an object",
      ],
    });
    expect(f.balance).toBeNull();
    expect(f.feeFromBalance).toBeNull();
    expect(f.feeFromDeposits).toBeNull();
    expect(f.expectedMonthlyPension).toBeNull();
    expect(f.treasuryCode).toBeNull();
    expect(f.deposits).toEqual({ employee: null, employer: null, severance: null });
    expect(f.tracks).toEqual([{ name: "מסלול תקין", returnYearPct: null }]);
  });
  it("accepts numeric strings", () => {
    const f = parseStatementFields({ balance: "131969", feeFromBalance: "0.1" });
    expect(f.balance).toBe(131969);
    expect(f.feeFromBalance).toBe(0.1);
  });
});

describe("hasAnyStatementData", () => {
  it("is false for an empty extraction", () => {
    expect(hasAnyStatementData(parseStatementFields({}))).toBe(false);
  });
  it("is true when any field was found", () => {
    expect(hasAnyStatementData(parseStatementFields({ company: "כלל" }))).toBe(true);
  });
});

describe("statementAccountColumns", () => {
  it("maps fields to account columns with statement source", () => {
    const cols = statementAccountColumns(parseStatementFields({ company: "x", balance: 100 }));
    expect(cols.data_source).toBe("statement");
    expect(cols.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cols.treasury_code).toBeNull();
    expect(cols.monthly_deposit_employee).toBeNull();
  });
});
