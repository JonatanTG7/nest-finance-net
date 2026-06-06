
-- ============ 1. Person enum: add 'shared' ============
ALTER TYPE public.person ADD VALUE IF NOT EXISTS 'shared';

-- ============ 2. Payment methods: enum -> text + custom table ============
ALTER TABLE public.transactions
  ALTER COLUMN payment_method TYPE text USING payment_method::text;

-- normalize legacy values to new identifiers
UPDATE public.transactions SET payment_method = 'credit'         WHERE payment_method = 'credit';
UPDATE public.transactions SET payment_method = 'cash'           WHERE payment_method = 'cash';
UPDATE public.transactions SET payment_method = 'bank_transfer'  WHERE payment_method = 'standing_order';

DROP TYPE IF EXISTS public.payment_method;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select ON public.payment_methods
  FOR SELECT TO authenticated USING (household_id = current_household_id());
CREATE POLICY pm_insert ON public.payment_methods
  FOR INSERT TO authenticated WITH CHECK (household_id = current_household_id());
CREATE POLICY pm_update ON public.payment_methods
  FOR UPDATE TO authenticated USING (household_id = current_household_id())
  WITH CHECK (household_id = current_household_id());
CREATE POLICY pm_delete ON public.payment_methods
  FOR DELETE TO authenticated USING (household_id = current_household_id());

-- seed default payment methods for every existing household
INSERT INTO public.payment_methods (household_id, key, label, sort_order)
SELECT h.id, v.key, v.label, v.sort_order
FROM public.households h
CROSS JOIN (VALUES
  ('credit',        'אשראי',        1),
  ('cash',          'מזומן',         2),
  ('bank_transfer', 'העברה בנקאית', 3)
) v(key, label, sort_order)
ON CONFLICT (household_id, key) DO NOTHING;

-- ============ 3. Investment accounts: starting balance + fx ============
ALTER TABLE public.investment_accounts
  ADD COLUMN IF NOT EXISTS starting_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.investment_accounts
  ADD COLUMN IF NOT EXISTS starting_balance_ils numeric(14,2) NOT NULL DEFAULT 0;

-- For Jonatan + Shiri's household: align the 4 required accounts
DO $$
DECLARE
  hid uuid := 'e3360e60-d721-4802-adc7-5d70ee473196';
BEGIN
  -- Rename "השקעות אחרות" -> "חסכון כללי"
  UPDATE public.investment_accounts
     SET name = 'חסכון כללי', kind = 'savings', sort_order = 2, color = '#10b981'
   WHERE household_id = hid AND name = 'השקעות אחרות';

  -- IB -> USD
  UPDATE public.investment_accounts
     SET currency = 'USD', kind = 'interactive', sort_order = 4, color = '#6366f1'
   WHERE household_id = hid AND name = 'Interactive Brokers';

  -- קרן כספית keep, set order
  UPDATE public.investment_accounts
     SET sort_order = 3, color = '#eab308'
   WHERE household_id = hid AND name = 'קרן כספית';

  -- Insert עובר ושב if missing
  INSERT INTO public.investment_accounts (household_id, name, kind, color, currency, sort_order)
  SELECT hid, 'עובר ושב', 'checking', '#3b82f6', 'ILS', 1
  WHERE NOT EXISTS (
    SELECT 1 FROM public.investment_accounts WHERE household_id = hid AND name = 'עובר ושב'
  );
END $$;

-- ============ 4. Categories: renames ============
-- System renames (NULL household_id)
UPDATE public.categories SET name = 'סופר' WHERE name = 'סופרמרקט' AND household_id IS NULL;

-- Per-household renames (e3360e60)
UPDATE public.categories SET name = 'רפואה'         WHERE name = 'בריאות'        AND household_id = 'e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET name = 'רכב'           WHERE name = 'רכב (תחזוקה)' AND household_id = 'e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET name = 'הוצאות לבית'   WHERE name = 'הוצאות בית'    AND household_id = 'e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET name = 'הוצאות כללי'   WHERE name = 'כללי'          AND household_id = 'e3360e60-d721-4802-adc7-5d70ee473196';

-- ============ 5. Categories: remaps before deletion ============
-- פרילנס (system, income) -> משכורת (system)
UPDATE public.transactions
   SET category_id = (SELECT id FROM public.categories WHERE name='משכורת' AND household_id IS NULL LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='פרילנס' AND household_id IS NULL);

