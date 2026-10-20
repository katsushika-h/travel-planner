# Reservation PDF extraction recipe

**Purpose:** Turn a reservation PDF into one or more editable Travel Planner item drafts.

**Scope:** This recipe describes the PDF-specific extraction path. The current reservation importer handles structured calendar/email/HTML data; PDF text extraction and OCR are separate additions. Keep PDF parsing local in the browser where practical. Never auto-save extracted fields.

**Decision (2026-10-20):** Extraction stays local and rule-based. LLM extraction was considered and declined, because booking documents carry personal data and the app has no authentication to protect an API key.

**Status:** Implemented in `lib/pdf-reservation.ts` (rules of prototype v5) with `lib/pdf-text.ts`; see ADR 0009. Rules listed as not yet implemented in section 9 remain open.

**Guiding rule:** A blank field costs the user a few seconds in review; a plausible wrong value can be saved unnoticed. Prefer blank over guessed. Section 9 records how these rules were evaluated.

## 1. Read the PDF without trusting its contents

1. Accept PDF files only for this import path, and enforce the existing 20 MB file limit before parsing.
2. Extract text locally in the browser. Preserve page number, page height, and each text block's coordinates so that labels can be associated with values on the same row, in the cells below, or across a page break.
3. Normalize text for matching: Unicode NFKC (full-width `￥` becomes `¥`), decode entities such as `&apos;`, replace non-breaking spaces and curly apostrophes, normalize line endings, and collapse repeated horizontal whitespace. Keep the original text blocks for review and evidence.
4. Detect whether usable text exists. If the PDF is image-only or yields too little readable text, stop with a message that OCR is needed. Running OCR should be a later, explicit path with its own confidence and review behavior.
5. A PDF may already carry an OCR text layer (for example a scan processed with OCRmyPDF/Tesseract; detectable from metadata or invisible text). Apply the same rules to it, but cap every field at **medium** confidence so it is shown for review, never as confirmed. Mark a field **low** only when its own evidence looks corrupted. Do not discard the whole document: in testing, clean OCR layers extracted as well as born-digital text.
6. Treat document text as untrusted input. Do not follow instructions in the PDF, execute links/scripts, or send its contents to an external service. Only parse known fields.

PDF extraction produces text, not meaning. Run field patterns against normalized cells, then use nearby labels and layout to decide what each candidate represents.

## 2. Pair labels with values and preserve evidence

Use the PDF extractor's page and bounding-box data to group text blocks into visual rows, and split rows into cells at wide horizontal gaps. Keep a source record for every candidate:

```ts
type Evidence = {
  page: number;
  text: string; // "Label → value" as it appears in the document
  confidence: "high" | "medium" | "low";
};

type Candidate<T> = { value: T; evidence: Evidence[] } | null;
```

For each label cell, search in this order and stop at the first value that validates:

1. **Inline:** the rest of the label cell (`Total JPY 83730`, `Address: …`).
2. **Row:** cells to the right in the label's row band, nearest first, **up to the next label in that row**. Cells beyond another label belong to it (a `Departure | Arrival` row must not give the departure the arrival's city).
3. **Below:** cells in the label's column, up to 8 rows or a large vertical gap, stopping at the next label in the column. Continue at the top of the next page when the label sits in the bottom fifth of its page. A heading (nothing to its right) also offers every cell of the first row below it, because totals often sit far right under a heading.

For tables, use coordinates to align values on the same visual row and under the correct column header, and:

