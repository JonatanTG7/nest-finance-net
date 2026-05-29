
-- Enums
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'fixed', 'savings', 'investment');
CREATE TYPE public.person AS ENUM ('yonatan', 'shiri');

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  icon TEXT NOT NULL DEFAULT 'circle',
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO anon, authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.tags FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  fx_rate_to_ils NUMERIC(14,6) NOT NULL DEFAULT 1,
  amount_ils NUMERIC(14,2) NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT,
  occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_by public.person NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_occurred_at ON public.transactions(occurred_at DESC);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- transaction_tags
CREATE TABLE public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_tags TO anon, authenticated;
GRANT ALL ON public.transaction_tags TO service_role;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.transaction_tags FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER TABLE public.transaction_tags REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_tags;

-- Seed default categories (Hebrew names per PRD)
INSERT INTO public.categories (name, type, color, icon, is_system, sort_order) VALUES
  -- Income (green)
  ('משכורת', 'income', '#22c55e', 'briefcase', true, 1),
  ('פרילנס', 'income', '#22c55e', 'laptop', true, 2),
  ('החזרים', 'income', '#22c55e', 'undo-2', true, 3),
  ('מתנות', 'income', '#22c55e', 'gift', true, 4),
  -- Home (blue)
  ('משכנתא/שכירות', 'fixed', '#3b82f6', 'home', true, 10),
  ('חשמל', 'fixed', '#3b82f6', 'zap', true, 11),
  ('מים', 'fixed', '#3b82f6', 'droplet', true, 12),
  ('ארנונה', 'fixed', '#3b82f6', 'building', true, 13),
  ('אינטרנט', 'fixed', '#3b82f6', 'wifi', true, 14),
  -- Living (red - expense)
  ('סופרמרקט', 'expense', '#ef4444', 'shopping-cart', true, 20),
  ('דלק', 'expense', '#ef4444', 'fuel', true, 21),
  ('תחבורה', 'expense', '#ef4444', 'car', true, 22),
  ('בית מרקחת', 'expense', '#ef4444', 'pill', true, 23),
  ('מסעדות', 'expense', '#ef4444', 'utensils', true, 24),
  ('קפה', 'expense', '#ef4444', 'coffee', true, 25),
  ('קניות', 'expense', '#ef4444', 'shopping-bag', true, 26),
  ('בילויים', 'expense', '#ef4444', 'film', true, 27),
  -- Fixed/subscriptions (purple)
  ('מנויים', 'fixed', '#a855f7', 'repeat', true, 30),
  ('ביטוחים', 'fixed', '#a855f7', 'shield', true, 31),
  ('גן/חינוך', 'fixed', '#a855f7', 'graduation-cap', true, 32),
  -- Savings/Investments (gold)
  ('חיסכון', 'savings', '#eab308', 'piggy-bank', true, 40),
  ('קרן כספית', 'savings', '#eab308', 'landmark', true, 41),
  ('תיק מסחר', 'investment', '#eab308', 'trending-up', true, 42),
  ('פנסיה', 'investment', '#eab308', 'shield-check', true, 43),
  ('קריפטו', 'investment', '#eab308', 'bitcoin', true, 44);
