# Architecture rules
- Keep receipt extraction normalization and unique last-four card matching in tested pure rules; never infer payer from card selection because cards have no ownership field, and keep scan images in memory only.
- Keep subscription billing dates and finite occurrence limits in shared pure schedule rules used by both generation and monthly status; this prevents charges and summaries from disagreeing.
- Keep shared monthly category caps in a household-scoped table, and calculate calendar-month spending from actual expense/fixed transactions; this keeps both partners' budgets consistent without forecasts.
- Centralize currency-summary, installment splitting, amount-filter and budget arithmetic in pure finance rules with tests; save subscription amounts per charge, not as purchase totals, so generation and summaries retain the same monetary rules.
- Create accounts through the existing investment_accounts model and convert their initial balance before insertion; this preserves existing account screens and totals.
- Store private media by household-prefixed object path and sign it only for display; this enforces household isolation without durable bearer links.