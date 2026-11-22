-- Email digest preferences: one row per household member. Each member enters
-- their own email address, opts in/out, and chooses when to receive a
-- summary email: weekly (on a chosen weekday) and/or monthly (on a chosen
-- day of the month). A daily cron calls the app's /api/send-digests route,
-- which builds the digest from the household's own data and sends it via
-- Resend. last_net_worth_ils stores the net worth reported by the previous
-- send, so the next digest can show the change (the app keeps no net-worth
-- history of its own). last_sent_at + last_digest_kind make sending
-- idempotent: a cron retry on the same day never double-sends.

CREATE TABLE public.email_digest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  email text NOT NULL CHECK (email <> ''),
  enabled boolean NOT NULL DEFAULT true,
  weekly_enabled boolean NOT NULL DEFAULT false,
  weekly_weekday int CHECK (weekly_weekday BETWEEN 0 AND 6),
  monthly_enabled boolean NOT NULL DEFAULT false,
  monthly_day int CHECK (monthly_day BETWEEN 1 AND 31),
  last_sent_at timestamptz,
  last_digest_kind text CHECK (last_digest_kind IS NULL OR last_digest_kind IN ('weekly', 'monthly')),
  last_net_worth_ils numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_digest_preferences TO authenticated;
GRANT ALL ON public.email_digest_preferences TO service_role;

ALTER TABLE public.email_digest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_digest_preferences_select ON public.email_digest_preferences FOR SELECT TO authenticated USING (household_id = public.current_household_id());
CREATE POLICY email_digest_preferences_insert ON public.email_digest_preferences FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household_id());
CREATE POLICY email_digest_preferences_update ON public.email_digest_preferences FOR UPDATE TO authenticated USING (household_id = public.current_household_id()) WITH CHECK (household_id = public.current_household_id());
CREATE POLICY email_digest_preferences_delete ON public.email_digest_preferences FOR DELETE TO authenticated USING (household_id = public.current_household_id());

CREATE INDEX email_digest_preferences_household_idx ON public.email_digest_preferences (household_id);

CREATE TRIGGER email_digest_preferences_touch_updated_at BEFORE UPDATE ON public.email_digest_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