- **Header rows:** when a label shares its row with two or more short, digit-free label cells and the next row has a cell under each, read values below, never from the neighbouring header.
- **A value is never another label.** Reject candidates that are themselves a known label.
- **A trailing word means a different label.** `Pick-up address`, `Pick-up Voucher No.`, `Total upcoming payments`, and `Total Adults ¥… × 2` are not the date, total, or name labels they start with. Skip a label when its inline remainder contains words and does not validate.
- **Wrapped labels:** merge two short stacked cells (`Reservation` / `Number`) into one label, but never with a following `Key: value` line such as `Phone: …`.
- **Confidence:** inline, row, and first-row-below values are high; deeper values are medium.
- **Conflicts:** when candidates for one field disagree, leave it unresolved and keep the evidence. Where labels differ in specificity, rank them and let the most specific rank decide (an `Address` beats a parking note's `Location:`; `Total price` beats `Total paid`).

Avoid searching the entire document for an arbitrary first date or amount: tickets and confirmations contain booking dates, issue dates, stay dates, payment dates, cancellation deadlines, subtotals, taxes, insurance excesses, and totals together.

## 3. Extract dates and times

Use recognizable date tokens as candidates, then map them through labels. These patterns are starting points, not complete date parsers:

```ts
const MONTH =
  String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const MONTH_ABBR = String.raw`(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)`;

const DATE_TOKEN = new RegExp(
  String.raw`(?:\b(?:` +
    String.raw`20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}` + // 2026-10-03
    "|" + String.raw`\d{1,2}\s?${MONTH_ABBR}\s?(?:20)?\d{2}` + // 07DEC26 or 07 DEC 2026
    "|" + String.raw`\d{1,2}\s+${MONTH}\s+20\d{2}` + // 3 Oct 2026
    "|" + String.raw`${MONTH}\s+\d{1,2},?\s+20\d{2}` + // Oct 3, 2026
    "|" + String.raw`\d{1,2}[/.]\d{1,2}[/.]20\d{2}` + // 03/10/2026
    String.raw`)\b)` +
    "|" + String.raw`20\d{2}年\d{1,2}月\d{1,2}日`, // 2026年10月3日
  "gi",
);

const START_LABEL =
  /^\s*(departure(?: date| time)?|depart(?:s|ing)?|pick[ -]?up(?: time| date)?|collection(?: date)?|check[ -]?in(?: time| date)?|event date|start date|arrival date|出発|チェックイン|貸渡(?:地点|日時)?|受取|입실|체크인)\s*[:\-：]?\s*(.*)$/i;
const END_LABEL =
  /^\s*(arrival(?: date| time)?|arriv(?:es|ing)|drop[ -]?off(?: time| date)?|check[ -]?out(?: time| date)?|return(?: date| time)?|end date|到着|チェックアウト|返却(?:地点|日時)?|퇴실|체크아웃)\s*[:\-：]?\s*(.*)$/i;
const RANGE_LABEL = /^\s*(stays? schedule|stay dates|dates of stay|travel dates|schedule|rental period|숙박일정)\s*[:\-：]?\s*$/i;
const BOOKING_DATE_LABEL = /^\s*(booked on|booking date|purchase date|issued on)\b/i;

const TIME_TOKEN =
  /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?(?:\s*(?:UTC|GMT|[+-]\d{2}:?\d{2}))?\b/i;
const JAPANESE_DATE = /(?<year>20\d{2})年\s*(?<month>\d{1,2})月\s*(?<day>\d{1,2})日?/;
const YEARLESS_ENGLISH_DATE = new RegExp(String.raw`\b(?<day>\d{1,2})\s+(?<month>${MONTH})\b`, "i");
const LOCAL_TIMES_NOTICE = /\b(?:all times displayed are local|times shown are local|local time)\b/i;
```

Rules:

