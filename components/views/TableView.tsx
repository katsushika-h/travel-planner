"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { shiftDate } from "@/lib/date-utils";
import {
  allDayCalendarDays,
  elapsedDurationMinutes,
  endForAllDayCalendarDays,
  endForElapsedDuration,
  scheduleAtTableStart,
  schedulePatchForMove,
} from "@/lib/schedule-domain";
import { formatExpenseAmount } from "@/lib/expense-domain";
import { shortDayLabel } from "@/components/views/KanbanView";
import { typeColor } from "@/lib/type-color";
import type { TravelObject, Trip, UpdateTravelObjectInput } from "@/types/travel";

const defaultTypes = ["unclassified", "flight", "hotel", "food", "commute", "activity", "sightseeing"];

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

function lengthSortMinutes(item: TravelObject, timeZone: string) {
  const allDayDays = allDayCalendarDays(item);
  return allDayDays === null ? elapsedDurationMinutes(item, timeZone) : allDayDays * 1440;
}

type Column = { key: SortKey | null; label: string; align?: "right" };
const columns: Column[] = [
  { key: "startDate", label: "Day" },
  { key: null, label: "Start" },
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: null, label: "Place" },
  { key: "duration", label: "Length" },
  { key: "cost", label: "Planned", align: "right" },
  { key: "tags", label: "Tags" },
];

function placeName(item: TravelObject) {
  return (item.location as { name?: string } | null)?.name ?? "";
}

function InlineInput({
  value,
  label,
  type = "text",
  min,
  step,
  onFocus,
  onCommit,
  className = "",
}: {
  value: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local";
  min?: string;
  step?: string;
  onFocus: () => void;
  onCommit: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      key={value}
      aria-label={label}
      type={type}
      min={min}
      step={step}
      defaultValue={value}
      onFocus={onFocus}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      className={`w-full border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-input-rule focus:border-foreground ${className}`}
    />
  );
}

