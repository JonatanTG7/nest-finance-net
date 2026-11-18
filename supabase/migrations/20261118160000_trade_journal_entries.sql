-- Trading journal for day-trading accounts (e.g. Colmex Pro): one row per
-- closed trade — ticker, long/short, units, P&L in USD, note and date.
-- Dry data only, no photos. Each trade's P&L counts toward the displayed
-- account balance (client-side: entries created after the account's
-- balance_reset_at add their P&L on top of the manual baseline, so a
-- manual balance update absorbs earlier trades — no double-counting).
-- Journal entries are never written as transactions rows.

CREATE TABLE public.trade_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  investment_account_id uuid NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  occurred_at date NOT NULL DEFAULT current_date,
  symbol text NOT NULL CHECK (symbol <> ''),
  side text NOT NULL CHECK (side IN ('long', 'short')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  pnl_usd numeric NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journal_entries TO authenticated;
GRANT ALL ON public.trade_journal_entries TO service_role;

ALTER TABLE public.trade_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_journal_entries_select ON public.trade_journal_entries FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY trade_journal_entries_insert ON public.trade_journal_entries FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY trade_journal_entries_update ON public.trade_journal_entries FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY trade_journal_entries_delete ON public.trade_journal_entries FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX trade_journal_entries_account_occurred_idx ON public.trade_journal_entries (household_id, investment_account_id, occurred_at DESC, created_at DESC);

CREATE TRIGGER trade_journal_entries_touch_updated_at BEFORE UPDATE ON public.trade_journal_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
