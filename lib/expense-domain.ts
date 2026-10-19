import type { Expense, ExpenseCategory, TravelObject } from "../types/travel.ts";

/** An itinerary item cost counted as spend because no expense is logged for it. Read-only; edit the item instead. */
export type BookedExpense = Expense & { fromItem: true };

/** The itinerary type whose colour represents each expense category; shopping and other have none. */
export const CATEGORY_ITEM_TYPE: Record<ExpenseCategory, string> = {
  accommodation: "hotel",
  transport: "flight",
  food: "food",
  activities: "activity",
  shopping: "unclassified",
  other: "unclassified",
};

const ITEM_TYPE_CATEGORIES: Record<string, ExpenseCategory> = {
  hotel: "accommodation",
  flight: "transport",
  commute: "transport",
  food: "food",
  activity: "activities",
  sightseeing: "activities",
};

/** Expense category for an itinerary item type; custom types fall under "other". */
export function itemExpenseCategory(type: string): ExpenseCategory {
  return ITEM_TYPE_CATEGORIES[type] ?? "other";
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "accommodation",
  "transport",
  "food",
  "activities",
  "shopping",
  "other",
];

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
    currencies: [...currencies]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({ currency, amount: thousandthsToDecimal(amount) })),
    categories: [...categories]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, amount]) => {
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
  return [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
}

export function formatExpenseAmount(amount: string | number, currency: string) {
  const format = (currencyDisplay: "narrowSymbol" | "symbol") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay, maximumFractionDigits: 3 }).format(
      Number(amount),
    );
  try {
    const narrow = format("narrowSymbol");
    // A bare "$" would read as USD for SGD, AUD and similar, so those keep the unambiguous symbol or code.
    return narrow.includes("$") && currency.toUpperCase() !== "USD" ? format("symbol") : narrow;
  } catch {
    return `${amount} ${currency}`;
  }
}

const DAY_MS = 86_400_000;
const MAX_DASHBOARD_DAYS = 366;

function dayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * One currency's expenses as a single dashboard. Pre-trip bookings (dated before the trip starts) and
 * on-trip spending share every figure; the phase only splits a total, never separates the data.
 * Planned itinerary costs are not part of this (ADR 0003).
 */
export function expenseDashboard(
  expenses: Expense[],
  trip: { startDate: string; endDate: string },
  currency: string,
  today: string,
) {
  const zero = BigInt(0);
  const start = trip.startDate.slice(0, 10);
  const end = trip.endDate.slice(0, 10);
  const rows = expenses
    .filter((expense) => expense.currency === currency)
    .map((expense) => ({
      expense,
      value: decimalToThousandths(expense.amount),
      pre: "fromItem" in expense || expense.date < start,
    }));

  let pre = zero;
  let during = zero;
  const categories = new Map<ExpenseCategory, { pre: bigint; during: bigint }>(
    EXPENSE_CATEGORIES.map((category) => [category, { pre: zero, during: zero }]),
  );
  const byDate = new Map<string, bigint>();
  for (const { expense, value, pre: isPre } of rows) {
    const bucket = categories.get(expense.category);
    if (isPre) {
      pre += value;
      if (bucket) bucket.pre += value;
    } else {
      during += value;
      if (bucket) bucket.during += value;
      byDate.set(expense.date, (byDate.get(expense.date) ?? zero) + value);
    }
  }

  const lastDate = rows.reduce(
    (last, { expense, pre: isPre }) => (!isPre && expense.date > last ? expense.date : last),
    end,
  );
  const dayCount = Math.min(Math.max(dayNumber(lastDate) - dayNumber(start) + 1, 1), MAX_DASHBOARD_DAYS);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date((dayNumber(start) + index) * DAY_MS).toISOString().slice(0, 10);
    return { date, amount: thousandthsToDecimal(byDate.get(date) ?? zero) };
  });

  const elapsed = today < start ? 0 : Math.min(dayNumber(today), dayNumber(end)) - dayNumber(start) + 1;
  const perDay = elapsed > 0 && during > zero ? thousandthsToDecimal(during / BigInt(elapsed)) : null;

  return {
    currency,
    count: rows.length,
    total: thousandthsToDecimal(pre + during),
    pre: thousandthsToDecimal(pre),
    during: thousandthsToDecimal(during),
    perDay,
    categories: EXPENSE_CATEGORIES.map((category) => {
      const { pre: p, during: d } = categories.get(category)!;
      return {
        category,
        total: thousandthsToDecimal(p + d),
        pre: thousandthsToDecimal(p),
        during: thousandthsToDecimal(d),
        value: p + d,
      };
    })
      .filter(({ value }) => value > zero)
      .sort((left, right) => (left.value === right.value ? 0 : left.value > right.value ? -1 : 1)),
    days,
    largest: rows
      .slice()
      .sort((left, right) => (left.value === right.value ? 0 : left.value > right.value ? -1 : 1))
      .slice(0, 5)
      .map(({ expense, pre: isPre }) => ({ expense, pre: isPre })),
  };
}

