"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Car, Check, Footprints } from "lucide-react";
import { useNow } from "@/components/layout/useNow";
import { dateParts, formatTripDate } from "@/lib/date-utils";
import { occursOnItineraryDate } from "@/lib/schedule-domain";
import { compareScheduleOrder } from "@/lib/schedule-order";
import { leaveBy, legTravel, todayDate, todayTimeline, type TodayStop } from "@/lib/today";
import { dayRouteStops, formatDuration } from "@/lib/travel-legs";
import { typeColor } from "@/lib/type-color";
import { useTravelStore } from "@/store/use-travel-store";
import type { TravelObject, Trip } from "@/types/travel";
import { safeMapsHref, stopMeta, tripDays } from "./plan/plan-domain";
import { useDayRoutes } from "./plan/useDayRoutes";

const actionClass =
  "flex min-h-11 flex-1 basis-28 items-center justify-center border border-divider px-3 text-sm text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground";

function Stripe({ color }: { color: string }) {
  return <span aria-hidden="true" className="absolute inset-y-0 -left-3 w-[3px]" style={{ backgroundColor: color }} />;
}

function timeText(stop: TodayStop) {
  return stop.time ? `${stop.approximate ? "~" : ""}${stop.time}` : "Flexible";
}

/**
 * The phone's screen during a trip: the next stop with when to leave, the rest of today's stops and tonight's hotel.
 * Done is derived from the clock (see `todayTimeline`); nothing here is saved.
 */
