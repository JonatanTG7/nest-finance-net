-- Multi-portfolio IB support (stage 1 of the IB upgrade).
--
-- Until now every IB table was keyed by household only, and the single IB
-- portfolio was identified in the client by a hardcoded investment_accounts
-- UUID (IB_ACCOUNT_ID). That breaks for any new household and makes a second
-- portfolio (e.g. for the child) impossible.
--
-- This migration keys ib_holdings / ib_positions / ib_position_transactions by
-- the investment_accounts row (kind = 'interactive') they belong to, backfills
-- existing rows onto each household's interactive account, and seeds an IB
-- account + holdings row for new households inside create_household().
--
-- It also adds investment_accounts.balance_reset_at: balance updates
-- (setAccountBalanceIls) used to zero out historical transactions to make the
-- displayed balance match. From now on a reset only stamps the account, and
-- totals count transactions created after the reset — history is preserved.

-- ---------------------------------------------------------------------------
-- 1. Add the portfolio column (nullable for the backfill below)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ib_holdings
  ADD COLUMN investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.ib_positions
  ADD COLUMN investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.ib_position_transactions
  ADD COLUMN investment_account_id uuid REFERENCES public.investment_accounts(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Seed an interactive account for households that have IB rows but no
--    interactive investment account (defensive; normally every household that
--    used IB already has one from the original seed).
-- ---------------------------------------------------------------------------
INSERT INTO public.investment_accounts (household_id, name, kind, color, currency, sort_order, starting_balance, starting_balance_ils)
SELECT h.id, 'Interactive Brokers', 'interactive', '#6366f1', 'USD', 4, 0, 0
FROM public.households h
WHERE EXISTS (
  SELECT 1 FROM public.ib_holdings x WHERE x.household_id = h.id
  UNION ALL SELECT 1 FROM public.ib_positions x WHERE x.household_id = h.id
  UNION ALL SELECT 1 FROM public.ib_position_transactions x WHERE x.household_id = h.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.investment_accounts a
  WHERE a.household_id = h.id AND a.kind = 'interactive'
);

-- ---------------------------------------------------------------------------
-- 3. Backfill: map every existing IB row onto its household's interactive
--    account (earliest created wins if somehow there are several).
-- ---------------------------------------------------------------------------
UPDATE public.ib_holdings h
   SET investment_account_id = (
     SELECT a.id FROM public.investment_accounts a
     WHERE a.household_id = h.household_id AND a.kind = 'interactive'
     ORDER BY a.created_at ASC LIMIT 1
   );
UPDATE public.ib_positions p
   SET investment_account_id = (
     SELECT a.id FROM public.investment_accounts a
     WHERE a.household_id = p.household_id AND a.kind = 'interactive'
     ORDER BY a.created_at ASC LIMIT 1
   );
UPDATE public.ib_position_transactions t
   SET investment_account_id = (
     SELECT a.id FROM public.investment_accounts a
     WHERE a.household_id = t.household_id AND a.kind = 'interactive'
     ORDER BY a.created_at ASC LIMIT 1
   );

-- ---------------------------------------------------------------------------
-- 4. Enforce NOT NULL + per-portfolio uniqueness
-- ---------------------------------------------------------------------------
ALTER TABLE public.ib_holdings ALTER COLUMN investment_account_id SET NOT NULL;
ALTER TABLE public.ib_positions ALTER COLUMN investment_account_id SET NOT NULL;
ALTER TABLE public.ib_position_transactions ALTER COLUMN investment_account_id SET NOT NULL;

-- Drop the old household-only unique constraints (looked up dynamically so the
-- migration survives renames; primary keys are contype 'p' and untouched).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.ib_holdings'::regclass AND contype = 'u' LOOP
    EXECUTE format('ALTER TABLE public.ib_holdings DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.ib_positions'::regclass AND contype = 'u' LOOP
    EXECUTE format('ALTER TABLE public.ib_positions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ib_holdings
  ADD CONSTRAINT ib_holdings_household_account_key UNIQUE (household_id, investment_account_id);
ALTER TABLE public.ib_positions
  ADD CONSTRAINT ib_positions_household_account_symbol_key UNIQUE (household_id, investment_account_id, symbol);

CREATE INDEX ib_positions_account_idx ON public.ib_positions (household_id, investment_account_id);
CREATE INDEX ib_position_transactions_account_idx
  ON public.ib_position_transactions (household_id, investment_account_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Sanity CHECKs on positions (quantities and prices are never negative)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ib_positions ADD CONSTRAINT ib_positions_quantity_nonneg CHECK (quantity >= 0);
ALTER TABLE public.ib_positions ADD CONSTRAINT ib_positions_avg_price_nonneg CHECK (avg_price >= 0);

-- ---------------------------------------------------------------------------
-- 6. Ledger: allow 'adjust' entries (portfolio-sync corrections). The old
--    kind CHECK is dropped by definition match, then recreated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint c
           WHERE c.conrelid = 'public.ib_position_transactions'::regclass
             AND c.contype = 'c'
             AND pg_get_constraintdef(c.oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.ib_position_transactions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.ib_position_transactions
  ADD CONSTRAINT ib_position_transactions_kind_check CHECK (kind IN ('buy', 'sell', 'adjust'));

-- ---------------------------------------------------------------------------
-- 7. Ensure every interactive account has a holdings (cash) row
-- ---------------------------------------------------------------------------
INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
SELECT a.household_id, a.id, 0
FROM public.investment_accounts a
WHERE a.kind = 'interactive'
  AND NOT EXISTS (
    SELECT 1 FROM public.ib_holdings h WHERE h.investment_account_id = a.id
  );

-- ---------------------------------------------------------------------------
-- 8. Balance resets must stop wiping history (see header note).
--    NULL = no reset yet (all transactions count toward the balance).
-- ---------------------------------------------------------------------------
ALTER TABLE public.investment_accounts ADD COLUMN balance_reset_at timestamptz;

-- ---------------------------------------------------------------------------
-- 9. Seed default investment accounts (incl. an IB portfolio + cash row) for
--    every household created from now on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_household(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _uid uuid := auth.uid();
  _ib_account_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.households(name) VALUES (coalesce(nullif(trim(_name), ''), 'משק הבית שלי'))
  RETURNING id INTO _hid;

  UPDATE public.profiles
     SET household_id = _hid,
         person = COALESCE(person, 'yonatan'),
         updated_at = now()
   WHERE id = _uid;

  -- Default investment accounts (same set the original 2026-05-30 seed created
  -- for the first household, with the 2026-06-06 renames applied).
  INSERT INTO public.investment_accounts (household_id, name, kind, color, currency, sort_order, starting_balance, starting_balance_ils)
  VALUES
    (_hid, 'עובר ושב', 'checking', '#3b82f6', 'ILS', 1, 0, 0),
    (_hid, 'חסכון כללי', 'savings', '#10b981', 'ILS', 2, 0, 0),
    (_hid, 'קרן כספית', 'money_market', '#eab308', 'ILS', 3, 0, 0);

  INSERT INTO public.investment_accounts (household_id, name, kind, color, currency, sort_order, starting_balance, starting_balance_ils)
  VALUES (_hid, 'Interactive Brokers', 'interactive', '#6366f1', 'USD', 4, 0, 0)
  RETURNING id INTO _ib_account_id;

  INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
  VALUES (_hid, _ib_account_id, 0);

  RETURN _hid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;
