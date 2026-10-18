CREATE TABLE public.category_budgets (
 household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
 category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
 amount_ils numeric NOT NULL CHECK (amount_ils > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (household_id, category_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_budgets TO authenticated;
GRANT ALL ON public.category_budgets TO service_role;
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY household_budget_read ON public.category_budgets FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY household_budget_delete ON public.category_budgets FOR DELETE TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY household_budget_insert ON public.category_budgets FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id() AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.type IN ('expense','fixed') AND (c.household_id IS NULL OR c.household_id = public.current_household_id())));
CREATE POLICY household_budget_update ON public.category_budgets FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id() AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.type IN ('expense','fixed') AND (c.household_id IS NULL OR c.household_id = public.current_household_id())));
CREATE TRIGGER category_budgets_touch BEFORE UPDATE ON public.category_budgets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.category_budgets;