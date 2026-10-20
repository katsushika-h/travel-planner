import assert from "node:assert/strict";
import test from "node:test";
import { extractPdfReservation, pdfWordsFromItems } from "../lib/pdf-reservation.ts";

// Synthetic layouts modelled on real confirmations; names, codes and addresses are invented.
const trip = { startDate: "2026-11-29", endDate: "2026-12-07", timezone: "Asia/Tokyo" };

/** Words for one visual row: each cell is [x, text]; characters are half the font size wide. */
function row(y, cells, { page = 1, size = 10 } = {}) {
  return cells.flatMap(([x, text]) => {
    let cursor = x;
    return text.split(" ").map((word) => {
      const box = { page, x0: cursor, x1: cursor + word.length * size * 0.5, y0: y, y1: y + size, text: word };
      cursor = box.x1 + size * 0.3;
      return box;
    });
  });
}

const pdf = (...rows) => ({ pageHeights: [842, 842], words: rows.flat(), ocrLayer: false });
const filler = row(20, [[40, "Reservation details for your upcoming stay with us, please keep this page"]]);

test("lodging tables read label/value cells and keep check-in windows as notes", () => {
  const draft = extractPdfReservation(
    pdf(
      filler,
      row(100, [[210, "Kawabata Onsen Example Ryokan"]]),
      row(106, [[60, "Property"]]),
      row(112, [[210, "+81-90-0000-0000"]]),
      row(140, [
        [60, "Check-in Time"],
        [210, "15:00~18:00"],
      ]),
      row(170, [[210, "Tue, Dec 1, 2026 (Check-in time undecided)"]]),
      row(176, [[60, "Stays Schedule"]]),
      row(182, [[210, "Wed, Dec 2, 2026 (~10:00)"]]),
      row(220, [
        [60, "Total Adults ¥28,050 x 2 people = ¥56,100"],
        [400, "Total Accommodation Fee: ¥56,100"],
      ]),
      row(250, [
        [60, "Point Discount"],
        [450, "-¥11,220"],
      ]),
      row(274, [[450, "¥44,880"]]),
      row(280, [[60, "Total Price"]]),
      row(320, [
        [60, "Address"],
        [210, "〒843-0000 Saga Prefecture 1-2-3 Example-cho"],
      ]),
    ),
    trip,
  );
  assert.equal(draft.title, "Kawabata Onsen Example Ryokan");
  assert.equal(draft.type, "hotel");
  assert.deepEqual(
    [draft.date, draft.endDate, draft.startTime, draft.endTime, draft.isAllDay],
    ["2026-12-01", "2026-12-02", null, null, true],
  );
  assert.deepEqual(draft.cost, { amount: 44880, currency: "JPY" });
  assert.equal(draft.location.name, "〒843-0000 Saga Prefecture 1-2-3 Example-cho");
  assert.match(draft.notes, /Check-in: 15:00~18:00\n\nCheckout: Wed, Dec 2, 2026 \(~10:00\)/);
  assert.equal(draft.review.title.confidence, "high");
  assert.match(draft.review.cost.evidence, /^p\.1: Total Price → ¥44,880$/);
});

test("flight blocks give the route, airport-local times converted to the trip zone, and no invented cost", () => {
  const draft = extractPdfReservation(
    pdf(
      row(40, [[400, "Booking Date: 03 Sep 2026"]]),
      row(80, [[40, "FLIGHT 1: SINGAPORE TO BANGKOK"]]),
      row(100, [[40, "TR 614 [Example A320neo] - 2h 35m"]]),
      row(130, [
        [40, "Departure"],
        [300, "Arrival"],
      ]),
      row(145, [
        [40, "Singapore"],
        [300, "Bangkok"],
      ]),
      row(160, [
        [40, "Changi Airport (SIN)"],
        [300, "Suvarnabhumi Intl (BKK)"],
      ]),
      row(175, [
        [40, "Terminal 1"],
        [300, "International Terminal"],
      ]),
      row(190, [
        [40, "27 Nov 2026 19:40 HRS"],
        [300, "27 Nov 2026 21:15 HRS"],
      ]),
      row(220, [[40, "All times displayed are local. Thank you for flying with this airline."]]),
    ),
    { ...trip, startDate: "2026-11-27" },
  );
  assert.equal(draft.type, "flight");
  assert.equal(draft.title, "Flight TR 614 · SIN → BKK");
  // 19:40 in Singapore and 21:15 in Bangkok are 20:40 and 23:15 in Tokyo.
  assert.deepEqual(
    [draft.date, draft.startTime, draft.endDate, draft.endTime],
    ["2026-11-27", "20:40", "2026-11-27", "23:15"],
  );
  assert.equal(draft.cost, null);
  assert.equal(draft.location.name, "Changi Airport (SIN)");
  assert.match(draft.notes, /Source times: 2026-11-27 19:40 SIN → 2026-11-27 21:15 BKK/);
});

