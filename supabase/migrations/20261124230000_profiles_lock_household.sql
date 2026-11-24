-- Lock household membership on direct profile updates (Supabase security
-- finding, Critical: "Any signed-in user can join another household").
--
-- The original policy (June 2026) let any signed-in user update their own
-- profile row with an arbitrary household_id — its WITH CHECK only verified
-- id = auth.uid(). Since current_household_id() reads household_id from
-- profiles, changing it opened every household-scoped policy of the target
-- household to the attacker.
--
-- The fix freezes household_id on direct updates: the new value must equal
-- the current one (IS NOT DISTINCT FROM keeps NULL == NULL, for new users
-- who have no household yet). Joining, leaving and creating a household
-- still work — they go through the SECURITY DEFINER RPCs (redeem_invite /
-- leave_household / create_household), which bypass RLS. Client-side
-- profile edits (display name, avatar, person) are unaffected.
-- Applied live 2026-11-24; this file keeps the repo as source of truth.
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND household_id IS NOT DISTINCT FROM public.current_household_id());
