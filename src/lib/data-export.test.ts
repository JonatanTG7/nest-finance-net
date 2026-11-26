import { describe, expect, it } from "vitest";
import {
  accountsToRows,
  budgetsToRows,
  categoriesToRows,
  creditCardsToRows,
  escapeCsvCell,
  exportFileName,
  householdPeopleToRows,
  ibCashToRows,
  ibPositionsToRows,
  isMissingTableError,
  ibTransactionsToRows,
  journalToRows,
  recurringIncomeToRows,
  subscriptionsToRows,
  tagsToRows,
  toCsv,
  trackAllocationsToRows,
  transactionsToRows,
  tripsToRows,
  vouchersToRows,
} from "./data-export";

describe("escapeCsvCell", () => {
  it("passes plain values through", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell("שלום")).toBe("שלום");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(3.5)).toBe("3.5");
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(false)).toBe("false");
  });

  it("renders null/undefined as empty", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes cells with a comma, quote or newline", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("a\rb")).toBe('"a\rb"');
  });

  it("neutralizes formula-leading cells (CSV injection)", () => {
    expect(escapeCsvCell("=2+5")).toBe("'=2+5");
    expect(escapeCsvCell("+2+5")).toBe("'+2+5");
    expect(escapeCsvCell("-2+5")).toBe("'-2+5");
    expect(escapeCsvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell("  =2+5")).toBe("'  =2+5");
    expect(escapeCsvCell("\t=2+5")).toBe("'\t=2+5");
    expect(escapeCsvCell("\r=2+5")).toBe('\'"\r=2+5"');
    expect(escapeCsvCell("=a,b")).toBe('\'"=a,b"');
    // Plain values stay untouched.
    expect(escapeCsvCell("2+5")).toBe("2+5");
    expect(escapeCsvCell("a=b")).toBe("a=b");
    expect(escapeCsvCell("  hello")).toBe("  hello");
  });
});

describe("toCsv", () => {
  it("starts with a UTF-8 BOM, has a header row and CRLF endings", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        [1, "x"],
        [2, "y"],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe("\uFEFFa,b\r\n1,x\r\n2,y");
  });

  it("renders headers only for an empty area", () => {
    expect(toCsv(["id", "name"], [])).toBe("\uFEFFid,name");
  });
});

