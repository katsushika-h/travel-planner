"use client";

import { useDroppable } from "@dnd-kit/core";
import { useEffect, useRef } from "react";
import { formatTripDate } from "@/lib/date-utils";

function DayButton({
  date,
  active,
  today,
  month,
  dayNumber,
  pill,
  onPick,
}: {
  date: string;
  active: boolean;
  today: boolean;
  month: string | null;
  dayNumber: number;
  pill: boolean;
  onPick: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${date}`, disabled: pill });
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  const weekday = formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "short" });
  const full = formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "long", month: "long", day: "numeric" });
  if (pill)
    return (
      <button
        type="button"
        ref={(node) => {
          ref.current = node;
        }}
        aria-pressed={active}
        aria-label={today ? `${full}, today` : full}
        onClick={() => onPick(date)}
        className={`flex min-h-11 shrink-0 items-center px-1 outline-none focus-visible:outline-2 focus-visible:outline-foreground`}
      >
        <span
          className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap ${active ? "border-ink bg-ink text-background" : today ? "border-accent text-accent" : "border-divider text-muted"}`}
        >
          <span className="font-mono">{dayNumber}</span>
          <span>{weekday}</span>
          <span className="font-mono">{Number(date.slice(8, 10))}</span>
        </span>
      </button>
    );
  return (
    <button
      type="button"
      ref={(node) => {
        ref.current = node;
        setNodeRef(node);
      }}
      aria-pressed={active}
      aria-label={today ? `${full}, today` : full}
      onClick={() => onPick(date)}
      className={`flex min-h-11 w-[52px] shrink-0 flex-col items-center gap-1 pb-2.5 pt-1.5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground ${active ? "shadow-[inset_0_-2px_0_var(--ink)]" : ""} ${isOver ? "bg-surface shadow-[inset_0_-2px_0_var(--accent)]" : ""}`}
    >
      <span aria-hidden="true" className="h-3 text-[11px] leading-3 text-faint">
        {month}
      </span>
      <span className={`text-[11px] leading-none ${today ? "text-accent" : "text-muted"}`}>{weekday}</span>
      <span
        className={`font-mono text-xl font-light leading-none ${active ? "text-foreground" : today ? "text-accent" : "text-faint"}`}
      >
        {date.slice(8, 10)}
      </span>
    </button>
  );
}

/** One button per trip day; also a drop target that moves a dragged stop onto that day. */
export function DayStrip({
  days,
  activeDate,
  today,
  variant = "tabs",
  onPick,
}: {
  days: string[];
  activeDate: string;
  today: string;
  /** "pills" is the compact phone strip; it is not a drop target. */
  variant?: "tabs" | "pills";
  onPick: (date: string) => void;
}) {
  const multiMonth = days.some((date) => date.slice(0, 7) !== days[0].slice(0, 7));
  return (
    <div
      role="group"
      aria-label="Trip days"
      className={`flex max-w-full overflow-x-auto ${variant === "pills" ? "" : "gap-1"} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {days.map((date, index) => {
        const startsMonth = multiMonth && (index === 0 || date.endsWith("-01"));
        return (
          <DayButton
            key={date}
            date={date}
            active={date === activeDate}
            today={date === today}
            dayNumber={index + 1}
            pill={variant === "pills"}
            month={startsMonth ? formatTripDate(`${date}T12:00:00Z`, "UTC", { month: "short" }) : null}
            onPick={onPick}
          />
        );
      })}
    </div>
  );
}
