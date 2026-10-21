import { formatPlannedCost, plannedTotals, safeMapsHref, tripDays } from "../components/views/plan/plan-domain.ts";
import { hasMapCoordinates } from "./map-coordinates.ts";
import { markdownToPlainText } from "./text-utils.ts";
import { placeLabel } from "./place-label.ts";
import { itemScheduleLabel, occursOnItineraryDate, scheduleKind } from "./schedule-domain.ts";
import { sortDayDisplayItems } from "./schedule-order.ts";
import { dayRouteStops } from "./travel-legs.ts";
import type { TravelObject, Trip } from "../types/travel.ts";

export interface PrintItem {
  id: string;
  title: string;
  type: string;
  time: string;
  /** Shown again on a later day of a multi-day item; printed as one muted line. */
  continued: boolean;
  /** Extra time detail, e.g. "until 10-05 11:00" or "through 10-06". */
  until: string | null;
  place: string | null;
  address: string | null;
  mapsHref: string | null;
  cost: string | null;
  notes: string | null;
}

export interface PrintDay {
  date: string;
  dayNumber: number;
  notes: string[];
  items: PrintItem[];
  routeHref: string | null;
}

function routePoint(item: TravelObject) {
  const location = item.location;
  if (hasMapCoordinates(location)) return `${location!.lat},${location!.lng}`;
  return location?.address?.trim() || location?.name?.trim() || null;
}

/** Google Maps directions through the day's stops; the path form keeps more stops than the `waypoints` parameter. */
export function dayRouteHref(dayItems: readonly TravelObject[], date: string) {
  const points = dayRouteStops(dayItems, date)
    .stops.map(routePoint)
    .filter((point): point is string => point !== null)
    .filter((point, index, all) => index === 0 || point !== all[index - 1]);
  if (points.length < 2) return null;
  return `https://www.google.com/maps/dir/${points.map((point) => encodeURIComponent(point)).join("/")}`;
}

function untilLabel(item: TravelObject, date: string) {
  const start = item.date!.slice(0, 10);
  const end = item.endDate?.slice(0, 10) ?? start;
  if (end === start || end <= date) return null;
  return scheduleKind(item) === "fixed" ? `until ${end.slice(5)} ${item.endTime}` : `through ${end.slice(5)}`;
}

function printItem(item: TravelObject, date: string): PrintItem {
  const continued = item.date!.slice(0, 10) < date;
  const place = placeLabel(item);
  const address = item.location?.address?.trim() || null;
  const multiDay = (item.endDate?.slice(0, 10) ?? date) > item.date!.slice(0, 10);
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    // A fixed range ending on a later day prints its start time here and the end in `until`.
    time: continued
      ? "Continued"
      : scheduleKind(item) === "fixed" && multiDay
        ? item.startTime!
        : itemScheduleLabel(item, "Flexible")!,
    continued,
    until: untilLabel(item, date),
    place,
    address: address && address !== place ? address : null,
    mapsHref: continued ? null : safeMapsHref(item.location),
    cost:
      !continued && item.cost && item.cost.amount >= 0 ? formatPlannedCost(item.cost.amount, item.cost.currency) : null,
    notes: continued || !item.notes ? null : markdownToPlainText(item.notes) || null,
  };
}

/** Day-by-day printable itinerary; undated ideas and other trips' items are left out. */
export function createTripPrintModel(trip: Pick<Trip, "id" | "startDate" | "endDate">, items: readonly TravelObject[]) {
  const own = items.filter((item) => item.tripId === trip.id && item.date);
  const events = own.filter((item) => item.kind !== "note");
  const days: PrintDay[] = tripDays(trip.startDate, trip.endDate).map((date, index) => {
    const dayItems = sortDayDisplayItems(events.filter((item) => occursOnItineraryDate(item, date)));
    return {
      date,
      dayNumber: index + 1,
      notes: own
        .filter((item) => item.kind === "note" && item.date!.slice(0, 10) === date)
        .map((note) => markdownToPlainText(note.noteBody ?? note.title))
        .filter(Boolean),
      items: dayItems.map((item) => printItem(item, date)),
      routeHref: dayRouteHref(dayItems, date),
    };
  });
  return { days, totals: plannedTotals(events) };
}
