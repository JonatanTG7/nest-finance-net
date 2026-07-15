## IB Portfolio — Plan

### 1. Data model (new tables)

**`ib_holdings`** — per-user IB account state
- `id`, `household_id`, `cash_usd numeric` (default 0)
- RLS: household-scoped, one row per household (upsert on household_id)

**`ib_positions`** — one row per ticker
- `id`, `household_id`, `symbol text`, `quantity numeric`, `avg_price numeric`
- Unique (household_id, symbol)
- RLS: household-scoped, standard GRANTs

Migration also: nothing removed from `investment_accounts` (IB row stays, just its "balance" is computed from these tables, not stored). Legacy `starting_balance*` on the IB row is ignored for totals.

### 2. Live prices (Finnhub)

- Add secret `FINNHUB_API_KEY` (I'll open the secure form after this plan).
- Server function `getQuotes({ symbols })` in `src/lib/ib.functions.ts`:
  - Uses `requireSupabaseAuth`, reads `process.env.FINNHUB_API_KEY` inside handler.
  - Calls `https://finnhub.io/api/v1/quote?symbol=X` per symbol in parallel, returns `{ symbol, last, prevClose }`.
  - Cached in-memory 60s per symbol per worker to save quota.
- Client uses TanStack Query with 60s staleTime; refetch on window focus.

### 3. USD→ILS

Reuse existing `fetchUsdIlsRate()` in `src/lib/fx.ts`; cached via a `["fx","usdils"]` query.

### 4. UI — under Investments

Route stays `/investments`. Each account card is clickable (matches user's request "like קרן כספית — clickable"). For the IB card, clicking opens a dedicated view `/investments/ib` (new file `src/routes/investments.ib.tsx`) styled per the screenshot:

- **Header summary (left column on desktop, top on mobile):**
  - Total portfolio value in USD (large), ILS equivalent muted below
  - Rows: Cash, Unrealized P&L (green/red, `+` sign), Realized P&L (shown as `—` / hidden per user)
  - Buttons: **Manage Cash**, **Add Position**

- **Positions table (main area):**
  Columns: `INSTRUMENT | POSITION | LAST | AVG PRICE | UNREALIZED P&L | MARKET VALUE` + row action menu (Edit / Delete).
  Empty state: "אין החזקות עדיין" + CTA.

- **Other investment accounts** on `/investments` keep the existing balance-update flow untouched.

- **Dashboard** השקעה card total now includes IB portfolio USD × FX (replaces old IB balance in the aggregate).

### 5. Management modals

- **Manage Cash** (Dialog): single USD input → upserts `ib_holdings.cash_usd`.
- **Position form** (Dialog, reused for add/edit): symbol (uppercased, trimmed), quantity, avg price. Delete button on edit.
- All mutations invalidate `["ib","holdings"]`, `["ib","positions"]`, `["ib","quotes"]`.

### 6. Calculations (client)

For each position with live `last`:
```
marketValue = quantity * last
unrealizedPnL = (last - avg_price) * quantity
```
Totals:
```
totalMarketValue = sum(marketValue)
totalUnrealized  = sum(unrealizedPnL)
portfolioUsd     = cash_usd + totalMarketValue
portfolioIls     = portfolioUsd * usdIlsRate
```

### 7. Files

Created:
- `supabase/migrations/<ts>_ib_portfolio.sql`
- `src/lib/ib.functions.ts` (getQuotes, protected)
- `src/lib/ib.ts` (client CRUD helpers over supabase)
- `src/routes/investments.ib.tsx`
- `src/components/ib/PortfolioSummary.tsx`
- `src/components/ib/PositionsTable.tsx`
- `src/components/ib/PositionDialog.tsx`
- `src/components/ib/CashDialog.tsx`

Edited:
- `src/routes/investments.tsx` — IB card links to `/investments/ib`; totals for IB row come from portfolio.
- `src/routes/index.tsx` — השקעה summary uses IB portfolio value instead of stored balance.
- `src/routes/settings.tsx` — remove IB from the "update balance in ILS" list (other accounts stay).

### Secrets

I'll request `FINNHUB_API_KEY` via the secure form once the plan is approved. Get a free key at finnhub.io → Dashboard.

### Out of scope (per your answer)

Realized P&L is skipped for now — the row is either omitted or shown as `—`.