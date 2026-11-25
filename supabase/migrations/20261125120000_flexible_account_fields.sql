-- Flexible private-account details: custom fields + hideable fixed rows.
--
-- A private account's details list used to render every fixed field, with
-- "—" for the empty ones, and there was no way to add a data point of the
-- owner's own or to hide a row they don't want to see. Now:
--   * investment_accounts.hidden_detail_fields (text[]) stores the keys
--     of the fixed rows the owner hid on that account (empty by default);
--   * account_custom_fields holds free-text label + value rows the owner
--     adds to an account (rendered with the account fields, above the
--     meta block), mirroring track_allocations;
--   * private_account_history accepts the two new change kinds
--     ('custom_field', 'hidden_fields') so custom-field edits and
--     hide/show toggles are logged like any other metadata edit.
-- Existing rows are untouched (empty hidden list, no custom fields).

ALTER TABLE public.investment_accounts
  ADD COLUMN hidden_detail_fields text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.account_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  investment_account_id uuid NOT NULL REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) > 0),
  value text NOT NULL CHECK (char_length(value) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_custom_fields TO authenticated;
GRANT ALL ON public.account_custom_fields TO service_role;

ALTER TABLE public.account_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_custom_fields_select ON public.account_custom_fields FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY account_custom_fields_insert ON public.account_custom_fields FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY account_custom_fields_update ON public.account_custom_fields FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY account_custom_fields_delete ON public.account_custom_fields FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX account_custom_fields_account_idx ON public.account_custom_fields (household_id, investment_account_id, sort_order);

-- History field values are a fixed CHECK list; extend it for the two new
-- change kinds. The constraint name is Postgres' generated
-- "<table>_<column>_check".
ALTER TABLE public.private_account_history DROP CONSTRAINT IF EXISTS private_account_history_field_check;
ALTER TABLE public.private_account_history ADD CONSTRAINT private_account_history_field_check
  CHECK (field IN ('company', 'fee_from_balance', 'fee_from_deposits', 'track', 'name', 'kind', 'owner', 'custom_field', 'hidden_fields'));
