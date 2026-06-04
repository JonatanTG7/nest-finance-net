
-- =====================================================
-- 1. CORE TABLES: households, profiles, invites
-- =====================================================

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid REFERENCES public.households(id) ON DELETE SET NULL,
  display_name text,
  avatar_url text,
  person public.person,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE INDEX profiles_household_idx ON public.profiles(household_id);

CREATE TABLE public.household_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  max_uses int NOT NULL DEFAULT 1,
  uses int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_invites TO authenticated;
GRANT ALL ON public.household_invites TO service_role;

CREATE INDEX household_invites_household_idx ON public.household_invites(household_id);

-- =====================================================
-- 2. SECURITY DEFINER HELPERS (avoid RLS recursion)
-- =====================================================

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_household(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hid uuid;
  _uid uuid := auth.uid();
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

  RETURN _hid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite public.household_invites%ROWTYPE;
  _uid uuid := auth.uid();
  _existing_count int;
  _assigned_person public.person;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO _invite FROM public.household_invites
   WHERE upper(code) = upper(trim(_code))
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF _invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF _invite.uses >= _invite.max_uses THEN
    RAISE EXCEPTION 'invite_used_up';
  END IF;

  -- Decide which "person" slot is free in the household.
  SELECT count(*) INTO _existing_count FROM public.profiles WHERE household_id = _invite.household_id;
  IF _existing_count = 0 THEN
    _assigned_person := 'yonatan';
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE household_id = _invite.household_id AND person = 'yonatan') THEN
    _assigned_person := 'shiri';
  ELSE
    _assigned_person := 'yonatan';
  END IF;

  UPDATE public.profiles
     SET household_id = _invite.household_id,
         person = COALESCE(person, _assigned_person),
         updated_at = now()
   WHERE id = _uid;

  UPDATE public.household_invites
     SET uses = uses + 1
   WHERE id = _invite.id;

  RETURN _invite.household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_invite_code(_household_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND household_id = _household_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  LOOP
    _code := upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 6));
    _code := regexp_replace(_code, '[^A-Z0-9]', 'X', 'g');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.household_invites WHERE code = _code);
  END LOOP;

  INSERT INTO public.household_invites(household_id, code, created_by, max_uses)
  VALUES (_household_id, _code, _uid, 1);

  RETURN _code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid) TO authenticated;

-- =====================================================
-- 3. AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at triggers
CREATE TRIGGER households_updated_at BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================
-- 4. ADD household_id TO EXISTING TABLES + BACKFILL
-- =====================================================

ALTER TABLE public.transactions ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.investment_accounts ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;

-- Bootstrap household + invite for the existing data
DO $$
DECLARE
  _hid uuid;
BEGIN
  INSERT INTO public.households (name) VALUES ('בית יונתן ושירי') RETURNING id INTO _hid;

  UPDATE public.transactions SET household_id = _hid WHERE household_id IS NULL;
  UPDATE public.tags SET household_id = _hid WHERE household_id IS NULL;
  UPDATE public.investment_accounts SET household_id = _hid WHERE household_id IS NULL;
  -- Keep system categories shared (household_id = NULL); non-system attach to household
  UPDATE public.categories SET household_id = _hid WHERE household_id IS NULL AND is_system = false;

  INSERT INTO public.household_invites (household_id, code, max_uses, expires_at)
  VALUES (_hid, 'YONSHI', 5, now() + interval '90 days');
END $$;

-- Now enforce NOT NULL on tables that should always have a household
ALTER TABLE public.transactions ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.tags ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.investment_accounts ALTER COLUMN household_id SET NOT NULL;
-- categories: nullable so system seed stays shared

CREATE INDEX transactions_household_idx ON public.transactions(household_id);
CREATE INDEX categories_household_idx ON public.categories(household_id);
CREATE INDEX tags_household_idx ON public.tags(household_id);
CREATE INDEX investment_accounts_household_idx ON public.investment_accounts(household_id);

-- =====================================================
-- 5. REPLACE OPEN RLS WITH HOUSEHOLD-SCOPED RLS
-- =====================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS open_all ON public.transactions;
DROP POLICY IF EXISTS open_all ON public.categories;
DROP POLICY IF EXISTS open_all ON public.tags;
DROP POLICY IF EXISTS open_all ON public.transaction_tags;
DROP POLICY IF EXISTS open_all ON public.investment_accounts;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- households: only members see/edit
CREATE POLICY households_select ON public.households
  FOR SELECT TO authenticated
  USING (id = public.current_household_id());
CREATE POLICY households_update ON public.households
  FOR UPDATE TO authenticated
  USING (id = public.current_household_id())
  WITH CHECK (id = public.current_household_id());

-- profiles: members of my household can see each other; I can update only myself
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR household_id = public.current_household_id());
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- INSERT only via trigger (security definer). No INSERT policy for authenticated.

-- household_invites: only my household
CREATE POLICY invites_select ON public.household_invites
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY invites_insert ON public.household_invites
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY invites_delete ON public.household_invites
  FOR DELETE TO authenticated
  USING (household_id = public.current_household_id());

-- transactions
CREATE POLICY tx_select ON public.transactions
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY tx_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY tx_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY tx_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (household_id = public.current_household_id());

-- categories: system categories (household_id IS NULL) visible to all authenticated; household-specific scoped
CREATE POLICY cat_select ON public.categories
  FOR SELECT TO authenticated
  USING (household_id IS NULL OR household_id = public.current_household_id());
CREATE POLICY cat_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY cat_update ON public.categories
  FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id() AND is_system = false)
  WITH CHECK (household_id = public.current_household_id() AND is_system = false);
CREATE POLICY cat_delete ON public.categories
  FOR DELETE TO authenticated
  USING (household_id = public.current_household_id() AND is_system = false);

-- tags
CREATE POLICY tags_select ON public.tags
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY tags_insert ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY tags_update ON public.tags
  FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY tags_delete ON public.tags
  FOR DELETE TO authenticated
  USING (household_id = public.current_household_id());

-- transaction_tags: scoped via transaction membership
CREATE POLICY txtags_select ON public.transaction_tags
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.household_id = public.current_household_id()));
CREATE POLICY txtags_insert ON public.transaction_tags
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.household_id = public.current_household_id()));
CREATE POLICY txtags_delete ON public.transaction_tags
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.household_id = public.current_household_id()));

-- investment_accounts
CREATE POLICY inv_select ON public.investment_accounts
  FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY inv_insert ON public.investment_accounts
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY inv_update ON public.investment_accounts
  FOR UPDATE TO authenticated
  USING (household_id = public.current_household_id())
  WITH CHECK (household_id = public.current_household_id());
CREATE POLICY inv_delete ON public.investment_accounts
  FOR DELETE TO authenticated
  USING (household_id = public.current_household_id());

-- Strip anon grants from these tables (defence in depth)
REVOKE ALL ON public.transactions FROM anon;
REVOKE ALL ON public.categories FROM anon;
REVOKE ALL ON public.tags FROM anon;
REVOKE ALL ON public.transaction_tags FROM anon;
REVOKE ALL ON public.investment_accounts FROM anon;

-- Storage policies for transaction-photos bucket: authenticated users only
DROP POLICY IF EXISTS "tx_photos_authenticated_all" ON storage.objects;
CREATE POLICY "tx_photos_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'transaction-photos')
  WITH CHECK (bucket_id = 'transaction-photos');
