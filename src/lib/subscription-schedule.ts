import { isoLocal } from "./dates";

export type SubscriptionSchedule = {
  billing_day: number;
  start_date: string;
  end_date: string | null;
  payment_count?: number | null;
  active: boolean;
};

export function billingDateIn(sub: Pick<SubscriptionSchedule, "billing_day">, year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return isoLocal(new Date(year, month, Math.min(sub.billing_day, lastDay)));
}

export function paymentNumber(sub: SubscriptionSchedule, date: string) {
  const [year, month] = sub.start_date.split("-").map(Number);
  const [targetYear, targetMonth] = date.split("-").map(Number);
  const skippedFirst = billingDateIn(sub, year, month - 1) < sub.start_date ? 1 : 0;
  return (targetYear - year) * 12 + targetMonth - month + 1 - skippedFirst;
}

export function isScheduledBilling(sub: SubscriptionSchedule, date: string) {
  const number = paymentNumber(sub, date);
  return date >= sub.start_date && (!sub.end_date || date <= sub.end_date)
    && number > 0 && (sub.payment_count == null || number <= sub.payment_count);
}

export function dueDates(sub: SubscriptionSchedule, until: string): string[] {
  if (!sub.active) return [];
  const dates: string[] = [];
  const [year, month] = sub.start_date.split("-").map(Number);
  const [stopYear, stopMonth] = until.split("-").map(Number);
  const months = (stopYear - year) * 12 + stopMonth - month;
  for (let offset = 0; offset <= months; offset++) {
    const date = billingDateIn(sub, year, month - 1 + offset);
    if (date > until || (sub.end_date && date > sub.end_date)) break;
    if (sub.payment_count != null && paymentNumber(sub, date) > sub.payment_count) break;
    if (isScheduledBilling(sub, date)) dates.push(date);
  }
  return dates;
}

export function monthStatus(sub: SubscriptionSchedule, now = new Date()) {
  const date = billingDateIn(sub, now.getFullYear(), now.getMonth());
  const today = isoLocal(now);
  const daysLeft = Math.round((new Date(date + "T00:00").getTime() - new Date(today + "T00:00").getTime()) / 86400000);
  const number = paymentNumber(sub, date);
  return {
    date, inRange: sub.active && isScheduledBilling(sub, date), charged: date <= today, daysLeft,
    paymentNumber: number,
    completed: sub.payment_count != null && (number > sub.payment_count || (number === sub.payment_count && date <= today)),
  };
}