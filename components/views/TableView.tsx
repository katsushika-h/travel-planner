"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter, RotateCcw } from "lucide-react";
import { dateParts, dayIndexForDate, zonedDateTimeToUtc } from "@/lib/date-utils";
import { elapsedDurationMinutes } from "@/lib/schedule-domain";
import type { TravelObject, Trip } from "@/types/travel";

type SortKey = "startDate" | "title" | "type" | "duration" | "cost" | "tags";
type SortDirection = "asc" | "desc";

function costAmount(item: TravelObject) {
  const cost = item.cost as { amount?: number; currency?: string } | null | undefined;
  return typeof cost?.amount === "number" && Number.isFinite(cost.amount) ? cost.amount : null;
}

function compareNullable<T>(a: T | null, b: T | null, compare: (left: T, right: T) => number) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compare(a, b);
}

const columns: { key: SortKey; label: string }[] = [
  { key: "startDate", label: "Start" },
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "duration", label: "Length" },
  { key: "cost", label: "Cost" },
  { key: "tags", label: "Tags" },
];

const defaultTypeColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const typePalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function typeColor(type: string, colors: Record<string, string>) {
  return colors[type] ?? defaultTypeColors[type] ?? typePalette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % typePalette.length];
}

function InlineInput({ value, label, type = "text", min, step, onFocus, onCommit, className = "" }: { value: string; label: string; type?: "text" | "number" | "datetime-local"; min?: string; step?: string; onFocus: () => void; onCommit: (value: string) => void; className?: string }) {
  return <input key={value} aria-label={label} type={type} min={min} step={step} defaultValue={value} onFocus={onFocus} onBlur={(event) => { if (event.currentTarget.value !== value) onCommit(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); else if (event.key === "Escape") { event.currentTarget.value = value; event.currentTarget.blur(); } }} className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-stone-300 focus:border-emerald-600 focus:bg-background ${className}`} />;
}

export function TableView({ trip, items, typeColors, selectedIds, primarySelectedId, onSelect, onInspect, onSelectionChange, onChangeItems }: { trip: Trip; items: TravelObject[]; typeColors: Record<string, string>; selectedIds: ReadonlySet<string>; primarySelectedId: string | null; onSelect: (item: TravelObject, additive?: boolean) => void; onInspect: (item: TravelObject) => void; onSelectionChange: (ids: Iterable<string>, primaryId?: string | null) => void; onChangeItems: (ids: string[], patchForItem: (item: TravelObject) => Partial<TravelObject>, immediate?: boolean) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !filterRef.current?.contains(event.target)) setFilterOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFilterOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filterOpen]);

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
        case "startDate": result = compareNullable(a.startDateTime, b.startDateTime, (left, right) => Date.parse(left) - Date.parse(right)); break;
        case "title": result = a.title.localeCompare(b.title); break;
        case "type": result = a.type.localeCompare(b.type); break;
        case "duration": result = compareNullable(elapsedDurationMinutes(a, trip.timezone), elapsedDurationMinutes(b, trip.timezone), (left, right) => left - right); break;
        case "cost": result = compareNullable(costAmount(a), costAmount(b), (left, right) => left - right); break;
        case "tags": result = (a.tags ?? []).join(", ").localeCompare((b.tags ?? []).join(", ")); break;
      }
      return result * (sortDirection === "asc" ? 1 : -1) || a.title.localeCompare(b.title);
    });
  }, [items, selectedTags, selectedTypes, sortDirection, sortKey, titleQuery, trip.timezone]);

  const costTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of visibleItems) {
      const amount = costAmount(item);
      if (amount == null) continue;
      const currency = (item.cost as { currency?: string } | null)?.currency || trip.defaultCurrency || "USD";
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    }
    return [...totals.entries()];
  }, [trip.defaultCurrency, visibleItems]);

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id));
  const someVisibleSelected = visibleItems.some((item) => selectedIds.has(item.id));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected; }, [allVisibleSelected, someVisibleSelected]);
  useEffect(() => {
    function selectAll(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      onSelectionChange(visibleItems.map((item) => item.id), visibleItems[0]?.id ?? null);
    }
    window.addEventListener("keydown", selectAll);
    return () => window.removeEventListener("keydown", selectAll);
  }, [onSelectionChange, visibleItems]);

  function formatTotal(amount: number, currency: string) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }

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

  function editIds(item: TravelObject) { return selectedIds.has(item.id) ? [...selectedIds] : [item.id]; }
  function beginEdit(item: TravelObject) { if (!selectedIds.has(item.id)) onSelect(item); }
  function localStart(item: TravelObject) { if (!item.startDateTime) return ""; const parts = dateParts(item.startDateTime, trip.timezone); return `${parts.date}T${parts.time}`; }
  function toggleAllVisible() {
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    const next = allVisibleSelected ? [...selectedIds].filter((id) => !visibleIds.has(id)) : [...new Set([...selectedIds, ...visibleIds])];
    onSelectionChange(next, allVisibleSelected && primarySelectedId && visibleIds.has(primarySelectedId) ? next[0] ?? null : primarySelectedId ?? next[0] ?? null);
  }

  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900" aria-label="Trip items table">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div><h2 className="text-sm font-semibold">All trip items</h2><p className="mt-0.5 text-xs text-muted-foreground">{visibleItems.length} of {items.length} items · {trip.timezone}</p></div>
      <div className="relative" ref={filterRef}>
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
      <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:bg-neutral-950 dark:text-stone-400"><tr><th scope="col" className="w-10 border-b px-3 py-3"><input ref={selectAllRef} type="checkbox" aria-label="Select all filtered rows" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-emerald-700" /></th>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="border-b px-3 py-3 font-semibold"><button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 hover:text-emerald-800 dark:hover:text-emerald-300">{label}{sortKey === key && (sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</button></th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">{visibleItems.map((item) => <tr key={item.id} className={`transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800/70 ${selectedIds.has(item.id) ? primarySelectedId === item.id ? "bg-emerald-700/10 outline outline-2 -outline-offset-2 outline-white" : "bg-emerald-50 outline outline-2 -outline-offset-2 outline-emerald-600 dark:bg-emerald-950/30" : ""}`}>
          <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${item.title}`} checked={selectedIds.has(item.id)} onChange={() => onSelect(item, true)} className="accent-emerald-700" /></td>
          <td className="min-w-52 whitespace-nowrap px-2 py-2 text-stone-600 dark:text-stone-300"><InlineInput label={`Start date for ${item.title}`} type="datetime-local" value={localStart(item)} onFocus={() => beginEdit(item)} onCommit={(value) => onChangeItems(editIds(item), (candidate) => { if (!value) return { startDateTime: null, endDateTime: null, dayIndex: null }; const [date, time] = value.split("T"); const startDateTime = zonedDateTimeToUtc(date, time, trip.timezone); const duration = candidate.startDateTime && candidate.endDateTime ? Math.max(15 * 60_000, Date.parse(candidate.endDateTime) - Date.parse(candidate.startDateTime)) : 60 * 60_000; return { startDateTime, endDateTime: new Date(Date.parse(startDateTime) + duration).toISOString(), dayIndex: Math.max(1, dayIndexForDate(date, trip.startDate)) }; })} /></td>
          <td className="min-w-52 max-w-[320px] px-2 py-2"><InlineInput label={`Title for ${item.title}`} value={item.title} onFocus={() => onInspect(item)} onCommit={(value) => onChangeItems(editIds(item), () => ({ title: value || "(untitled event)" }))} className="font-medium text-stone-900 dark:text-stone-100" /></td>
          <td className="min-w-36 px-2 py-2"><div className="flex items-center gap-1"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: typeColor(item.type, typeColors) }} /><InlineInput label={`Type for ${item.title}`} value={item.type} onFocus={() => beginEdit(item)} onCommit={(value) => onChangeItems(editIds(item), () => ({ type: value.trim() || "unclassified" }))} className="capitalize" /></div></td>
          <td className="min-w-28 whitespace-nowrap px-2 py-2 text-stone-600 dark:text-stone-300"><InlineInput label={`Length in minutes for ${item.title}`} type="number" min="0" step="15" value={elapsedDurationMinutes(item, trip.timezone)?.toString() ?? ""} onFocus={() => beginEdit(item)} onCommit={(value) => onChangeItems(editIds(item), (candidate) => ({ endDateTime: candidate.startDateTime && value !== "" ? new Date(Date.parse(candidate.startDateTime) + Math.max(0, Number(value) || 0) * 60_000).toISOString() : null }))} /></td>
          <td className="min-w-28 whitespace-nowrap px-2 py-2 text-stone-600 dark:text-stone-300"><InlineInput label={`Cost for ${item.title}`} type="number" min="0" step="0.01" value={costAmount(item)?.toString() ?? ""} onFocus={() => beginEdit(item)} onCommit={(value) => onChangeItems(editIds(item), (candidate) => ({ cost: value === "" ? null : { ...((candidate.cost as object | null) ?? {}), amount: Math.max(0, Number(value) || 0), currency: (candidate.cost as { currency?: string } | null)?.currency || trip.defaultCurrency || "USD" } }))} /></td>
          <td className="min-w-64 px-2 py-2"><InlineInput label={`Tags for ${item.title}`} value={(item.tags ?? []).join(", ")} onFocus={() => beginEdit(item)} onCommit={(value) => onChangeItems(editIds(item), () => ({ tags: [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))] }))} /></td>
        </tr>)}</tbody>
        <tfoot className="sticky bottom-0 border-t bg-stone-50 text-sm dark:bg-neutral-950"><tr><td /><td colSpan={4} className="px-4 py-3 text-right font-semibold text-stone-700 dark:text-stone-200">{activeFilterCount ? "Filtered total" : "Total"}</td><td className="whitespace-nowrap px-4 py-3 font-semibold text-stone-900 dark:text-stone-100">{costTotals.length ? costTotals.map(([currency, amount]) => formatTotal(amount, currency)).join(" · ") : "—"}</td><td /></tr></tfoot>
      </table>
      {visibleItems.length === 0 && <div className="grid min-h-48 place-items-center p-6 text-center"><div><p className="text-sm font-medium">No matching trip items</p><p className="mt-1 text-xs text-muted-foreground">Try changing or clearing your filters.</p></div></div>}
    </div>
  </section>;
}
