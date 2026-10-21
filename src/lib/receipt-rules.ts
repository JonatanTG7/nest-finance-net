export type ReceiptFields = {
  amount: number | null;
  merchant: string | null;
  area: string | null;
  date: string | null;
  category: string | null;
  paymentMethod: "cash" | "credit" | null;
  cardLastFour: string | null;
  cardBrand: string | null;
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function parseReceiptFields(value: Record<string, unknown>, categories: string[]): ReceiptFields {
  const amount = Number(value.amount);
  const date = text(value.date);
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  return {
    amount: value.amount != null && Number.isFinite(amount) && amount > 0 ? amount : null,
    merchant: text(value.merchant),
    area: text(value.area),
    date: validDate ? date : null,
    category: typeof value.category === "string" && categories.includes(value.category) ? value.category : null,
    paymentMethod: value.paymentMethod === "cash" || value.paymentMethod === "credit" ? value.paymentMethod : null,
    cardLastFour: typeof value.cardLastFour === "string" && /^\d{4}$/.test(value.cardLastFour) ? value.cardLastFour : null,
    cardBrand: text(value.cardBrand),
  };
}

export function receiptTitle(merchant: string | null, area: string | null): string | null {
  if (!merchant) return null;
  return area && !merchant.includes(area) ? `${merchant} · ${area}` : merchant;
}

export function matchReceiptCard<T extends { id: string; last_four: string | null }>(lastFour: string | null, cards: T[]): T | null {
  if (!lastFour || !/^\d{4}$/.test(lastFour)) return null;
  const matches = cards.filter((card) => card.last_four === lastFour);
  return matches.length === 1 ? matches[0] : null;
}