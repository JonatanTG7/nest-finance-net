ALTER TABLE public.subscriptions ADD COLUMN payment_count integer;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_count_positive CHECK (payment_count IS NULL OR payment_count > 0);
COMMENT ON COLUMN public.subscriptions.payment_count IS 'Optional total monthly billing occurrences counted from the first billing date on or after start_date; NULL means unlimited.';