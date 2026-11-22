import { isoLocal } from "./dates";
import { budgetProgress, categorySpent } from "./finance-rules";
import { formatILS, formatMoney } from "./finance";
import { dueDates, type SubscriptionSchedule } from "./subscription-schedule";
import { tradeJournalSummary, type TradeJournalSummary } from "./trade-journal";

/**
 * Pure rules for the email digest (weekly/monthly household summaries).
 *
 * Everything here is pure and tested; the sender (email-digest.server.ts)
 * only loads data, calls these rules, and talks to Resend.
 *
 * Dates are always Israel calendar dates (Asia/Jerusalem). The server runs
 * in UTC, so "today" is evaluated with Intl in the Israel timezone — never
 * via toISOString(), which would return yesterday for the first hours of
 * every day (see dates.ts).
 */

export type DigestKind = "weekly" | "monthly";

export interface IsraelToday {
  /** YYYY-MM-DD in Asia/Jerusalem. */
  ymd: string;
  /** JS getDay convention: 0 = Sunday. */
  weekday: number;
  dayOfMonth: number;
  daysInMonth: number;
}

/** "Today" in Israel, from any instant. DST-safe via Intl. */
export function israelToday(now: Date = new Date()): IsraelToday {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month")); // 1–12
  const day = Number(get("day"));
  return {
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    weekday: new Date(year, month - 1, day).getDay(),
    dayOfMonth: day,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

/** "YYYY-MM-DD" → local-midnight Date. Local getters only, never UTC. */
export function toLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = toLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function dayDiff(fromYmd: string, toYmd: string): number {
  return Math.round((toLocalDate(toYmd).getTime() - toLocalDate(fromYmd).getTime()) / 86400000);
}

/** "2026-11-22" → "22 בנובמבר". */
export function formatHebrewDayMonth(ymd: string): string {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(
    toLocalDate(ymd),
  );
}

/** "2026-11-22" → "נובמבר 2026". */
export function formatHebrewMonth(ymd: string): string {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
    toLocalDate(ymd),
  );
}

export interface DigestPreferenceInput {
  enabled: boolean;
  weekly_enabled: boolean;
  weekly_weekday: number | null;
  monthly_enabled: boolean;
  monthly_day: number | null;
  last_sent_at: string | null;
  last_digest_kind: string | null;
}

/**
 * Which digest (if any) is due for this member today. Weekly fires on the
 * chosen weekday; monthly fires on the chosen day-of-month, clamped to the
 * last day of short months (day 31 → Feb 28). When both are due the same
 * day, the monthly one wins — one email, not two.
 */
export function shouldSendDigest(
  prefs: DigestPreferenceInput,
  today: IsraelToday,
): DigestKind | null {
  if (!prefs.enabled) return null;
  const monthlyDue =
    prefs.monthly_enabled &&
    prefs.monthly_day != null &&
    today.dayOfMonth === Math.min(prefs.monthly_day, today.daysInMonth);
  if (monthlyDue) return "monthly";
  const weeklyDue =
    prefs.weekly_enabled && prefs.weekly_weekday != null && today.weekday === prefs.weekly_weekday;
  if (weeklyDue) return "weekly";
  return null;
}

/** Idempotency: was this kind already sent today (Israel date)? */
export function alreadySentToday(
  prefs: DigestPreferenceInput,
  todayYmd: string,
  kind: DigestKind,
): boolean {
  if (!prefs.last_sent_at || prefs.last_digest_kind !== kind) return false;
  const sentAt = new Date(prefs.last_sent_at);
  if (Number.isNaN(sentAt.getTime())) return false;
  return israelToday(sentAt).ymd === todayYmd;
}

/**
 * The period a digest covers. Weekly = the last 7 days ending today;
 * monthly = the current calendar month so far. `end` is exclusive
 * (tomorrow), so `occurred_at >= start && occurred_at < end` selects it.
 */
export function digestPeriod(
  kind: DigestKind,
  todayYmd: string,
): { start: string; end: string; label: string } {
  const end = addDaysYmd(todayYmd, 1);
  if (kind === "weekly") {
    const start = addDaysYmd(todayYmd, -6);
    const year = todayYmd.slice(0, 4);
    return {
      start,
      end,
      label: `${formatHebrewDayMonth(start)} – ${formatHebrewDayMonth(todayYmd)} ${year}`,
    };
  }
  const start = `${todayYmd.slice(0, 7)}-01`;
  return { start, end, label: formatHebrewMonth(todayYmd) };
}

/* ------------------------------------------------------------------ *
 * Digest summary
 * ------------------------------------------------------------------ */

export interface DigestTransactionInput {
  category_id: string | null;
  type: string;
  amount_ils: number;
  occurred_at: string;
}

export interface DigestBudgetInput {
  category_id: string;
  amount_ils: number;
}

export interface DigestCategoryInput {
  id: string;
  name: string;
}

export interface DigestSubscriptionInput extends SubscriptionSchedule {
  name: string;
  amount: number;
  currency: string;
}

export interface DigestJournalInput {
  pnl_usd: number;
  occurred_at: string;
}

export interface DigestBudgetRow {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
  percent: number;
  state: "over" | "near" | "ok";
}

export interface DigestRenewal {
  name: string;
  date: string;
  daysLeft: number;
  amount: number;
  currency: string;
}

export interface DigestSummary {
  kind: DigestKind;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  spentTotalIls: number;
  incomeTotalIls: number;
  budgetTotalIls: number;
  budgetSpentIls: number;
  budgetRows: DigestBudgetRow[];
  netWorthIls: number | null;
  netWorthPreviousIls: number | null;
  netWorthDeltaIls: number | null;
  netWorthMissingIb: boolean;
  renewals: DigestRenewal[];
  journal: TradeJournalSummary;
}

export interface DigestSummaryInput {
  kind: DigestKind;
  todayYmd: string;
  /** Transactions from min(period start, month start) to the period end. */
  transactions: DigestTransactionInput[];
  budgets: DigestBudgetInput[];
  categories: DigestCategoryInput[];
  subscriptions: DigestSubscriptionInput[];
  journalEntries: DigestJournalInput[];
  /** From lib/net-worth (server-computed, same totals as the app). */
  netWorthIls: number | null;
  /** Stored from the previous send; null on the first digest. */
  netWorthPreviousIls: number | null;
  netWorthMissingIb: boolean;
}

/** Next billing date per active subscription within the horizon. */
export function upcomingRenewals(
  subs: DigestSubscriptionInput[],
  todayYmd: string,
  horizonDays: number,
): DigestRenewal[] {
  const until = addDaysYmd(todayYmd, horizonDays);
  const out: DigestRenewal[] = [];
  for (const s of subs) {
    if (!s.active) continue;
    const next = dueDates(s, until).find((d) => d >= todayYmd);
    if (!next) continue;
    out.push({
      name: s.name,
      date: next,
      daysLeft: dayDiff(todayYmd, next),
      amount: s.amount,
      currency: s.currency,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Builds the digest summary from loaded household data. Spending/income
 * cover the digest period; budget rows compare month-to-date spending
 * against the monthly limits (budgets are calendar-month caps, so the
 * weekly digest also reports them month-to-date).
 */
export function buildDigestSummary(input: DigestSummaryInput): DigestSummary {
  const period = digestPeriod(input.kind, input.todayYmd);
  const monthStart = `${input.todayYmd.slice(0, 7)}-01`;
  const inWindow = (occurredAt: string, start: string, end: string) =>
    occurredAt >= start && occurredAt < end;
  const periodTxs = input.transactions.filter((t) =>
    inWindow(t.occurred_at, period.start, period.end),
  );
  const monthTxs = input.transactions.filter((t) =>
    inWindow(t.occurred_at, monthStart, period.end),
  );

  let spentTotalIls = 0;
  let incomeTotalIls = 0;
  for (const t of periodTxs) {
    if (t.type === "expense" || t.type === "fixed") spentTotalIls += Number(t.amount_ils);
    else if (t.type === "income") incomeTotalIls += Number(t.amount_ils);
  }

  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));
  const budgetRows: DigestBudgetRow[] = input.budgets
    .map((b) => {
      const spent = categorySpent(monthTxs, b.category_id, input.todayYmd);
      const progress = budgetProgress(spent, Number(b.amount_ils));
      return {
        categoryId: b.category_id,
        categoryName: categoryName.get(b.category_id) ?? "קטגוריה",
        spent,
        limit: Number(b.amount_ils),
        percent: progress.percent,
        // budgetProgress only ever returns these three states.
        state: progress.state as "over" | "near" | "ok",
      };
    })
    .sort((a, b) => b.percent - a.percent);
  const budgetTotalIls = budgetRows.reduce((a, r) => a + r.limit, 0);
  const budgetSpentIls = budgetRows.reduce((a, r) => a + r.spent, 0);

  const renewals = upcomingRenewals(
    input.subscriptions,
    input.todayYmd,
    input.kind === "weekly" ? 7 : 30,
  );

  const journal = tradeJournalSummary(
    input.journalEntries.filter((e) => inWindow(e.occurred_at, period.start, period.end)),
  );

  // A partial total (IB excluded while the FX rate is down) must never
  // produce a delta — comparing it with the last full total would show a
  // fake jump. The sender also skips storing a partial total.
  const netWorthDeltaIls =
    !input.netWorthMissingIb && input.netWorthIls != null && input.netWorthPreviousIls != null
      ? Math.round((input.netWorthIls - input.netWorthPreviousIls) * 100) / 100
      : null;

  return {
    kind: input.kind,
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    spentTotalIls,
    incomeTotalIls,
    budgetTotalIls,
    budgetSpentIls,
    budgetRows,
    netWorthIls: input.netWorthIls,
    netWorthPreviousIls: input.netWorthPreviousIls,
    netWorthDeltaIls,
    netWorthMissingIb: input.netWorthMissingIb,
    renewals,
    journal,
  };
}

/* ------------------------------------------------------------------ *
 * Rendering (HTML + plain text)
 * ------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deltaText(delta: number | null): string {
  if (delta == null) return "סיכום ראשון — אין השוואה קודמת";
  if (delta === 0) return "ללא שינוי מהסיכום הקודם";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatILS(delta)} מהסיכום הקודם`;
}

function renewalWhen(daysLeft: number): string {
  if (daysLeft === 0) return "היום";
  if (daysLeft === 1) return "מחר";
  return `בעוד ${daysLeft} ימים`;
}

const budgetStateLabel: Record<DigestBudgetRow["state"], string> = {
  over: "חריגה",
  near: "קרוב לתקרה",
  ok: "",
};

const budgetStateColor: Record<DigestBudgetRow["state"], string> = {
  over: "#dc2626",
  near: "#d97706",
  ok: "#16a34a",
};

export function digestTitle(kind: DigestKind): string {
  return kind === "weekly" ? "סיכום שבועי" : "סיכום חודשי";
}

/** Hebrew RTL email HTML (table layout, inline styles — email-safe). */
export function renderDigestHtml(summary: DigestSummary): string {
  const title = digestTitle(summary.kind);
  const netWorth = summary.netWorthIls != null ? formatILS(summary.netWorthIls) : "לא זמין כרגע";
  const budgetRows = summary.budgetRows
    .map(
      (r) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.categoryName)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:left;direction:ltr;">${formatILS(r.spent)} / ${formatILS(r.limit)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:left;color:${budgetStateColor[r.state]};">${r.percent}%${r.state !== "ok" ? ` (${budgetStateLabel[r.state]})` : ""}</td>
      </tr>`,
    )
    .join("");
  const renewals = summary.renewals
    .map(
      (r) =>
        `<li style="margin:4px 0;">${escapeHtml(r.name)} — ${formatHebrewDayMonth(r.date)} (${renewalWhen(r.daysLeft)}) — ${formatMoney(r.amount, r.currency)}</li>`,
    )
    .join("");
  const winRate =
    summary.journal.winRate != null
      ? `${Math.round(summary.journal.winRate * 100)}% הצלחה`
      : "אין עסקאות מוכרעות בתקופה";
  const journalPnl =
    summary.journal.count === 0
      ? "לא היו עסקאות בתקופה"
      : `${formatMoney(summary.journal.totalPnl, "USD")} · ${summary.journal.count} עסקאות · ${summary.journal.wins} רווח / ${summary.journal.losses} הפסד · ${winRate}`;

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:24px;text-align:right;">
<tr><td><h1 style="margin:0 0 4px;font-size:22px;">${title} — כסף משפחתי</h1><p style="margin:0 0 20px;color:#64748b;font-size:14px;">${escapeHtml(summary.periodLabel)}</p></td></tr>
<tr><td><h2 style="font-size:16px;margin:0 0 8px;">שווי נכסים</h2><p style="margin:0;font-size:20px;font-weight:bold;">${netWorth}</p><p style="margin:4px 0 20px;color:#64748b;font-size:13px;">${deltaText(summary.netWorthDeltaIls)}${summary.netWorthMissingIb ? " · שער הדולר לא היה זמין — שווי תיקי ה-IB לא נכלל" : ""}</p></td></tr>
<tr><td><h2 style="font-size:16px;margin:0 0 8px;">הוצאות והכנסות בתקופה</h2><p style="margin:0 0 20px;">הוצאות: <b>${formatILS(summary.spentTotalIls)}</b> · הכנסות: <b>${formatILS(summary.incomeTotalIls)}</b></p></td></tr>
<tr><td><h2 style="font-size:16px;margin:0 0 8px;">תקציבים החודש</h2>${summary.budgetRows.length === 0 ? `<p style="margin:0 0 20px;color:#64748b;">לא הוגדרו תקציבים לקטגוריות.</p>` : `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:8px;"><tr><th style="text-align:right;padding:8px 0;border-bottom:2px solid #e5e7eb;">קטגוריה</th><th style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">הוצא / תקציב</th><th style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">ניצול</th></tr>${budgetRows}</table><p style="margin:0 0 20px;color:#64748b;font-size:13px;">סה"כ תקציבים: ${formatILS(summary.budgetSpentIls)} מתוך ${formatILS(summary.budgetTotalIls)}</p>`}</td></tr>
<tr><td><h2 style="font-size:16px;margin:0 0 8px;">חיובים קרובים</h2>${summary.renewals.length === 0 ? `<p style="margin:0 0 20px;color:#64748b;">אין חיובים צפויים בתקופה הקרובה.</p>` : `<ul style="margin:0 0 20px;padding-right:20px;font-size:14px;">${renewals}</ul>`}</td></tr>
<tr><td><h2 style="font-size:16px;margin:0 0 8px;">יומן מסחר</h2><p style="margin:0 0 20px;">${journalPnl}</p></td></tr>
<tr><td><p style="margin:0;color:#94a3b8;font-size:12px;">נשלח אוטומטית מאפליקציית כסף משפחתי. אפשר לשנות או לבטל בהגדרות ← מייל.</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** Plain-text fallback for the same digest. */
export function renderDigestText(summary: DigestSummary): string {
  const lines: string[] = [
    `${digestTitle(summary.kind)} — כסף משפחתי`,
    summary.periodLabel,
    "",
    "שווי נכסים",
    summary.netWorthIls != null ? formatILS(summary.netWorthIls) : "לא זמין כרגע",
    deltaText(summary.netWorthDeltaIls),
  ];
  if (summary.netWorthMissingIb) {
    lines.push("שער הדולר לא היה זמין — שווי תיקי ה-IB לא נכלל");
  }
  lines.push(
    "",
    "הוצאות והכנסות בתקופה",
    `הוצאות: ${formatILS(summary.spentTotalIls)} · הכנסות: ${formatILS(summary.incomeTotalIls)}`,
    "",
    "תקציבים החודש",
  );
  if (summary.budgetRows.length === 0) {
    lines.push("לא הוגדרו תקציבים לקטגוריות.");
  } else {
    for (const r of summary.budgetRows) {
      const state = r.state !== "ok" ? ` (${budgetStateLabel[r.state]})` : "";
      lines.push(
        `${r.categoryName}: ${formatILS(r.spent)} מתוך ${formatILS(r.limit)} (${r.percent}%)${state}`,
      );
    }
    lines.push(
      `סה"כ תקציבים: ${formatILS(summary.budgetSpentIls)} מתוך ${formatILS(summary.budgetTotalIls)}`,
    );
  }
  lines.push("", "חיובים קרובים");
  if (summary.renewals.length === 0) {
    lines.push("אין חיובים צפויים בתקופה הקרובה.");
  } else {
    for (const r of summary.renewals) {
      lines.push(
        `${r.name} — ${formatHebrewDayMonth(r.date)} (${renewalWhen(r.daysLeft)}) — ${formatMoney(r.amount, r.currency)}`,
      );
    }
  }
  lines.push("", "יומן מסחר");
  if (summary.journal.count === 0) {
    lines.push("לא היו עסקאות בתקופה");
  } else {
    const winRate =
      summary.journal.winRate != null
        ? `${Math.round(summary.journal.winRate * 100)}% הצלחה`
        : "אין עסקאות מוכרעות בתקופה";
    lines.push(
      `${formatMoney(summary.journal.totalPnl, "USD")} · ${summary.journal.count} עסקאות · ${summary.journal.wins} רווח / ${summary.journal.losses} הפסד · ${winRate}`,
    );
  }
  lines.push("", "נשלח אוטומטית מאפליקציית כסף משפחתי. אפשר לשנות או לבטל בהגדרות ← מייל.");
  return lines.join("\n");
}
