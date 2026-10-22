"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Navigation } from "lucide-react";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { placeLabel } from "@/lib/place-label";
import type { LocationData, TravelObject } from "@/types/travel";
import { formatPlannedCost } from "./plan-domain";

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 8;

function safeMapsHref(location: LocationData | null | undefined, fallback: string) {
  if (location?.googleMapsUrl?.startsWith("https://") || location?.googleMapsUrl?.startsWith("http://"))
    return location.googleMapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location?.name || location?.address || fallback)}`;
}

/** Large mono start time in the Plan list: confirmed start, `~` derived time for flexible items, or a label. */
function timeLabel(item: TravelObject, flexibleTime?: string, anchor?: "start" | "end") {
  if (anchor) return { text: anchor === "start" ? "Start" : "End", flexible: false, small: true };
  if (item.isAllDay) return { text: "All day", flexible: false, small: true };
  if (item.startTime && item.endTime) return { text: item.startTime, flexible: false, small: false };
  if (flexibleTime) return { text: `~${flexibleTime}`, flexible: true, small: false };
  return { text: "Flexible", flexible: true, small: true };
}

/** Whether the item has anything Maps can open: a saved URL, a name or an address. */
function hasPlace(item: TravelObject) {
  const location = item.location;
  return Boolean(location && (location.googleMapsUrl || location.name?.trim() || location.address?.trim()));
}

type PhoneRowProps = {
  item: TravelObject;
  date: string;
  flexTime?: string;
  color: string;
  selected: boolean;
  primary: boolean;
  /** A hotel pinned to the start (last night's) or end (tonight's) of the day. */
  anchor?: "start" | "end";
  /** Today's current or next stop during the trip: "now" / "next ~17:00" and its leave-by line. */
  markLabel?: string;
  markLeave?: string;
  onInspect: (item: TravelObject) => void;
  /** Long-press / context menu / Shift+F10: open the row's action sheet. */
  onActions: (item: TravelObject, date: string, anchor: "start" | "end" | undefined, trigger: HTMLElement) => void;
};

/** Compact two-line phone row: time, type dot, title over one muted meta line, navigate button. */
export function PhoneJourneyRow({
  item,
  date,
  flexTime,
  color,
  selected,
  primary,
  anchor,
  markLabel,
  markLeave,
  onInspect,
  onActions,
}: PhoneRowProps) {
  const time = timeLabel(item, flexTime, anchor);
  const place = placeLabel(item);
  const cost = item.cost?.amount != null ? formatPlannedCost(item.cost.amount, item.cost.currency) : null;
  const located = hasPlace(item);
  const meta: ReactNode[] = [
    markLabel ? <span className="font-medium text-accent">{markLabel}</span> : null,
    markLeave ? <span className="font-medium text-foreground">{markLeave}</span> : null,
    place ?? item.type.charAt(0).toUpperCase() + item.type.slice(1),
    item.startTime && item.endTime && !item.isAllDay ? `until ${item.endTime}` : null,
    cost,
  ].filter(Boolean);
  if (!located) meta.push(<span className="text-accent">No location</span>);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const longPressed = useRef(false);
  const openActions = () => {
    if (buttonRef.current) onActions(item, date, anchor, buttonRef.current);
  };
  function cancelPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  useEffect(() => cancelPress, []);
  return (
    <article
      id={`plan-row-${item.id}-${date}${anchor === "end" ? "-end" : ""}`}
      className={`relative flex min-h-[52px] items-stretch border-b border-divider bg-background select-none [-webkit-touch-callout:none] ${selected && !primary ? "ring-1 ring-inset ring-accent" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        data-item-content
        aria-haspopup="dialog"
        aria-keyshortcuts="Shift+F10 ContextMenu"
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onInspect(item);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          longPressed.current = false;
          cancelPress();
          press.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
              press.current = null;
              longPressed.current = true;
              openActions();
            }, LONG_PRESS_MS),
          };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) cancelPress();
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(event) => {
          event.preventDefault();
          cancelPress();
          longPressed.current = true;
          openActions();
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            openActions();
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left select-none [-webkit-touch-callout:none]"
      >
        <span
          className={`min-w-10 shrink-0 font-mono tracking-tighter ${time.small ? "max-w-10 text-[11px] leading-tight" : "text-[13px]"} ${primary ? "text-accent" : time.flexible ? "text-muted" : ""}`}
        >
          {time.flexible && !time.small ? (
            <>
              <span className="sr-only">Approximately </span>
              {time.text}
            </>
          ) : (
            time.text
          )}
        </span>
        <span aria-hidden className="size-2 shrink-0" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-tight font-medium break-words">{item.title}</span>
          <span className="mt-0.5 block truncate text-xs leading-tight text-muted">
            {meta.map((part, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {part}
              </span>
            ))}
          </span>
        </span>
      </button>
      {located && (
        <a
          href={safeMapsHref(item.location, item.title)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.title} in Maps`}
          className="grid size-11 shrink-0 place-items-center self-center text-muted outline-none hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <Navigation aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
        </a>
      )}
    </article>
  );
}

/** Builds the sheet in its own render, so the (ref-using) action callbacks are only called from handlers. */
export function SheetHost({
  build,
  triggerRef,
  onClose,
}: {
  build: () => { title: string; actions: SheetAction[] } | null;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: (restoreFocus: boolean) => void;
}) {
  const view = build();
  if (!view) return null;
  return <ActionSheet title={view.title} actions={view.actions} triggerRef={triggerRef} onClose={onClose} />;
}
