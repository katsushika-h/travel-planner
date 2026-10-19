"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SpendDashboard } from "@/components/views/expenses/SpendDashboard";
import { api } from "@/lib/api-client";
import {
  decimalToThousandths,
  EXPENSE_CATEGORIES,
  expenseDashboard,
  expenseTotals,
  formatExpenseAmount,
  plannedCostTotals,
} from "@/lib/expense-domain";
import type { CreateExpenseInput, Expense, ExpenseCategory, TravelObject, Trip } from "@/types/travel";

type Draft = Omit<CreateExpenseInput, "notes" | "travelObjectId"> & { notes: string; travelObjectId: string };

function todayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function newDraft(trip: Trip): Draft {
  return {
    description: "",
    date: todayInTimeZone(trip.timezone),
    amount: "",
    currency: trip.defaultCurrency,
    category: "other",
    notes: "",
    travelObjectId: "",
  };
}

const fieldClass =
  "mt-1 block min-h-11 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-2 text-sm text-foreground outline-none placeholder:text-faint focus:border-foreground";
const controlClass =
  "min-h-11 rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-2 text-sm text-foreground outline-none placeholder:text-faint focus:border-foreground sm:min-h-9";

export function ExpensesView({
  trip,
  items,
  startWith,
}: {
  trip: Trip;
  items: TravelObject[];
  /** Opens the new-expense form already linked to this item (used by Today's "Log expense"). */
  startWith?: { itemId: string; description: string };
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(!!startWith);
  const expenseFormRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() =>
    startWith
      ? { ...newDraft(trip), description: startWith.description.slice(0, 100), travelObjectId: startWith.itemId }
      : newDraft(trip),
  );
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest">("newest");
  const [dashCurrency, setDashCurrency] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api
      .expenses(trip.id)
      .then((result) => {
        if (!cancelled) setExpenses(result);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load expenses.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip.id, reloadNonce]);

  useEffect(() => {
    if (!formOpen || !window.matchMedia("(max-width: 639px)").matches) return;
    expenseFormRef.current
      ?.querySelector<HTMLInputElement>("input")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [formOpen]);

  const totals = useMemo(() => expenseTotals(expenses), [expenses]);
  const planned = useMemo(() => plannedCostTotals(items), [items]);
  const itemTitles = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);
  const currencies = useMemo(() => [...new Set(expenses.map((expense) => expense.currency))].sort(), [expenses]);
  const plannedByCurrency = useMemo(
    () => new Map(planned.map(({ currency, amount }) => [currency, amount])),
    [planned],
  );
  const activeCurrency = totals.currencies.some(({ currency }) => currency === dashCurrency)
    ? dashCurrency
    : (totals.currencies[0]?.currency ?? "");
  const dashboard = useMemo(
    () => (activeCurrency ? expenseDashboard(expenses, trip, activeCurrency, todayInTimeZone(trip.timezone)) : null),
    [activeCurrency, expenses, trip],
  );
  const visibleExpenses = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return expenses
      .filter(
        (expense) =>
          (!search ||
            `${expense.description} ${expense.notes ?? ""} ${itemTitles.get(expense.travelObjectId ?? "") ?? ""}`
              .toLocaleLowerCase()
              .includes(search)) &&
          (!categoryFilter || expense.category === categoryFilter) &&
          (!currencyFilter || expense.currency === currencyFilter),
      )
      .sort((left, right) => {
        if (sort === "highest") {
          const amountOrder = decimalToThousandths(right.amount) - decimalToThousandths(left.amount);
          if (amountOrder !== BigInt(0)) return amountOrder > BigInt(0) ? 1 : -1;
        }
        const dateOrder = left.date.localeCompare(right.date);
        return (sort === "oldest" ? dateOrder : -dateOrder) || left.description.localeCompare(right.description);
      });
  }, [categoryFilter, currencyFilter, expenses, itemTitles, query, sort]);

  function startCreate() {
    setEditingId(null);
    setDraft(newDraft(trip));
    setError("");
    setFormOpen(true);
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id);
    setDraft({
      description: expense.description,
      date: expense.date,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      notes: expense.notes ?? "",
      travelObjectId: expense.travelObjectId ?? "",
    });
    setError("");
    setFormOpen(true);
  }

  function retryExpenseLoad() {
    setLoading(true);
    setLoadError("");
    setReloadNonce((nonce) => nonce + 1);
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const input: CreateExpenseInput = {
      ...draft,
      description: draft.description.trim(),
      currency: draft.currency.trim().toUpperCase(),
      amount: draft.amount.trim(),
      notes: draft.notes.trim() || null,
      travelObjectId: draft.travelObjectId || null,
    };
    try {
      if (editingId) {
        const updated = await api.updateExpense(editingId, input);
        setExpenses((current) => current.map((expense) => (expense.id === updated.id ? updated : expense)));
      } else {
        const created = await api.createExpense(trip.id, input);
        setExpenses((current) => [created, ...current]);
      }
      setFormOpen(false);
      setEditingId(null);
      setDraft(newDraft(trip));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save expense.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteExpense(deleteTarget.id);
      setExpenses((current) => current.filter((expense) => expense.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) {
        setEditingId(null);
        setFormOpen(false);
      }
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete expense.");
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  const categoryName = (category: string) => category[0].toUpperCase() + category.slice(1);
  const columns = "lg:grid-cols-[88px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_112px_72px]";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8 pt-4 sm:px-12 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sr-only">Spend</h1>
        <p className="min-w-0 text-[13px] text-muted">Everything spent on {trip.title}, before and during the trip.</p>
        <Button
          type="button"
          size="lg"
          disabled={loading || Boolean(loadError)}
          onClick={startCreate}
          className="min-h-11 shrink-0 rounded-full px-4 sm:min-h-10"
        >
          <Plus size={14} /> Log expense
        </Button>
      </div>
      {error && (
        <div role="alert" className="mt-4 border border-danger px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {loading ? (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="animate-spin text-muted" />
        </div>
      ) : (
        <>
          {loadError ? (
            <div role="alert" className="pb-8 pt-8">
              <p className="text-sm text-danger">{loadError}</p>
              <Button type="button" variant="outline" onClick={retryExpenseLoad} className="mt-3 min-h-11 px-3">
                Retry loading expenses
              </Button>
            </div>
          ) : dashboard ? (
            <SpendDashboard
              dashboard={dashboard}
              currencies={totals.currencies.map(({ currency }) => currency)}
              onCurrency={setDashCurrency}
              planned={plannedByCurrency.get(activeCurrency)}
              itemTitles={itemTitles}
            />
          ) : (
            <p className="pb-8 pt-8 text-sm text-muted">No expenses recorded yet.</p>
          )}
          {!loadError && formOpen && (
            <form
              ref={expenseFormRef}
              onSubmit={(event) => void saveExpense(event)}
              className="mb-8 border-t border-foreground bg-surface p-4 sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium">{editingId ? "Edit expense" : "New expense"}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                  }}
                  className="inline-flex min-h-11 items-center px-3 text-sm text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-medium">
                  Description
                  <input
                    required
                    maxLength={100}
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                    className={fieldClass}
                    placeholder="Museum tickets"
                  />
                </label>
                <label className="text-sm font-medium">
                  Date
                  <input
                    required
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className="text-sm font-medium">
                  Category
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, category: event.target.value as ExpenseCategory }))
                    }
                    className={fieldClass}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category} className="capitalize">
                        {categoryName(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Amount
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,3})?"
                    title="Positive amount with up to three decimal places"
                    value={draft.amount}
                    onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                    className={`${fieldClass} font-mono`}
                    placeholder="24.50"
                  />
                </label>
                <label className="text-sm font-medium">
                  Currency
                  <input
                    required
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    value={draft.currency}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))
                    }
                    className={`${fieldClass} font-mono uppercase`}
                    placeholder="SGD"
                  />
                </label>
                <label className="text-sm font-medium">
                  Itinerary item (optional)
                  <select
                    value={draft.travelObjectId}
                    onChange={(event) => setDraft((current) => ({ ...current, travelObjectId: event.target.value }))}
                    className={fieldClass}
                  >
                    <option value="">No linked item</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">
                  Notes (optional)
                  <textarea
                    maxLength={2500}
                    rows={2}
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    className={fieldClass}
                    placeholder="What was this for?"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <Button disabled={busy} type="submit" className="min-h-11 px-4">
                  {busy ? "Saving…" : editingId ? "Save changes" : "Save expense"}
                </Button>
              </div>
            </form>
          )}
          {!loadError && (
            <div>
              <section aria-label="Expenses" className="min-w-0 flex-1">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-foreground pt-3">
                  <p className="text-xs text-muted">
                    {visibleExpenses.length} of {expenses.length} expenses
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <label className="sr-only" htmlFor="expense-search">
                      Search expenses
                    </label>
                    <input
                      id="expense-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search expenses"
                      className={`${controlClass} w-36`}
                    />
                    <label className="sr-only" htmlFor="expense-category">
                      Filter category
                    </label>
                    <select
                      id="expense-category"
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      className={controlClass}
                    >
                      <option value="">All categories</option>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {categoryName(category)}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="expense-currency">
                      Filter currency
                    </label>
                    <select
                      id="expense-currency"
                      value={currencyFilter}
                      onChange={(event) => setCurrencyFilter(event.target.value)}
                      className={controlClass}
                    >
                      <option value="">All currencies</option>
                      {currencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="expense-sort">
                      Sort expenses
                    </label>
                    <select
                      id="expense-sort"
                      value={sort}
                      onChange={(event) => setSort(event.target.value as typeof sort)}
                      className={controlClass}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="highest">Highest amount</option>
                    </select>
                  </div>
                </div>
                {visibleExpenses.length ? (
                  <>
                    <div aria-hidden="true" className={`hidden gap-x-3 py-3 text-xs text-muted lg:grid ${columns}`}>
                      <span>Date</span>
                      <span>Description</span>
                      <span>Category</span>
                      <span>Itinerary item</span>
                      <span className="text-right">Amount</span>
                      <span />
                    </div>
                    <ul>
                      {visibleExpenses.map((expense) => {
                        const linked = expense.travelObjectId
                          ? (itemTitles.get(expense.travelObjectId) ?? "Linked item unavailable")
                          : null;
                        return (
                          <li
                            key={expense.id}
                            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-divider py-2.5 text-sm hover:bg-surface max-lg:first:border-t-0 ${columns}`}
                          >
                            <span
                              title={expense.date}
                              className="font-mono text-[13px] whitespace-nowrap text-muted max-lg:order-2 max-lg:col-span-2 lg:text-foreground"
                            >
                              {new Intl.DateTimeFormat("en-US", {
                                timeZone: "UTC",
                                month: "short",
                                day: "2-digit",
                              }).format(new Date(`${expense.date}T12:00:00Z`))}
                            </span>
                            <span className="min-w-0 font-medium max-lg:order-1">
                              {expense.description}
                              {expense.notes && (
                                <span className="mt-0.5 block text-xs font-normal text-muted">{expense.notes}</span>
                              )}
                              {expense.date < trip.startDate.slice(0, 10) && (
                                <span className="mt-0.5 block text-xs font-normal text-muted">Booked before trip</span>
                              )}
                            </span>
                            <span className="text-muted max-lg:hidden">{categoryName(expense.category)}</span>
                            <span className="min-w-0 text-muted max-lg:order-3 max-lg:col-span-2 max-lg:text-xs">
                              <span className="lg:hidden">{categoryName(expense.category)}</span>
                              {linked && <span className="lg:hidden"> · </span>}
                              {linked ?? <span className="max-lg:hidden">—</span>}
                            </span>
                            <span className="text-right font-mono text-[13px] whitespace-nowrap max-lg:order-1">
                              {formatExpenseAmount(expense.amount, expense.currency)}
                            </span>
                            <span className="flex justify-end max-lg:order-4 max-lg:col-span-2">
                              <button
                                type="button"
                                onClick={() => startEdit(expense)}
                                aria-label={`Edit ${expense.description}`}
                                className="grid size-11 place-items-center text-muted hover:bg-surface hover:text-foreground lg:size-8"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(expense)}
                                aria-label={`Delete ${expense.description}`}
                                className="grid size-11 place-items-center text-muted hover:bg-surface hover:text-danger lg:size-8"
                              >
                                <Trash2 size={14} />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <div className="py-10 text-center text-sm text-muted">
                    {expenses.length
                      ? "No expenses match these filters."
                      : "No expenses yet. Log one to start tracking spending."}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete expense?"
          description="This expense will be permanently removed."
          items={[deleteTarget.description]}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void deleteExpense();
          }}
        />
      )}
    </section>
  );
}