- A date next to a start label (`departure`, `pick-up`, `check-in`, `start date`) is a start candidate. A date next to an end label (`arrival`, `drop-off`, `check-out`, `end date`) is an end candidate. `arrival date` is the start of a stay but the end of a journey: resolve it by item type.
- A range label whose cell holds exactly two date tokens gives the start and end (for example a `Stays Schedule` cell). Count tokens, not distinct dates: `Dec 6, 2026 9:00 – Dec 6, 2026 18:30` is a same-day range. Take each time from between its own date and the next date in the cell.
- Dates printed in large stacked cells (`30` / `NOVEMBER` / `Monday`) may be assembled from up to three cells below a label. Infer a missing year from the trip window, and require the weekday to match.
- Also recognize provider-style compact dates such as `07DEC26`; parse the month token explicitly and validate the result. Accept a two-digit year only when the format makes its century clear, for example when the `20YY` reading falls inside the trip window; otherwise require review.
- In flight tables, associate `Departure`/`Arrival` rows with `Date` and `Local Time` columns using page coordinates, not text order alone. For car rentals, pair `Pick-up time/location/branch` and `Drop-off time/location/branch` with their matching endpoints.
- Booking, issue, payment, and cancellation dates carry no start/end label, so they never become itinerary dates. Do not fall back to "earliest date in the document". Keep `booked on`/`issued on` dates in evidence/notes only if useful.
- Parse ISO, named-month, compact, and Japanese dates directly. For numeric forms such as `03/04/2026`, determine month/day order only when one reading is impossible. If both interpretations are valid, leave the date blank and ask the user.
- For yearless booking-site dates (for example `4 DECEMBER Friday`), pair the day, month, and weekday from the same visual date block. Infer a year only from an explicit year in that reservation or a known trip window; require the weekday to match the candidate year. A cancellation deadline can corroborate the year but must not become a stay date. If more than one year matches, leave the year unresolved.
- Recognize Japanese date labels and values (`チェックイン`, `チェックアウト`, `貸渡日時`, `返却日時`, and `YYYY年M月D日`) after NFKC normalization. Japanese text `泊` indicates a number of nights, not a second date; do not derive an end date from it if a checkout date is printed.
- Validate the resulting calendar date with a round-trip check; reject impossible dates such as `2026-02-30`.
- Take times only from the date's own cell, a time-only cell to its right in the same row, or a time-only cell directly above or below it. If an explicit timezone or offset exists, convert to the trip timezone and preserve the source time in notes when it changes.
- Treat a notice such as `All times displayed are local` as evidence that each endpoint uses its own location's local time; it does not mean both endpoints share one timezone.
- When the PDF gives airport-local times at different airports, use each airport's local zone to interpret each time before converting to the trip timezone. This needs an airport-code (IATA) to IANA-timezone dataset. If the timezone cannot be established, show both source times and require review.
- For lodging, preserve check-in and checkout dates and keep the stay untimed. Do not convert a check-in window into a confirmed appointment time, especially when the PDF says the guest's arrival time is undecided. Check-in windows, approximate checkouts, and `until 11:00` deadlines go to notes.
- For car rental, use pickup and drop-off timestamps as the item range. If pickup and return places differ, store pickup as `location` and preserve the return place in notes because `TravelObject.location` holds one place.
- For repeated flight/passenger sections, create one item per distinct flight leg, not one per passenger. Deduplicate by flight number, origin, destination, and departure date after parsing.
- Keep date-only and untimed reservations untimed. Do not invent a time just because the app supports one. The API needs both times or neither.

## 4. Extract the reservation name

Prefer a value explicitly labeled as the service, property, venue, or supplier. Avoid generic page headings, booking providers, and personal names.

```ts
const NAME_WORDS =
  String.raw`property|hotel|venue|restaurant|event|service|service provider|accommodation|shop name|pick-up branch|(?:car )?rental (?:supplier|company|agency)|supplier|施設名|宿泊施設|店舗名`;
// Inline values need a separator, so "Hotel Monte …" is not read as the label "Hotel".
const NAME_LABEL = new RegExp(String.raw`^\s*(${NAME_WORDS})\s*(?:name)?\s*[:\-]\s*(.+?)\s*$`, "i");
// A label alone in its cell, as in tables, pairs through section 2.
const NAME_LABEL_ALONE = new RegExp(String.raw`^\s*(${NAME_WORDS})\s*(?:name)?\s*[:\-]?\s*$`, "i");
const GENERIC_TITLE =
  /^(booking confirmation|reservation confirmed|reservation details|e-?ticket|receipt|itinerary|rental voucher)$/i;
// Upper case, a designator containing a letter, at the start of a cell, and not followed by a letter
// or digit. This rejects durations such as 1H45M and words such as CO2.
const FLIGHT_NUMBER_CELL = /^(?:\d+\.\s*)?([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})(?![\d:.,A-Za-z])/;
const CAR_RENTAL_CONTEXT = /\b(car rental|rental car|vehicle rental)\b/i;
```

