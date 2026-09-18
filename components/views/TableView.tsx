"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, RotateCcw } from "lucide-react";
import type { TravelObject, Trip } from "@/types/travel";

type SortKey = "title" | "type" | "duration" | "cost" | "tags";
type SortDirection = "asc" | "desc";

function durationMinutes(item: TravelObject) {
  if (!item.startDateTime || !item.endDateTime) return null;
  return Math.max(0, Math.round((Date.parse(item.endDateTime) - Date.parse(item.startDateTime)) / 60_000));
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "Unscheduled";
  if (minutes === 0) return "0 min";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", remainingMinutes ? `${remainingMinutes}m` : ""].filter(Boolean).join(" ");
}

function costAmount(item: TravelObject) {
  const cost = item.cost as { amount?: number; currency?: string } | null | undefined;
  return typeof cost?.amount === "number" && Number.isFinite(cost.amount) ? cost.amount : null;
}

function formatCost(item: TravelObject, defaultCurrency: string) {
  const cost = item.cost as { amount?: number; currency?: string } | null | undefined;
  if (costAmount(item) == null) return "—";
  const currency = cost?.currency || defaultCurrency || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(cost!.amount!);
  } catch {
    return `${cost!.amount} ${currency}`;
  }
}

function compareNullable<T>(a: T | null, b: T | null, compare: (left: T, right: T) => number) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compare(a, b);
}

const columns: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "duration", label: "Length" },
  { key: "cost", label: "Cost" },
  { key: "tags", label: "Tags" },
];

export function TableView({ trip, items, onSelect }: { trip: Trip; items: TravelObject[]; onSelect: (item: TravelObject) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const types = useMemo(() => [...new Set(items.map((item) => item.type))].sort((a, b) => a.localeCompare(b)), [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags ?? []))].sort((a, b) => a.localeCompare(b)), [items]);
  const activeFilterCount = Number(Boolean(titleQuery.trim())) + selectedTypes.length + selectedTags.length;

  const visibleItems = useMemo(() => {
    const query = titleQuery.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (query && !item.title.toLocaleLowerCase().includes(query)) return false;
      if (selectedTypes.length && !selectedTypes.includes(item.type)) return false;
      if (selectedTags.length && !selectedTags.some((tag) => item.tags?.includes(tag))) return false;
      return true;
    }).sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "title": result = a.title.localeCompare(b.title); break;
        case "type": result = a.type.localeCompare(b.type); break;
        case "duration": result = compareNullable(durationMinutes(a), durationMinutes(b), (left, right) => left - right); break;
        case "cost": result = compareNullable(costAmount(a), costAmount(b), (left, right) => left - right); break;
        case "tags": result = (a.tags ?? []).join(", ").localeCompare((b.tags ?? []).join(", ")); break;
      }
      return result * (sortDirection === "asc" ? 1 : -1) || a.title.localeCompare(b.title);
    });
  }, [items, selectedTags, selectedTypes, sortDirection, sortKey, titleQuery]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  }

  function toggleSelection(value: string, selected: string[], setSelected: (next: string[]) => void) {
    setSelected(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  }

  function clearFilters() {
    setTitleQuery("");
    setSelectedTypes([]);
    setSelectedTags([]);
  }

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900" aria-label="Trip items table">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div><h2 className="text-sm font-semibold">All trip items</h2><p className="mt-0.5 text-xs text-muted-foreground">{visibleItems.length} of {items.length} items · {trip.timezone}</p></div>
      <div className="relative">
        <button type="button" aria-expanded={filterOpen} aria-haspopup="dialog" onClick={() => setFilterOpen((open) => !open)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-neutral-800 ${activeFilterCount ? "border-emerald-600 text-emerald-800 dark:text-emerald-200" : ""}`}>
          <Filter size={15} /> Filters {activeFilterCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-emerald-700 text-[11px] text-white">{activeFilterCount}</span>}
        </button>
        {filterOpen && <div role="dialog" aria-label="Filter trip items" className="absolute right-0 top-full z-30 mt-2 max-h-[min(70vh,520px)] w-[min(340px,88vw)] overflow-y-auto rounded-xl border bg-white p-4 shadow-xl dark:bg-neutral-900">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">Filter items</h3><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RotateCcw size={12} /> Clear</button></div>
          <label className="mb-4 block text-xs font-medium">Title contains<input value={titleQuery} onChange={(event) => setTitleQuery(event.target.value)} placeholder="Search titles" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-emerald-600" /></label>
          <fieldset className="mb-4"><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</legend><div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">{types.map((type) => <label key={type} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleSelection(type, selectedTypes, setSelectedTypes)} className="accent-emerald-700" /><span className="truncate capitalize">{type}</span></label>)}</div>{types.length === 0 && <p className="text-xs text-muted-foreground">No types yet</p>}</fieldset>
          <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag</legend><div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">{tags.map((tag) => <label key={tag} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleSelection(tag, selectedTags, setSelectedTags)} className="accent-emerald-700" /><span className="truncate">{tag}</span></label>)}</div>{tags.length === 0 && <p className="text-xs text-muted-foreground">No tags yet</p>}</fieldset>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Done</button></div>
        </div>}
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:bg-neutral-950 dark:text-stone-400"><tr>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="border-b px-4 py-3 font-semibold"><button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 hover:text-emerald-800 dark:hover:text-emerald-300">{label}{sortKey === key && (sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</button></th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">{visibleItems.map((item) => <tr key={item.id} className="transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800/70">
          <td className="max-w-[320px] px-4 py-3"><button type="button" onClick={() => onSelect(item)} className="block max-w-full truncate text-left font-medium text-stone-900 hover:text-emerald-800 hover:underline dark:text-stone-100 dark:hover:text-emerald-300">{item.title || "Untitled item"}</button></td>
          <td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs capitalize text-stone-700 dark:bg-neutral-800 dark:text-stone-200">{item.type}</span></td>
          <td className="whitespace-nowrap px-4 py-3 text-stone-600 dark:text-stone-300">{formatDuration(durationMinutes(item))}</td>
          <td className="whitespace-nowrap px-4 py-3 text-stone-600 dark:text-stone-300">{formatCost(item, trip.defaultCurrency)}</td>
          <td className="px-4 py-3"><div className="flex max-w-[260px] flex-wrap gap-1.5">{item.tags?.length ? item.tags.map((tag) => <span key={tag} className="max-w-32 truncate rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{tag}</span>) : <span className="text-stone-400">—</span>}</div></td>
        </tr>)}</tbody>
      </table>
      {visibleItems.length === 0 && <div className="grid min-h-48 place-items-center p-6 text-center"><div><p className="text-sm font-medium">No matching trip items</p><p className="mt-1 text-xs text-muted-foreground">Try changing or clearing your filters.</p></div></div>}
    </div>
  </section>;
}
