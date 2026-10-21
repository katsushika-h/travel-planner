import assert from "node:assert/strict";
import test from "node:test";
import { decimalToThousandths, expenseDashboard, expenseTotals, plannedCostTotals } from "../lib/expense-domain.ts";
import { readExpenseFields } from "../lib/expense-validation.ts";

const base = {
  description: "  Train ticket  ",
  date: "2026-08-31",
  amount: "12.345",
  currency: "SGD",
  category: "transport",
  notes: null,
  travelObjectId: null,
};

test("expense creation validates exact decimal amounts and calendar dates", () => {
  const parsed = readExpenseFields(base, "create");
  assert.equal(parsed.description, "Train ticket");
  assert.equal(parsed.amount, "12.345");
  assert.equal(parsed.date.toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(readExpenseFields({ ...base, amount: "0.1" }, "create").amount, "0.100");
  for (const amount of [0.1, "0", "0.000", "-1", "1.2345", "01.00", "10000000000", "1e2"]) {
    assert.throws(() => readExpenseFields({ ...base, amount }, "create"), /amount must be a positive decimal string/);
  }
  for (const date of ["2026-02-29", "2026-13-01", "2026-9-1", "2026-08-31T00:00:00Z"]) {
    assert.throws(() => readExpenseFields({ ...base, date }, "create"), /date must be a valid YYYY-MM-DD date/);
  }
});

test("expense updates validate only supplied fields and nullable links", () => {
  assert.deepEqual(readExpenseFields({ notes: "", travelObjectId: null }, "update"), {
    notes: null,
    travelObjectId: null,
  });
  assert.deepEqual(readExpenseFields({ amount: "3.5" }, "update"), { amount: "3.500" });
  assert.throws(() => readExpenseFields({}, "update"), /Provide at least one field/);
  assert.throws(() => readExpenseFields({ category: "unknown" }, "update"), /supported expense category/);
  assert.throws(() => readExpenseFields({ currency: "usd" }, "update"), /three-letter currency code/);
});

test("actual expenses sum exactly by currency and category without mixing planned costs", () => {
  const expenses = [
    { amount: "0.100", currency: "SGD", category: "food" },
    { amount: "0.200", currency: "SGD", category: "food" },
    { amount: "1.005", currency: "USD", category: "transport" },
  ];
  assert.equal(decimalToThousandths("1.005"), BigInt(1005));
  assert.deepEqual(expenseTotals(expenses), {
    currencies: [
      { currency: "SGD", amount: "0.300" },
      { currency: "USD", amount: "1.005" },
    ],
    categories: [
      { currency: "SGD", category: "food", amount: "0.300" },
      { currency: "USD", category: "transport", amount: "1.005" },
    ],
  });
  assert.deepEqual(
    plannedCostTotals([
      { cost: { amount: 5, currency: "SGD" } },
      { cost: null },
      { cost: { amount: 2, currency: "USD" } },
    ]),
    [
      { currency: "SGD", amount: 5 },
      { currency: "USD", amount: 2 },
    ],
  );
});

test("expense dashboard keeps pre-trip bookings and on-trip spending in one set of figures", () => {
  const trip = { startDate: "2026-11-10", endDate: "2026-11-12" };
  const make = (amount, date, category, currency = "SGD") => ({
    id: `${date}-${amount}`,
    amount,
    date,
    category,
    currency,
    description: category,
  });
  const dashboard = expenseDashboard(
    [
      make("400.000", "2026-09-01", "accommodation"),
      make("250.500", "2026-09-03", "transport"),
      make("12.000", "2026-11-10", "food"),
      make("8.000", "2026-11-11", "food"),
      make("999.000", "2026-11-11", "food", "JPY"),
    ],
    trip,
    "SGD",
    "2026-11-11",
  );
  assert.equal(dashboard.total, "670.500");
  assert.equal(dashboard.pre, "650.500");
  assert.equal(dashboard.during, "20.000");
  assert.equal(dashboard.count, 4);
  assert.equal(dashboard.perDay, "10.000");
  assert.deepEqual(
    dashboard.categories.map(({ category, total, pre, during }) => [category, total, pre, during]),
    [
      ["accommodation", "400.000", "400.000", "0.000"],
      ["transport", "250.500", "250.500", "0.000"],
      ["food", "20.000", "0.000", "20.000"],
    ],
  );
  assert.deepEqual(
    dashboard.days.map(({ date, amount }) => [date, amount]),
    [
      ["2026-11-10", "12.000"],
      ["2026-11-11", "8.000"],
      ["2026-11-12", "0.000"],
    ],
  );
  assert.equal(dashboard.largest[0].expense.amount, "400.000");
  assert.equal(dashboard.largest[0].pre, true);
  assert.equal(expenseDashboard([], trip, "SGD", "2026-10-01").perDay, null);
});
