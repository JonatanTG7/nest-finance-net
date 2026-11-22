/**
 * Pure rules for the annual pension statement (דוח שנתי) import.
 *
 * The statement's structure is standardized across companies (uniform
 * short report since 2015, fixed tables א'–ה'), so an AI read can
 * reliably extract: company, product type, closing balance, fees in %
 * and the fund's average fees, deposits, expected monthly pension,
 * track NAMES + each track's annual return, and the header's קוד
 * האוצר (Treasury code).
 *
 * What the statement does NOT contain — and this module never
 * invents: track allocation PERCENTAGES (Table ד' lists names +
 * returns only). Imported tracks always start without a percentage;
 * the user fills it in from the member portal, the clearinghouse
 * report, or by hand.
 */

export interface StatementTrack {
  name: string;
  returnYearPct: number | null;
}

export type StatementProductKind = "pension" | "provident" | "savings" | "investment";

export interface StatementFields {
  company: string | null;
  productKind: StatementProductKind | null;
  treasuryCode: string | null;
  balance: number | null;
  feeFromBalance: number | null;
  feeFromDeposits: number | null;
  /** Investment-management expenses % (Table ג') — shown in review, not stored. */
  investmentExpenses: number | null;
  /** The fund's average fees (Table ג') — the fee-alert comparison. */
  avgFeeFromBalance: number | null;
  avgFeeFromDeposits: number | null;
  expectedMonthlyPension: number | null;
  /** Monthly deposits from the latest month in Table ה'. */
  deposits: {
    employee: number | null;
    employer: number | null;
    severance: number | null;
  };
  tracks: StatementTrack[];
}

/* ------------------------------------------------------------------ *
 * קוד האוצר — the structured parse key in the statement header.
 * `9-digit company no. + 14-digit product no. + 4-digit track code +
 * 3-digit insurance-track no. + policy no.`, usually dash-separated:
 * `520042540-00000240100121-2009-101XXXXXXX` (Menora, track 2009).
 * ------------------------------------------------------------------ */

export interface TreasuryCodeParts {
  companyNo: string;
  productNo: string;
  /** 4-digit investment-track code ("0000" when the account has none). */
  trackCode: string;
  insuranceTrackNo: string;
  policyNo: string;
}

/** Parse a Treasury code, dashed or plain digits; null when it does not fit the shape. */
export function parseTreasuryCode(code: string | null | undefined): TreasuryCodeParts | null {
  if (!code) return null;
  const clean = code.trim().replace(/\s+/g, "");
  const parts = clean.split("-");
  if (parts.length >= 4) {
    const [companyNo, productNo, trackCode, rest] = parts;
    if (!/^\d{9}$/.test(companyNo)) return null;
    if (!/^\d{14}$/.test(productNo)) return null;
    if (!/^\d{4}$/.test(trackCode)) return null;
    if (!/^\d{3}/.test(rest)) return null;
    return {
      companyNo,
      productNo,
      trackCode,
      insuranceTrackNo: rest.slice(0, 3),
      policyNo: rest.slice(3),
    };
  }
  // Plain digits, no dashes: slice by fixed positions.
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 30) return null;
  return {
    companyNo: digits.slice(0, 9),
    productNo: digits.slice(9, 23),
    trackCode: digits.slice(23, 27),
    insuranceTrackNo: digits.slice(27, 30),
    policyNo: digits.slice(30),
  };
}

/* ------------------------------------------------------------------ *
 * Product-kind mapping from the statement's Hebrew product type.
 * ------------------------------------------------------------------ */

/** "קרן פנסיה" → pension, "קרן השתלמות"/"קופת גמל" → provident, etc. */
export function mapStatementKind(
  productType: string | null | undefined,
): StatementProductKind | null {
  if (!productType) return null;
  const t = productType.trim();
  if (t.includes("פנסיה")) return "pension";
  if (t.includes("השתלמות") || t.includes("גמל")) return "provident";
  if (t.includes("חיסכון")) return "savings";
  if (t.includes("השקעה")) return "investment";
  return null;
}

/* ------------------------------------------------------------------ *
 * Sanitizing the AI extraction — never trust a raw field.
 * ------------------------------------------------------------------ */

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function num(v: unknown, min: number, max: number): number | null {
  // Number(null) is 0 and Number("") is 0 — reject those before converting.
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

const MAX_TRACKS = 20;

export function parseStatementFields(raw: Record<string, unknown>): StatementFields {
  const depositsRaw =
    raw.deposits != null && typeof raw.deposits === "object"
      ? (raw.deposits as Record<string, unknown>)
      : {};
  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks: StatementTrack[] = [];
  for (const t of tracksRaw.slice(0, MAX_TRACKS)) {
    if (t == null || typeof t !== "object") continue;
    const row = t as Record<string, unknown>;
    const name = text(row.name);
    if (!name) continue;
    tracks.push({ name, returnYearPct: num(row.returnYearPct, -100, 100) });
  }
  const treasuryCode = text(raw.treasuryCode);
  return {
    company: text(raw.company),
    productKind: mapStatementKind(text(raw.productType)),
    treasuryCode: treasuryCode != null && parseTreasuryCode(treasuryCode) ? treasuryCode : null,
    balance: num(raw.balance, 0, 1e12),
    feeFromBalance: num(raw.feeFromBalance, 0, 100),
    feeFromDeposits: num(raw.feeFromDeposits, 0, 100),
    investmentExpenses: num(raw.investmentExpenses, 0, 100),
    avgFeeFromBalance: num(raw.avgFeeFromBalance, 0, 100),
    avgFeeFromDeposits: num(raw.avgFeeFromDeposits, 0, 100),
    expectedMonthlyPension: num(raw.expectedMonthlyPension, 0, 1e9),
    deposits: {
      employee: num(depositsRaw.employee, 0, 1e9),
      employer: num(depositsRaw.employer, 0, 1e9),
      severance: num(depositsRaw.severance, 0, 1e9),
    },
    tracks,
  };
}

/** True when the scan found anything worth importing at all. */
export function hasAnyStatementData(f: StatementFields): boolean {
  return (
    f.company != null ||
    f.productKind != null ||
    f.balance != null ||
    f.feeFromBalance != null ||
    f.feeFromDeposits != null ||
    f.expectedMonthlyPension != null ||
    f.tracks.length > 0
  );
}

/**
 * The investment_accounts columns an import writes (create or update).
 * data_source is always "statement" and source_date is the import day,
 * so the account page can show where the numbers came from.
 */
export function statementAccountColumns(f: StatementFields): {
  treasury_code: string | null;
  expected_monthly_pension: number | null;
  avg_fee_from_balance: number | null;
  avg_fee_from_deposits: number | null;
  data_source: "statement";
  source_date: string;
  monthly_deposit_employee: number | null;
  monthly_deposit_employer: number | null;
  monthly_deposit_severance: number | null;
} {
  return {
    treasury_code: f.treasuryCode,
    expected_monthly_pension: f.expectedMonthlyPension,
    avg_fee_from_balance: f.avgFeeFromBalance,
    avg_fee_from_deposits: f.avgFeeFromDeposits,
    data_source: "statement",
    source_date: new Date().toISOString().slice(0, 10),
    monthly_deposit_employee: f.deposits.employee,
    monthly_deposit_employer: f.deposits.employer,
    monthly_deposit_severance: f.deposits.severance,
  };
}
