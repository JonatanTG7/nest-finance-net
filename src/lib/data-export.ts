/**
 * Data export: household backup as CSV files, one per area.
 *
 * CSV dialect: comma delimiter, RFC 4180 quoting, CRLF line endings, UTF-8
 * BOM prefix so Hebrew opens correctly in Excel (the app's own importer
 * already strips a leading BOM — see csv-import.ts). Headers are English
 * snake_case; values keep their original Hebrew text. Numbers are plain
 * (no thousands separators); dates stay ISO.
 *
 * Deliberate choice: NO privacy masking in the export. This is the user's
 * own backup file, downloaded by them — masking would defeat the purpose.
 *
 * All row-builders take minimal structural types (Pick of the fields they
 * use), so they are easy to test without full database rows.
 */
import { isoLocal } from "@/lib/dates";
import { cardLabel } from "@/lib/credit_cards";
import type { Category, InvestmentAccount, Tag, Transaction } from "@/lib/db";
import type { IbHoldings, IbPosition, IbTransaction } from "@/lib/ib";
import type { Subscription } from "@/lib/subscriptions";
import type { RecurringIncome } from "@/lib/recurring-income";
import type { TrackAllocationRow } from "@/lib/track-splits";
import type { TradeJournalEntry } from "@/lib/trade-journal";
import type { Trip } from "@/lib/trips";
import type { Voucher } from "@/lib/vouchers";
import type { CreditCard } from "@/lib/credit_cards";
import type { HouseholdPersonRow } from "@/lib/household-people";

export interface CsvSheet {
  headers: string[];
  rows: unknown[][];
}

/** RFC 4180 cell escaping: null/undefined → empty, quote when the value contains , " or a newline. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** BOM + header + rows, CRLF-separated. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * True when a Supabase error means the table doesn't exist (yet) — i.e. its
 * migration hasn't run. PostgREST reports a missing table as PGRST205
 * ("Could not find the table ... in the schema cache"). Used so the export
 * degrades to an empty sheet for a not-yet-migrated table instead of
 * failing the whole backup; any other error still aborts the export.
 */
export function isMissingTableError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  if (code === "PGRST205") return true;
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && message.includes("Could not find the table");
}

/** `family-spend-<area>-YYYY-MM-DD.csv`, using the LOCAL calendar date. */
export function exportFileName(area: string, date: Date = new Date()): string {
  return `family-spend-${area}-${isoLocal(date)}.csv`;
}

/** Triggers a browser download of one CSV file. */
export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ExportTransaction = Pick<
  Transaction,
  | "id"
  | "occurred_at"
  | "type"
  | "title"
  | "amount"
  | "currency"
  | "fx_rate_to_ils"
  | "amount_ils"
  | "entered_by"
  | "payment_method"
  | "credit_card_id"
  | "trip_id"
  | "subscription_id"
  | "note"
  | "location"
  | "created_at"
  | "photo_url"
> & {
  category: Pick<Category, "name"> | null;
  transaction_tags: { tag: Pick<Tag, "name"> }[];
  investment_account?: Pick<InvestmentAccount, "name"> | null;
};

export type TripRef = Pick<Trip, "id" | "name">;
export type CategoryRef = Pick<Category, "id" | "name">;

const TRANSACTION_HEADERS = [
  "id",
  "occurred_at",
  "type",
  "title",
  "amount",
  "currency",
  "fx_rate_to_ils",
  "amount_ils",
  "category",
  "entered_by",
  "payment_method",
  "credit_card",
  "investment_account",
  "trip",
  "tags",
  "note",
  "location",
  "subscription_id",
  "created_at",
  "photo_url",
];

/**
 * Transactions sheet: lookups resolved to names (category, card, account,
 * trip), tags joined with ";". photo_url is the raw storage path as stored
 * (fetchAllTransactions does not sign it).
 */
