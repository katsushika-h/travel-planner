import assert from "node:assert/strict";
import test from "node:test";
import { localFromIso, parseReservationFile } from "../lib/reservation-import.ts";

const ics = (...events) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events.flatMap((event) => ["BEGIN:VEVENT", ...event, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");

const page = (...blocks) =>
  `<html><head>${blocks.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`).join("")}</head><body>Thanks</body></html>`;

test("iCalendar events convert UTC and TZID times to the trip timezone and keep the source time", () => {
  const [dinner, flight] = parseReservationFile(
    "booking.ics",
    ics(
      [
        "SUMMARY:Dinner at Sukiyabashi",
        "DTSTART:20261003T100000Z",
        "DTEND:20261003T113000Z",
        "LOCATION:Ginza\\, Tokyo",
        "GEO:35.672;139.764",
        "DESCRIPTION:Table for two\\nRef ABC",
      ],
      [
        "SUMMARY:Flight SQ12",
        "DTSTART;TZID=Asia/Singapore:20261004T230000",
        "DTEND;TZID=Asia/Tokyo:20261005T",
        " 070000",
      ],
    ),
    "Asia/Tokyo",
  );
  assert.deepEqual(
    { ...dinner, notes: undefined },
    {
      title: "Dinner at Sukiyabashi",
      type: "food",
      date: "2026-10-03",
      endDate: "2026-10-03",
      startTime: "19:00",
      endTime: "20:30",
      isAllDay: false,
      location: { name: "Ginza, Tokyo", lat: 35.672, lng: 139.764 },
      cost: null,
      notes: undefined,
    },
  );
  assert.match(dinner.notes, /^Table for two\nRef ABC\n\nConverted to the trip timezone from: 2026-10-03 10:00 UTC/);

  // The folded DTEND line is unfolded; Singapore 23:00 is midnight in Tokyo.
  assert.equal(flight.type, "flight");
  assert.deepEqual(
    [flight.date, flight.startTime, flight.endDate, flight.endTime],
    ["2026-10-05", "00:00", "2026-10-05", "07:00"],
  );
});

test("iCalendar all-day ends are exclusive, floating times stay local, and cancelled events are skipped", () => {
  const drafts = parseReservationFile(
    "stay.ics",
    ics(
      ["SUMMARY:Hotel Gracery", "DTSTART;VALUE=DATE:20261003", "DTEND;VALUE=DATE:20261006"],
      ["SUMMARY:Museum", "DTSTART:20261004T100000"],
      ["SUMMARY:Old booking", "STATUS:CANCELLED", "DTSTART:20261004T100000"],
    ),
    "Asia/Tokyo",
  );
  assert.equal(drafts.length, 2);
  assert.deepEqual(
    [drafts[0].type, drafts[0].date, drafts[0].endDate, drafts[0].isAllDay, drafts[0].startTime],
    ["hotel", "2026-10-03", "2026-10-05", true, null],
  );
  // A start without an end receives a default duration.
  assert.deepEqual([drafts[1].startTime, drafts[1].endTime, drafts[1].notes], ["10:00", "11:00", null]);
});

test("schema.org reservations in HTML map to items with cost, place and confirmation", () => {
  const [flight, hotel] = parseReservationFile(
    "confirmation.html",
    page(
      {
        "@context": "http://schema.org",
        "@type": "FlightReservation",
        reservationNumber: "RXJ34P",
        totalPrice: "1,234.50",
        priceCurrency: "sgd",
        airplaneSeat: "42A",
        reservationFor: {
          "@type": "Flight",
          flightNumber: "12",
          airline: { "@type": "Airline", name: "Singapore Airlines", iataCode: "SQ" },
          departureAirport: { "@type": "Airport", name: "Changi", iataCode: "SIN" },
          arrivalAirport: { "@type": "Airport", name: "Narita", iataCode: "NRT" },
          departureTime: "2026-10-02T23:00:00+08:00",
          arrivalTime: "2026-10-03T07:00:00+09:00",
        },
      },
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "LodgingReservation",
            reservationNumber: "H-99",
            checkinTime: "2026-10-03T15:00:00+09:00",
            checkoutTime: "2026-10-06T11:00:00+09:00",
            totalPrice: { "@type": "PriceSpecification", price: 480, priceCurrency: "JPY" },
            reservationFor: {
              "@type": "LodgingBusiness",
              name: "Hotel Gracery",
              address: { streetAddress: "1-19-1 Kabukicho", addressLocality: "Tokyo" },
              geo: { latitude: "35.6951", longitude: "139.7016" },
            },
          },
        ],
      },
    ),
    "Asia/Tokyo",
  );
  assert.equal(flight.title, "Flight SQ12 SIN → NRT");
  assert.deepEqual(
    [flight.date, flight.startTime, flight.endDate, flight.endTime],
    ["2026-10-03", "00:00", "2026-10-03", "07:00"],
  );
  assert.deepEqual(flight.cost, { amount: 1234.5, currency: "SGD" });
  assert.deepEqual(flight.location, { name: "Changi" });
  assert.match(
    flight.notes,
    /Confirmation: RXJ34P\n\nSeat 42A\n\nConverted to the trip timezone from: 2026-10-02T23:00:00\+08:00$/,
  );

  assert.deepEqual(hotel, {
    title: "Hotel Gracery",
    type: "hotel",
    date: "2026-10-03",
    endDate: "2026-10-06",
    startTime: "15:00",
    endTime: "11:00",
    isAllDay: false,
    location: { name: "Hotel Gracery", address: "1-19-1 Kabukicho, Tokyo", lat: 35.6951, lng: 139.7016 },
    cost: { amount: 480, currency: "JPY" },
    notes: "Confirmation: H-99",
  });
});

test("emails are decoded from quoted-printable MIME parts and duplicate blocks are merged", () => {
  const block = JSON.stringify({
    "@context": "http://schema.org",
    "@type": "FoodEstablishmentReservation",
    partySize: 2,
    startTime: "2026-10-04T19:30:00",
    reservationFor: { "@type": "FoodEstablishment", name: "Café Kitsuné" },
  });
  const qp = `<script type=3D"application/ld+json">${block.replace(/=/g, "=3D").replace("é", "=C3=A9")}</script>`;
  const email = [
    "From: bookings@example.com",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    `${qp.slice(0, 60)}=\n${qp.slice(60)}`,
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(`<script type="application/ld+json">${block}</script>`).toString("base64"),
    "--b1--",
  ].join("\r\n");
  const drafts = parseReservationFile("Your table.eml", email, "Asia/Tokyo");
  assert.equal(drafts.length, 1);
  assert.deepEqual(
    [drafts[0].title, drafts[0].type, drafts[0].startTime, drafts[0].endTime, drafts[0].notes],
    ["Café Kitsuné", "food", "19:30", "21:00", "Party of 2"],
  );
});

test("unsupported files and files without reservations raise readable errors", () => {
  assert.throws(() => parseReservationFile("ticket.docx", "PK", "UTC"), /Choose a PDF/);
  assert.throws(() => parseReservationFile("page.html", "<p>Hi</p>", "UTC"), /No reservation details/);
  assert.throws(
    () =>
      parseReservationFile(
        "x.html",
        page({ "@type": "EventReservation", reservationStatus: "http://schema.org/ReservationCancelled" }),
        "UTC",
      ),
    /No reservation details/,
  );
  assert.equal(localFromIso("2026-02-30", "UTC"), null);
});
