-- Track splits for private accounts (pension / study fund / provident):
-- one row per investment track within an account, with its share of the
-- accumulated balance and (optionally) of future deposits — the Migdal
-- model, where the two splits may differ. Percentages are stored with
-- one decimal; the app warns (never hard-blocks) when a split does not
-- sum to 100, and shows the remainder as "unallocated".
--
-- The short annual pension statement (דוח שנתי מקוצר) lists track names
-- + annual returns but NO allocation percentages, so percentages are
-- always manual / portal / clearinghouse data — the import never
-- invents them. Tracks imported from a statement therefore start with
-- NULL percentages until the user fills them in.
--
-- Also adds statement-import fields to investment_accounts: the
-- Treasury code (קוד האוצר), expected monthly pension, the fund's
-- average fees (for the "fees above average" alert), monthly deposit
-- split, and the data source + date so the account shows where its
-- numbers came from.

ALTER TABLE public.investment_accounts
  ADD COLUMN treasury_code text,
  ADD COLUMN expected_monthly_pension numeric CHECK (expected_monthly_pension IS NULL OR expected_monthly_pension >= 0),
  ADD COLUMN avg_fee_from_balance numeric CHECK (avg_fee_from_balance IS NULL OR (avg_fee_from_balance >= 0 AND avg_fee_from_balance <= 100)),
  ADD COLUMN avg_fee_from_deposits numeric CHECK (avg_fee_from_deposits IS NULL OR (avg_fee_from_deposits >= 0 AND avg_fee_from_deposits <= 100)),
  ADD COLUMN data_source text CHECK (data_source IS NULL OR data_source IN ('manual', 'statement', 'clearinghouse', 'portal')),
  ADD COLUMN source_date date,
  ADD COLUMN monthly_deposit_employee numeric CHECK (monthly_deposit_employee IS NULL OR monthly_deposit_employee >= 0),
  ADD COLUMN monthly_deposit_employer numeric CHECK (monthly_deposit_employer IS NULL OR monthly_deposit_employer >= 0),
  ADD COLUMN monthly_deposit_severance numeric CHECK (monthly_deposit_severance IS NULL OR monthly_deposit_severance >= 0);

CREATE TABLE public.track_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  investment_account_id uuid NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  track_name text NOT NULL,
  track_code text,
  track_type text NOT NULL DEFAULT 'general'
    CHECK (track_type IN ('equities', 'index', 'bonds', 'cash', 'age-based', 'halacha', 'general')),
  allocation_pct_balance numeric
    CHECK (allocation_pct_balance IS NULL OR (allocation_pct_balance >= 0 AND allocation_pct_balance <= 100)),
  allocation_pct_deposits numeric
    CHECK (allocation_pct_deposits IS NULL OR (allocation_pct_deposits >= 0 AND allocation_pct_deposits <= 100)),
  return_year_pct numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_allocations TO authenticated;
GRANT ALL ON public.track_allocations TO service_role;

ALTER TABLE public.track_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY track_allocations_select ON public.track_allocations FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY track_allocations_insert ON public.track_allocations FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY track_allocations_update ON public.track_allocations FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY track_allocations_delete ON public.track_allocations FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX track_allocations_account_idx ON public.track_allocations (household_id, investment_account_id, sort_order);
