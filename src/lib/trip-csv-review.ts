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

export function tripCsvDrafts(rows: CsvExpenseRow[], currency: string, person: Person): TripCsvDraft[] {
  return rows.map((row, id) => ({
    id, on: true, title: row.title, date: row.date, amount: String(row.amount),
    currency: row.currency ?? currency, categoryId: "", person,
    paymentMethod: "", creditCardId: "", note: "", location: "",
  }));
}

export function draftError(row: TripCsvDraft): string | null {
  if (!row.categoryId) return "בחר קטגוריה";
  if (!row.title.trim()) return "הזן שם לתנועה";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || parseDate(row.date) !== row.date) return "בחר תאריך תקין";
  const date = new Date(`${row.date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) return "בחר תאריך תקין";
  if (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) return "הזן סכום גדול מאפס";
  if (!/^[A-Z]{3}$/.test(row.currency)) return "הזן קוד מטבע תקין, למשל ILS";
  if (!row.paymentMethod) return "בחר אמצעי תשלום";
  return null;
}