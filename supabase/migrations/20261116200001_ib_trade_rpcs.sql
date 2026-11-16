-- Atomic IB trade RPCs (stage 1 of the IB upgrade).
--
-- Buy/sell used to be 3-4 separate writes from the client (ledger + position
-- + cash + history log) with no transaction and a client-computed cash
-- balance — a failure mid-way left partial state, and two phones trading at
-- once could race on the cash row. These functions do the whole trade in one
-- database transaction, locking the cash row and the position row.
--
-- Internal helpers (ib_apply_*) do the work; the public RPCs validate the
-- caller + account and delegate. apply_ib_sync reuses the same helpers to
-- apply a whole AI-recognized portfolio in one transaction.
--
-- Lock order is always: cash row first, then position row. Never reverse it.

-- ---------------------------------------------------------------------------
-- Internal: buy. No auth checks — callers must validate first.
-- Returns {position_id, quantity, avg_price, cash_usd}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ib_apply_buy(
  _hid uuid,
  _account_id uuid,
  _symbol text,
  _quantity numeric,
  _price numeric,
  _occurred_at date,
  _note text,
  _adjust_cash boolean,
  _changed_by public.person,
  _changed_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pos public.ib_positions%ROWTYPE;
  _exists boolean := false;
  _cash numeric;
  _old_qty numeric := 0;
  _old_avg numeric := 0;
  _new_qty numeric;
  _new_avg numeric;
  _cost numeric;
  _new_cash numeric;
BEGIN
  SELECT cash_usd INTO _cash FROM public.ib_holdings
   WHERE household_id = _hid AND investment_account_id = _account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
    VALUES (_hid, _account_id, 0)
    ON CONFLICT (household_id, investment_account_id) DO NOTHING;
    SELECT cash_usd INTO _cash FROM public.ib_holdings
     WHERE household_id = _hid AND investment_account_id = _account_id
     FOR UPDATE;
  END IF;

  _cost := _quantity * _price;
  IF _adjust_cash AND _cash < _cost THEN
    RAISE EXCEPTION 'insufficient_cash';
  END IF;

  SELECT * INTO _pos FROM public.ib_positions
   WHERE household_id = _hid AND investment_account_id = _account_id AND symbol = _symbol
   FOR UPDATE;
  _exists := FOUND;
  IF _exists THEN
    _old_qty := _pos.quantity;
    _old_avg := _pos.avg_price;
  END IF;

  _new_qty := _old_qty + _quantity;
  _new_avg := CASE WHEN _new_qty > 0
    THEN (_old_qty * _old_avg + _quantity * _price) / _new_qty
    ELSE _price END;

  IF _exists THEN
    -- Ledger first: if this fails, the position is untouched.
    INSERT INTO public.ib_position_transactions
      (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
    VALUES (_hid, _account_id, _pos.id, _symbol, 'buy', _quantity, _price, _old_avg, _occurred_at, _note);

    UPDATE public.ib_positions
       SET quantity = _new_qty, avg_price = _new_avg, updated_at = now()
     WHERE id = _pos.id;
  ELSE
    -- New position must be inserted first to have an id for the ledger.
    INSERT INTO public.ib_positions (household_id, investment_account_id, symbol, quantity, avg_price)
    VALUES (_hid, _account_id, _symbol, _new_qty, _new_avg)
    RETURNING * INTO _pos;

    INSERT INTO public.ib_position_transactions
      (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
    VALUES (_hid, _account_id, _pos.id, _symbol, 'buy', _quantity, _price, _old_avg, _occurred_at, _note);
  END IF;

  _new_cash := _cash;
  IF _adjust_cash THEN
    _new_cash := _cash - _cost;
    UPDATE public.ib_holdings
       SET cash_usd = _new_cash, updated_at = now()
     WHERE household_id = _hid AND investment_account_id = _account_id;
    INSERT INTO public.account_balance_history
      (household_id, investment_account_id, kind, changed_by, changed_by_user_id, old_amount, new_amount, currency, note)
    VALUES (_hid, _account_id, 'קניית ' || _symbol, _changed_by, _changed_by_user_id, _cash, _new_cash, 'USD', _note);
  END IF;

  RETURN jsonb_build_object('position_id', _pos.id, 'quantity', _new_qty, 'avg_price', _new_avg, 'cash_usd', _new_cash);
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal: sell. No auth checks — callers must validate first.
-- Returns {realized_pnl, quantity, cash_usd}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ib_apply_sell(
  _hid uuid,
  _account_id uuid,
  _symbol text,
  _quantity numeric,
  _price numeric,
  _occurred_at date,
  _note text,
  _adjust_cash boolean,
  _changed_by public.person,
  _changed_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pos public.ib_positions%ROWTYPE;
  _cash numeric;
  _new_qty numeric;
  _full_sell boolean;
  _realized numeric;
  _proceeds numeric;
  _new_cash numeric;
BEGIN
  SELECT cash_usd INTO _cash FROM public.ib_holdings
   WHERE household_id = _hid AND investment_account_id = _account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
    VALUES (_hid, _account_id, 0)
    ON CONFLICT (household_id, investment_account_id) DO NOTHING;
    SELECT cash_usd INTO _cash FROM public.ib_holdings
     WHERE household_id = _hid AND investment_account_id = _account_id
     FOR UPDATE;
  END IF;

  SELECT * INTO _pos FROM public.ib_positions
   WHERE household_id = _hid AND investment_account_id = _account_id AND symbol = _symbol
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'position_not_found';
  END IF;
  IF _quantity > _pos.quantity THEN
    RAISE EXCEPTION 'insufficient_shares';
  END IF;

  _new_qty := _pos.quantity - _quantity;
  _full_sell := _new_qty <= 0.000001;
  _realized := (_price - _pos.avg_price) * _quantity;

  -- Ledger first: if this fails, the position is untouched. A full sell
  -- records position_id NULL because the position row is about to be deleted.
  INSERT INTO public.ib_position_transactions
    (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
  VALUES (_hid, _account_id, CASE WHEN _full_sell THEN NULL ELSE _pos.id END, _symbol, 'sell', _quantity, _price, _pos.avg_price, _occurred_at, _note);

  IF _full_sell THEN
    DELETE FROM public.ib_positions WHERE id = _pos.id;
    _new_qty := 0;
  ELSE
    UPDATE public.ib_positions
       SET quantity = _new_qty, updated_at = now()
     WHERE id = _pos.id;
  END IF;

  _new_cash := _cash;
  IF _adjust_cash THEN
    _proceeds := _quantity * _price;
    _new_cash := _cash + _proceeds;
    UPDATE public.ib_holdings
       SET cash_usd = _new_cash, updated_at = now()
     WHERE household_id = _hid AND investment_account_id = _account_id;
    INSERT INTO public.account_balance_history
      (household_id, investment_account_id, kind, changed_by, changed_by_user_id, old_amount, new_amount, currency, note)
    VALUES (_hid, _account_id, 'מכירת ' || _symbol, _changed_by, _changed_by_user_id, _cash, _new_cash, 'USD', _note);
  END IF;

  RETURN jsonb_build_object('realized_pnl', _realized, 'quantity', _new_qty, 'cash_usd', _new_cash);
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal: set a position to exactly (quantity, avg_price), recording an
-- 'adjust' ledger entry with the previous average. Used only by portfolio
-- sync (the broker's cost basis is authoritative). Quantity 0 deletes the
-- position. Returns {position_id, quantity, avg_price}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ib_apply_adjust(
  _hid uuid,
  _account_id uuid,
  _symbol text,
  _quantity numeric,
  _avg_price numeric,
  _occurred_at date,
  _note text,
  _changed_by public.person,
  _changed_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pos public.ib_positions%ROWTYPE;
  _exists boolean := false;
  _old_avg numeric := 0;
BEGIN
  SELECT * INTO _pos FROM public.ib_positions
   WHERE household_id = _hid AND investment_account_id = _account_id AND symbol = _symbol
   FOR UPDATE;
  _exists := FOUND;
  IF _exists THEN
    _old_avg := _pos.avg_price;
  END IF;

  IF _quantity <= 0 THEN
    IF _exists THEN
      INSERT INTO public.ib_position_transactions
        (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
      VALUES (_hid, _account_id, NULL, _symbol, 'adjust', _pos.quantity, _avg_price, _old_avg, _occurred_at, _note);
      DELETE FROM public.ib_positions WHERE id = _pos.id;
    END IF;
    RETURN jsonb_build_object('position_id', NULL, 'quantity', 0, 'avg_price', _avg_price);
  END IF;

  IF _exists THEN
    INSERT INTO public.ib_position_transactions
      (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
    VALUES (_hid, _account_id, _pos.id, _symbol, 'adjust', _quantity, _avg_price, _old_avg, _occurred_at, _note);
    UPDATE public.ib_positions
       SET quantity = _quantity, avg_price = _avg_price, updated_at = now()
     WHERE id = _pos.id;
  ELSE
    INSERT INTO public.ib_positions (household_id, investment_account_id, symbol, quantity, avg_price)
    VALUES (_hid, _account_id, _symbol, _quantity, _avg_price)
    RETURNING * INTO _pos;
    INSERT INTO public.ib_position_transactions
      (household_id, investment_account_id, position_id, symbol, kind, quantity, price, prior_avg_price, occurred_at, note)
    VALUES (_hid, _account_id, _pos.id, _symbol, 'adjust', _quantity, _avg_price, _old_avg, _occurred_at, _note);
  END IF;

  RETURN jsonb_build_object('position_id', _pos.id, 'quantity', _quantity, 'avg_price', _avg_price);
END;
$$;

-- Internal helpers are NOT callable from the API (only the public RPCs below
-- call them, running as the function owner).
REVOKE ALL ON FUNCTION public.ib_apply_buy(uuid, uuid, text, numeric, numeric, date, text, boolean, public.person, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ib_apply_sell(uuid, uuid, text, numeric, numeric, date, text, boolean, public.person, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ib_apply_adjust(uuid, uuid, text, numeric, numeric, date, text, public.person, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Public: buy shares (atomic: ledger + position + cash + history log).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buy_ib_shares(
  _account_id uuid,
  _symbol text,
  _quantity numeric,
  _price numeric,
  _occurred_at date,
  _note text DEFAULT NULL,
  _adjust_cash boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _sym text;
  _profile public.profiles%ROWTYPE;
BEGIN
  _hid := public.current_household_id();
  IF _hid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _sym := upper(trim(coalesce(_symbol, '')));
  IF _sym = '' THEN RAISE EXCEPTION 'invalid_symbol'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF _occurred_at IS NULL THEN _occurred_at := current_date; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investment_accounts a
    WHERE a.id = _account_id AND a.household_id = _hid AND a.kind = 'interactive'
  ) THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = auth.uid();
  RETURN public.ib_apply_buy(_hid, _account_id, _sym, _quantity, _price, _occurred_at, _note, coalesce(_adjust_cash, true), _profile.person, _profile.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Public: sell shares (atomic). Returns {realized_pnl, quantity, cash_usd}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_ib_shares(
  _account_id uuid,
  _symbol text,
  _quantity numeric,
  _price numeric,
  _occurred_at date,
  _note text DEFAULT NULL,
  _adjust_cash boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _sym text;
  _profile public.profiles%ROWTYPE;
BEGIN
  _hid := public.current_household_id();
  IF _hid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _sym := upper(trim(coalesce(_symbol, '')));
  IF _sym = '' THEN RAISE EXCEPTION 'invalid_symbol'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF _occurred_at IS NULL THEN _occurred_at := current_date; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investment_accounts a
    WHERE a.id = _account_id AND a.household_id = _hid AND a.kind = 'interactive'
  ) THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = auth.uid();
  RETURN public.ib_apply_sell(_hid, _account_id, _sym, _quantity, _price, _occurred_at, _note, coalesce(_adjust_cash, true), _profile.person, _profile.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Public: set the cash balance of a portfolio (atomic + history log).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ib_cash(
  _account_id uuid,
  _cash_usd numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _profile public.profiles%ROWTYPE;
  _old_cash numeric;
BEGIN
  _hid := public.current_household_id();
  IF _hid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _cash_usd IS NULL OR _cash_usd < 0 THEN RAISE EXCEPTION 'invalid_cash'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investment_accounts a
    WHERE a.id = _account_id AND a.household_id = _hid AND a.kind = 'interactive'
  ) THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = auth.uid();

  SELECT cash_usd INTO _old_cash FROM public.ib_holdings
   WHERE household_id = _hid AND investment_account_id = _account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
    VALUES (_hid, _account_id, _cash_usd)
    ON CONFLICT (household_id, investment_account_id)
    DO UPDATE SET cash_usd = EXCLUDED.cash_usd, updated_at = now()
    RETURNING cash_usd INTO _old_cash;
    -- First row: old cash was 0 (the RETURNING value is the new one).
    _old_cash := 0;
  ELSE
    UPDATE public.ib_holdings
       SET cash_usd = _cash_usd, updated_at = now()
     WHERE household_id = _hid AND investment_account_id = _account_id;
  END IF;

  INSERT INTO public.account_balance_history
    (household_id, investment_account_id, kind, changed_by, changed_by_user_id, old_amount, new_amount, currency)
  VALUES (_hid, _account_id, 'מזומן', _profile.person, _profile.id, _old_cash, _cash_usd, 'USD');

  RETURN jsonb_build_object('cash_usd', _cash_usd);
END;
$$;

-- ---------------------------------------------------------------------------
-- Public: apply a whole AI-recognized portfolio in ONE transaction.
-- _ops is a JSON array of {symbol, action: 'buy'|'sell'|'adjust', quantity, price}
-- computed by the client (see ib-sync-rules.planSyncOps). Cash is set
-- explicitly at the end (the ops never touch cash). Symbols absent from _ops
-- are left untouched — a cropped screenshot must never delete positions.
-- Returns {ops_applied, cash_usd}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_ib_sync(
  _account_id uuid,
  _cash_usd numeric,
  _ops jsonb,
  _occurred_at date,
  _note text DEFAULT 'סנכרון מ-IBKR'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _profile public.profiles%ROWTYPE;
  _op jsonb;
  _applied int := 0;
  _sym text;
  _action text;
  _qty numeric;
  _price numeric;
  _old_cash numeric;
BEGIN
  _hid := public.current_household_id();
  IF _hid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _cash_usd IS NULL OR _cash_usd < 0 THEN RAISE EXCEPTION 'invalid_cash'; END IF;
  IF _occurred_at IS NULL THEN _occurred_at := current_date; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investment_accounts a
    WHERE a.id = _account_id AND a.household_id = _hid AND a.kind = 'interactive'
  ) THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = auth.uid();

  FOR _op IN SELECT * FROM jsonb_array_elements(coalesce(_ops, '[]'::jsonb)) LOOP
    _sym := upper(trim(coalesce(_op->>'symbol', '')));
    _action := _op->>'action';
    _qty := (_op->>'quantity')::numeric;
    _price := (_op->>'price')::numeric;
    IF _sym = '' OR _qty IS NULL OR _qty < 0 OR _price IS NULL OR _price < 0 THEN
      RAISE EXCEPTION 'invalid_sync_op';
    END IF;
    IF _action = 'buy' THEN
      PERFORM public.ib_apply_buy(_hid, _account_id, _sym, _qty, _price, _occurred_at, _note, false, _profile.person, _profile.id);
    ELSIF _action = 'sell' THEN
      PERFORM public.ib_apply_sell(_hid, _account_id, _sym, _qty, _price, _occurred_at, _note, false, _profile.person, _profile.id);
    ELSIF _action = 'adjust' THEN
      PERFORM public.ib_apply_adjust(_hid, _account_id, _sym, _qty, _price, _occurred_at, _note, _profile.person, _profile.id);
    ELSE
      RAISE EXCEPTION 'invalid_sync_action';
    END IF;
    _applied := _applied + 1;
  END LOOP;

  SELECT cash_usd INTO _old_cash FROM public.ib_holdings
   WHERE household_id = _hid AND investment_account_id = _account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ib_holdings (household_id, investment_account_id, cash_usd)
    VALUES (_hid, _account_id, _cash_usd)
    ON CONFLICT (household_id, investment_account_id)
    DO UPDATE SET cash_usd = EXCLUDED.cash_usd, updated_at = now();
    _old_cash := 0;
  ELSE
    UPDATE public.ib_holdings
       SET cash_usd = _cash_usd, updated_at = now()
     WHERE household_id = _hid AND investment_account_id = _account_id;
  END IF;
  INSERT INTO public.account_balance_history
    (household_id, investment_account_id, kind, changed_by, changed_by_user_id, old_amount, new_amount, currency, note)
  VALUES (_hid, _account_id, 'סנכרון מ-IBKR', _profile.person, _profile.id, _old_cash, _cash_usd, 'USD', _note);

  RETURN jsonb_build_object('ops_applied', _applied, 'cash_usd', _cash_usd);
END;
$$;

-- Public RPCs: signed-in only, never anonymous.
REVOKE EXECUTE ON FUNCTION public.buy_ib_shares(uuid, text, numeric, numeric, date, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sell_ib_shares(uuid, text, numeric, numeric, date, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_ib_cash(uuid, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_ib_sync(uuid, numeric, jsonb, date, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_ib_shares(uuid, text, numeric, numeric, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_ib_shares(uuid, text, numeric, numeric, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ib_cash(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ib_sync(uuid, numeric, jsonb, date, text) TO authenticated;
