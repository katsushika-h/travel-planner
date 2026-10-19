import { useState } from "react";
import { CATEGORY_ITEM_TYPE, decimalToThousandths, expenseDashboard, formatExpenseAmount } from "@/lib/expense-domain";
import { typeColor } from "@/lib/type-color";

type Dashboard = ReturnType<typeof expenseDashboard>;

const categoryName = (category: string) => category[0].toUpperCase() + category.slice(1);
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
const share = (part: string, whole: string) => {
  const total = Number(decimalToThousandths(whole));
  return total > 0 ? (Number(decimalToThousandths(part)) / total) * 100 : 0;
};

function Kpi({ label, value, note, big }: { label: string; value: string; note?: string; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t border-foreground pt-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={`font-mono font-light tracking-[-0.03em] ${big ? "text-[34px] sm:text-[44px]" : "text-[20px] sm:text-[22px]"}`}
      >
        {value}
      </span>
      {note && <span className="text-[13px] text-muted">{note}</span>}
    </div>
  );
}

/**
 * One currency's spending as a single dashboard: pre-trip bookings and on-trip spending share every
 * figure, and the phase only shades the bars. Planned itinerary costs appear as a note, never in a total.
 */
export function SpendDashboard({
  dashboard,
  currencies,
  active,
  onCurrency,
  combined,
  planned,
  itemTitles,
  typeColors,
}: {
  dashboard: Dashboard;
  currencies: string[];
  /** The selected tab: a currency code, or "ALL" for the combined view. */
  active: string;
  onCurrency: (currency: string) => void;
  /** Present when more than one currency is in use; enables the combined tab and its rate editor. */
  combined?: {
    defaultCurrency: string;
    rates: Record<string, string>;
    missing: string[];
    onSaveRates: (rates: Record<string, string>) => Promise<void>;
  };
  /** Planned itinerary cost in this currency; never added to the actual total. */
  planned?: number;
  itemTitles: Map<string, string>;
  typeColors: Record<string, string>;
}) {
  const { currency, total, pre, during, perDay, categories, days, largest } = dashboard;
  const money = (amount: string) => formatExpenseAmount(amount, currency);
  const over = planned != null && Number(total) > planned;
  const topCategory = categories[0]?.total ?? "0";
  const dayMax = days.reduce((max, { amount }) => (Number(amount) > max ? Number(amount) : max), 0);
  const peak = dayMax > 0 ? days.find(({ amount }) => Number(amount) === dayMax) : undefined;

  return (
    <section aria-label={`Spend in ${currency}`} className="flex flex-col gap-10 pb-10 pt-6 sm:pt-8">
      {combined && (
        <div className="flex gap-4 text-[13px]">
          {["ALL", ...currencies].map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={code === active}
              onClick={() => onCurrency(code)}
              className={`min-h-8 px-0.5 max-sm:min-h-11 max-sm:min-w-11 ${code === active ? "font-medium shadow-[inset_0_-1px_0_var(--ink)]" : "text-muted hover:text-foreground"}`}
            >
              {code === "ALL" ? "All" : code}
            </button>
          ))}
        </div>
      )}

      {combined && active === "ALL" && (
        <RateEditor
          key={JSON.stringify(combined.rates)}
          currencies={currencies.filter((code) => code !== combined.defaultCurrency)}
          {...combined}
        />
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-x-8">
        <div className="col-span-2 lg:col-span-1">
          <Kpi
            big
            label={active === "ALL" ? `Total spent · all currencies in ${currency}` : `Total spent · ${currency}`}
            value={money(total)}
            note={
              planned != null
                ? `${dashboard.count} ${dashboard.count === 1 ? "expense" : "expenses"} · of ${formatExpenseAmount(planned, currency)} planned${over ? ` · ${formatExpenseAmount(Number(total) - planned, currency)} over` : ""}`
                : `${dashboard.count} ${dashboard.count === 1 ? "expense" : "expenses"}`
            }
          />
        </div>
        <Kpi label="Booked before trip" value={money(pre)} note="Itinerary costs and advance bookings" />
        <Kpi label="During trip" value={money(during)} />
        <Kpi
          label="Per day on trip"
          value={perDay ? money(perDay) : "—"}
          note={perDay ? "Trip days so far" : "Once spending starts"}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <section aria-label="By category">
          <div className="flex items-baseline justify-between border-t border-foreground pb-2 pt-3">
            <h2 className="text-[15px] font-medium">By category</h2>
            <div className="flex gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 bg-foreground opacity-40" /> Before trip
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 bg-foreground" /> During
              </span>
            </div>
          </div>
          {categories.map((row) => (
            <div key={row.category} className="flex flex-col gap-1.5 border-b border-divider py-3">
              <div className="flex justify-between gap-3 text-sm">
                <span>
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ backgroundColor: typeColor(CATEGORY_ITEM_TYPE[row.category], typeColors) }}
                  />
                  {categoryName(row.category)}
                  <span className="ml-2 text-xs text-muted">{share(row.total, total).toFixed(0)}%</span>
                </span>
                <span className="font-mono text-[13px]">{money(row.total)}</span>
              </div>
              <div className="flex h-1 bg-surface" aria-hidden="true">
                <div
                  className="h-1 opacity-40"
                  style={{
                    width: `${share(row.pre, topCategory)}%`,
                    backgroundColor: typeColor(CATEGORY_ITEM_TYPE[row.category], typeColors),
                  }}
                />
                <div
                  className="h-1"
                  style={{
                    width: `${share(row.during, topCategory)}%`,
                    backgroundColor: typeColor(CATEGORY_ITEM_TYPE[row.category], typeColors),
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        <section aria-label="Daily spend on trip">
          <div className="flex items-baseline justify-between border-t border-foreground pb-2 pt-3">
            <h2 className="text-[15px] font-medium">Daily spend on trip</h2>
            {peak && (
              <span className="text-xs text-muted">
                Peak {shortDate(peak.date)} · {money(peak.amount)}
              </span>
            )}
          </div>
          <div
            className="flex h-40 items-end gap-px border-b border-divider pt-4"
            role="img"
            aria-label="Spend per trip day"
          >
            {days.map(({ date, amount }) => (
              <div
                key={date}
                title={`${shortDate(date)} · ${money(amount)}`}
                className={`min-w-px flex-1 ${peak?.date === date ? "bg-accent" : "bg-foreground"}`}
                style={{
                  height: dayMax > 0 && Number(amount) > 0 ? `${Math.max((Number(amount) / dayMax) * 100, 2)}%` : "1px",
                  opacity: Number(amount) > 0 ? 1 : 0.15,
                }}
              />
            ))}
          </div>
          <div className="flex justify-between pt-2 font-mono text-xs text-muted">
            <span>{shortDate(days[0].date)}</span>
            <span>{shortDate(days[days.length - 1].date)}</span>
          </div>
        </section>
      </div>

      <section aria-label="Largest expenses">
        <h2 className="border-t border-foreground pb-1 pt-3 text-[15px] font-medium">Largest expenses</h2>
        <ul>
          {largest.map(({ expense, pre: isPre }, index) => (
            <li key={expense.id} className="flex items-baseline gap-3 border-b border-divider py-2.5 text-sm">
              <span className="w-5 font-mono text-xs text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1">
                {expense.description}
                <span className="block text-xs text-muted">
                  {categoryName(expense.category)} · {shortDate(expense.date)}
                  {isPre && " · before trip"}
                  {expense.travelObjectId &&
                    itemTitles.has(expense.travelObjectId) &&
                    ` · ${itemTitles.get(expense.travelObjectId)}`}
                </span>
              </span>
              <span className="font-mono text-[13px] whitespace-nowrap">{money(expense.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function RateEditor({
  currencies,
  defaultCurrency,
  rates,
  missing,
  onSaveRates,
}: {
  currencies: string[];
  defaultCurrency: string;
  rates: Record<string, string>;
  missing: string[];
  onSaveRates: (rates: Record<string, string>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => Object.fromEntries(currencies.map((code) => [code, rates[code] ?? ""])));
  const [saving, setSaving] = useState(false);
  const dirty = currencies.some((code) => (draft[code] ?? "").trim() !== (rates[code] ?? ""));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void onSaveRates(Object.fromEntries(Object.entries(draft).filter(([, rate]) => rate.trim()))).finally(() =>
          setSaving(false),
        );
      }}
      className="flex flex-col gap-3 border-t border-divider pt-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className="text-[13px] text-muted">Exchange rates into {defaultCurrency}</span>
        {currencies.map((code) => (
          <label key={code} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-[13px] text-muted">1 {code} =</span>
            <input
              inputMode="decimal"
              value={draft[code] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [code]: event.target.value }))}
              pattern="(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,8})?"
              title="Positive rate with up to eight decimal places"
              placeholder="0.0000"
              aria-label={`Rate for ${code} in ${defaultCurrency}`}
              className="min-h-11 w-24 border-0 border-b border-input-rule bg-transparent px-0 py-2 font-mono text-sm outline-none placeholder:text-faint focus:border-foreground sm:min-h-9"
            />
            <span className="font-mono text-[13px] text-muted">{defaultCurrency}</span>
          </label>
        ))}
        {dirty && (
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 px-3 text-sm font-medium underline-offset-4 hover:underline sm:min-h-9"
          >
            {saving ? "Saving…" : "Save rates"}
          </button>
        )}
      </div>
      <p className="text-[13px] text-muted">
        {missing.length
          ? `${missing.join(", ")} not included until a rate is set. `
          : "Rates are your own estimates, so the combined total is approximate. "}
        Each currency tab stays exact.
      </p>
    </form>
  );
}
