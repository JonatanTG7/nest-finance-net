import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  alreadySentToday,
  buildDigestSummary,
  dayDiff,
  digestPeriod,
  escapeHtml,
  israelToday,
  renderDigestHtml,
  renderDigestText,
  shouldSendDigest,
  type DigestPreferenceInput,
} from "./email-digest-rules";

// 2026-11-22 is a Sunday.
const SUNDAY: DigestPreferenceInput = {
  enabled: true,
  weekly_enabled: true,
  weekly_weekday: 0,
  monthly_enabled: false,
  monthly_day: null,
  last_sent_at: null,
  last_digest_kind: null,
};

describe("israelToday", () => {
  it("uses the Israel calendar date, not UTC", () => {
    // 23:30 UTC on Nov 22 is already 01:30 on Nov 23 in Israel.
    const t = israelToday(new Date("2026-11-22T23:30:00Z"));
    expect(t.ymd).toBe("2026-11-23");
    expect(t.weekday).toBe(1); // Monday
    expect(t.dayOfMonth).toBe(23);
    expect(t.daysInMonth).toBe(30);
  });

  it("keeps the same date in the early UTC hours", () => {
    // 01:00 UTC on Nov 22 is 03:00 the same day in Israel.
    expect(israelToday(new Date("2026-11-22T01:00:00Z")).ymd).toBe("2026-11-22");
  });

  it("reports Sunday for 2026-11-22", () => {
    const t = israelToday(new Date("2026-11-22T12:00:00Z"));
    expect(t.weekday).toBe(0);
    expect(t.dayOfMonth).toBe(22);
  });
});

describe("addDaysYmd / dayDiff", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysYmd("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysYmd("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDaysYmd("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("counts whole calendar days", () => {
    expect(dayDiff("2026-11-22", "2026-11-25")).toBe(3);
    expect(dayDiff("2026-11-22", "2026-11-22")).toBe(0);
    expect(dayDiff("2026-11-30", "2026-12-01")).toBe(1);
  });
});

describe("shouldSendDigest", () => {
  const today = { ymd: "2026-11-22", weekday: 0, dayOfMonth: 22, daysInMonth: 30 };

  it("returns null when disabled", () => {
    expect(shouldSendDigest({ ...SUNDAY, enabled: false }, today)).toBeNull();
  });

  it("fires weekly on the matching weekday", () => {
    expect(shouldSendDigest(SUNDAY, today)).toBe("weekly");
    expect(shouldSendDigest(SUNDAY, { ...today, weekday: 1 })).toBeNull();
  });

  it("ignores weekly when no weekday is set", () => {
    expect(shouldSendDigest({ ...SUNDAY, weekly_weekday: null }, today)).toBeNull();
  });

  it("fires monthly on the matching day", () => {
    const monthly: DigestPreferenceInput = {
      ...SUNDAY,
      weekly_enabled: false,
      monthly_enabled: true,
      monthly_day: 22,
    };
    expect(shouldSendDigest(monthly, today)).toBe("monthly");
    expect(shouldSendDigest(monthly, { ...today, dayOfMonth: 21 })).toBeNull();
  });

  it("clamps the monthly day to the last day of short months", () => {
    const monthly: DigestPreferenceInput = {
      ...SUNDAY,
      weekly_enabled: false,
      monthly_enabled: true,
      monthly_day: 31,
    };
    // Feb 28, 2027 (not a leap year): day 31 clamps to 28.
    expect(
      shouldSendDigest(monthly, { ymd: "2027-02-28", weekday: 0, dayOfMonth: 28, daysInMonth: 28 }),
    ).toBe("monthly");
    // Nov 30: day 31 clamps to 30.
    expect(
      shouldSendDigest(monthly, { ymd: "2026-11-30", weekday: 1, dayOfMonth: 30, daysInMonth: 30 }),
    ).toBe("monthly");
    // Nov 29: not the clamped day yet.
    expect(
      shouldSendDigest(monthly, { ymd: "2026-11-29", weekday: 0, dayOfMonth: 29, daysInMonth: 30 }),
    ).toBeNull();
  });

  it("prefers monthly when both are due the same day", () => {
    const both: DigestPreferenceInput = {
      ...SUNDAY,
      monthly_enabled: true,
      monthly_day: 22,
    };
    expect(shouldSendDigest(both, today)).toBe("monthly");
  });
});

