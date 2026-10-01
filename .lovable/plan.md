# Subscriptions Hub — מרכז מנויים והוראות קבע

## Goal
A compact page (`/subscriptions`) listing every recurring commitment (rent, internet, insurance, Netflix...). Each subscription is a rule, not a pre-created transaction. A real transaction appears only on its billing day (e.g. Netflix on the 25th shows up on the 25th, not before).

## What the user gets
- Tapping the "קבועות" stat on the home page opens the Subscriptions page. Bottom nav unchanged; clear back button to home.
- Summary at top: total per month, already charged this month, still pending.
- Chronological list by billing day: emoji, name, amount, payer, payment method/card, status chip ("ירד" / "בעוד X ימים").
- Add/Edit dialog: name, emoji/category, amount + currency, billing day (1-31), paid by, payment method + card, start date, optional end date, active toggle.
- Price change applies from now on only; past transactions untouched.
- Pausing/ending a subscription stops future charges.
- Home forecast: "עד היום" counts only charges whose day passed; "תחזית לסוף החודש" includes all active subscriptions.

## Technical details
- New table `subscriptions` (household_id, name, emoji, category_id, amount, currency, billing_day, entered_by, payment_method, credit_card_id, start_date, end_date, active, last_generated_on) with grants, RLS by `current_household_id()`, updated_at trigger.
- Add `transactions.subscription_id` (nullable, ON DELETE SET NULL) + unique (subscription_id, occurred_at) to prevent duplicates.
- Lazy generation: on app load, for each active subscription create missing transactions for billing dates between start (or last_generated_on) and today only — never future dates. Runs client-side with upsert-on-conflict-ignore so both phones stay in sync.
- Existing future-dated recurring transactions (old mechanism): offer one-time conversion — delete future rows of a recurring series and create a subscription from it. Old "recurring" option in TransactionForm is replaced with a link to the Subscriptions page.
- New files: `src/lib/subscriptions.ts`, `src/routes/subscriptions.tsx`, `src/components/SubscriptionDialog.tsx`. Edit `src/routes/index.tsx` (link + forecast), `TransactionForm.tsx`.
- Also finish pending items: period-mode setting in Settings and actual vs forecast hero.
