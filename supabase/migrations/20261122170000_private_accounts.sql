-- Per-person private accounts (pension, study fund, provident): an owner
-- on investment_accounts plus metadata columns, and a history table that
-- records changes to the metadata (company, fees, track...) so past values
-- can be looked up later.
--
-- Existing accounts default to owner 'shared', so they stay exactly where
-- they are in the shared assets view. New private accounts are created
-- from a person's tab with that person as owner.

ALTER TABLE public.investment_accounts
  ADD COLUMN person public.person NOT NULL DEFAULT 'shared',
  ADD COLUMN company text,
  ADD COLUMN fee_from_balance numeric CHECK (fee_from_balance IS NULL OR (fee_from_balance >= 0 AND fee_from_balance <= 100)),
  ADD COLUMN fee_from_deposits numeric CHECK (fee_from_deposits IS NULL OR (fee_from_deposits >= 0 AND fee_from_deposits <= 100)),
  ADD COLUMN track text;

-- One row per changed metadata field, per edit. Values are stored as text
-- (fees as their plain number, e.g. '0.1' for 0.1%) — the history is
-- display-only, never used in calculations.
CREATE TABLE public.private_account_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  investment_account_id uuid NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('company', 'fee_from_balance', 'fee_from_deposits', 'track', 'name', 'kind', 'owner')),
  old_value text,
  new_value text,
  changed_by public.person,
  changed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_account_history TO authenticated;
GRANT ALL ON public.private_account_history TO service_role;

ALTER TABLE public.private_account_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY private_account_history_select ON public.private_account_history FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY private_account_history_insert ON public.private_account_history FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY private_account_history_update ON public.private_account_history FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY private_account_history_delete ON public.private_account_history FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX private_account_history_account_idx ON public.private_account_history (household_id, investment_account_id, created_at DESC);
