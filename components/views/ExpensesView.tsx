"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api-client";
import { decimalToThousandths, EXPENSE_CATEGORIES, expenseTotals, formatExpenseAmount, plannedCostTotals } from "@/lib/expense-domain";
import type { CreateExpenseInput, Expense, ExpenseCategory, TravelObject, Trip } from "@/types/travel";

type Draft = Omit<CreateExpenseInput, "notes" | "travelObjectId"> & { notes: string; travelObjectId: string };

function todayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function newDraft(trip: Trip): Draft {
  return { description: "", date: todayInTimeZone(trip.timezone), amount: "", currency: trip.defaultCurrency, category: "other", notes: "", travelObjectId: "" };
}

const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-600";

export function ExpensesView({ trip, items }: { trip: Trip; items: TravelObject[] }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const expenseFormRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => newDraft(trip));
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest">("newest");

  useEffect(() => {
    let cancelled = false;
    void api.expenses(trip.id).then((result) => {
      if (!cancelled) setExpenses(result);
    }).catch((cause) => {
      if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load expenses.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [trip.id, reloadNonce]);

  useEffect(() => {
    if (!formOpen || !window.matchMedia("(max-width: 639px)").matches) return;
    expenseFormRef.current?.querySelector<HTMLInputElement>("input")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [formOpen]);

  const totals = useMemo(() => expenseTotals(expenses), [expenses]);
  const planned = useMemo(() => plannedCostTotals(items), [items]);
  const itemTitles = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);
  const currencies = useMemo(() => [...new Set(expenses.map((expense) => expense.currency))].sort(), [expenses]);
  const visibleExpenses = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return expenses.filter((expense) =>
      (!search || `${expense.description} ${expense.notes ?? ""} ${itemTitles.get(expense.travelObjectId ?? "") ?? ""}`.toLocaleLowerCase().includes(search)) &&
      (!categoryFilter || expense.category === categoryFilter) &&
      (!currencyFilter || expense.currency === currencyFilter)
    ).sort((left, right) => {
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
    setDraft({ description: expense.description, date: expense.date, amount: expense.amount, currency: expense.currency, category: expense.category, notes: expense.notes ?? "", travelObjectId: expense.travelObjectId ?? "" });
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
    const input: CreateExpenseInput = { ...draft, description: draft.description.trim(), currency: draft.currency.trim().toUpperCase(), amount: draft.amount.trim(), notes: draft.notes.trim() || null, travelObjectId: draft.travelObjectId || null };
    try {
      if (editingId) {
        const updated = await api.updateExpense(editingId, input);
        setExpenses((current) => current.map((expense) => expense.id === updated.id ? updated : expense));
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
      if (editingId === deleteTarget.id) { setEditingId(null); setFormOpen(false); }
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete expense.");
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
      <div><h1 className="text-xl font-semibold">Expenses</h1><p className="mt-1 text-sm text-muted-foreground">Track actual spending for {trip.title}. Planned item costs stay separate.</p></div>
      <button type="button" disabled={loading || Boolean(loadError)} onClick={startCreate} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Add expense</button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
      {loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-emerald-700" /></div> : <>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-emerald-50/70 p-4 dark:bg-emerald-950/30"><h2 className="text-sm font-semibold">Actual spending</h2><p className="mt-1 text-xs text-muted-foreground">All recorded expenses, grouped by currency</p>{loadError ? <div role="alert" className="mt-4"><p className="text-sm text-rose-800 dark:text-rose-200">{loadError}</p><button type="button" onClick={retryExpenseLoad} className="mt-3 min-h-11 rounded-lg border border-emerald-800 px-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">Retry loading expenses</button></div> : <div className="mt-4 space-y-2">{totals.currencies.length ? totals.currencies.map(({ currency, amount }) => <div key={currency} className="flex justify-between gap-3 text-lg font-semibold"><span>{currency}</span><span>{formatExpenseAmount(amount, currency)}</span></div>) : <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}</div>}</div>
          <div className="rounded-xl border p-4"><h2 className="text-sm font-semibold">Planned item costs</h2><p className="mt-1 text-xs text-muted-foreground">Estimates entered on itinerary items</p><div className="mt-4 space-y-2">{planned.length ? planned.map(({ currency, amount }) => <div key={currency} className="flex justify-between gap-3 text-lg font-semibold"><span>{currency}</span><span>{formatExpenseAmount(amount, currency)}</span></div>) : <p className="text-sm text-muted-foreground">No item costs entered yet.</p>}</div></div>
        </div>
        {!loadError && totals.categories.length > 0 && <section className="mt-4 rounded-xl border p-4"><h2 className="text-sm font-semibold">Spending by category</h2><div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">{totals.categories.map(({ currency, category, amount }) => <div key={`${currency}:${category}`} className="flex justify-between gap-3 text-sm"><span className="capitalize text-muted-foreground">{category} · {currency}</span><span className="font-medium">{formatExpenseAmount(amount, currency)}</span></div>)}</div></section>}
        {!loadError && formOpen && <form ref={expenseFormRef} onSubmit={(event) => void saveExpense(event)} className="mt-5 rounded-xl border bg-stone-50 p-4 dark:bg-neutral-900 sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{editingId ? "Edit expense" : "New expense"}</h2><button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground hover:text-foreground">Cancel</button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Description<input required maxLength={100} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={fieldClass} placeholder="Museum tickets" /></label>
          <label className="text-sm font-medium">Date<input required type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} className={fieldClass} /></label>
          <label className="text-sm font-medium">Category<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as ExpenseCategory }))} className={fieldClass}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category} className="capitalize">{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label>
          <label className="text-sm font-medium">Amount<input required type="text" inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,3})?" title="Positive amount with up to three decimal places" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} className={fieldClass} placeholder="24.50" /></label>
          <label className="text-sm font-medium">Currency<input required maxLength={3} pattern="[A-Za-z]{3}" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className={`${fieldClass} uppercase`} placeholder="SGD" /></label>
          <label className="text-sm font-medium">Itinerary item (optional)<select value={draft.travelObjectId} onChange={(event) => setDraft((current) => ({ ...current, travelObjectId: event.target.value }))} className={fieldClass}><option value="">No linked item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Notes (optional)<textarea maxLength={2500} rows={2} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} className={fieldClass} placeholder="What was this for?" /></label>
        </div><div className="mt-4 flex justify-end"><button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Saving…" : editingId ? "Save changes" : "Save expense"}</button></div></form>}
        {!loadError && <><div className="mt-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Entries</h2><p className="text-xs text-muted-foreground">{visibleExpenses.length} of {expenses.length} expenses</p></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="expense-search">Search expenses</label><input id="expense-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" className="min-h-11 rounded-lg border bg-background px-3 py-2 text-sm" /><label className="sr-only" htmlFor="expense-category">Filter category</label><select id="expense-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="min-h-11 rounded-lg border bg-background px-3 py-2 text-sm"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select><label className="sr-only" htmlFor="expense-currency">Filter currency</label><select id="expense-currency" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="min-h-11 rounded-lg border bg-background px-3 py-2 text-sm"><option value="">All currencies</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select><label className="sr-only" htmlFor="expense-sort">Sort expenses</label><select id="expense-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 rounded-lg border bg-background px-3 py-2 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest amount</option></select></div></div>
        <div className="mt-3 overflow-hidden rounded-xl border">{visibleExpenses.length ? <ul className="divide-y">{visibleExpenses.map((expense) => <li key={expense.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:bg-stone-50 dark:hover:bg-neutral-900"><div className="min-w-48 flex-1"><p className="font-medium">{expense.description}</p><p className="mt-1 text-xs text-muted-foreground">{expense.date} · <span className="capitalize">{expense.category}</span>{expense.travelObjectId && ` · ${itemTitles.get(expense.travelObjectId) ?? "Linked item unavailable"}`}</p>{expense.notes && <p className="mt-1 text-sm text-muted-foreground">{expense.notes}</p>}</div><p className="min-w-28 text-right font-semibold">{formatExpenseAmount(expense.amount, expense.currency)}</p><div className="flex gap-1"><button type="button" onClick={() => startEdit(expense)} aria-label={`Edit ${expense.description}`} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-stone-100 hover:text-foreground dark:hover:bg-neutral-800"><Pencil size={16} /></button><button type="button" onClick={() => setDeleteTarget(expense)} aria-label={`Delete ${expense.description}`} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 size={16} /></button></div></li>)}</ul> : <div className="p-8 text-center text-sm text-muted-foreground">{expenses.length ? "No expenses match these filters." : "No expenses yet. Add one to start tracking spending."}</div>}</div></>}
      </>}
    </div>
    {deleteTarget && <ConfirmDialog title="Delete expense?" description="This expense will be permanently removed." items={[deleteTarget.description]} onCancel={() => setDeleteTarget(null)} onConfirm={() => { void deleteExpense(); }} />}
  </section>;
}
