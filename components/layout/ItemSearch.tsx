"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { itemScheduleLabel } from "@/lib/schedule-domain";
import type { TravelObject } from "@/types/travel";

const RESULT_LIMIT = 30;

function itemMeta(item: TravelObject) {
  const date = item.date
    ? new Date(`${item.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "Idea";
  return [date, itemScheduleLabel(item, item.date ? "Flexible" : null), item.type, item.location?.name]
    .filter(Boolean)
    .join(" · ");
}

/** Find an itinerary item by title, place, type, tag or notes and open it in the item editor. */
export function ItemSearch({
  items,
  onClose,
  onPick,
}: {
  items: TravelObject[];
  onClose: () => void;
  onPick: (item: TravelObject) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useModalFocus(true, dialogRef);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? items.filter((item) => {
          const haystack = [
            item.title,
            item.type,
            item.location?.name,
            item.location?.address,
            item.notes,
            ...(item.tags ?? []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return terms.every((term) => haystack.includes(term));
        })
      : items;
    return matches.slice(0, RESULT_LIMIT);
  }, [items, query]);
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-[12vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search items"
        className="flex max-h-[min(36rem,calc(100dvh_-_2rem))] w-full max-w-xl flex-col border-t border-foreground bg-panel text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)]"
      >
        <div className="flex items-center gap-3 border-b border-divider px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            placeholder="Search stops, places, tags"
            aria-label="Search items"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={results.length ? listId : undefined}
            aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!results.length) return;
                setActiveIndex((active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                onPick(results[active]);
              }
            }}
            className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="grid size-11 shrink-0 place-items-center text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-9"
          >
            <X className="size-4" />
          </button>
        </div>
        {results.length ? (
          <ul id={listId} role="listbox" aria-label="Matching items" className="min-h-0 flex-1 overflow-y-auto py-1">
            {results.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => onPick(item)}
                className={`flex cursor-pointer flex-col gap-0.5 border-b border-divider px-4 py-2.5 last:border-b-0 ${index === active ? "bg-surface" : ""}`}
              >
                <span className="truncate text-sm font-medium">{item.title || "Untitled item"}</span>
                <span className="truncate text-xs text-muted">{itemMeta(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No items match “{query.trim()}”.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
