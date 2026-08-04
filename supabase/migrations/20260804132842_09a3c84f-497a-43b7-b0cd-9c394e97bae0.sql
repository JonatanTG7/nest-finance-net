CREATE TABLE public.account_balance_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'balance',
  changed_by public.person,
  changed_by_user_id uuid,
  old_amount numeric NOT NULL DEFAULT 0,
  new_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.account_balance_history TO authenticated;
GRANT ALL ON public.account_balance_history TO service_role;

ALTER TABLE public.account_balance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abh_select" ON public.account_balance_history
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());

CREATE POLICY "abh_insert" ON public.account_balance_history
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());

CREATE INDEX account_balance_history_acct_idx
  ON public.account_balance_history (investment_account_id, created_at DESC);