import { formatPlannedCost, safeMapsHref } from "../components/views/plan/plan-domain.ts";
import {
  bookedItemExpenses,
  convertExpenses,
  decimalToThousandths,
  expenseDashboard,
  expenseType,
  formatExpenseAmount,
  plannedCostTotals,
  sumAmounts,
  thousandthsToDecimal,
} from "./expense-domain.ts";
import { placeLabel } from "./place-label.ts";
import { markdownToPlainText } from "./text-utils.ts";
import { formatTripDateRange } from "./trip-dates.ts";
import { createTripPrintModel, type PrintItem } from "./trip-print.ts";
import { defaultTypeColor } from "./type-color.ts";
import type { Expense, TravelObject, Trip } from "../types/travel.ts";

/** An attachment embedded in the file as base64; `contentType` must come from `attachmentContentType`. */
export interface OfflineAttachment {
  fileName: string;
  contentType: string;
  base64: string;
}

export interface OfflineTripInput {
  trip: Trip;
  items: readonly TravelObject[];
  expenses: readonly Expense[];
  /** Attachments by travel object id. */
  attachments?: ReadonlyMap<string, readonly OfflineAttachment[]>;
  generatedAt?: Date;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Only web links leave the file; anything else (javascript:, data:) is dropped. */
const safeHref = (href: string | null | undefined) => (href && /^https?:\/\//i.test(href) ? href : null);

const link = (href: string | null | undefined, label: string) => {
  const safe = safeHref(href);
  return safe ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` : "";
};

const categoryName = (category: string) => (category ? category[0].toUpperCase() + category.slice(1) : "Other");

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

function localDate(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      date,
    );
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Same file-name rule as the calendar export. */
export function offlineFileName(title: string) {
  return `${
    title
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "trip"
  }.html`;
}

function attachmentLinks(attachments: readonly OfflineAttachment[] | undefined) {
  if (!attachments?.length) return "";
  const links = attachments
    .map(
      (file) =>
        `<li><a href="data:${escapeHtml(file.contentType.split(";")[0])};base64,${file.base64}" download="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</a></li>`,
    )
    .join("");
  return `<div class="field"><span class="label">Attachments</span><ul class="files">${links}</ul></div>`;
}

function spentLines(expenses: readonly Expense[] | undefined) {
  if (!expenses?.length) return "";
  const rows = expenses
    .map(
      (expense) =>
        `<li>${escapeHtml(expense.description)} <span class="muted">· ${escapeHtml(shortDate(expense.date))}</span> <span class="amount">${escapeHtml(formatExpenseAmount(expense.amount, expense.currency))}</span></li>`,
    )
    .join("");
  return `<div class="field"><span class="label">Spent</span><ul class="spent">${rows}</ul></div>`;
}

interface StopView {
  id: string;
  time: string;
  title: string;
  type: string;
  meta: string;
  continued: boolean;
  place: string | null;
  address: string | null;
  mapsHref: string | null;
  cost: string | null;
  notes: string | null;
}

function stopHtml(stop: StopView, input: OfflineTripInput, expensesByItem: Map<string, Expense[]>) {
  const color = escapeHtml(defaultTypeColor(stop.type));
  const head = `<span class="time">${escapeHtml(stop.time)}</span><span class="dot" style="background:${color}"></span><span class="what"><span class="title">${escapeHtml(stop.title)}</span><span class="muted meta">${escapeHtml(stop.meta)}</span></span><span class="cost">${escapeHtml(stop.cost ?? "")}</span>`;
  if (stop.continued) return `<div class="stop continued">${head}</div>`;

  const body = [
    stop.place || stop.address
      ? `<div class="field"><span class="label">Place</span><span>${escapeHtml([stop.place, stop.address].filter(Boolean).join(", "))}</span></div>`
      : "",
    stop.notes
      ? `<div class="field"><span class="label">Notes</span><p class="notes">${escapeHtml(stop.notes)}</p></div>`
      : "",
    spentLines(expensesByItem.get(stop.id)),
    attachmentLinks(input.attachments?.get(stop.id)),
    stop.mapsHref
      ? `<div class="field"><span class="label"></span>${link(stop.mapsHref, "Open in Google Maps ↗")}</div>`
      : "",
  ].join("");
  return body
    ? `<details class="stop"><summary>${head}</summary><div class="body">${body}</div></details>`
    : `<div class="stop">${head}</div>`;
}

function fromPrintItem(entry: PrintItem): StopView {
  return {
    ...entry,
    meta: [entry.type, entry.place, entry.until].filter(Boolean).join(" · "),
  };
}

function fromIdea(item: TravelObject): StopView {
  const place = placeLabel(item);
  return {
    id: item.id,
    time: "Idea",
    title: item.title,
    type: item.type,
    meta: [item.type, place].filter(Boolean).join(" · "),
    continued: false,
    place,
    address: item.location?.address?.trim() || null,
    mapsHref: safeMapsHref(item.location),
    cost: item.cost && item.cost.amount >= 0 ? formatPlannedCost(item.cost.amount, item.cost.currency) : null,
    notes: item.notes ? markdownToPlainText(item.notes) || null : null,
  };
}

function itineraryHtml(input: OfflineTripInput, expensesByItem: Map<string, Expense[]>) {
  const { trip, items } = input;
  const { days, totals } = createTripPrintModel(trip, items);
  const ideas = items.filter((item) => item.tripId === trip.id && item.kind !== "note" && !item.date);

  const strip = days
    .map(
      (day) =>
        `<a href="#day-${day.dayNumber}"><span>${day.dayNumber}</span><small>${escapeHtml(shortDate(day.date))}</small></a>`,
    )
    .join("");

  const daySections = days
    .map((day) => {
      const notes = day.notes.map((note) => `<p class="day-note">${escapeHtml(note)}</p>`).join("");
      const stops = day.items.map((entry) => stopHtml(fromPrintItem(entry), input, expensesByItem)).join("");
      const empty = !day.items.length && !day.notes.length ? `<p class="muted">Nothing planned</p>` : "";
      return `<section class="day" id="day-${day.dayNumber}"><div class="day-head"><h2>Day ${day.dayNumber} <span class="muted">${escapeHtml(dayFormat.format(new Date(`${day.date}T00:00:00Z`)))}</span></h2>${link(day.routeHref, "Day route ↗")}</div>${notes}${stops}${empty}</section>`;
    })
    .join("");

  const ideaSection = ideas.length
    ? `<section class="day" id="ideas"><div class="day-head"><h2>Ideas <span class="muted">not scheduled</span></h2></div>${ideas.map((item) => stopHtml(fromIdea(item), input, expensesByItem)).join("")}</section>`
    : "";

  return `<section class="tab" id="itinerary" data-tab="itinerary"><nav class="strip" aria-label="Days">${strip}${ideas.length ? `<a href="#ideas"><span>·</span><small>Ideas</small></a>` : ""}</nav>${daySections}${ideaSection}${
    totals.length ? `<p class="muted total-line">Planned costs: ${escapeHtml(totals.join(" · "))}</p>` : ""
  }</section>`;
}

const percent = (part: bigint, whole: bigint) => (whole > BigInt(0) ? Number((part * BigInt(10000)) / whole) / 100 : 0);

function spendingHtml(input: OfflineTripInput, itemTitles: Map<string, string>) {
  const { trip, items } = input;
  // Same data as the app's Spending view: logged expenses under their item type, plus item costs with no logged expense.
  const logged = input.expenses
    .filter((expense) => expense.tripId === trip.id)
    .map((expense) => ({ ...expense, category: expenseType(expense.category) }));
  const all: Expense[] = [
    ...logged,
    ...bookedItemExpenses(
      items.filter((item) => item.tripId === trip.id),
      logged,
      trip.startDate,
    ),
  ];
  if (!all.length) {
    return `<section class="tab" id="spending" data-tab="spending"><p class="muted empty">No expenses recorded.</p></section>`;
  }
  const today = localDate(input.generatedAt ?? new Date(), trip.timezone);
  const currencies = [...new Set([trip.defaultCurrency, ...all.map((expense) => expense.currency)])].sort();
  const plannedCosts = plannedCostTotals(items.filter((item) => item.tripId === trip.id && item.kind !== "note")).map(
    ({ currency, amount }) => ({ currency, amount: thousandthsToDecimal(BigInt(Math.round(amount * 1000))) }),
  );

  const switcher =
    currencies.length > 1
      ? `<div class="filters currencies" role="group" aria-label="Currency">${currencies
          .map(
            (currency) =>
              `<button type="button" data-currency="${escapeHtml(currency)}" aria-pressed="${currency === trip.defaultCurrency}">${escapeHtml(currency)}</button>`,
          )
          .join("")}</div>`
      : "";

  const dashboards = currencies
    .map((currency) => {
      const { converted, missing } = convertExpenses(all, currency, trip.exchangeRates, trip.defaultCurrency);
      const board = expenseDashboard(converted, trip, currency, today);
      const plannedResult = plannedCosts.length
        ? convertExpenses(plannedCosts, currency, trip.exchangeRates, trip.defaultCurrency)
        : null;
      // A planned figure missing a currency would understate the plan, so it is left out entirely.
      const planned = plannedResult && !plannedResult.missing.length ? sumAmounts(plannedResult.converted) : null;
      const money = (amount: string | number) => escapeHtml(formatExpenseAmount(amount, currency, { rounded: true }));
      const total = decimalToThousandths(board.total);
      const kpis = [
        ["Pre-trip bookings", money(board.pre)],
        ["During the trip", money(board.during)],
        ["Per trip day so far", board.perDay ? money(board.perDay) : "–"],
        ...(planned ? [["Planned in itinerary", money(planned)]] : []),
      ]
        .map(
          ([label, value]) =>
            `<div class="kpi"><span class="muted">${label}</span><span class="num">${value}</span></div>`,
        )
        .join("");
      const categories = board.categories
        .map(
          ({ category, total: amount, value }) =>
            `<div class="bar-row"><span>${escapeHtml(categoryName(category))}</span><span class="bar"><i style="width:${percent(value, total)}%;background:${escapeHtml(defaultTypeColor(category))}"></i></span><span class="num">${money(amount)}</span></div>`,
        )
        .join("");
      const dayMax = board.days.reduce((max, day) => {
        const value = decimalToThousandths(day.amount);
        return value > max ? value : max;
      }, BigInt(0));
      const dayBars = board.days
        .map((day) => {
          const value = decimalToThousandths(day.amount);
          const label = `${shortDate(day.date)}: ${formatExpenseAmount(day.amount, currency, { rounded: true })}`;
          return `<span class="col" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><i style="height:${Math.max(percent(value, dayMax), value > BigInt(0) ? 2 : 0)}%"></i></span>`;
        })
        .join("");
      const missingNote = missing.length
        ? `<p class="muted total-line">Not included (no exchange rate): ${escapeHtml(missing.join(", "))}</p>`
        : "";
      return `<div class="board" data-currency="${escapeHtml(currency)}"><div class="kpi big"><span class="muted">Total spent · ${escapeHtml(currency)} · ${board.count} ${board.count === 1 ? "entry" : "entries"}</span><span class="num">${money(board.total)}</span></div>${missingNote}<div class="kpis">${kpis}</div><h3>By type</h3>${categories}${
        board.days.length > 1
          ? `<h3>By day</h3><div class="cols">${dayBars}</div><div class="cols-axis muted"><span>${escapeHtml(shortDate(board.days[0].date))}</span><span>${escapeHtml(shortDate(board.days.at(-1)!.date))}</span></div>`
          : ""
      }</div>`;
    })
    .join("");

  const usedTypes = [...new Set(all.map((expense) => expense.category))].sort();
  const filters = `<div class="filters" role="group" aria-label="Filter expenses"><button type="button" data-filter="" aria-pressed="true">All</button>${usedTypes
    .map(
      (type) =>
        `<button type="button" data-filter="${escapeHtml(type)}" aria-pressed="false">${escapeHtml(categoryName(type))}</button>`,
    )
    .join("")}</div>`;
  const rows = all
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
    .map((expense) => {
      const item = expense.travelObjectId ? itemTitles.get(expense.travelObjectId) : undefined;
      const fromItem = "fromItem" in expense;
      const extra = [
        categoryName(expense.category),
        fromItem ? "itinerary cost" : item !== expense.description ? item : null,
        expense.notes,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li data-category="${escapeHtml(expense.category)}"><span class="date muted">${escapeHtml(shortDate(expense.date))}</span><span class="what"><span>${escapeHtml(expense.description)}</span><span class="muted meta">${escapeHtml(extra)}</span></span><span class="amount">${escapeHtml(formatExpenseAmount(expense.amount, expense.currency))}</span></li>`;
    })
    .join("");

  return `<section class="tab" id="spending" data-tab="spending">${switcher}${dashboards}<h3>All expenses</h3>${filters}<ul class="expenses">${rows}</ul><p class="muted total-line">Item costs with no logged expense count as spend. Totals in another currency use the trip's exchange rates.</p></section>`;
}

const styles = `
:root{color-scheme:light dark;--bg:#fff;--surface:#f2f2f0;--ink:#111;--muted:#6b6b6b;--divider:#ebebea;--accent:#d9381e;--link:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e0e;--surface:#1c1c1c;--ink:#ededec;--muted:#9a9a98;--divider:#242424;--accent:#ff6a4d;--link:#8ab4ff}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--link)}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 48px}
header.top{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--divider);padding:14px 0 0}
h1{font-size:22px;font-weight:500;letter-spacing:-.01em;margin:0}
h2{font-size:16px;font-weight:600;margin:0}
h3{font-size:13px;font-weight:500;color:var(--muted);margin:28px 0 10px}
.muted{color:var(--muted)}
.sub{font-size:13px;margin:2px 0 10px}
.tabs{display:flex;gap:20px}
.tabs a{color:var(--muted);text-decoration:none;padding:8px 0 10px;font-size:14px}
.tabs a[aria-current=page]{color:var(--ink);font-weight:500;box-shadow:inset 0 -2px 0 var(--accent)}
.strip{display:flex;gap:6px;overflow-x:auto;padding:14px 0 6px;scrollbar-width:thin}
.strip a{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;min-width:48px;padding:6px 8px;border-radius:8px;background:var(--surface);color:var(--ink);text-decoration:none}
.strip a span{font-weight:600}
.strip small{font-size:11px;color:var(--muted)}
.tab{scroll-margin-top:120px}
.day{margin-top:24px;scroll-margin-top:110px}
.day-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px solid var(--ink);padding-top:10px;margin-bottom:4px}
.day-head a{font-size:13px;white-space:nowrap}
.day-note{background:var(--surface);border-radius:6px;padding:8px 10px;margin:8px 0;white-space:pre-wrap;font-size:14px}
.stop{border-bottom:1px solid var(--divider)}
.stop>summary,div.stop{display:grid;grid-template-columns:4.6em 10px 1fr auto;gap:10px;align-items:baseline;padding:10px 0;list-style:none}
.stop>summary{cursor:pointer}
.stop>summary::-webkit-details-marker{display:none}
.stop[open]>summary .title{text-decoration:underline;text-decoration-color:var(--divider)}
.stop.continued{opacity:.7}
.time{font:13px ui-monospace,"SF Mono",Menlo,monospace;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;align-self:center}
.what{display:flex;flex-direction:column;min-width:0}
.title{font-weight:500}
.meta{font-size:13px}
.cost,.amount{font:13px ui-monospace,"SF Mono",Menlo,monospace;white-space:nowrap;text-align:right}
.body{padding:0 0 14px calc(4.6em + 30px);display:flex;flex-direction:column;gap:8px;font-size:14px}
.field{display:grid;grid-template-columns:6.5em 1fr;gap:8px}
.label{color:var(--muted);font-size:13px}
.notes{margin:0;white-space:pre-wrap}
.files,.spent{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.spent li{display:flex;gap:6px}
.spent .amount{margin-left:auto}
.total-line{font-size:13px;margin-top:24px}
.board{margin-top:24px;padding-top:16px;border-top:1px solid var(--ink)}
.kpi{display:flex;flex-direction:column;gap:4px}
.kpi .muted{font-size:13px}
.num{font-family:ui-monospace,"SF Mono",Menlo,monospace}
.kpi.big .num{font-size:36px;font-weight:300;letter-spacing:-.03em}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-top:18px}
.kpis .num{font-size:18px}
.bar-row{display:grid;grid-template-columns:8.5em 1fr 8em;gap:12px;align-items:center;padding:4px 0;font-size:14px}
.bar-row .num{text-align:right}
.bar{height:8px;background:var(--surface);border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
.cols{display:flex;align-items:flex-end;gap:2px;height:90px;border-bottom:1px solid var(--divider)}
.col{flex:1;height:100%;display:flex;align-items:flex-end}
.col i{display:block;width:100%;background:var(--accent);border-radius:2px 2px 0 0}
.cols-axis{display:flex;justify-content:space-between;font-size:12px;margin-top:4px}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.filters button{font:inherit;font-size:13px;border:1px solid var(--divider);background:none;color:var(--muted);border-radius:999px;padding:4px 12px;min-height:32px;cursor:pointer}
.filters button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
html:not(.js) .filters{display:none}
.board[data-currency]{margin-top:16px}
.expenses{list-style:none;margin:0;padding:0}
.expenses li{display:grid;grid-template-columns:4.2em 1fr auto;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--divider)}
.expenses li[hidden]{display:none}
.empty{margin-top:32px}
footer{margin-top:40px;font-size:12px}
html.js .tab:not(.active){display:none}
html.js .board:not(.active){display:none}
.currencies{margin-top:18px}
@media (max-width:560px){
 .stop>summary,div.stop{grid-template-columns:4.4em 8px 1fr auto;gap:8px}
 .time{font-size:11px}
 .body{padding-left:0}
 .field{grid-template-columns:1fr;gap:2px}
 .bar-row{grid-template-columns:7.4em 1fr 6.6em;gap:8px;font-size:13px}
 .kpi.big .num{font-size:30px}
}
@media print{header.top{position:static}html.js .tab:not(.active),html.js .board:not(.active){display:block}.strip,.filters,.tabs{display:none}}
`;

/** Tabs and the expense filter; without scripts both sections simply show one after the other. */
const script = `
document.documentElement.classList.add("js");
(function(){
  var tabs=[].slice.call(document.querySelectorAll(".tabs a"));
  function show(name){
    document.querySelectorAll(".tab").forEach(function(s){s.classList.toggle("active",s.dataset.tab===name)});
    tabs.forEach(function(a){a.getAttribute("href")==="#"+name?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current")});
  }
  function fromHash(){
    var id=location.hash.slice(1);
    var el=id&&document.getElementById(id);
    var tab=el&&el.closest(".tab");
    show(tab?tab.dataset.tab:"itinerary");
  }
  tabs.forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();show(a.getAttribute("href").slice(1));history.replaceState(null,"",a.getAttribute("href"));window.scrollTo(0,0)})});
  window.addEventListener("hashchange",fromHash);
  fromHash();
  function currency(code){
    document.querySelectorAll(".board").forEach(function(d){d.classList.toggle("active",d.dataset.currency===code)});
    document.querySelectorAll(".currencies button").forEach(function(o){o.setAttribute("aria-pressed",String(o.dataset.currency===code))});
  }
  var first=document.querySelector(".currencies [aria-pressed=true]")||document.querySelector(".board");
  if(first)currency(first.dataset.currency);
  document.querySelectorAll(".currencies button").forEach(function(b){b.addEventListener("click",function(){currency(b.dataset.currency)})});
  document.querySelectorAll("[data-filter]").forEach(function(b){b.addEventListener("click",function(){
    var f=b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(function(o){o.setAttribute("aria-pressed",String(o===b))});
    document.querySelectorAll(".expenses li").forEach(function(li){li.hidden=!!f&&li.dataset.category!==f});
  })});
})();
`;

/**
 * A self-contained, read-only copy of one trip: day-by-day itinerary and spending, with no server or
 * network needed except for the Google Maps links. Nothing done in the file is saved anywhere.
 */
export function createTripOfflineHtml(input: OfflineTripInput) {
  const { trip, items, expenses } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const own = items.filter((item) => item.tripId === trip.id);
  const itemTitles = new Map(own.map((item) => [item.id, item.title]));
  const expensesByItem = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if (expense.tripId !== trip.id || !expense.travelObjectId) continue;
    expensesByItem.set(expense.travelObjectId, [...(expensesByItem.get(expense.travelObjectId) ?? []), expense]);
  }
  let generated: string;
  try {
    generated = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: trip.timezone,
    }).format(generatedAt);
  } catch {
    generated = generatedAt.toISOString().slice(0, 16).replace("T", " ");
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(trip.title)}</title>
<style>${styles}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<h1>${escapeHtml(trip.title)}</h1>
<p class="sub muted">${escapeHtml(formatTripDateRange(trip.startDate, trip.endDate))} · ${escapeHtml(trip.timezone)} · read-only copy</p>
<nav class="tabs" aria-label="Sections"><a href="#itinerary" aria-current="page">Itinerary</a><a href="#spending">Spending</a></nav>
</header>
${itineraryHtml(input, expensesByItem)}
${spendingHtml(input, itemTitles)}
<footer class="muted">Exported ${escapeHtml(generated)}. This is a snapshot: later changes in the app are not included, and nothing changed here is saved.</footer>
</div>
<script>${script}</script>
</body>
</html>
`;
}
