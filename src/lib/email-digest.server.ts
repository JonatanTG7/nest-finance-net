import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { fetchLiveQuotes } from "@/lib/ib.functions";
import { fetchRateToIls } from "@/lib/fx";
import { computeNetWorth } from "@/lib/net-worth";
import {
  addDaysYmd,
  alreadySentToday,
  buildDigestSummary,
  digestPeriod,
  digestTitle,
  israelToday,
  renderDigestHtml,
  renderDigestText,
  shouldSendDigest,
  type DigestKind,
  type DigestSummary,
} from "@/lib/email-digest-rules";

/**
 * Server-only email digest sender (called by the /api/send-digests route,
 * triggered daily by cron). Loads every enabled preference, decides who is
 * due today (Israel time), builds each household's summary once per kind,
 * and sends via Resend.
 *
 * Idempotency: a member whose last_sent_at is already today (same kind)
 * is skipped, so cron retries can't double-send. A partial net-worth
 * total (IB excluded while the FX rate is down) is reported with a flag
 * and is never stored as the comparison baseline.
 *
 * Env: RESEND_API_KEY (required), RESEND_FROM_EMAIL (default
 * onboarding@resend.dev — Resend's onboarding sender only delivers to the
 * Resend account owner's email; real multi-recipient delivery needs a
 * verified sender domain), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (already configured in Lovable Cloud).
 */

type PreferenceRow = Database["public"]["Tables"]["email_digest_preferences"]["Row"];

export interface DigestSendResult {
  sent: number;
  skipped: number;
  errors: string[];
}

const RESEND_API_URL = "https://api.resend.com/emails";

