CREATE OR REPLACE FUNCTION public.generate_invite_code(_household_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _uid uuid := auth.uid();
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _i int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND household_id = _household_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  LOOP
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code);
  END LOOP;

  INSERT INTO public.household_invites(household_id, code, created_by, max_uses)
  VALUES (_household_id, _code, _uid, 1);

  RETURN _code;
END;
$$;