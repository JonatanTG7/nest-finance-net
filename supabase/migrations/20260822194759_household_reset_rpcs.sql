
-- Lets a user reset their household affiliation from Settings, so they can
-- start fresh (create or join a different household) without needing an
-- admin to delete their auth account. Two paths:
--   * leave_household(): unlink myself only (safe when other members exist)
--   * delete_my_household(): permanently delete the whole household + all
--     its data, only allowed when I'm the sole member (prevents wiping a
--     spouse's data by mistake)

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
     SET household_id = NULL,
         person = NULL,
         updated_at = now()
   WHERE id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_household() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_household()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hid uuid;
  _member_count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT household_id INTO _hid FROM public.profiles WHERE id = _uid;
  IF _hid IS NULL THEN
    RAISE EXCEPTION 'no_household';
  END IF;

  SELECT count(*) INTO _member_count FROM public.profiles WHERE household_id = _hid;
  IF _member_count > 1 THEN
    RAISE EXCEPTION 'not_sole_member';
  END IF;

  -- Cascades to transactions, categories, tags, investment_accounts,
  -- household_invites, ib_holdings, ib_positions, ib_position_transactions.
  -- profiles.household_id resets to NULL via ON DELETE SET NULL.
  DELETE FROM public.households WHERE id = _hid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_household() TO authenticated;