async function sendEmailViaResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const r = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Resend ${r.status}: ${body.slice(0, 200)}`);
  }
}

interface HouseholdData {
  summaryInput: Omit<Parameters<typeof buildDigestSummary>[0], "kind" | "netWorthPreviousIls">;
  netWorthIls: number;
  netWorthMissingIb: boolean;
}

async function loadHouseholdData(
  householdId: string,
  todayYmd: string,
  dueKinds: Set<DigestKind>,
): Promise<HouseholdData> {
  const monthStart = `${todayYmd.slice(0, 7)}-01`;
  const endExclusive = addDaysYmd(todayYmd, 1);
  const loadStarts = [monthStart];
  for (const kind of dueKinds) loadStarts.push(digestPeriod(kind, todayYmd).start);
  const loadStart = loadStarts.sort()[0];

  const [
    { data: transactions, error: txErr },
    { data: categories, error: catErr },
    { data: budgets, error: budErr },
    { data: accounts, error: accErr },
    { data: investmentTxs, error: invTxErr },
    { data: ibHoldings, error: holdErr },
    { data: ibPositions, error: posErr },
    { data: subscriptions, error: subErr },
    { data: journalEntries, error: jrErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("category_id, type, amount_ils, occurred_at")
      .eq("household_id", householdId)
      .gte("occurred_at", loadStart)
      .lt("occurred_at", endExclusive),
    supabaseAdmin.from("categories").select("id, name").eq("household_id", householdId),
    supabaseAdmin
      .from("category_budgets")
      .select("category_id, amount_ils")
      .eq("household_id", householdId),
    supabaseAdmin.from("investment_accounts").select("*").eq("household_id", householdId),
    supabaseAdmin
      .from("transactions")
      .select("investment_account_id, amount, amount_ils, created_at")
      .eq("household_id", householdId)
      .eq("type", "investment"),
    supabaseAdmin
      .from("ib_holdings")
      .select("investment_account_id, cash_usd")
      .eq("household_id", householdId),
    supabaseAdmin
      .from("ib_positions")
      .select("investment_account_id, symbol, quantity, avg_price")
      .eq("household_id", householdId),
    supabaseAdmin.from("subscriptions").select("*").eq("household_id", householdId),
    supabaseAdmin
      .from("trade_journal_entries")
      .select("investment_account_id, pnl_usd, occurred_at, created_at")
      .eq("household_id", householdId),
  ]);
  const firstErr =
    txErr ?? catErr ?? budErr ?? accErr ?? invTxErr ?? holdErr ?? posErr ?? subErr ?? jrErr;
  if (firstErr) throw firstErr;

  const positions = ibPositions ?? [];
  const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
  const quotes = symbols.length > 0 ? await fetchLiveQuotes(symbols) : [];

  // A missing FX rate is never guessed: IB value is excluded from the
  // ILS total and flagged (same rule as the assets page).
  let fxRate: number | null = null;
  try {
    fxRate = await fetchRateToIls("USD");
  } catch (e) {
    console.warn("[digest] USD→ILS rate unavailable, IB value excluded", e);
  }

  // Same composition the assets page renders — the digest can never drift.
  const { grandIls, ibIlsMissing } = computeNetWorth({
    accounts: accounts ?? [],
    transactions: investmentTxs ?? [],
    journalEntries: journalEntries ?? [],
    ibHoldings: ibHoldings ?? [],
    ibPositions: positions,
    quotes,
    fxRate,
  });

  return {
    summaryInput: {
      todayYmd,
      transactions: transactions ?? [],
      budgets: budgets ?? [],
      categories: categories ?? [],
      subscriptions: subscriptions ?? [],
      journalEntries: journalEntries ?? [],
      netWorthIls: grandIls,
      netWorthMissingIb: ibIlsMissing,
    },
    netWorthIls: grandIls,
    netWorthMissingIb: ibIlsMissing,
  };
}

/** Sends every digest due today. Safe to call repeatedly (idempotent). */
export async function sendDigestsForToday(now: Date = new Date()): Promise<DigestSendResult> {
  const result: DigestSendResult = { sent: 0, skipped: 0, errors: [] };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[digest] RESEND_API_KEY is not configured — skipping all digests");
    result.errors.push("RESEND_API_KEY is not configured");
    return result;
  }
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  const today = israelToday(now);
  const { data: prefs, error } = await supabaseAdmin
    .from("email_digest_preferences")
    .select("*")
    .eq("enabled", true);
  if (error) throw error;

  // Who is due, grouped by household so each household's data is loaded once.
  const dueByHousehold = new Map<string, { pref: PreferenceRow; kind: DigestKind }[]>();
  for (const pref of prefs ?? []) {
    const kind = shouldSendDigest(pref, today);
    if (!kind) continue;
    if (alreadySentToday(pref, today.ymd, kind)) {
      result.skipped += 1;
      continue;
    }
    const list = dueByHousehold.get(pref.household_id) ?? [];
    list.push({ pref, kind });
    dueByHousehold.set(pref.household_id, list);
  }

  for (const [householdId, due] of dueByHousehold) {
    const dueKinds = new Set(due.map((d) => d.kind));
    let data: HouseholdData;
    try {
      data = await loadHouseholdData(householdId, today.ymd, dueKinds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[digest] failed to load household data", householdId, e);
      result.errors.push(`household ${householdId}: ${msg}`);
      continue;
    }

    // One summary per kind (two members due the same kind share it).
    // last_net_worth_ils is per member: each recipient compares against
    // their own previous send.
    const summaries = new Map<DigestKind, Map<string, DigestSummary>>();
    for (const { pref, kind } of due) {
      let byKind = summaries.get(kind);
      if (!byKind) {
        byKind = new Map();
        summaries.set(kind, byKind);
      }
      if (!byKind.has(pref.id)) {
        byKind.set(
          pref.id,
          buildDigestSummary({
            ...data.summaryInput,
            kind,
            netWorthPreviousIls:
              pref.last_net_worth_ils != null ? Number(pref.last_net_worth_ils) : null,
          }),
        );
      }
    }

    for (const { pref, kind } of due) {
      const summary = summaries.get(kind)!.get(pref.id)!;
      try {
        await sendEmailViaResend({
          apiKey,
          from,
          to: pref.email,
          subject: `${digestTitle(kind)} — כסף משפחתי (${summary.periodLabel})`,
          html: renderDigestHtml(summary),
          text: renderDigestText(summary),
        });
        const { error: updErr } = await supabaseAdmin
          .from("email_digest_preferences")
          .update({
            last_sent_at: new Date().toISOString(),
            last_digest_kind: kind,
            // Never store a partial total as the comparison baseline.
            ...(data.netWorthMissingIb ? {} : { last_net_worth_ils: data.netWorthIls }),
          })
          .eq("id", pref.id);
        if (updErr) {
          // The email went out but the send wasn't recorded — a retry
          // could double-send, so surface it loudly.
          console.error("[digest] sent but failed to record", pref.email, updErr);
          result.errors.push(`${pref.email}: sent but failed to record (${updErr.message})`);
        }
        result.sent += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[digest] failed to send", pref.email, e);
        result.errors.push(`${pref.email} (${kind}): ${msg}`);
      }
    }
  }

  return result;
}