export function transactionsToRows(
  txs: ExportTransaction[],
  creditCards: CreditCard[],
  trips: TripRef[],
): CsvSheet {
  const cardsById = new Map(creditCards.map((c) => [c.id, c]));
  const tripsById = new Map(trips.map((t) => [t.id, t]));
  return {
    headers: TRANSACTION_HEADERS,
    rows: txs.map((tx) => {
      const card = tx.credit_card_id ? cardsById.get(tx.credit_card_id) : undefined;
      const trip = tx.trip_id ? tripsById.get(tx.trip_id) : undefined;
      return [
        tx.id,
        tx.occurred_at,
        tx.type,
        tx.title,
        tx.amount,
        tx.currency,
        tx.fx_rate_to_ils,
        tx.amount_ils,
        tx.category?.name ?? "",
        tx.entered_by,
        tx.payment_method,
        card ? cardLabel(card) : "",
        tx.investment_account?.name ?? "",
        trip?.name ?? "",
        tx.transaction_tags.map((tt) => tt.tag.name).join("; "),
        tx.note,
        tx.location,
        tx.subscription_id,
        tx.created_at,
        tx.photo_url,
      ];
    }),
  };
}

export type ExportAccount = Pick<
  InvestmentAccount,
  | "id"
  | "name"
  | "kind"
  | "person"
  | "company"
  | "fee_from_balance"
  | "fee_from_deposits"
  | "track"
  | "currency"
  | "starting_balance"
  | "starting_balance_ils"
  | "balance_reset_at"
  | "color"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

/** Accounts sheet: table columns 1:1, household_id dropped (same on every row). */
export function accountsToRows(accounts: ExportAccount[]): CsvSheet {
  return {
    headers: [
      "id",
      "name",
      "kind",
      "person",
      "company",
      "fee_from_balance",
      "fee_from_deposits",
      "track",
      "currency",
      "starting_balance",
      "starting_balance_ils",
      "balance_reset_at",
      "color",
      "sort_order",
      "created_at",
      "updated_at",
    ],
    rows: accounts.map((a) => [
      a.id,
      a.name,
      a.kind,
      a.person,
      a.company,
      a.fee_from_balance,
      a.fee_from_deposits,
      a.track,
      a.currency,
      a.starting_balance,
      a.starting_balance_ils,
      a.balance_reset_at,
      a.color,
      a.sort_order,
      a.created_at,
      a.updated_at,
    ]),
  };
}

export type ExportTrackAllocation = Pick<
  TrackAllocationRow,
  | "id"
  | "investment_account_id"
  | "track_name"
  | "track_code"
  | "track_type"
  | "allocation_pct_balance"
  | "allocation_pct_deposits"
  | "return_year_pct"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

/** Track splits sheet: table columns 1:1, household_id dropped. */
export function trackAllocationsToRows(allocations: ExportTrackAllocation[]): CsvSheet {
  return {
    headers: [
      "id",
      "investment_account_id",
      "track_name",
      "track_code",
      "track_type",
      "allocation_pct_balance",
      "allocation_pct_deposits",
      "return_year_pct",
      "sort_order",
      "created_at",
      "updated_at",
    ],
    rows: allocations.map((a) => [
      a.id,
      a.investment_account_id,
      a.track_name,
      a.track_code,
      a.track_type,
      a.allocation_pct_balance,
      a.allocation_pct_deposits,
      a.return_year_pct,
      a.sort_order,
      a.created_at,
      a.updated_at,
    ]),
  };
}

/** Recurring-income sheet: columns 1:1 (no payment method / card — income has none). */
export function recurringIncomeToRows(items: RecurringIncome[]): CsvSheet {
  return {
    headers: [
      "id",
      "name",
      "emoji",
      "category_id",
      "amount",
      "currency",
      "billing_day",
      "entered_by",
      "start_date",
      "end_date",
      "payment_count",
      "active",
    ],
    rows: items.map((s) => [
      s.id,
      s.name,
      s.emoji,
      s.category_id,
      s.amount,
      s.currency,
      s.billing_day,
      s.entered_by,
      s.start_date,
      s.end_date,
      s.payment_count,
      s.active,
    ]),
  };
}

