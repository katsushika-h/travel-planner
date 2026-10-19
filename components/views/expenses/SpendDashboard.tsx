import { decimalToThousandths, expenseDashboard, formatExpenseAmount } from "@/lib/expense-domain";

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
  onCurrency,
  planned,
  itemTitles,
}: {
  dashboard: Dashboard;
  currencies: string[];
  onCurrency: (currency: string) => void;
  /** Planned itinerary cost in this currency; never added to the actual total. */
  planned?: number;
  itemTitles: Map<string, string>;
}) {
  const { currency, total, pre, during, perDay, categories, days, largest } = dashboard;
  const money = (amount: string) => formatExpenseAmount(amount, currency);
  const over = planned != null && Number(total) > planned;
  const topCategory = categories[0]?.total ?? "0";
  const dayMax = days.reduce((max, { amount }) => (Number(amount) > max ? Number(amount) : max), 0);
  const peak = dayMax > 0 ? days.find(({ amount }) => Number(amount) === dayMax) : undefined;

  return (
    <section aria-label={`Spend in ${currency}`} className="flex flex-col gap-10 pb-10 pt-6 sm:pt-8">
      {currencies.length > 1 && (
        <div className="flex gap-4 text-[13px]">
          {currencies.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={code === currency}
              onClick={() => onCurrency(code)}
              className={`min-h-8 px-0.5 max-sm:min-h-11 max-sm:min-w-11 ${code === currency ? "font-medium shadow-[inset_0_-1px_0_var(--ink)]" : "text-muted hover:text-foreground"}`}
            >
              {code}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-x-8">
        <div className="col-span-2 lg:col-span-1">
          <Kpi
            big
            label={`Total spent · ${currency}`}
            value={money(total)}
            note={
              planned != null
                ? `${dashboard.count} expenses · of ${formatExpenseAmount(planned, currency)} planned${over ? ` · ${formatExpenseAmount(Number(total) - planned, currency)} over` : ""}`
                : `${dashboard.count} expenses`
            }
          />
        </div>
        <Kpi label="Booked before trip" value={money(pre)} note="Flights, hotels, deposits" />
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
                <span className="size-2 bg-faint" /> Before trip
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
                  {categoryName(row.category)}
                  <span className="ml-2 text-xs text-muted">{share(row.total, total).toFixed(0)}%</span>
                </span>
                <span className="font-mono text-[13px]">{money(row.total)}</span>
              </div>
              <div className="flex h-1 bg-surface" aria-hidden="true">
                <div className="h-1 bg-faint" style={{ width: `${share(row.pre, topCategory)}%` }} />
                <div className="h-1 bg-foreground" style={{ width: `${share(row.during, topCategory)}%` }} />
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
