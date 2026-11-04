/** Pure CSV parsing rules for importing trip expenses. */

export interface CsvExpenseRow {
  date: string; // YYYY-MM-DD
  title: string;
  amount: number; // positive
  currency: string | null; // ISO code if detected
  category?: string; // source category name (e.g. TravelSpend "Restaurants")
  paymentMethod?: "cash" | "credit";
  location?: string;
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delim = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return fmt(y, +m[2], +m[1]); // Israeli order: day/month/year
  }
  return null;
}

function fmt(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SYMBOLS: Record<string, string> = { "₪": "ILS", "$": "USD", "€": "EUR", "£": "GBP" };

export function parseAmount(s: string): { amount: number; currency: string | null } | null {
  let currency: string | null = null;
  for (const [sym, code] of Object.entries(SYMBOLS)) if (s.includes(sym)) currency = code;
  const code = s.match(/\b([A-Z]{3})\b/);
  if (code) currency = code[1];
  const num = s.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(num);
  if (!num || !Number.isFinite(n) || n === 0) return null;
  return { amount: Math.abs(Number(n.toFixed(2))), currency };
}

const HEADERS = {
  date: /תאריך|date/i,
  title: /בית\s*עסק|שם|תיאור|פירוט|merchant|description|title|name|payee/i,
  amount: /סכום|חיוב|amount|total|sum|price/i,
  currency: /מטבע|currency/i,
};

export function detectColumns(header: string[]) {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  return {
    date: find(HEADERS.date),
    title: find(HEADERS.title),
    amount: find(HEADERS.amount),
    currency: find(HEADERS.currency),
  };
}

/** TravelSpend exports carry category/payment/place columns; detect them by exact header names. */
function parseTravelSpend(rows: string[][]): CsvExpenseRow[] | null {
  const h = rows[0].map((c) => c.trim());
  const ix = (n: string) => h.indexOf(n);
  const c = { amount: ix("amount"), date: ix("datePaid"), cur: ix("localCurrency"), notes: ix("notes"), desc: ix("description"), cat: ix("category"), pay: ix("paymentMethod"), place: ix("place"), type: ix("type") };
  if (c.amount < 0 || c.date < 0 || c.cur < 0 || c.cat < 0) return null;
  const out: CsvExpenseRow[] = [];
  for (const r of rows.slice(1)) {
    if (c.type >= 0 && r[c.type] && r[c.type] !== "Expense") continue;
    const date = parseDate(r[c.date] ?? "");
    const amt = parseAmount(r[c.amount] ?? "");
    if (!date || !amt) continue;
    const category = (r[c.cat] ?? "").trim();
    const title = (r[c.notes] ?? "").trim() || (c.desc >= 0 ? (r[c.desc] ?? "").trim() : "") || category || "הוצאה מיובאת";
    const pay = (c.pay >= 0 ? r[c.pay] : "")?.trim().toLowerCase();
    out.push({
      date, title, amount: amt.amount,
      currency: (r[c.cur] ?? "").trim().toUpperCase() || null,
      category: category || undefined,
      paymentMethod: pay === "cash" ? "cash" : pay?.includes("credit") ? "credit" : undefined,
      location: (c.place >= 0 ? r[c.place] : "")?.trim() || undefined,
    });
  }
  return out;
}

/** Parses CSV text into expense rows; skips rows without a valid date or amount. */
export function parseExpenseCsv(text: string): CsvExpenseRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const ts = parseTravelSpend(rows);
  if (ts) return ts;
  let cols = detectColumns(rows[0]);
  let body = rows.slice(1);
  if (cols.date < 0 || cols.amount < 0) {
    // No usable header: guess by content of first row.
    const r = rows[0];
    cols = {
      date: r.findIndex((c) => parseDate(c)),
      amount: r.findIndex((c) => !parseDate(c) && parseAmount(c)),
      title: r.findIndex((c) => c && !parseDate(c) && !parseAmount(c)),
      currency: -1,
    };
    body = rows;
    if (cols.date < 0 || cols.amount < 0) return [];
  }
  const out: CsvExpenseRow[] = [];
  for (const r of body) {
    const date = parseDate(r[cols.date] ?? "");
    const amt = parseAmount(r[cols.amount] ?? "");
    if (!date || !amt) continue;
    const curCell = cols.currency >= 0 ? (r[cols.currency] ?? "") : "";
    const currency =
      SYMBOLS[curCell.trim()] ?? (/^[A-Za-z]{3}$/.test(curCell.trim()) ? curCell.trim().toUpperCase() : amt.currency);
    out.push({ date, title: (cols.title >= 0 ? r[cols.title] : "") || "הוצאה מיובאת", amount: amt.amount, currency });
  }
  return out;
}