/** Subscriptions sheet: columns 1:1. */
export function subscriptionsToRows(subs: Subscription[]): CsvSheet {
  return {
    headers: [
      "id",
      "name",
      "emoji",
      "category_id",
      "amount",
      "currency",
      "billing_day",
      "entered_by",
      "payment_method",
      "credit_card_id",
      "start_date",
      "end_date",
      "payment_count",
      "active",
    ],
    rows: subs.map((s) => [
      s.id,
      s.name,
      s.emoji,
      s.category_id,
      s.amount,
      s.currency,
      s.billing_day,
      s.entered_by,
      s.payment_method,
      s.credit_card_id,
      s.start_date,
      s.end_date,
      s.payment_count,
      s.active,
    ]),
  };
}

export type ExportJournalEntry = Pick<
  TradeJournalEntry,
  | "id"
  | "investment_account_id"
  | "symbol"
  | "side"
  | "quantity"
  | "pnl_usd"
  | "note"
  | "occurred_at"
  | "created_at"
  | "updated_at"
>;

/** Trading journal sheet: table columns 1:1, household_id dropped. */
export function journalToRows(entries: ExportJournalEntry[]): CsvSheet {
  return {
    headers: [
      "id",
      "investment_account_id",
      "symbol",
      "side",
      "quantity",
      "pnl_usd",
      "note",
      "occurred_at",
      "created_at",
      "updated_at",
    ],
    rows: entries.map((e) => [
      e.id,
      e.investment_account_id,
      e.symbol,
      e.side,
      e.quantity,
      e.pnl_usd,
      e.note,
      e.occurred_at,
      e.created_at,
      e.updated_at,
    ]),
  };
}

export type ExportVoucher = Pick<
  Voucher,
  | "id"
  | "label"
  | "face_value"
  | "remaining_value"
  | "currency"
  | "barcode"
  | "expiry_date"
  | "image_url"
  | "source"
  | "entered_by"
  | "occurred_at"
  | "created_at"
  | "updated_at"
>;

/**
 * Vouchers sheet: table columns 1:1, household_id dropped. image_url is the
 * RAW storage path — never the 1-hour signed URL fetchVouchers() returns.
 */
export function vouchersToRows(vouchers: ExportVoucher[]): CsvSheet {
  return {
    headers: [
      "id",
      "label",
      "face_value",
      "remaining_value",
      "currency",
      "barcode",
      "expiry_date",
      "image_url",
      "source",
      "entered_by",
      "occurred_at",
      "created_at",
      "updated_at",
    ],
    rows: vouchers.map((v) => [
      v.id,
      v.label,
      v.face_value,
      v.remaining_value,
      v.currency,
      v.barcode,
      v.expiry_date,
      v.image_url,
      v.source,
      v.entered_by,
      v.occurred_at,
      v.created_at,
      v.updated_at,
    ]),
  };
}

export type ExportTrip = Pick<
  Trip,
  | "id"
  | "name"
  | "country"
  | "cities"
  | "start_date"
  | "end_date"
  | "budget"
  | "currency"
  | "cover_image"
  | "created_at"
  | "updated_at"
>;

/**
 * Trips sheet: table columns 1:1, household_id dropped. cover_image is the
 * RAW storage path — never the 1-hour signed URL fetchTrips() returns.
 */
export function tripsToRows(trips: ExportTrip[]): CsvSheet {
  return {
    headers: [
      "id",
      "name",
      "country",
      "cities",
      "start_date",
      "end_date",
      "budget",
      "currency",
      "cover_image",
      "created_at",
      "updated_at",
    ],
    rows: trips.map((t) => [
      t.id,
      t.name,
      t.country,
      t.cities,
      t.start_date,
      t.end_date,
      t.budget,
      t.currency,
      t.cover_image,
      t.created_at,
      t.updated_at,
    ]),
  };
}

