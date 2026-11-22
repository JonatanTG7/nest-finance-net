import { useState } from "react";
import { toast } from "sonner";
import { Download, FileDown } from "lucide-react";
import { fetchBudgets } from "@/lib/budgets";
import { fetchCreditCards } from "@/lib/credit_cards";
import {
  accountsToRows,
  budgetsToRows,
  categoriesToRows,
  creditCardsToRows,
  downloadCsv,
  exportFileName,
  ibCashToRows,
  ibPositionsToRows,
  ibTransactionsToRows,
  isMissingTableError,
  journalToRows,
  subscriptionsToRows,
  tagsToRows,
  toCsv,
  trackAllocationsToRows,
  transactionsToRows,
  tripsToRows,
  vouchersToRows,
  type CsvSheet,
} from "@/lib/data-export";
import {
  fetchAllCategories,
  fetchAllTransactionsPaged,
  fetchHiddenCategoryIds,
  fetchInvestmentAccounts,
  fetchTags,
} from "@/lib/db";
import {
  fetchAllIbHoldings,
  fetchAllIbPositions,
  fetchIbPortfolios,
  fetchIbTransactions,
} from "@/lib/ib";
import { fetchSubscriptions } from "@/lib/subscriptions";
import { fetchAllTrackAllocations } from "@/lib/track-splits";
import { fetchAllTradeJournalEntries } from "@/lib/trade-journal";
import { fetchTripsRaw } from "@/lib/trips";
import { fetchVouchersRaw } from "@/lib/vouchers";

interface PreparedFile {
  area: string;
  label: string;
  filename: string;
  csv: string;
  rowCount: number;
}

function prepareFile(area: string, label: string, sheet: CsvSheet, date: Date): PreparedFile {
  return {
    area,
    label,
    filename: exportFileName(area, date),
    csv: toCsv(sheet.headers, sheet.rows),
    rowCount: sheet.rows.length,
  };
}

/** Pause between automatic downloads so the browser doesn't block them. */
const DOWNLOAD_ALL_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Household data export (Settings → משק הבית): downloads every area as a
 * CSV file (UTF-8 BOM, opens correctly in Excel). The files contain the
 * full data with NO privacy masking — this is the household's own backup.
 */
export function DataExportSection() {
  const [preparing, setPreparing] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [files, setFiles] = useState<PreparedFile[] | null>(null);

  async function prepare() {
    setPreparing(true);
    setFiles(null);
    try {
      const [
        txs,
        accounts,
        trackAllocations,
        subs,
        journal,
        vouchers,
        trips,
        ibPositions,
        ibCash,
        portfolios,
        categories,
        hiddenIds,
        tags,
        cards,
        budgets,
      ] = await Promise.all([
        fetchAllTransactionsPaged(),
        fetchInvestmentAccounts(),
        // The track_allocations table arrives with PR #18's migration; until
        // it runs there are no allocations to export, so a missing table
        // degrades to an empty sheet instead of failing the whole backup.
        fetchAllTrackAllocations().catch((e) => {
          if (isMissingTableError(e)) return [];
          throw e;
        }),
        fetchSubscriptions(),
        fetchAllTradeJournalEntries(),
        fetchVouchersRaw(),
        fetchTripsRaw(),
        fetchAllIbPositions(),
        fetchAllIbHoldings(),
        fetchIbPortfolios(),
        fetchAllCategories(),
        fetchHiddenCategoryIds(),
        fetchTags(),
        fetchCreditCards(),
        fetchBudgets(),
      ]);
      const ledgerLists = await Promise.all(portfolios.map((p) => fetchIbTransactions(p.id)));
      const ibLedger = ledgerLists.flat();

      const date = new Date();
      setFiles([
        prepareFile("transactions", "עסקאות", transactionsToRows(txs, cards, trips), date),
        prepareFile("accounts", "חשבונות", accountsToRows(accounts), date),
        prepareFile(
          "track-allocations",
          "פיצולי מסלולים",
          trackAllocationsToRows(trackAllocations),
          date,
        ),
        prepareFile("subscriptions", "מנויים", subscriptionsToRows(subs), date),
        prepareFile("trading-journal", "יומן מסחר", journalToRows(journal), date),
        prepareFile("vouchers", "שוברים", vouchersToRows(vouchers), date),
        prepareFile("trips", "טיולים", tripsToRows(trips), date),
        prepareFile("ib-positions", "פוזיציות IB", ibPositionsToRows(ibPositions), date),
        prepareFile("ib-cash", "מזומן IB", ibCashToRows(ibCash), date),
        prepareFile("ib-ledger", "יומן עסקאות IB", ibTransactionsToRows(ibLedger), date),
        prepareFile("categories", "קטגוריות", categoriesToRows(categories, hiddenIds), date),
        prepareFile("tags", "תגיות", tagsToRows(tags), date),
        prepareFile("credit-cards", "כרטיסי אשראי", creditCardsToRows(cards), date),
        prepareFile("budgets", "תקציבים", budgetsToRows(budgets, categories), date),
      ]);
      toast.success("הייצוא הוכן");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בהכנת הייצוא");
    } finally {
      setPreparing(false);
    }
  }

  async function downloadAll() {
    if (!files || downloadingAll) return;
    setDownloadingAll(true);
    try {
      for (const f of files) {
        downloadCsv(f.filename, f.csv);
        await sleep(DOWNLOAD_ALL_DELAY_MS);
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  return (
    <section className="px-5 mt-8">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <FileDown className="size-4" />
        ייצוא נתונים
      </h2>
      <div className="rounded-2xl bg-card border p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          הורידו את כל נתוני משק הבית כקבצי CSV — גיבוי מלא שנפתח באקסל.
        </p>
        <p className="text-xs text-muted-foreground">
          הקבצים מכילים את כל הנתונים ללא הסתרה — שמרו אותם במקום בטוח.
        </p>

        {files && (
          <>
            <ul className="divide-y -my-1">
              {files.map((f) => (
                <li key={f.area} className="flex items-center gap-2 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{f.label}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {f.rowCount} {f.rowCount === 1 ? "שורה" : "שורות"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(f.filename, f.csv)}
                    aria-label={`הורד ${f.label}`}
                    className="size-9 rounded-full border flex items-center justify-center"
                  >
                    <Download className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={downloadAll}
              disabled={downloadingAll}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Download className="size-4" />
              {downloadingAll ? "מוריד…" : "הורד הכל"}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={prepare}
          disabled={preparing}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          <FileDown className="size-4" />
          {preparing ? "מכין…" : files ? "הכן ייצוא מחדש" : "הכן ייצוא"}
        </button>
      </div>
    </section>
  );
}
