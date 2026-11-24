-- Scope email digest preferences to the member's own row (Supabase security
-- findings: "Anyone can expose digest recipients' email addresses" and
-- "Any signed-in user can redirect finance digests").
--
-- The original policies (PR #15) were household-wide, so any household
-- member could read or change another member's digest email address —
-- exposing addresses and redirecting digests to an arbitrary inbox.
-- Each member now manages only their own row (profile_id = auth.uid());
-- the client only ever touches its own row, and the sender
-- (/api/send-digests) uses the service-role key and bypasses RLS.
-- Applied live 2026-11-24; this file keeps the repo as source of truth.
DROP POLICY IF EXISTS "email_digest_preferences_select" ON public.email_digest_preferences;
DROP POLICY IF EXISTS "email_digest_preferences_insert" ON public.email_digest_preferences;
DROP POLICY IF EXISTS "email_digest_preferences_update" ON public.email_digest_preferences;
DROP POLICY IF EXISTS "email_digest_preferences_delete" ON public.email_digest_preferences;
CREATE POLICY "email_digest_preferences_select" ON public.email_digest_preferences
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY "email_digest_preferences_insert" ON public.email_digest_preferences
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid() AND household_id = public.current_household_id());
CREATE POLICY "email_digest_preferences_update" ON public.email_digest_preferences
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid() AND household_id = public.current_household_id());
CREATE POLICY "email_digest_preferences_delete" ON public.email_digest_preferences
  FOR DELETE TO authenticated USING (profile_id = auth.uid());