export function TodayView({
  trip,
  items,
  typeColors,
  onInspect,
  onCreateNote,
  onSaveNote,
  onLogExpense,
  onOpenMap,
  onOpenFullItinerary,
}: {
  trip: Trip;
  /** Every item of the trip; Today picks out the stops, hotel and notes target for the current day. */
  items: TravelObject[];
  typeColors: Record<string, string>;
  onInspect: (item: TravelObject) => void;
  onCreateNote: (date: string, order: number) => Promise<string | undefined>;
  onSaveNote: (id: string, data: { title: string; noteBody: string }) => Promise<void>;
  /** Opens the expense form linked to the item, or unlinked for null. */
  onLogExpense: (item: TravelObject | null) => void;
  onOpenMap: () => void;
  onOpenFullItinerary: () => void;
}) {
  const now = useNow();
  const date = todayDate(trip, now);
  const clock = dateParts(now, trip.timezone).time;
  const dayItems = useMemo(
    () => items.filter((item) => occursOnItineraryDate(item, date)).sort(compareScheduleOrder),
    [items, date],
  );
  const timeline = useMemo(
    () => todayTimeline(items, date, now, trip.timezone),
    // The clock only matters to the minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, date, clock, trip.timezone],
  );
  const { evening, stops: routeStops } = useMemo(() => dayRouteStops(dayItems, date), [dayItems, date]);
  const mode = useTravelStore((state) => state.travelModeByTrip[trip.id] ?? "walk");
  const overrides = useTravelStore((state) => state.legOverridesByTrip[trip.id]);
  // The same routed-legs fetch Plan uses, so the leg time here matches the Plan view.
  const { legs } = useDayRoutes(routeStops, mode, overrides);

  const { past, next, upcoming } = timeline;
  const stops = [...past, ...(next ? [next] : []), ...upcoming];
  const nextLeg = next ? legs.find((leg) => leg.toId === next.item.id) : undefined;
  const travel = legTravel(nextLeg);
  const leave = next && travel && !travel.estimated ? leaveBy(next, travel.seconds) : null;
  const leaveNow = leave !== null && leave <= clock;
  const days = tripDays(trip.startDate, trip.endDate);
  const dayNumber = days.indexOf(date) + 1;
  const lastDay = date === trip.endDate.slice(0, 10);
  const weekday = formatTripDate(`${date}T12:00:00Z`, "UTC", { weekday: "long", month: "long", day: "numeric" });
  const mapsHref = next ? safeMapsHref(next.item.location) : null;
  const parking = next?.item.location?.parking;
  const TravelIcon = nextLeg?.mode === "drive" ? Car : Footprints;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = noteText.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    setNoteError("");
    try {
      const id = await onCreateNote(date, dayItems.length);
      if (!id) throw new Error("Could not add the note.");
      await onSaveNote(id, { title: "Note", noteBody: body });
      setNoteText("");
      setNoteOpen(false);
    } catch (cause) {
      setNoteError(cause instanceof Error ? cause.message : "Could not add the note.");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8">
      <header className="pt-4">
        <h1 className="text-xl font-medium tracking-tight">{weekday}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {dayNumber > 0 ? `Day ${dayNumber} of ${days.length}` : trip.title}
          {lastDay ? " · Last day" : ""}
        </p>
      </header>

      {next ? (
        <section aria-label="Next stop" className="mt-5 border-t border-foreground pt-4">
          <p className="text-xs text-muted">{next.inProgress ? "Now" : "Next"}</p>
          <button
            type="button"
            onClick={() => onInspect(next.item)}
            className="relative mt-1 block w-full text-left focus-visible:outline-2 focus-visible:outline-foreground"
          >
            <Stripe color={typeColor(next.item.type, typeColors)} />
            <span
              className={`block font-mono text-4xl font-light tracking-tight ${next.confirmed ? "text-foreground" : "text-muted"}`}
            >
              {timeText(next)}
            </span>
            <span className="mt-2 block text-lg font-medium tracking-tight">{next.item.title}</span>
            <span className="mt-0.5 block text-[13px] text-muted">{stopMeta(next.item)}</span>
          </button>
          <div className="mt-3 space-y-1 text-[13px] text-muted">
            {leave && !next.inProgress && (
              <p className="text-base text-foreground">
                {leaveNow ? "Leave now" : "Leave by"}{" "}
                {!leaveNow && <span className="font-mono text-xl font-light">{leave}</span>}
              </p>
            )}
            {travel && (
              <p className="flex items-center gap-1.5">
                <TravelIcon aria-hidden="true" className="size-3.5 shrink-0" />
                <span>
                  {travel.estimated ? "~" : ""}
                  {formatDuration(travel.seconds)} {nextLeg?.mode === "drive" ? "by car" : "walking"}
                </span>
              </p>
            )}
            {parking && (
              <p>Parking: {parking.name?.trim() || `${parking.lat.toFixed(4)}, ${parking.lng.toFixed(4)}`}</p>
            )}
          </div>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex min-h-11 items-center justify-center bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Directions
            </a>
          )}
        </section>
      ) : (
        <section aria-label="Next stop" className="mt-5 border-t border-foreground py-8">
          {stops.length === 0 ? (
            <>
              <p className="text-base font-medium">Nothing planned today</p>
              <p className="mt-1 text-sm text-muted">Add a stop in the full itinerary, or enjoy the free day.</p>
            </>
          ) : lastDay ? (
            <>
              <p className="text-base font-medium">That&apos;s the last stop of the trip</p>
              <p className="mt-1 text-sm text-muted">Everything planned for the last day is done.</p>
            </>
          ) : (
            <>
              <p className="text-base font-medium">Done for today</p>
              <p className="mt-1 text-sm text-muted">Nothing left on today&apos;s plan.</p>
            </>
          )}
        </section>
      )}

      {stops.length > 0 && (
        <section aria-label="Rest of today" className="mt-8">
          <h2 className="text-xs text-muted">Rest of today</h2>
          <ol className="mt-2 border-t border-foreground">
            {stops.map((stop) => (
              <li key={stop.item.id} className="border-b border-divider">
                <button
                  type="button"
                  onClick={() => onInspect(stop.item)}
                  aria-current={stop === next ? "step" : undefined}
                  className={`relative grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-foreground ${stop.done ? "opacity-50" : ""}`}
                >
                  <Stripe color={typeColor(stop.item.type, typeColors)} />
                  <span
                    className={`font-mono text-base font-light tracking-tight ${stop.confirmed ? "text-foreground" : "text-muted"}`}
                  >
                    {timeText(stop)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={`truncate text-[15px] font-medium ${stop.done ? "line-through" : ""}`}>
                      {stop.item.title}
                    </span>
                    <span className="truncate text-xs text-muted">{stopMeta(stop.item)}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {stop.done ? (
                      <>
                        <Check aria-hidden="true" className="size-4" />
                        <span className="sr-only">Done</span>
                      </>
                    ) : stop === next ? (
                      next.inProgress ? (
                        "Now"
                      ) : (
                        "Next"
                      )
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {evening && (
        <section aria-label="Tonight" className="mt-8">
          <h2 className="text-xs text-muted">Tonight</h2>
          <button
            type="button"
            onClick={() => onInspect(evening)}
            className="relative mt-2 block w-full border-t border-foreground py-3.5 text-left focus-visible:outline-2 focus-visible:outline-foreground"
          >
            <Stripe color={typeColor(evening.type, typeColors)} />
            <span className="block text-[15px] font-medium">{evening.title}</span>
            {evening.location?.address && (
              <span className="block truncate text-xs text-muted">{evening.location.address}</span>
            )}
          </button>
        </section>
      )}

      <section aria-label="Quick actions" className="mt-8">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onLogExpense(next?.item ?? null)} className={actionClass}>
            Log expense
          </button>
          <button
            type="button"
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen((open) => !open)}
            className={actionClass}
          >
            Add note
          </button>
          <button type="button" onClick={onOpenMap} className={actionClass}>
            Map
          </button>
        </div>
        {noteOpen && (
          <form onSubmit={(event) => void saveNote(event)} className="mt-3 flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="today-note">
              Note for today
            </label>
            <textarea
              id="today-note"
              rows={3}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              className="block w-full rounded-none border border-divider bg-transparent p-2 text-sm text-foreground outline-none placeholder:text-faint focus:border-foreground"
              placeholder="Table for two at 8"
            />
            {noteError && (
              <p role="alert" className="text-sm text-danger">
                {noteError}
              </p>
            )}
            <button
              type="submit"
              disabled={noteBusy || !noteText.trim()}
              className="flex min-h-11 items-center justify-center bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
            >
              {noteBusy ? "Saving…" : "Save note"}
            </button>
          </form>
        )}
      </section>

      <button
        type="button"
        onClick={onOpenFullItinerary}
        className="mt-6 flex min-h-11 items-center self-start text-sm text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
      >
        Full itinerary
      </button>
    </div>
  );
}
