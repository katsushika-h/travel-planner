"use client";

import { formatTripDate, startDateTimeFor } from "@/lib/date-utils";
import { typeColor } from "@/lib/type-color";
import type { TravelObject } from "@/types/travel";

export function selectionRing(selected: boolean, primary: boolean) {
  return selected
    ? primary
      ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-600"
      : "ring-2 ring-emerald-600"
    : "";
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
            className="rounded-lg border border-l-4 bg-background px-3 py-2 text-xs shadow-xl"
            style={{ borderLeftColor: typeColor(item.type, typeColors) }}
          >
            <p className="truncate font-semibold">{item.title}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
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
