-- Lock down SECURITY DEFINER / helper functions from the exposed API

-- Internal trigger helpers: not callable by any API role
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;

-- Helper used inside RLS policies: signed-in only, never anonymous
REVOKE ALL ON FUNCTION public.current_household_id() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;

-- Intentional user RPCs: signed-in only, never anonymous
REVOKE ALL ON FUNCTION public.create_household(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_invite_code(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.generate_invite_code(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;