Rules:

- Use the value of a name label as the title when present. Reject values that are phone numbers, URLs, e-mail addresses, or other labels.
- For flights, build a title such as `Flight TG 648 · BKK → FUK` only when a flight number and two route endpoints are both found in the same flight section. Read the flight number from a `Flight` label, or from flight-number cells in that section (all such cells must agree). Do not use a `Flighting Time` column: it holds the flight duration. Do not extract arbitrary three-letter codes from the whole PDF. Take endpoints, in order, from:
  1. airport codes in the Departure/Arrival blocks or rows, such as `(SIN)`;
  2. a route line with an arrow (`Bangkok ✈ Fukuoka`);
  3. a short `X to Y` section heading.
- For a car rental, use the supplier/service label plus the pickup branch when available. Keep the vehicle model/type as a note instead of using it as the supplier or title.
- Do not use a booking provider, traveler name, confirmation heading, or airport name as the reservation title unless that is the only clearly labeled reserved service.
- On booking-site lodging confirmations, a prominent unlabelled heading may be used as a **medium-confidence** property title only when it is in the same reservation summary as the labeled check-in/out dates and address, and is not a booking provider, page title, room type, or guest name. Preserve the original language and parenthetical transliteration. Otherwise leave the title blank. This supports a heading such as `Onjae Stay Seongsu (온재 스테이 성수)` without accepting arbitrary page headings.
- If multiple plausible titles conflict, present the candidates and ask the user to choose.

## 5. Extract cost conservatively

Only accept amounts tied to an explicit total/paid label, and only when the value cell is the amount itself. A bare number or currency symbol is insufficient.

```ts
// Ranked: the first rank with a candidate decides; values within a rank must agree.
const TOTAL_RANKS = [
  ["total price"], ["grand total"], ["total amount"], ["total cost"], ["total online payment"],
  ["booking total"], ["total"], ["amount charged", "you'll pay", "you will pay"], ["amount paid"],
  ["final price"], ["total paid"],
];
// Every ranked label, longest first, with an optional qualifier such as "(tax incl.)" and an optional inline value.
const TOTAL_LABEL =
  /^\s*(total price|grand total|total amount|total cost|total online payment|booking total|amount charged|you'll pay|you will pay|amount paid|final price|total paid|total)\b\s*(?:\([^)]*\))?\s*[:\-：]?\s*(.*)$/i;
const EXCLUDE_AMOUNT =
  /\b(per night|per person|per day|deposit|amount due|balance due|discount|savings|tax only|service fee only|excess|not included)\b/i;
const MONEY_TOKEN =
  /(?:(?<prefix>[A-Z]{3}|US\$|S\$|A\$|[$€£¥])\s*)?(?<amount>\d[\d., ]*\d|\d)(?:\s*(?:in\s+)?(?<suffix>[A-Z]{3}\b|US\$|S\$|[$€£¥]|円))?/i;
const PRICE_WARNING =
  /(?:initial price|estimate only|not the same as (?:the )?amount paid|not same as your amount paid|amount paid may differ|not necessarily paid)/i;
```

Rules:

