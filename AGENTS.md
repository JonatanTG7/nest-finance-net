# Architecture rules
- Keep shared monthly category caps in a household-scoped table, and calculate calendar-month spending from actual expense/fixed transactions; this keeps both partners' budgets consistent without forecasts.
- Centralize currency-summary, amount-filter and budget arithmetic in pure finance rules with tests; this keeps the same monetary rules across screens.
- Create accounts through the existing investment_accounts model and convert their initial balance before insertion; this preserves existing account screens and totals.
- Store private media by household-prefixed object path and sign it only for display; this enforces household isolation without durable bearer links.