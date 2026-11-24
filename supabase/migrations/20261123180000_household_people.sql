-- Additional household people (children) + an extensible account owner.
--
-- The person model was a 3-value enum (yonatan/shiri/shared), so only the
-- two members with an app login could own private accounts. A child like
-- Eitan has no login and no profile row, yet needs his own accounts
-- (his IB portfolio, an account per child). household_people holds those
-- extra people — name only, no auth — and investment_accounts.person
-- becomes plain text: the three slot values stay as-is, added people are
-- referenced as 'person:<household_people id>'.
--
-- Only investment_accounts.person changes type. entered_by / changed_by
-- columns (transactions, subscriptions, history) stay the enum: those
-- are always real users who performed an action.

CREATE TABLE public.household_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_people TO authenticated;
GRANT ALL ON public.household_people TO service_role;

ALTER TABLE public.household_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household people household all" ON public.household_people FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());

CREATE INDEX household_people_household_idx ON public.household_people (household_id, sort_order, created_at);

-- Existing values ('yonatan' / 'shiri' / 'shared') survive the cast
-- unchanged; the 'shared' default is carried over as text.
ALTER TABLE public.investment_accounts
  ALTER COLUMN person TYPE text USING person::text;