/** IB positions sheet: columns 1:1, household_id dropped. */
export function ibPositionsToRows(positions: IbPosition[]): CsvSheet {
  return {
    headers: ["id", "investment_account_id", "symbol", "quantity", "avg_price"],
    rows: positions.map((p) => [p.id, p.investment_account_id, p.symbol, p.quantity, p.avg_price]),
  };
}

/** IB cash sheet: one row per portfolio, columns 1:1, household_id dropped. */
export function ibCashToRows(holdings: IbHoldings[]): CsvSheet {
  return {
    headers: ["id", "investment_account_id", "cash_usd"],
    rows: holdings.map((h) => [h.id, h.investment_account_id, h.cash_usd]),
  };
}

/** IB ledger sheet: buy/sell/adjust entries, columns 1:1. */
export function ibTransactionsToRows(txs: IbTransaction[]): CsvSheet {
  return {
    headers: [
      "id",
      "position_id",
      "investment_account_id",
      "symbol",
      "kind",
      "quantity",
      "price",
      "prior_avg_price",
      "occurred_at",
      "note",
      "created_at",
    ],
    rows: txs.map((t) => [
      t.id,
      t.position_id,
      t.investment_account_id,
      t.symbol,
      t.kind,
      t.quantity,
      t.price,
      t.prior_avg_price,
      t.occurred_at,
      t.note,
      t.created_at,
    ]),
  };
}

export type ExportCategory = Pick<
  Category,
  | "id"
  | "name"
  | "type"
  | "emoji"
  | "icon"
  | "color"
  | "is_system"
  | "investment_account_id"
  | "sort_order"
  | "created_at"
>;

/** Categories reference sheet: every category (including hidden ones), household_id dropped. */
export function categoriesToRows(categories: ExportCategory[], hiddenIds: Set<string>): CsvSheet {
  return {
    headers: [
      "id",
      "name",
      "type",
      "emoji",
      "icon",
      "color",
      "is_system",
      "investment_account_id",
      "sort_order",
      "hidden",
      "created_at",
    ],
    rows: categories.map((c) => [
      c.id,
      c.name,
      c.type,
      c.emoji,
      c.icon,
      c.color,
      c.is_system,
      c.investment_account_id,
      c.sort_order,
      hiddenIds.has(c.id),
      c.created_at,
    ]),
  };
}

/** Added household people (children): columns 1:1, household_id dropped. */
export function householdPeopleToRows(
  people: Pick<HouseholdPersonRow, "id" | "name" | "sort_order" | "created_at">[],
): CsvSheet {
  return {
    headers: ["id", "name", "sort_order", "created_at"],
    rows: people.map((p) => [p.id, p.name, p.sort_order, p.created_at]),
  };
}

/** Tags reference sheet: columns 1:1, household_id dropped. */
export function tagsToRows(tags: Pick<Tag, "id" | "name" | "created_at">[]): CsvSheet {
  return {
    headers: ["id", "name", "created_at"],
    rows: tags.map((t) => [t.id, t.name, t.created_at]),
  };
}

/** Credit cards reference sheet: columns 1:1. */
export function creditCardsToRows(cards: CreditCard[]): CsvSheet {
  return {
    headers: ["id", "name", "last_four", "billing_day", "sort_order"],
    rows: cards.map((c) => [c.id, c.name, c.last_four, c.billing_day, c.sort_order]),
  };
}

export type ExportBudget = { category_id: string; amount_ils: number };

/** Budgets reference sheet: category id + resolved category name + amount. */
export function budgetsToRows(budgets: ExportBudget[], categories: CategoryRef[]): CsvSheet {
  const namesById = new Map(categories.map((c) => [c.id, c.name]));
  return {
    headers: ["category_id", "category", "amount_ils"],
    rows: budgets.map((b) => [b.category_id, namesById.get(b.category_id) ?? "", b.amount_ils]),
  };
}