test("car rentals read same-day ranges, shop names and tax notes, and leave conflicting addresses blank", () => {
  const draft = extractPdfReservation(
    pdf(
      row(40, [[60, "[EXAMPLE RENTACAR FUKUOKA] Your booking is confirmed"]]),
      row(80, [
        [60, "Booked at"],
        [210, "Oct 9, 2026 17:41"],
      ]),
      row(100, [
        [60, "Rental period"],
        [210, "Dec 6, 2026 9:00 – Dec 6, 2026 18:30 (1 days)"],
      ]),
      row(120, [
        [60, "Address"],
        [210, "1 Chome-2-3 Tenjin, Chuo Ward, Fukuoka, 810-0001, Japan"],
      ]),
      row(160, [
        [60, "Total (tax incl.)"],
        [210, "¥14,630 (incl. tax ¥1,330)"],
      ]),
      // Fake bold: the same value drawn again a fraction of a point away.
      row(160, [[210.3, "¥14,630 (incl. tax ¥1,330)"]]),
      row(200, [[60, "Shop name: EXAMPLE RENTACAR FUKUOKA"]]),
      row(220, [[60, "Address: 9-9-9 Example-minami, Nishi Ward, Fukuoka City, 819-0000, Japan"]]),
    ),
    trip,
  );
  assert.equal(draft.type, "commute");
  assert.equal(draft.title, "EXAMPLE RENTACAR FUKUOKA");
  assert.deepEqual(
    [draft.date, draft.startTime, draft.endDate, draft.endTime],
    ["2026-12-06", "09:00", "2026-12-06", "18:30"],
  );
  assert.deepEqual(draft.cost, { amount: 14630, currency: "JPY" });
  // The booker's address and the shop's address disagree, so the place is left for the user.
  assert.equal(draft.location, null);
  assert.equal(draft.review.location, undefined);
});

test("ambiguous dates, conflicting totals and unknown types stay blank instead of guessed", () => {
  const draft = extractPdfReservation(
    pdf(
      filler,
      row(80, [
        [60, "Start date"],
        [210, "03/04/2026"],
      ]),
      row(100, [
        [60, "Total price"],
        [210, "€120.00"],
      ]),
      row(120, [
        [60, "Total price"],
        [210, "€150.00"],
      ]),
      row(140, [
        [60, "Venue: Example Gallery"],
        [300, "Booking total"],
      ]),
    ),
    trip,
  );
  assert.equal(draft.date, null);
  assert.equal(draft.cost, null);
  assert.equal(draft.title, "Example Gallery");
  assert.equal(draft.review.type.confidence, "low");
  assert.equal(draft.review.dates, undefined);
});

test("OCR text layers are shown for review, and PDFs without text are refused", () => {
  const ocr = extractPdfReservation(
    {
      ...pdf(
        filler,
        row(80, [
          [60, "Hotel: Example Inn"],
          [300, "Total JPY 83730"],
        ]),
      ),
      ocrLayer: true,
    },
    trip,
  );
  assert.equal(ocr.title, "Example Inn");
  assert.equal(ocr.review.title.confidence, "medium");
  assert.deepEqual(ocr.cost, { amount: 83730, currency: "JPY" });
  assert.match(ocr.notes, /OCR text layer/);
  assert.throws(() => extractPdfReservation(pdf(row(10, [[10, "1/2"]])), trip), /no readable text/);
});

test("pdf.js runs are split into words and runs that touch are joined", () => {
  const words = pdfWordsFromItems(
    [
      { str: "Total ", transform: [10, 0, 0, 10, 50, 700], width: 30, height: 10 },
      { str: "¥14,", transform: [10, 0, 0, 10, 80, 700], width: 20, height: 10 },
      { str: "630", transform: [10, 0, 0, 10, 100, 700], width: 15, height: 10 },
      { str: "", transform: [10, 0, 0, 10, 0, 0], width: 0, height: 0 },
    ],
    1,
    842,
  );
  assert.deepEqual(
    words.map((w) => w.text),
    ["Total", "¥14,630"],
  );
  assert.ok(words[0].y0 < words[0].y1 && Math.abs(words[0].y1 - 144) < 3);
});
