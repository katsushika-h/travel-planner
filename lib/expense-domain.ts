import type { Expense, ExpenseCategory } from "../types/travel.ts";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["accommodation", "transport", "food", "activities", "shopping", "other"];

export function decimalToThousandths(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

export function thousandthsToDecimal(amount: bigint): string {
  return `${amount / BigInt(1000)}.${String(amount % BigInt(1000)).padStart(3, "0")}`;
}

export function expenseTotals(expenses: Expense[]) {
  const currencies = new Map<string, bigint>();
  const categories = new Map<string, bigint>();
  for (const expense of expenses) {
    const value = decimalToThousandths(expense.amount);
    currencies.set(expense.currency, (currencies.get(expense.currency) ?? BigInt(0)) + value);
    const categoryKey = `${expense.currency}:${expense.category}`;
    categories.set(categoryKey, (categories.get(categoryKey) ?? BigInt(0)) + value);
  }
  return {
    currencies: [...currencies].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount: thousandthsToDecimal(amount) })),
    categories: [...categories].sort(([left], [right]) => left.localeCompare(right)).map(([key, amount]) => {
      const [currency, category] = key.split(":") as [string, ExpenseCategory];
      return { currency, category, amount: thousandthsToDecimal(amount) };
    }),
  };
}

export function plannedCostTotals(items: { cost?: { amount: number; currency: string } | null }[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.cost || !Number.isFinite(item.cost.amount)) continue;
    totals.set(item.cost.currency, (totals.get(item.cost.currency) ?? 0) + item.cost.amount);
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
}

export function formatExpenseAmount(amount: string | number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 3 }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}
