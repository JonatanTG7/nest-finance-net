-- Recurring income (הכנסות קבועות): mirrors the subscriptions table, minus
-- payment_method / credit_card_id (income has no card). Generated income
-- transactions link back via transactions.recurring_income_id; the unique
-- index prevents duplicates when both phones sync.
CREATE TABLE public.recurring_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '💰',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  billing_day integer NOT NULL DEFAULT 1,
  entered_by public.person NOT NULL DEFAULT 'shared',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  payment_count integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_income TO authenticated;
GRANT ALL ON public.recurring_income TO service_role;
ALTER TABLE public.recurring_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurring income household all" ON public.recurring_income FOR ALL TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());
CREATE TRIGGER recurring_income_touch BEFORE UPDATE ON public.recurring_income
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.transactions ADD COLUMN recurring_income_id uuid REFERENCES public.recurring_income(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX transactions_recurring_income_date_uniq ON public.transactions(recurring_income_id, occurred_at) WHERE recurring_income_id IS NOT NULL;
