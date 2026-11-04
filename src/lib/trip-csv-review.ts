import type { CsvExpenseRow } from "./csv-import";
import { parseDate } from "./csv-import";
import type { Person } from "./person";

export type TripCsvDraft = {
  id: number;
  on: boolean;
  title: string;
  date: string;
  amount: string;
  currency: string;
  categoryId: string;
  person: Person;
  paymentMethod: string;
  creditCardId: string;
  note: string;
  location: string;
};

/** Source (TravelSpend) category → candidate Hebrew category names, first existing match wins. */
export const SOURCE_CATEGORY_NAMES: Record<string, string[]> = {
  flights: ["טיסות"],
  restaurants: ["מסעדות"],
  transportation: ["תחבורה ציבורית", "תחבורה"],
  accommodation: ["לינה"],
  groceries: ["סופר"],
  shopping: ["קניות"],
  drinks: ["שתייה"],
  coffee: ["קפה"],
  entertainment: ["בילויים"],
  "fees & charges": ["עמלות"],
  general: ["הוצאות כללי", "כללי"],
};

export function matchCategoryId(source: string | undefined, cats: { id: string; name: string }[]): string {
  if (!source) return "";
  const s = source.trim().toLowerCase();
  for (const name of SOURCE_CATEGORY_NAMES[s] ?? []) {
    const hit = cats.find((c) => c.name.trim() === name);
    if (hit) return hit.id;
  }
  return cats.find((c) => c.name.trim().toLowerCase() === s)?.id ?? "";
}

export function tripCsvDrafts(
  rows: CsvExpenseRow[], currency: string, person: Person,
  cats: { id: string; name: string }[] = [],
): TripCsvDraft[] {
  return rows.map((row, id) => ({
    id, on: true, title: row.title, date: row.date, amount: String(row.amount),
    currency: row.currency ?? currency, categoryId: matchCategoryId(row.category, cats), person,
    paymentMethod: row.paymentMethod ?? "", creditCardId: "", note: "", location: row.location ?? "",
  }));
}

export function draftError(row: TripCsvDraft): string | null {
  if (!row.categoryId) return "בחר קטגוריה";
  if (!row.title.trim()) return "הזן שם לתנועה";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || parseDate(row.date) !== row.date) return "בחר תאריך תקין";
  const date = new Date(`${row.date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) return "בחר תאריך תקין";
  if (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) return "הזן סכום תקין (0 ומעלה)";
  if (!/^[A-Z]{3}$/.test(row.currency)) return "הזן קוד מטבע תקין, למשל ILS";
  if (!row.paymentMethod) return "בחר אמצעי תשלום";
  return null;
}