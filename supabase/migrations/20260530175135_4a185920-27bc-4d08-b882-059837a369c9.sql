
-- Investment accounts (e.g. "קרן כספית", "Interactive Brokers", "השקעות אחרות")
CREATE TABLE public.investment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  color text NOT NULL DEFAULT '#eab308',
  currency text NOT NULL DEFAULT 'ILS',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_accounts TO anon, authenticated;
GRANT ALL ON public.investment_accounts TO service_role;

ALTER TABLE public.investment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all ON public.investment_accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER touch_updated_at_investment_accounts
BEFORE UPDATE ON public.investment_accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link transactions to investment accounts (nullable; soft FK)
ALTER TABLE public.transactions
  ADD COLUMN investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE SET NULL;

-- Optional default account per category (for auto-routing when adding investment transactions)
ALTER TABLE public.categories
  ADD COLUMN investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE SET NULL;

-- Seed 3 default investment accounts
INSERT INTO public.investment_accounts (name, kind, color, sort_order) VALUES
  ('קרן כספית', 'money_market', '#10b981', 1),
  ('Interactive Brokers', 'interactive', '#6366f1', 2),
  ('השקעות אחרות', 'other', '#eab308', 3);

-- Move "קרן כספית" category from savings to investment + add "אינטראקטיב"
UPDATE public.categories SET type = 'investment' WHERE name = 'קרן כספית';

INSERT INTO public.categories (name, type, color, sort_order)
SELECT 'אינטראקטיב', 'investment'::transaction_type, '#6366f1', 45
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'אינטראקטיב');

-- Auto-route categories to investment accounts by name
UPDATE public.categories c SET investment_account_id = a.id
FROM public.investment_accounts a
WHERE (c.name = 'קרן כספית' AND a.name = 'קרן כספית')
   OR (c.name = 'אינטראקטיב' AND a.name = 'Interactive Brokers')
   OR (c.name IN ('תיק מסחר', 'פנסיה', 'קריפטו') AND a.name = 'השקעות אחרות');