describe("isMissingTableError", () => {
  it("detects a missing-table PostgREST error and nothing else", () => {
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table" })).toBe(
      true,
    );
    expect(
      isMissingTableError({ message: "Could not find the table 'public.x' in the schema cache" }),
    ).toBe(true);
    expect(isMissingTableError({ code: "PGRST116", message: "not found" })).toBe(false);
    expect(isMissingTableError(new Error("network down"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe("exportFileName", () => {
  it("builds family-spend-<area>-YYYY-MM-DD.csv from the local date", () => {
    // Noon local time: unambiguous in any timezone.
    expect(exportFileName("transactions", new Date(2026, 10, 22, 12, 0, 0))).toBe(
      "family-spend-transactions-2026-11-22.csv",
    );
  });
});

describe("transactionsToRows", () => {
  it("resolves lookups, joins tags and keeps the raw photo path", () => {
    const { headers, rows } = transactionsToRows(
      [
        {
          id: "tx1",
          occurred_at: "2026-11-20T10:00:00Z",
          type: "expense",
          title: "סופר, שבועי",
          amount: 250.5,
          currency: "ILS",
          fx_rate_to_ils: 1,
          amount_ils: 250.5,
          entered_by: "yonatan",
          payment_method: "credit",
          credit_card_id: "card1",
          trip_id: "trip1",
          subscription_id: null,
          note: 'עם "מרכאות"',
          location: null,
          created_at: "2026-11-20T10:01:00Z",
          photo_url: "household-1/tx1.jpg",
          category: { name: "מזון" },
          transaction_tags: [{ tag: { name: "שבועי" } }, { tag: { name: "משפחה" } }],
          investment_account: { name: "עו״ש" },
        },
      ],
      [{ id: "card1", name: "ויזה", last_four: "1234", billing_day: 10, sort_order: 0 }],
      [{ id: "trip1", name: "פראג" }],
    );
    expect(headers).toContain("credit_card");
    expect(headers).toContain("photo_url");
    const row = rows[0];
    expect(row[headers.indexOf("category")]).toBe("מזון");
    expect(row[headers.indexOf("entered_by")]).toBe("Jonatan");
    expect(row[headers.indexOf("credit_card")]).toBe("ויזה (*1234)");
    expect(row[headers.indexOf("investment_account")]).toBe("עו״ש");
    expect(row[headers.indexOf("trip")]).toBe("פראג");
    expect(row[headers.indexOf("tags")]).toBe("שבועי; משפחה");
    expect(row[headers.indexOf("photo_url")]).toBe("household-1/tx1.jpg");
    expect(row[headers.indexOf("location")]).toBe(null);
    // And the full CSV round-trips through quoting.
    const csv = toCsv(headers, rows);
    expect(csv).toContain('"סופר, שבועי"');
    expect(csv).toContain('"עם ""מרכאות"""');
  });

  it("leaves lookup columns empty when the lookup is missing", () => {
    const { headers, rows } = transactionsToRows(
      [
        {
          id: "tx2",
          occurred_at: "2026-11-21",
          type: "income",
          title: "משכורת",
          amount: 1000,
          currency: "ILS",
          fx_rate_to_ils: 1,
          amount_ils: 1000,
          entered_by: "shiri",
          payment_method: null,
          credit_card_id: "gone",
          trip_id: null,
          subscription_id: null,
          note: null,
          location: null,
          created_at: "2026-11-21",
          photo_url: null,
          category: null,
          transaction_tags: [],
          investment_account: null,
        },
      ],
      [],
      [],
    );
    const row = rows[0];
    expect(row[headers.indexOf("category")]).toBe("");
    expect(row[headers.indexOf("entered_by")]).toBe("Shiri");
    expect(row[headers.indexOf("credit_card")]).toBe("");
    expect(row[headers.indexOf("trip")]).toBe("");
    expect(row[headers.indexOf("tags")]).toBe("");
  });
});

describe("accountsToRows", () => {
  it("exports private-account metadata columns", () => {
    const { headers, rows } = accountsToRows([
      {
        id: "a1",
        name: "קרן פנסיה",
        kind: "pension",
        person: "yonatan",
        company: "מנורה",
        fee_from_balance: 0.1,
        fee_from_deposits: 1.5,
        track: "מניות",
        currency: "ILS",
        starting_balance: 100000,
        starting_balance_ils: 100000,
        balance_reset_at: null,
        color: "#123456",
        sort_order: 1,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ]);
    expect(headers).not.toContain("household_id");
    expect(rows[0][headers.indexOf("company")]).toBe("מנורה");
    expect(rows[0][headers.indexOf("person")]).toBe("Jonatan");
    expect(rows[0][headers.indexOf("fee_from_deposits")]).toBe(1.5);
  });

  it("resolves an added person's owner id to their name", () => {
    const { headers, rows } = accountsToRows(
      [
        {
          id: "a2",
          name: "חיסכון לילד",
          kind: "savings",
          person: "person:c1",
          company: "מור",
          fee_from_balance: 0,
          fee_from_deposits: 0,
          track: null,
          currency: "ILS",
          starting_balance: 58,
          starting_balance_ils: 58,
          balance_reset_at: null,
          color: "#123456",
          sort_order: 1,
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
      ],
      { yonatan: "Jonatan", shiri: "Shiri", shared: "Shared", "person:c1": "Eitan" },
    );
    expect(rows[0][headers.indexOf("person")]).toBe("Eitan");
  });
});

describe("trackAllocationsToRows", () => {
  it("exports track splits 1:1, allowing unknown percentages", () => {
    const { headers, rows } = trackAllocationsToRows([
      {
        id: "ta1",
        investment_account_id: "a1",
        track_name: "מניות",
        track_code: "1234",
        track_type: "equities",
        allocation_pct_balance: 62.9,
        allocation_pct_deposits: null,
        return_year_pct: 8.5,
        sort_order: 0,
        created_at: "2026-11-22",
        updated_at: "2026-11-22",
      },
    ]);
    expect(headers).not.toContain("household_id");
    expect(rows[0][headers.indexOf("allocation_pct_balance")]).toBe(62.9);
    expect(rows[0][headers.indexOf("allocation_pct_deposits")]).toBe(null);
  });
});

describe("recurringIncomeToRows", () => {
  it("exports columns 1:1 including booleans", () => {
    const { headers, rows } = recurringIncomeToRows([
      {
        id: "r1",
        name: "קצבת ילדים",
        emoji: "👶",
        category_id: null,
        amount: 115,
        currency: "ILS",
        billing_day: 20,
        entered_by: "shared",
        start_date: "2026-10-20",
        end_date: null,
        payment_count: null,
        active: true,
      },
    ]);
    expect(rows[0][headers.indexOf("active")]).toBe(true);
    expect(rows[0][headers.indexOf("entered_by")]).toBe("Shared");
    expect(headers).not.toContain("payment_method");
    expect(toCsv(headers, rows)).toContain(",true");
  });
});

describe("subscriptionsToRows", () => {
  it("exports columns 1:1 including booleans", () => {
    const { headers, rows } = subscriptionsToRows([
      {
        id: "s1",
        name: "נטפליקס",
        emoji: "🎬",
        category_id: "c1",
        amount: 54.9,
        currency: "ILS",
        billing_day: 5,
        entered_by: "yonatan",
        payment_method: "credit",
        credit_card_id: null,
        start_date: "2026-01-01",
        end_date: null,
        payment_count: null,
        active: true,
      },
    ]);
    expect(rows[0][headers.indexOf("active")]).toBe(true);
    expect(rows[0][headers.indexOf("entered_by")]).toBe("Jonatan");
    expect(toCsv(headers, rows)).toContain(",true");
  });
});

describe("journalToRows", () => {
  it("exports journal entries 1:1", () => {
    const { headers, rows } = journalToRows([
      {
        id: "j1",
        investment_account_id: "a1",
        symbol: "QQQ",
        side: "long",
        quantity: 10,
        pnl_usd: 35,
        note: "test",
        occurred_at: "2026-11-18",
        created_at: "2026-11-18",
        updated_at: "2026-11-18",
      },
    ]);
    expect(rows[0][headers.indexOf("pnl_usd")]).toBe(35);
  });
});

describe("vouchersToRows", () => {
  it("keeps the raw image path", () => {
    const { headers, rows } = vouchersToRows([
      {
        id: "v1",
        label: "תו הזהב",
        face_value: 200,
        remaining_value: 50,
        currency: "ILS",
        barcode: null,
        expiry_date: "2027-01-01",
        image_url: "household-1/v1.jpg",
        source: "manual",
        entered_by: "shiri",
        occurred_at: "2026-11-01",
        created_at: "2026-11-01",
        updated_at: "2026-11-01",
      },
    ]);
    expect(rows[0][headers.indexOf("image_url")]).toBe("household-1/v1.jpg");
    expect(rows[0][headers.indexOf("entered_by")]).toBe("Shiri");
  });
});

describe("tripsToRows", () => {
  it("keeps the raw cover path", () => {
    const { headers, rows } = tripsToRows([
      {
        id: "t1",
        name: "פראג",
        country: "צ׳כיה",
        cities: null,
        start_date: "2026-12-01",
        end_date: "2026-12-05",
        budget: 5000,
        currency: "ILS",
        cover_image: "household-1/cover.jpg",
        created_at: "2026-11-01",
        updated_at: "2026-11-01",
      },
    ]);
    expect(rows[0][headers.indexOf("cover_image")]).toBe("household-1/cover.jpg");
  });
});

describe("IB sheets", () => {
  it("exports positions, cash and ledger", () => {
    const pos = ibPositionsToRows([
      {
        id: "p1",
        household_id: "h1",
        investment_account_id: "a1",
        symbol: "QQQ",
        quantity: 16.95,
        avg_price: 607.43,
      },
    ]);
    expect(pos.headers).not.toContain("household_id");
    expect(pos.rows[0][pos.headers.indexOf("symbol")]).toBe("QQQ");

    const cash = ibCashToRows([
      { id: "c1", household_id: "h1", investment_account_id: "a1", cash_usd: 4071.8 },
    ]);
    expect(cash.rows[0][cash.headers.indexOf("cash_usd")]).toBe(4071.8);

    const ledger = ibTransactionsToRows([
      {
        id: "l1",
        position_id: "p1",
        investment_account_id: "a1",
        symbol: "QQQ",
        kind: "buy",
        quantity: 10,
        price: 600,
        prior_avg_price: null,
        occurred_at: "2026-11-01",
        note: null,
        created_at: "2026-11-01",
      },
    ]);
    expect(ledger.rows[0][ledger.headers.indexOf("kind")]).toBe("buy");
  });
});

describe("reference sheets", () => {
  it("marks hidden categories", () => {
    const { headers, rows } = categoriesToRows(
      [
        {
          id: "c1",
          name: "מזון",
          type: "expense",
          emoji: "🍔",
          icon: "utensils",
          color: "#ff0000",
          is_system: true,
          investment_account_id: null,
          sort_order: 1,
          created_at: "2026-01-01",
        },
        {
          id: "c2",
          name: "ישן",
          type: "expense",
          emoji: null,
          icon: "",
          color: "",
          is_system: false,
          investment_account_id: null,
          sort_order: 2,
          created_at: "2026-01-01",
        },
      ],
      new Set(["c2"]),
    );
    expect(rows[0][headers.indexOf("hidden")]).toBe(false);
    expect(rows[1][headers.indexOf("hidden")]).toBe(true);
  });

  it("exports added household people", () => {
    const { headers, rows } = householdPeopleToRows([
      { id: "p1", name: "איתן", sort_order: 0, created_at: "2026-11-23" },
    ]);
    expect(rows[0][headers.indexOf("name")]).toBe("איתן");
    expect(rows[0][headers.indexOf("id")]).toBe("p1");
  });

  it("exports tags and credit cards", () => {
    const tags = tagsToRows([{ id: "t1", name: "שבועי", created_at: "2026-01-01" }]);
    expect(tags.rows[0][1]).toBe("שבועי");
    const cards = creditCardsToRows([
      { id: "cc1", name: "ויזה", last_four: "1234", billing_day: 10, sort_order: 0 },
    ]);
    expect(cards.rows[0][cards.headers.indexOf("last_four")]).toBe("1234");
  });

  it("resolves budget category names", () => {
    const { headers, rows } = budgetsToRows(
      [
        { category_id: "c1", amount_ils: 3000 },
        { category_id: "gone", amount_ils: 500 },
      ],
      [{ id: "c1", name: "מזון" }],
    );
    expect(rows[0][headers.indexOf("category")]).toBe("מזון");
    expect(rows[1][headers.indexOf("category")]).toBe("");
  });
});