describe("alreadySentToday", () => {
  it("detects a same-kind send earlier today (Israel date)", () => {
    const prefs: DigestPreferenceInput = {
      ...SUNDAY,
      last_sent_at: "2026-11-22T05:00:00Z",
      last_digest_kind: "weekly",
    };
    expect(alreadySentToday(prefs, "2026-11-22", "weekly")).toBe(true);
    expect(alreadySentToday(prefs, "2026-11-22", "monthly")).toBe(false);
    expect(alreadySentToday(prefs, "2026-11-23", "weekly")).toBe(false);
  });

  it("compares in Israel time, not UTC", () => {
    // Sent 23:30 UTC Nov 22 = Nov 23 in Israel.
    const prefs: DigestPreferenceInput = {
      ...SUNDAY,
      last_sent_at: "2026-11-22T23:30:00Z",
      last_digest_kind: "weekly",
    };
    expect(alreadySentToday(prefs, "2026-11-23", "weekly")).toBe(true);
    expect(alreadySentToday(prefs, "2026-11-22", "weekly")).toBe(false);
  });

  it("returns false with no previous send", () => {
    expect(alreadySentToday(SUNDAY, "2026-11-22", "weekly")).toBe(false);
  });
});

describe("digestPeriod", () => {
  it("covers the last 7 days for weekly", () => {
    const p = digestPeriod("weekly", "2026-11-22");
    expect(p.start).toBe("2026-11-16");
    expect(p.end).toBe("2026-11-23");
  });

  it("covers the calendar month so far for monthly", () => {
    const p = digestPeriod("monthly", "2026-11-22");
    expect(p.start).toBe("2026-11-01");
    expect(p.end).toBe("2026-11-23");
    expect(p.label).toContain("2026");
  });
});

const summaryInput = {
  todayYmd: "2026-11-22",
  transactions: [
    { category_id: "food", type: "expense", amount_ils: 100, occurred_at: "2026-11-20" },
    { category_id: "food", type: "expense", amount_ils: 50, occurred_at: "2026-11-10" },
    { category_id: "food", type: "expense", amount_ils: 999, occurred_at: "2026-11-15" },
    { category_id: "food", type: "expense", amount_ils: 777, occurred_at: "2026-10-30" },
    { category_id: null, type: "income", amount_ils: 5000, occurred_at: "2026-11-18" },
    { category_id: "food", type: "fixed", amount_ils: 200, occurred_at: "2026-11-21" },
    { category_id: "food", type: "savings", amount_ils: 300, occurred_at: "2026-11-21" },
  ],
  budgets: [{ category_id: "food", amount_ils: 1000 }],
  categories: [{ id: "food", name: "אוכל" }],
  subscriptions: [
    {
      name: "נטפליקס",
      billing_day: 25,
      start_date: "2026-01-01",
      end_date: null,
      active: true,
      amount: 60,
      currency: "ILS",
    },
    {
      name: "ישן",
      billing_day: 5,
      start_date: "2026-01-01",
      end_date: null,
      active: false,
      amount: 10,
      currency: "ILS",
    },
    {
      name: "רחוק",
      billing_day: 10,
      start_date: "2026-01-01",
      end_date: null,
      active: true,
      amount: 20,
      currency: "USD",
    },
  ],
  journalEntries: [
    { pnl_usd: 50, occurred_at: "2026-11-19" },
    { pnl_usd: -20, occurred_at: "2026-11-17" },
    { pnl_usd: 999, occurred_at: "2026-11-01" },
  ],
  netWorthIls: 50000,
  netWorthPreviousIls: 48000,
  netWorthMissingIb: false,
};