-- תחבורה (system) -> תחבורה ציבורית (per-household). For tx of households without a per-household replacement, set NULL.
UPDATE public.transactions tx
   SET category_id = COALESCE(
        (SELECT id FROM public.categories WHERE name='תחבורה ציבורית' AND household_id = tx.household_id LIMIT 1),
        NULL)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='תחבורה' AND household_id IS NULL);

-- בית מרקחת (system) -> רפואה (per-household). Fallback NULL.
UPDATE public.transactions tx
   SET category_id = (SELECT id FROM public.categories WHERE name='רפואה' AND household_id = tx.household_id LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='בית מרקחת' AND household_id IS NULL);

-- ביגוד -> קניות (system)
UPDATE public.transactions
   SET category_id = (SELECT id FROM public.categories WHERE name='קניות' AND household_id IS NULL LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='ביגוד' AND household_id IS NOT NULL);

-- כביסה -> הוצאות לבית
UPDATE public.transactions tx
   SET category_id = (SELECT id FROM public.categories WHERE name='הוצאות לבית' AND household_id = tx.household_id LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='כביסה' AND household_id IS NOT NULL);

-- חיות מחמד -> הוצאות כללי
UPDATE public.transactions tx
   SET category_id = (SELECT id FROM public.categories WHERE name='הוצאות כללי' AND household_id = tx.household_id LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='חיות מחמד' AND household_id IS NOT NULL);

-- סלולר -> מנויים (system, fixed)
UPDATE public.transactions
   SET category_id = (SELECT id FROM public.categories WHERE name='מנויים' AND household_id IS NULL LIMIT 1),
       type        = 'fixed'
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='סלולר' AND household_id IS NOT NULL);

-- חו"ל -> טיסות
UPDATE public.transactions tx
   SET category_id = (SELECT id FROM public.categories WHERE name='טיסות' AND household_id = tx.household_id LIMIT 1)
 WHERE category_id IN (SELECT id FROM public.categories WHERE name='חו"ל' AND household_id IS NOT NULL);

-- ============ 6. Delete obsolete categories ============
DELETE FROM public.categories WHERE name = 'פרילנס'    AND household_id IS NULL;
DELETE FROM public.categories WHERE name = 'תחבורה'    AND household_id IS NULL;
DELETE FROM public.categories WHERE name = 'בית מרקחת' AND household_id IS NULL;
DELETE FROM public.categories WHERE name IN ('ביגוד','כביסה','חיות מחמד','סלולר','חו"ל');

-- ============ 7. Add new "הוצאות קבועות" system category ============
INSERT INTO public.categories (name, type, household_id, is_system, color, emoji, sort_order)
SELECT 'הוצאות קבועות', 'expense', NULL, true, '#f59e0b', '📅', 14
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'הוצאות קבועות' AND household_id IS NULL
);

-- ============ 8. Reorder expense grid (system) ============
UPDATE public.categories SET sort_order = 1  WHERE name='סופר'             AND household_id IS NULL;
UPDATE public.categories SET sort_order = 2  WHERE name='בילויים'          AND household_id IS NULL;
UPDATE public.categories SET sort_order = 3  WHERE name='קניות'             AND household_id IS NULL;
UPDATE public.categories SET sort_order = 4  WHERE name='מסעדות'           AND household_id IS NULL;
UPDATE public.categories SET sort_order = 5  WHERE name='קפה'               AND household_id IS NULL;
UPDATE public.categories SET sort_order = 8  WHERE name='דלק'               AND household_id IS NULL;
UPDATE public.categories SET sort_order = 14 WHERE name='הוצאות קבועות'   AND household_id IS NULL;

-- per-household (e3360e60)
UPDATE public.categories SET sort_order = 6  WHERE name='שתייה'            AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 7  WHERE name='תחבורה ציבורית'  AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 9  WHERE name='רכב'              AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 10 WHERE name='רפואה'            AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 11 WHERE name='טיפוח'            AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 12 WHERE name='ספורט'            AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 13 WHERE name='הוצאות לבית'      AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 15 WHERE name='הוצאות כללי'      AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 16 WHERE name='טיסות'             AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 17 WHERE name='לינה'              AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
UPDATE public.categories SET sort_order = 18 WHERE name='עמלות'             AND household_id='e3360e60-d721-4802-adc7-5d70ee473196';