/**
 * Every itinerary item cost as spend. An item with any logged expense linked to it is skipped, so the
 * logged amounts win and nothing is counted twice.
 */
export function bookedItemExpenses(
  items: Pick<
    TravelObject,
    "id" | "tripId" | "title" | "type" | "date" | "cost" | "kind" | "createdAt" | "updatedAt"
  >[],
  expenses: Pick<Expense, "travelObjectId">[],
  tripStart: string,
): BookedExpense[] {
  const covered = new Set(expenses.map((expense) => expense.travelObjectId).filter(Boolean));
  return items.flatMap((item) => {
    const category = itemExpenseCategory(item.type);
    const cost = item.cost;
    if (item.kind !== "event" || covered.has(item.id) || !cost) return [];
    if (!Number.isFinite(cost.amount) || cost.amount <= 0 || !/^[A-Za-z]{3}$/.test(cost.currency)) return [];
    const amount = thousandthsToDecimal(BigInt(Math.round(cost.amount * 1000)));
    return [
      {
        id: `item:${item.id}`,
        tripId: item.tripId,
        travelObjectId: item.id,
        description: item.title,
        date: item.date?.slice(0, 10) ?? tripStart.slice(0, 10),
        amount,
        currency: cost.currency.toUpperCase(),
        category,
        notes: null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        fromItem: true as const,
      },
    ];
  });
}

const RATE_SCALE = BigInt(100_000_000);

/** Parses a positive decimal rate with up to eight fractional digits, scaled by 1e8; null when invalid. */
export function parseRate(rate: string): bigint | null {
  const match = /^(0|[1-9][0-9]{0,5})(?:\.([0-9]{1,8}))?$/.exec(rate.trim());
  if (!match) return null;
  const scaled = BigInt(match[1]) * RATE_SCALE + BigInt((match[2] ?? "").padEnd(8, "0"));
  return scaled > BigInt(0) ? scaled : null;
}

/**
 * Restates every expense in `target` using the trip's manual rates. Currencies without a valid rate are
 * left out and returned in `missing`, so the combined total never guesses.
 */
export function convertExpenses<T extends Expense>(
  expenses: T[],
  target: string,
  rates: Record<string, string> | null | undefined,
) {
  const missing = new Set<string>();
  const converted: Expense[] = [];
  for (const expense of expenses) {
    if (expense.currency === target) {
      converted.push(expense);
      continue;
    }
    const rate = rates?.[expense.currency] ? parseRate(rates[expense.currency]) : null;
    if (!rate) {
      missing.add(expense.currency);
      continue;
    }
    const value = (decimalToThousandths(expense.amount) * rate + RATE_SCALE / BigInt(2)) / RATE_SCALE;
    converted.push({ ...expense, currency: target, amount: thousandthsToDecimal(value) });
  }
  return { converted, missing: [...missing].sort() };
}
