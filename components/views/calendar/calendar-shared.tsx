"use client";

import { formatTripDate, startDateTimeFor } from "@/lib/date-utils";
import { typeColor } from "@/lib/type-color";
import type { TravelObject } from "@/types/travel";

/** Selected items take the single accent: a heavier ring on the primary selection. */
export function selectionRing(selected: boolean, primary: boolean) {
  return selected ? (primary ? "ring-2 ring-accent" : "ring-1 ring-accent") : "";
}

/** Transport legs are the tickets-in-hand items; the model has no explicit "booked" flag. */
export function isBookedItem(item: Pick<TravelObject, "type">) {
  return item.type === "flight" || item.type === "commute";
}

export function CalendarDragPreview({
  items,
  timezone,
  typeColors,
}: {
  items: TravelObject[];
  timezone: string;
  typeColors: Record<string, string>;
}) {
  return (
    <div className="w-64 space-y-1.5">
      {items.map((item) => {
        const start = startDateTimeFor(item, timezone);
        return (
          <article
            key={item.id}
            className="border-l-[3px] bg-surface px-3 py-2 text-xs shadow-[0_2px_10px_rgb(0_0_0/0.18)]"
            style={{ borderLeftColor: typeColor(item.type, typeColors) }}
          >
            <p className="truncate font-medium">{item.title}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
              {start
                ? formatTripDate(start, timezone, {
                    month: "short",
                    day: "numeric",
                    ...(item.isAllDay ? {} : { hour: "numeric", minute: "2-digit" }),
                  })
                : "Idea"}{" "}
              · {item.type}
            </p>
          </article>
        );
      })}
    </div>
  );
}
