CREATE TYPE public.payment_method AS ENUM ('cash', 'credit', 'standing_order');

ALTER TABLE public.transactions
  ADD COLUMN payment_method public.payment_method;