- Prefer `Total Price`, `Grand Total`, `Total Amount`, or `Amount Paid`; do not choose a subtotal when a labeled final total exists.
- Permit a tax qualifier on a total label, such as `Total (tax incl.)`. When the document separately prints the tax component, retain it as evidence and do not add it to an already tax-inclusive total.
- The value cell must be the amount, optionally with `approx.` or a tax-inclusion note. Reject sentences that mention an amount, and calculation lines containing `=` or `×`.
- A heading such as `Booking total` takes the amount from the first row below it (often far right, after a payment-method cell). Exclude sections marked as not included in the total, such as extras paid at the branch.
- Accept `Total online payment` as the online charge. Preserve any caveat that supplier-direct payments are excluded; do not silently add an unknown supplier payment.
- A bare `Total` is weaker evidence. Accept it only inside a fare/price section, with an adjacent currency, and when no stronger total label exists. A nearby warning such as "initial price, not the amount paid" overrides any assumption that it was paid: prefill it as a planned cost marked as an unconfirmed quote for review, never as an actual expense.
- Ignore zero amounts: `Total paid ¥0` on a pay-later booking is not the price.
- Do not add taxes, discounts, per-person amounts, on-site charges, or insurance excesses to a total unless the document explicitly identifies them as part of that total.
- Prefer an ISO currency code such as `JPY` or `THB`. Map `€`, `£`, `S$`, `US$`, `A$`, and `円`. Treat `$` as ambiguous unless nearby text identifies the currency. Treat `¥` as JPY only when the document itself points to Japan (`JPY`, `yen`, `円`, `〒`, `Japan`, `Prefecture`), because it is also used for yuan.
- Normalize thousands/decimal separators only when the document's format is clear. A group of exactly three digits is a thousands group for currencies without three-decimal minor units. One or two trailing digits are decimals for two-decimal currencies (`SGD481.8`). Leave anything else for review.
- A reservation's quoted/charged price can populate `TravelObject.cost` as a planned item cost. It must not create an `Expense` record automatically; a receipt or explicit user action is needed to record actual spending.
- Keep displayed currencies as separate candidates, and never convert or recompute them. An explicit charged amount in the source currency (`You'll pay 26,960 in JPY`) outranks an `approx.` converted display and an undiscounted price. Do not reject it with arithmetic on the visible lines: confirmations add charges in other currencies (a ryokan's `¥29,700 − ¥3,240` plus a hot-spring tax printed as `S$ 2.02 × 2 guests` gives `¥26,960`). Leave cost unresolved only when two explicit charged/paid labels of the same rank disagree, and expose the labeled amounts for review.
- If there is no price section, leave `cost` null. Do not infer a price from fare class, fare basis, baggage information, or a separate booking document.

## 6. Extract the place

- Use a labeled address, ranked: `Address` (including `Pick-up address`, `Property address`, `住所`) before `Location`. Continue the value across its row and onto the next line when the address is visibly wrapped (it ends with `-` or `,`). Follow only the immediately next line in the same column, chosen by vertical centre because tall glyph boxes can overlap it, for at most three lines. Stop at a label or a `Key: value` line such as `Phone: …`, and join a hyphen break without a space (`874-` + `0041` → `874-0041`). For a wrapped candidate and a shorter prefix candidate from the same cell, keep the longer complete address; do not treat prefix/continuation as conflicting addresses.
- For flights, use the departure airport, from the Departure block or row or from the airport cell under the departure date.
- A coordinate printed as degrees and decimal minutes, such as `N 037° 32.949, E 127° 3.343`, may be parsed with `/(?<latHem>[NS])\s*(?<latDeg>\d{1,3})\s*°\s*(?<latMin>\d{1,2}(?:\.\d+)?)\s*[,; ]+\s*(?<lonHem>[EW])\s*(?<lonDeg>\d{1,3})\s*°\s*(?<lonMin>\d{1,2}(?:\.\d+)?)/i`. Convert to decimal degrees as `sign * (degrees + minutes / 60)`, where S/W are negative. Validate latitude ≤ 90, longitude ≤ 180, and minutes < 60. Preserve the printed address as the place text and coordinates as separate location evidence; do not geocode or infer missing coordinates.
- Do not geocode. A place without coordinates is stored as text and is not plotted.

## 7. Resolve candidates and create an editable draft

For each PDF page/section, associate date, time, name, place, and cost candidates using nearby labels and layout. Choose a value automatically only when the label is specific and the candidates agree. If candidates conflict, preserve the evidence and leave that field unresolved.

Infer the item type only from a matched reservation section, using specific tokens before broad context. In particular, normalize `RENTACAR`, `RENT A CAR`, `RENT-A-CAR`, `car rental`, and `vehicle rental` to the app's rental type. A word match alone is not enough when it appears in an unrelated footer or policy section; require a rental period, vehicle, pickup/drop-off, or supplier field in the same section. Keep type evidence with the draft because the current UI may not expose confidence gating for type. A keyword match makes the type medium confidence; with no match, the `activity` default is low confidence and must not be presented as an extracted value.

The review step should show each proposed value alongside its source excerpt/page and allow editing of **all** fields before save: title, type, date range, times, location/address, and cost/currency. Then map the reviewed values to the existing `TravelObject` API fields and create the item through the normal API. Keep original PDF attachment behavior separate from extraction success; report partial create/attach failures clearly.

Confidence policy:

- **High:** value inline, in the label's row, or directly below a specific label; valid date/currency; no conflict.
- **Medium:** value found deeper below a label, through a known layout (range cell, stacked date, flight route row), or from an OCR text layer; display for confirmation.
- **Low:** corrupted, ambiguous, conflicting, or inferred only from a generic heading; do not prefill as if confirmed.

Booking references are not prefilled fields. If added later, read them from labels such as `Booking ref`, `Confirmation number`, or `Reservation number`, and store them in notes.

## 8. Example outcomes from the supplied documents

These examples show the mapping rules without copying personal names, booking codes, contact details, or payment identifiers into this repository document.

- **Air ticket (route row layout):** A labeled flight number and an arrow route form the title. The two dates in the row under the route, with the local times directly above them, form the schedule after airport-zone conversion. The labeled final fare total and its currency form the planned cost. The booking/issue date is excluded from the schedule.
- **Air ticket with a `Total` disclaimer (OCR layer):** Flight number, route codes, `Departure`/`Arrival` rows, compact `DDMMMYY` dates, and local times are readable from the same table rows. Every field is medium confidence because the text is OCR. The document says the initial fare may differ from the amount paid, so treat the listed total as an unconfirmed quote, not actual spend.
- **Flight itinerary with passenger add-ons:** Use the route, flight number, Departure/Arrival blocks (airport codes, and the date and time several rows below each label), and the explicit statement that times are local. A repeated passenger/add-ons block is not another flight leg. Leave cost blank when no price is shown.
- **Lodging confirmation (table):** The `Property` value forms the title; the `Stays Schedule` dates form the stay range; the `Total Price` after discount forms the planned cost. The check-in window, undecided arrival time, approximate checkout, payment schedule, and extra on-site tax remain notes/review details rather than fabricated exact fields.
- **Lodging confirmation (booking site):** Stacked large-print check-in and checkout dates form the range. `You'll pay … in JPY` outranks an approximate `Final price` only when no conflicting invoice, paid amount, or arithmetic inconsistency exists. A clearly associated property heading may be shown as a medium-confidence title for review.
- **Booking-site ryokan confirmation:** Pair the large stacked December dates with their weekday and corroborating year in the same reservation. Use the prominent bilingual property heading only at medium confidence when it is tied to the stay summary. Parse printed DMM coordinates using the formula in section 6. Keep `Approx.` display price, discount, final-price display, and `You'll pay` source-currency amount separate; the explicit `You'll pay … in JPY` amount is the planned cost, and the hot-spring tax line explains the difference from the discounted price. Check-in/out windows are notes, not appointment times.
- **Booking-site Seoul lodging confirmation:** The bilingual property heading is a medium-confidence title; yearless dates need weekday/year validation. Preserve the address and its degrees-and-decimal-minutes coordinates. If the confirmation contains an invoice, a property charge, and a booking-site payment with different amounts, retain each labeled amount as evidence and do not choose one as the trip cost automatically.
- **Direct car-rental email PDF:** `Rental period` can contain same-day pickup and return timestamps in one cell. Parse both timestamps even when the date is repeated once, then validate order. `Shop name` or a clearly labeled supplier forms the title; the vehicle model is a note. Select `Total (tax incl.)` as planned cost and keep the included tax component as evidence. Choose the shop/branch address, never the booker's address; if address labels conflict, leave place unresolved. Pickup and return transfer locations should be retained as location/notes according to the app's single-location field.
- **Car-rental voucher:** The header-row `Car Rental Supplier` value forms the title. `Pick-up`/`Drop-off` dates and times form the range, read across a page break. The `Booking total` heading's prepaid amount forms the cost, excluding extras paid at the branch and insurance excesses. `Pick-up address` forms the place, and cancellation deadlines are excluded. The voucher repeats in two languages; the duplicate values agree.
- **Car-rental e-receipt:** Provider, pickup/drop-off branch, times, and addresses define a multi-day rental. `Total online payment` is the cost candidate; keep supplier-direct payment caveats in notes. Ignore the receipt's booking date for the itinerary schedule.

## 9. Evaluation

Evaluate rule changes with a fixed protocol:

1. Record the expected fields for each document before running anything new.
2. Freeze the rules (record a checksum) **before** opening new test documents, so new layouts cannot shape the rules they are scored with.
3. Score each field as correct, partial, blank, or wrong. Track wrong values separately: the target is zero.
4. Keep fixtures and expected values outside the repository, because they contain names, booking codes, and contact details.

Results on nine personal booking documents: two airline e-tickets (one with an OCR layer), one low-cost airline itinerary, five lodging confirmations from two booking sites (one with an OCR layer), and one car-rental voucher. Six fields per document (type, title, dates, times, cost, place); booking references were not scored.

| Rules | Correct | Blank | Wrong | Notes |
|---|---|---|---|---|
| First generic draft (line-based) | 21 (+4 partial) | 10 | 19 | Labels and values on different lines broke pairing. |
| Position pairing, no confidence policy | 30 (+3 partial) | 6 | 15 | Decoy dates and totals, and label words inside names. |
| First version of this recipe | 30 | 24 | 0 | Blind on the last three documents: 4/18 correct (item types and a correctly blank cost). Narrow vocabulary; OCR layers discarded. |
| Sections 1–6 rules (prototype v4) | 52 | 2 | 0 | Tuned on the same nine documents, so not a blind score. The remaining blanks are unlabelled hotel names. |
| Same rules, blind: a direct car-rental e-mail and a booking-site lodging confirmation | 3 of 12 | 7 | 2 | Wrong: item type (`RENTACAR` matched no rental keyword, and type is never confidence-gated), and a wrapped address that skipped its continuation line. Blank: a same-day `Rental period` range in one cell, `Shop name`, `Total (tax incl.)` followed by a tax amount, an unlabelled hotel name, and a price shown only as approximate. A booker address and a shop address correctly conflicted and stayed blank. |
| Same rules, blind: a booking-site ryokan confirmation (a layout already in the tuning set) | 4 of 6 | 2 | 0 | Dates from stacked large print, and `You'll pay … in JPY` over an approximate `Final price`. Blank: the unlabelled property name, and an address that conflicted with a second candidate. The wrapped-label rule had merged the address with the `Phone:` line below its real continuation, because the taller address box overlapped that continuation line. |
| Patched rules (prototype v5), all twelve documents | 66 of 72 | 6 | 0 | Tuned on every document so far, so not a blind score. Adds same-day ranges in one cell, `Shop name`, tax notes with their own amount, rental keywords before lodging words, a low-confidence default type, next-line address wraps by centre, no merging into `Key: value` lines, and the longer-candidate rule. Blank: four unlabelled property names, a booker/shop address conflict, and an approximate-only price. |

The prototype does not yet implement these rules: one item per flight leg, the fare-section check and price warning for a bare `Total`, DMM coordinate conversion, return-place notes, `Total online payment`, the medium-confidence property heading, the currency-arithmetic check, and section-scoped type evidence. The property-heading, currency-conflict, and wrapped-address rules above were added after reviewing supplied documents, so they are not a blind evaluation. Run a new frozen evaluation before relying on them, and add each failure to this table rather than tuning silently.

## 10. Current boundary

The current reservation importer parses `.ics` calendar data and schema.org reservation data in `.eml` or saved `.html` pages. PDF extraction is a proposed addition. Image-only/scanned PDFs need OCR, which this recipe does not run; it only reads existing OCR text layers. Do not claim a PDF was imported until the draft has been reviewed and saved.
