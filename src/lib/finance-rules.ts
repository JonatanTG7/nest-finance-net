export function amountInRange(amountIls: number, min: string, max: string): boolean {
  return (min === "" || amountIls >= Number(min)) && (max === "" || amountIls <= Number(max));
}

export function convertedSubscriptionTotals(
  rows: { amount: number; currency: string; charged: boolean }[],
  rates: Record<string, number>,
) {
  let total = 0;
  let charged = 0;
  for (const row of rows) {
    const rate = row.currency === "ILS" ? 1 : rates[row.currency];
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("שער המרה חסר");
    const value = Math.round(row.amount * rate * 100) / 100;
    total += value;
    if (row.charged) charged += value;
  }
  total = Math.round(total * 100) / 100;
  charged = Math.round(charged * 100) / 100;
  return { total, charged, pending: Math.round((total - charged) * 100) / 100 };
}

export function budgetProgress(spent: number, limit: number) {
  const ratio = limit > 0 ? spent / limit : 0;
  return { percent: Math.round(ratio * 100), state: ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok", remaining: limit - spent };
}

export function categorySpent(
  transactions: { category_id: string | null; type: string; amount_ils: number; occurred_at: string }[],
  categoryId: string,
  today: string,
) {
  return transactions.reduce((sum, t) => sum + (
    t.category_id === categoryId && (t.type === "expense" || t.type === "fixed") && t.occurred_at <= today
      ? Number(t.amount_ils) : 0
  ), 0);
}