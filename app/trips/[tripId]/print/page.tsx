import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/trip/PrintToolbar";
import { prisma } from "@/lib/prisma";
import { serializeTravelObject } from "@/lib/travel-object-serialization";
import { formatTripDateRange } from "@/lib/trip-dates";
import { createTripPrintModel } from "@/lib/trip-print";
import { defaultTypeColor } from "@/lib/type-color";
import type { TravelObject, Trip } from "@/types/travel";
import "./print.css";

export const dynamic = "force-dynamic";

async function loadTrip(tripId: string) {
  const [trip, travelObjects] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId } }),
    prisma.travelObject.findMany({
      where: { tripId },
      orderBy: [{ date: "asc" }, { dayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!trip) notFound();
  // Same JSON shape the API returns to the browser.
  return JSON.parse(JSON.stringify({ trip, items: travelObjects.map(serializeTravelObject) })) as {
    trip: Trip;
    items: TravelObject[];
  };
}

export async function generateMetadata({ params }: PageProps<"/trips/[tripId]/print">): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { title: true } });
  return { title: trip ? `${trip.title} – itinerary` : "Itinerary" };
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function TripPrintPage({ params }: PageProps<"/trips/[tripId]/print">) {
  const { tripId } = await params;
  const { trip, items } = await loadTrip(tripId);
  const { days, totals } = createTripPrintModel(trip, items);
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: trip.timezone }).format(
    new Date(),
  );

  return (
    <main className="trip-print">
      <PrintToolbar />
      <header className="trip-print-header">
        <h1>{trip.title}</h1>
        <p className="muted">
          {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.timezone} · {days.length}{" "}
          {days.length === 1 ? "day" : "days"}
        </p>
      </header>

      {days.map((day) => (
        <section key={day.date} className="trip-print-day">
          <div className="trip-print-day-heading">
            <h2>
              Day {day.dayNumber} · {dayFormat.format(new Date(`${day.date}T00:00:00Z`))}
            </h2>
            {day.routeHref && (
              <a href={day.routeHref} target="_blank" rel="noreferrer">
                Route in Google Maps ↗
              </a>
            )}
          </div>
          {day.notes.map((note, index) => (
            <p key={index} className="trip-print-note">
              {note}
            </p>
          ))}
          {day.items.length === 0 && day.notes.length === 0 && <p className="muted">Nothing planned</p>}
          {day.items.map((entry) =>
            entry.continued ? (
              <div key={entry.id} className="trip-print-item continued">
                <div className="time">{entry.time}</div>
                <div>
                  {entry.title}
                  {entry.until && <span className="muted"> · {entry.until}</span>}
                </div>
                <div />
              </div>
            ) : (
              <div key={entry.id} className="trip-print-item">
                <div className="time">{entry.time}</div>
                <div>
                  <div>
                    <span className="dot" style={{ background: defaultTypeColor(entry.type) }} />
                    <strong>{entry.title}</strong>
                    <span className="muted">
                      {" "}
                      · {entry.type}
                      {entry.until && ` · ${entry.until}`}
                    </span>
                  </div>
                  {(entry.place || entry.address) && (
                    <div className="muted">{[entry.place, entry.address].filter(Boolean).join(", ")}</div>
                  )}
                  {entry.mapsHref && (
                    <a href={entry.mapsHref} target="_blank" rel="noreferrer">
                      Open in Google Maps
                    </a>
                  )}
                  {entry.notes && <p className="trip-print-note">{entry.notes}</p>}
                </div>
                <div className="cost">{entry.cost}</div>
              </div>
            ),
          )}
        </section>
      ))}

      <footer className="trip-print-footer muted">
        <span>{totals.length > 0 && `Planned costs: ${totals.join(" · ")}`}</span>
        <span>Generated {generated}</span>
      </footer>
    </main>
  );
}
