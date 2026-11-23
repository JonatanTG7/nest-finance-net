-- Free-text notes on an investment account (used by private accounts:
-- pension, study fund, provident...): the owner's own words about the
-- account — fund number, things to remember, contact details, anything
-- that doesn't deserve a structured field. Optional, plain text.
-- Notes are never privacy-masked (they are words, not amounts) and are
-- not history-logged.
ALTER TABLE public.investment_accounts ADD COLUMN notes text;