describe("buildDigestSummary", () => {
  it("summarizes the weekly period and month-to-date budgets", () => {
    const s = buildDigestSummary({ ...summaryInput, kind: "weekly" });
    // Period spending: 100 (expense) + 200 (fixed). Savings excluded.
    expect(s.spentTotalIls).toBe(300);
    expect(s.incomeTotalIls).toBe(5000);
    // Budget rows are month-to-date: 100 + 50 + 999 + 200 (fixed) = 1349 of 1000.
    expect(s.budgetRows).toHaveLength(1);
    expect(s.budgetRows[0]).toMatchObject({
      categoryName: "אוכל",
      spent: 1349,
      limit: 1000,
      percent: 135,
      state: "over",
    });
    expect(s.budgetTotalIls).toBe(1000);
    expect(s.budgetSpentIls).toBe(1349);
    // Renewals within 7 days: only the 25th.
    expect(s.renewals).toHaveLength(1);
    expect(s.renewals[0]).toMatchObject({ name: "נטפליקס", date: "2026-11-25", daysLeft: 3 });
    // Journal in the weekly window only.
    expect(s.journal).toMatchObject({ count: 2, totalPnl: 30, wins: 1, losses: 1 });
    expect(s.journal.winRate).toBeCloseTo(0.5);
    // Net worth delta vs the previous send.
    expect(s.netWorthDeltaIls).toBe(2000);
  });

  it("summarizes the monthly period with a 30-day renewal horizon", () => {
    const s = buildDigestSummary({ ...summaryInput, kind: "monthly" });
    expect(s.spentTotalIls).toBe(1349);
    expect(s.incomeTotalIls).toBe(5000);
    expect(s.journal).toMatchObject({ count: 3, totalPnl: 1029, wins: 2, losses: 1 });
    expect(s.journal.winRate).toBeCloseTo(2 / 3);
    expect(s.renewals.map((r) => r.name)).toEqual(["נטפליקס", "רחוק"]);
    expect(s.renewals[1]).toMatchObject({ date: "2026-12-10", daysLeft: 18 });
  });

  it("reports a null delta on the first digest", () => {
    const s = buildDigestSummary({ ...summaryInput, kind: "weekly", netWorthPreviousIls: null });
    expect(s.netWorthDeltaIls).toBeNull();
  });

  it("reports a null delta when the total is partial (IB excluded)", () => {
    const s = buildDigestSummary({ ...summaryInput, kind: "weekly", netWorthMissingIb: true });
    expect(s.netWorthDeltaIls).toBeNull();
  });

  it("handles empty data", () => {
    const s = buildDigestSummary({
      kind: "weekly",
      todayYmd: "2026-11-22",
      transactions: [],
      budgets: [],
      categories: [],
      subscriptions: [],
      journalEntries: [],
      netWorthIls: null,
      netWorthPreviousIls: null,
      netWorthMissingIb: true,
    });
    expect(s.spentTotalIls).toBe(0);
    expect(s.budgetRows).toEqual([]);
    expect(s.renewals).toEqual([]);
    expect(s.journal.count).toBe(0);
    expect(s.netWorthDeltaIls).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes markup in names", () => {
    expect(escapeHtml('<b>"אוכל" & שתיה</b>')).toBe(
      "&lt;b&gt;&quot;אוכל&quot; &amp; שתיה&lt;/b&gt;",
    );
  });
});

describe("renderDigestHtml / renderDigestText", () => {
  const summary = buildDigestSummary({ ...summaryInput, kind: "weekly" });

  it("renders the key figures as RTL HTML", () => {
    const html = renderDigestHtml(summary);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("סיכום שבועי");
    expect(html).toContain("50,000");
    expect(html).toContain("300");
    expect(html).toContain("אוכל");
    expect(html).toContain("נטפליקס");
    expect(html).toContain("חריגה");
  });

  it("escapes names in the HTML", () => {
    const evil = buildDigestSummary({
      ...summaryInput,
      kind: "weekly",
      categories: [{ id: "food", name: "<script>alert(1)</script>" }],
    });
    const html = renderDigestHtml(evil);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a plain-text version with the same figures", () => {
    const text = renderDigestText(summary);
    expect(text).toContain("סיכום שבועי");
    expect(text).toContain("50,000");
    expect(text).toContain("נטפליקס");
    expect(text).toContain("אוכל");
  });
});