export function TableView({
  trip,
  items,
  typeColors,
  selectedIds,
  primarySelectedId,
  onSelect,
  onInspect,
  onSelectionChange,
  onChangeItems,
  onDeleteSelected,
}: {
  trip: Trip;
  items: TravelObject[];
  typeColors: Record<string, string>;
  selectedIds: ReadonlySet<string>;
  primarySelectedId: string | null;
  onSelect: (item: TravelObject, additive?: boolean) => void;
  onInspect: (item: TravelObject) => void;
  onSelectionChange: (ids: Iterable<string>, primaryId?: string | null) => void;
  onChangeItems: (
    ids: string[],
    patchForItem: (item: TravelObject) => UpdateTravelObjectInput,
    immediate?: boolean,
  ) => void;
  onDeleteSelected?: (ids: string[]) => void;
}) {
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
  const tags = useMemo(
    () => [...new Set(items.flatMap((item) => item.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const activeFilterCount = Number(Boolean(titleQuery.trim())) + selectedTypes.length + selectedTags.length;

  const visibleItems = useMemo(() => {
    const query = titleQuery.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        if (query && !`${item.title}\n${placeName(item)}\n${item.type}`.toLocaleLowerCase().includes(query))
          return false;
        if (selectedTypes.length && !selectedTypes.includes(item.type)) return false;
        if (selectedTags.length && !selectedTags.some((tag) => item.tags?.includes(tag))) return false;
        return true;
      })
      .sort((a, b) => {
        let result = 0;
        switch (sortKey) {
          case "startDate":
            result = compareNullable(
              a.date ? `${a.date.slice(0, 10)}T${a.startTime ?? "00:00"}` : null,
              b.date ? `${b.date.slice(0, 10)}T${b.startTime ?? "00:00"}` : null,
              (left, right) => left.localeCompare(right),
            );
            break;
          case "title":
            result = a.title.localeCompare(b.title);
            break;
          case "type":
            result = a.type.localeCompare(b.type);
            break;
          case "duration":
            result = compareNullable(
              lengthSortMinutes(a, trip.timezone),
              lengthSortMinutes(b, trip.timezone),
              (left, right) => left - right,
            );
            break;
          case "cost":
            result = compareNullable(costAmount(a), costAmount(b), (left, right) => left - right);
            break;
          case "tags":
            result = (a.tags ?? []).join(", ").localeCompare((b.tags ?? []).join(", "));
            break;
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
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);
  useEffect(() => {
    function selectAll(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a" || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      event.preventDefault();
      onSelectionChange(
        visibleItems.map((item) => item.id),
        visibleItems[0]?.id ?? null,
      );
    }
    window.addEventListener("keydown", selectAll);
    return () => window.removeEventListener("keydown", selectAll);
  }, [onSelectionChange, visibleItems]);

  const formatTotal = formatExpenseAmount;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggleSelection(value: string, selected: string[], setSelected: (next: string[]) => void) {
    setSelected(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  }

  function clearFilters() {
    setTitleQuery("");
    setSelectedTypes([]);
    setSelectedTags([]);
  }

  function editIds(item: TravelObject) {
    return selectedIds.has(item.id) ? [...selectedIds] : [item.id];
  }
  function beginEdit(item: TravelObject) {
    if (!selectedIds.has(item.id)) onSelect(item);
  }
  function localStart(item: TravelObject) {
    if (!item.date) return "";
    const date = item.date.slice(0, 10);
    return item.startTime ? `${date}T${item.startTime}` : date;
  }
  function commitStart(item: TravelObject, value: string) {
    onChangeItems(editIds(item), (candidate) => {
      if (!value) return { date: null, endDate: null, placementTime: null, dayOrder: null };
      const [date, time] = value.split("T");
      return scheduleAtTableStart(candidate, date, time ?? candidate.startTime ?? "", trip.timezone);
    });
  }
  function commitDuration(item: TravelObject, value: string) {
    if (value === "") return;
    const patches = new Map<string, UpdateTravelObjectInput>();
    for (const id of editIds(item)) {
      const candidate = items.find((entry) => entry.id === id);
      if (!candidate || candidate.isAllDay !== item.isAllDay) continue;
      const end = candidate.isAllDay
        ? endForAllDayCalendarDays(candidate, Number(value))
        : endForElapsedDuration(candidate, Number(value), trip.timezone);
      if (!end) continue;
      patches.set(id, end);
    }
    if (patches.size) onChangeItems([...patches.keys()], (candidate) => patches.get(candidate.id)!);
  }
  function toggleAllVisible() {
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    const next = allVisibleSelected
      ? [...selectedIds].filter((id) => !visibleIds.has(id))
      : [...new Set([...selectedIds, ...visibleIds])];
    onSelectionChange(
      next,
      allVisibleSelected && primarySelectedId && visibleIds.has(primarySelectedId)
        ? (next[0] ?? null)
        : (primarySelectedId ?? next[0] ?? null),
    );
  }

  const selectedList = items.filter((item) => selectedIds.has(item.id));
  const selectedItemIds = selectedList.map((item) => item.id);
  const bulkTypes = [...new Set([...defaultTypes, ...types])];
  const tripDays: string[] = [];
  for (
    let day = trip.startDate.slice(0, 10);
    day <= trip.endDate.slice(0, 10) && tripDays.length < 366;
    day = shiftDate(day, 1)
  )
    tripDays.push(day);
  function bulkChangeType(type: string) {
    if (type) onChangeItems(selectedItemIds, () => ({ type }));
  }
  function bulkMoveToDay(date: string) {
    if (!date) return;
    onChangeItems(selectedItemIds, (candidate) => schedulePatchForMove(candidate, date) ?? {});
  }
  function bulkUnschedule() {
    onChangeItems(selectedItemIds, () => ({
      date: null,
      endDate: null,
      placementTime: null,
      isAllDay: false,
      dayOrder: null,
    }));
  }
  const bulkSelectClass =
    "max-w-40 cursor-pointer appearance-none border-0 bg-transparent py-1 pr-0 text-sm outline-none hover:text-muted focus-visible:underline";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Trip items table">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-6 sm:px-12">
        <h1 className="text-[22px] font-medium tracking-tight">
          All items{" "}
          <span className="font-mono text-[15px] font-normal text-muted">
            {activeFilterCount ? `${visibleItems.length} of ${items.length}` : items.length}
          </span>
        </h1>
        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto" ref={filterRef}>
          <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-input-rule py-2 focus-within:border-foreground sm:w-80 sm:flex-none">
            <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              aria-label="Filter by title, place or type"
              value={titleQuery}
              onChange={(event) => setTitleQuery(event.target.value)}
              placeholder="Filter by title, place or type"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </label>
          <div className="relative">
            <button
              type="button"
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
              onClick={() => setFilterOpen((open) => !open)}
              className={`py-2 text-sm hover:text-foreground ${selectedTypes.length + selectedTags.length ? "text-accent" : "text-muted"}`}
            >
              Types &amp; tags
              {selectedTypes.length + selectedTags.length > 0 && (
                <span className="ml-1.5 font-mono text-xs">{selectedTypes.length + selectedTags.length}</span>
              )}
            </button>
            {filterOpen && (
              <div
                role="dialog"
                aria-label="Filter trip items"
                className="absolute right-0 top-full z-30 mt-2 max-h-[min(70vh,520px)] w-[min(340px,88vw)] overflow-y-auto border border-foreground bg-panel p-4 shadow-md"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-medium">Filter items</h2>
                  <button type="button" onClick={clearFilters} className="text-xs text-muted hover:text-foreground">
                    Clear all
                  </button>
                </div>
                <fieldset className="mb-4">
                  <legend className="mb-2 text-xs text-muted">Type</legend>
                  <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">
                    {types.map((type) => (
                      <label key={type} className="flex min-w-0 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(type)}
                          onChange={() => toggleSelection(type, selectedTypes, setSelectedTypes)}
                          className="accent-foreground"
                        />
                        <span className="truncate capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                  {types.length === 0 && <p className="text-xs text-muted">No types yet</p>}
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs text-muted">Tag</legend>
                  <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto">
                    {tags.map((tag) => (
                      <label key={tag} className="flex min-w-0 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag)}
                          onChange={() => toggleSelection(tag, selectedTags, setSelectedTags)}
                          className="accent-foreground"
                        />
                        <span className="truncate">{tag}</span>
                      </label>
                    ))}
                  </div>
                  {tags.length === 0 && <p className="text-xs text-muted">No tags yet</p>}
                </fieldset>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="border border-foreground px-3 py-1.5 text-sm hover:bg-foreground hover:text-background"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="mx-4 flex min-h-0 min-w-0 flex-1 flex-col border-t border-foreground sm:mx-12">
        {selectedList.length > 0 && (
          <div
            role="toolbar"
            aria-label="Actions for selected items"
            className="flex flex-wrap items-center gap-x-7 gap-y-1 border-b border-divider py-2.5 text-sm"
          >
            <span className="font-medium">{selectedList.length} selected</span>
            <select
              aria-label="Change type of selected items"
              value=""
              onChange={(event) => bulkChangeType(event.target.value)}
              className={bulkSelectClass}
            >
              <option value="">Change type</option>
              {bulkTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <select
              aria-label="Move selected items to day"
              value=""
              onChange={(event) => bulkMoveToDay(event.target.value)}
              className={bulkSelectClass}
            >
              <option value="">Move to day</option>
              {tripDays.map((day) => (
                <option key={day} value={day}>
                  {shortDayLabel(day)}
                </option>
              ))}
            </select>
            <button type="button" onClick={bulkUnschedule} className="py-1 hover:text-muted">
              Unschedule
            </button>
            {onDeleteSelected && (
              <button
                type="button"
                onClick={() => onDeleteSelected(selectedItemIds)}
                className="py-1 text-danger hover:underline"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectionChange([], null)}
              className="ml-auto py-1 text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-background text-xs text-muted">
              <tr>
                <th scope="col" className="w-8 border-b border-divider py-3 pl-1.5 pr-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all filtered rows"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="size-4 accent-foreground"
                  />
                </th>
                {columns.map(({ key, label, align }) => (
                  <th
                    key={label}
                    scope="col"
                    aria-sort={
                      key && sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={`border-b border-divider px-2 py-3 font-normal ${align === "right" ? "text-right" : ""}`}
                  >
                    {key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={`inline-flex items-center gap-1.5 hover:text-foreground ${sortKey === key ? "text-foreground" : ""}`}
                      >
                        {label}
                        {sortKey === key && (sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {visibleItems.map((item, index) => {
                const day = item.date ? item.date.slice(0, 10) : null;
                const showDay = day === null || day !== (visibleItems[index - 1]?.date?.slice(0, 10) ?? null);
                const selected = selectedIds.has(item.id);
                const currency = (item.cost as { currency?: string } | null)?.currency;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-surface ${selected ? "bg-surface-selected" : ""}`}
                  >
                    <td
                      className={`py-1.5 pl-1.5 pr-2 ${primarySelectedId === item.id && selected ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={selected}
                        onChange={() => onSelect(item, true)}
                        className="size-4 accent-foreground"
                      />
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1.5 font-mono text-[13px] ${day ? "" : "text-accent"}`}>
                      {showDay ? (day ? shortDayLabel(day) : "Idea") : ""}
                    </td>
                    <td className="min-w-52 whitespace-nowrap px-1 py-1.5">
                      <InlineInput
                        label={`Start date for ${item.title}`}
                        type={!item.date || item.startTime ? "datetime-local" : "date"}
                        value={localStart(item)}
                        onFocus={() => beginEdit(item)}
                        onCommit={(value) => commitStart(item, value)}
                        className="font-mono text-[13px]"
                      />
                    </td>
                    <td className="min-w-52 max-w-[320px] px-1 py-1.5">
                      <InlineInput
                        label={`Title for ${item.title}`}
                        value={item.title}
                        onFocus={() => onInspect(item)}
                        onCommit={(value) =>
                          onChangeItems(editIds(item), () => ({ title: value || "(untitled event)" }))
                        }
                        className="font-medium"
                      />
                    </td>
                    <td className="min-w-36 px-1 py-1.5">
                      <div className="flex items-center gap-1 pl-1">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: typeColor(item.type, typeColors) }}
                        />
                        <InlineInput
                          label={`Type for ${item.title}`}
                          value={item.type}
                          onFocus={() => beginEdit(item)}
                          onCommit={(value) =>
                            onChangeItems(editIds(item), () => ({ type: value.trim() || "unclassified" }))
                          }
                          className="capitalize text-muted"
                        />
                      </div>
                    </td>
                    <td className="max-w-48 truncate px-2 py-1.5 text-muted" title={placeName(item)}>
                      {placeName(item)}
                    </td>
                    <td className="min-w-28 whitespace-nowrap px-1 py-1.5">
                      <div className="flex items-center gap-1">
                        <InlineInput
                          label={`Length in ${item.isAllDay ? "days" : "minutes"} for ${item.title}`}
                          type="number"
                          min={item.isAllDay ? "1" : "0"}
                          step={item.isAllDay ? "1" : "15"}
                          value={
                            (item.isAllDay
                              ? allDayCalendarDays(item)
                              : elapsedDurationMinutes(item, trip.timezone)
                            )?.toString() ?? ""
                          }
                          onFocus={() => beginEdit(item)}
                          onCommit={(value) => commitDuration(item, value)}
                          className="font-mono text-[13px]"
                        />
                        {item.isAllDay && (
                          <span className="pr-1 text-xs text-muted">
                            {allDayCalendarDays(item) === 1 ? "day" : "days"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-32 whitespace-nowrap px-1 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {currency && costAmount(item) != null && (
                          <span className="font-mono text-xs text-faint">{currency}</span>
                        )}
                        <InlineInput
                          label={`Cost for ${item.title}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={costAmount(item)?.toString() ?? ""}
                          onFocus={() => beginEdit(item)}
                          onCommit={(value) =>
                            onChangeItems(editIds(item), (candidate) => ({
                              cost:
                                value === ""
                                  ? null
                                  : {
                                      ...((candidate.cost as object | null) ?? {}),
                                      amount: Math.max(0, Number(value) || 0),
                                      currency:
                                        (candidate.cost as { currency?: string } | null)?.currency ||
                                        trip.defaultCurrency ||
                                        "USD",
                                    },
                            }))
                          }
                          className="w-24 text-right font-mono text-[13px]"
                        />
                      </div>
                    </td>
                    <td className="min-w-56 px-1 py-1.5">
                      <InlineInput
                        label={`Tags for ${item.title}`}
                        value={(item.tags ?? []).join(", ")}
                        onFocus={() => beginEdit(item)}
                        onCommit={(value) =>
                          onChangeItems(editIds(item), () => ({
                            tags: [
                              ...new Set(
                                value
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                              ),
                            ],
                          }))
                        }
                        className="text-muted"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-background">
              <tr className="border-t border-foreground align-top">
                <td />
                <td colSpan={6} className="px-2 py-3.5 text-[13px] text-muted">
                  {activeFilterCount ? "Filtered planned total" : "Planned total"} · per currency, actual spend lives in
                  Spend
                </td>
                <td className="whitespace-nowrap px-2 py-3.5 text-right font-mono font-medium">
                  {costTotals.length
                    ? costTotals.map(([currency, amount]) => <div key={currency}>{formatTotal(amount, currency)}</div>)
                    : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          {visibleItems.length === 0 && (
            <div className="grid min-h-48 place-items-center p-6 text-center">
              <div>
                <p className="text-sm font-medium">No matching trip items</p>
                <p className="mt-1 text-xs text-muted">Try changing or clearing your filters.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
