import { dateParts, zonedDateTimeToUtc } from "./date-utils.ts";
import type { FieldReview, ReservationDraft, ReviewField } from "./reservation-import.ts";
import { truncateUtf8 } from "./text-utils.ts";
import type { CostData, EventType, LocationData } from "../types/travel.ts";

/**
 * Local, rule-based reservation extraction from PDF text with positions.
 * Rules and their evaluation: docs/work/reservation-pdf-extraction-recipe.md.
 * Values come only from labels or a recognised layout; conflicting or ambiguous fields stay blank.
 */

/** A word with its box in page coordinates (top-left origin), as produced by `pdfWordsFromItems`. */
export interface PdfWord {
  page: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  text: string;
}

export interface PdfText {
  pageHeights: number[];
  words: PdfWord[];
  /** The text is an OCR layer over a scan, so every value is shown for review. */
  ocrLayer: boolean;
}

export interface PdfTrip {
  startDate: string;
  endDate: string;
  timezone: string;
}

/** A pdf.js text item: a run of text with a transform whose translation is its baseline origin. */
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

type Confidence = FieldReview["confidence"];
type Box = { page: number; x0: number; x1: number; y0: number; y1: number };
type Segment = Box & { h: number; text: string; line: number; id: number; parts?: [number, number] };
type Line = { page: number; text: string; index: number };
type Doc = { lines: Line[]; segments: Segment[]; pageHeights: number[] };
type Evidence = { page: number; text: string; confidence: Confidence };
type Found<T> = { value: T; evidence: Evidence; label?: Segment; segment?: Segment };
type DateToken = { date: string; index: number; end: number; next?: number; segment?: Segment };
type Resolved<T> = {
  value: T | null;
  conflict?: boolean;
  confidence?: Confidence;
  evidence: Evidence[];
  source?: { label?: Segment; segment?: Segment; token?: DateToken };
};

// ---------------------------------------------------------------- reading pdf.js text

/**
 * Splits pdf.js text runs into positioned words. Runs that touch without a space are joined,
 * because pdf.js may split one word across runs.
 */
export function pdfWordsFromItems(items: readonly PdfTextItem[], page: number, pageHeight: number): PdfWord[] {
  const words: PdfWord[] = [];
  let previous: { word: PdfWord; endsWithSpace: boolean } | null = null;
  for (const item of items) {
    if (!item.str) {
      previous = null;
      continue;
    }
    const [, , c, d, x, baseline] = item.transform;
    const size = Math.hypot(c, d) || item.height || 10;
    const top = pageHeight - baseline - size * 0.85;
    const bottom = pageHeight - baseline + size * 0.2;
    const characterWidth = item.width / Math.max(item.str.length, 1);
    let index = 0;
    for (const part of item.str.split(/(\s+)/)) {
      if (part && !/^\s+$/.test(part)) {
        const word: PdfWord = {
          page,
          x0: x + index * characterWidth,
          x1: x + (index + part.length) * characterWidth,
          y0: top,
          y1: bottom,
          text: part,
        };
        const touching =
          previous &&
          index === 0 &&
          !previous.endsWithSpace &&
          previous.word.page === page &&
          Math.abs(previous.word.y1 - bottom) < size * 0.3 &&
          word.x0 - previous.word.x1 < size * 0.12 &&
          word.x0 - previous.word.x1 > -size * 0.5;
        if (touching) {
          previous!.word.text += part;
          previous!.word.x1 = word.x1;
        } else words.push(word);
      }
      index += part.length;
    }
    const last = words.at(-1);
    previous = last ? { word: last, endsWithSpace: /\s$/.test(item.str) } : null;
  }
  return words;
}

// ---------------------------------------------------------------- rows, cells and labels

const centre = (box: Box) => (box.y0 + box.y1) / 2;
const union = (boxes: Box[]): Box => ({
  page: boxes[0].page,
  x0: Math.min(...boxes.map((b) => b.x0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});

/** Rows of words at the same height, split into cells at wide gaps. */
function layout(words: readonly PdfWord[]): Pick<Doc, "lines" | "segments"> {
  const byPage = new Map<number, (PdfWord & { h: number })[]>();
  for (const word of words) {
    const list = byPage.get(word.page) ?? [];
    const h = word.y1 - word.y0;
    // Fake bold draws the same text several times a fraction of a point apart; keep one copy.
    const repeat = list.some(
      (w) => w.text === word.text && Math.abs(w.x0 - word.x0) < h * 0.3 && Math.abs(w.y0 - word.y0) < h * 0.3,
    );
    if (!repeat) list.push({ ...word, h });
    byPage.set(word.page, list);
  }
  const rows: { y: number; h: number; words: (PdfWord & { h: number })[] }[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageWords = byPage.get(page)!.sort((a, b) => centre(a) - centre(b) || a.x0 - b.x0);
    const pageRows: typeof rows = [];
    for (const word of pageWords) {
      const row = pageRows.find((r) => Math.abs(r.y - centre(word)) <= Math.min(word.h, r.h) * 0.4);
      if (row) row.words.push(word);
      else pageRows.push({ y: centre(word), h: word.h, words: [word] });
    }
    rows.push(...pageRows.sort((a, b) => a.y - b.y));
  }
  const lines: Line[] = [];
  const segments: Segment[] = [];
  for (const row of rows) {
    row.words.sort((a, b) => a.x0 - b.x0);
    let text = "";
    const cells: (PdfWord & { h: number })[][] = [];
    for (const word of row.words) {
      const last = cells.at(-1)?.at(-1);
      const gap = last ? word.x0 - last.x1 : 0;
      if (last) text += gap > 12 ? "   " : " ";
      text += word.text;
      if (!last || gap > Math.max(word.h * 1.2, 6)) cells.push([word]);
      else cells.at(-1)!.push(word);
    }
    const line: Line = { page: row.words[0].page, text, index: lines.length };
    lines.push(line);
    for (const cell of cells)
      segments.push({
        ...union(cell),
        h: Math.max(...cell.map((w) => w.h)),
        text: cell.map((w) => w.text).join(" "),
        line: line.index,
        id: segments.length,
      });
  }
  return { lines, segments };
}

function rightOf(label: Box & { h: number; id: number }, segments: Segment[]) {
  const band = [label.y0 - label.h * 0.9, label.y1 + label.h * 0.9];
  return segments
    .filter(
      (s) =>
        s.page === label.page &&
        s.id !== label.id &&
        s.x0 >= label.x1 - 1 &&
        centre(s) >= band[0] &&
        centre(s) <= band[1],
    )
    .map((s) => ({ s, distance: s.x0 - label.x1 + Math.abs(centre(s) - centre(label)) * 2 }));
}

/** Labels as cells, plus labels wrapped over two stacked cells ("Reservation" / "Number"). */
function labelSegments(segments: Segment[]): Segment[] {
  const stacked: Segment[] = [];
  for (const top of segments) {
    const next = segments.find(
      (s) =>
        s.page === top.page &&
        s.id !== top.id &&
        s.y0 >= top.y1 - 1 &&
        s.y0 - top.y1 <= top.h * 1.6 &&
        Math.abs((s.x0 + s.x1) / 2 - (top.x0 + top.x1) / 2) <= top.h * 2 &&
        s.text.length <= 30 &&
        top.text.length <= 30,
    );
    if (next)
      stacked.push({
        ...union([top, next]),
        h: top.h,
        text: `${top.text} ${next.text}`,
        id: -1 - top.id,
        parts: [top.id, next.id],
        line: top.line,
      });
  }
  return [...segments, ...stacked];
}

// ---------------------------------------------------------------- vocabulary

const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const DATE_TOKEN = new RegExp(
  String.raw`(?:\b(?:` +
    String.raw`20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}` +
    "|" +
    String.raw`\d{1,2}\s+${MONTH}\s+20\d{2}` +
    "|" +
    String.raw`${MONTH}\s+\d{1,2},?\s+20\d{2}` +
    "|" +
    String.raw`\d{1,2}[/.]\d{1,2}[/.]20\d{2}` +
    "|" +
    String.raw`\d{2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:20)?\d{2}` +
    String.raw`)\b)` +
    "|" +
    String.raw`20\d{2}年\d{1,2}月\d{1,2}日`,
  "gi",
);
const START_LABEL =
  /^\s*(departure(?: date| time)?|depart(?:s|ing)?|check[ -]?in(?: date)?|pick[ -]?up(?: date| time)?|collection(?: date)?|event date|start date|arrival date|出発|チェックイン|貸渡(?:地点|日時)?|受取)\s*[:\-：]?\s*(.*)$/i;
const END_LABEL =
  /^\s*(arrival(?: date| time)?|arriv(?:es|ing)|check[ -]?out(?: date)?|drop[ -]?off(?: date| time)?|return(?: date| time)?|end date|到着|チェックアウト|返却(?:地点|日時)?)\s*[:\-：]?\s*(.*)$/i;
const RANGE_LABEL = /^\s*(stays? schedule|stay dates|dates of stay|travel dates|schedule|rental period)\s*[:\-]?\s*$/i;
const TIME_TOKEN = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?(?:\s*(?:UTC|GMT|[+-]\d{2}:?\d{2}))?\b/gi;
const NAME_WORDS = String.raw`property|hotel|venue|restaurant|event|service|accommodation|(?:car )?rental (?:supplier|company|agency)|supplier|shop|store`;
const NAME_LABEL = new RegExp(String.raw`^\s*(${NAME_WORDS})\s*(?:name)?\s*[:\-]\s*(.+?)\s*$`, "i");
const NAME_LABEL_ALONE = new RegExp(String.raw`^\s*(${NAME_WORDS})\s*(?:name)?\s*[:\-]?\s*()$`, "i");
const GENERIC_TITLE =
  /^(booking confirmation|reservation confirmed|reservation details|e-?ticket|receipt|itinerary|rental voucher)$/i;
// An airline designator with a letter, in upper case, at the start of a cell; not a duration like 1H45M.
const FLIGHT_NUMBER_CELL = /^(?:\d+\.\s*)?([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})(?![\d:.,A-Za-z])/;
const TOTAL_RANKS = [
  ["total price"],
  ["grand total"],
  ["total amount"],
  ["total cost"],
  ["total online payment"],
  ["booking total"],
  ["total"],
  ["amount charged", "you'll pay", "you will pay"],
  ["amount paid"],
  ["final price"],
  ["total paid"],
];
const TOTAL_LABEL =
  /^\s*(total price|grand total|total amount|total cost|total online payment|booking total|amount charged|you'll pay|you will pay|amount paid|final price|total paid|total)\b\s*(?:\([^)]*\))?\s*[:\-]?\s*(.*)$/i;
const EXCLUDE_AMOUNT =
  /\b(per night|per person|per day|deposit|amount due|balance due|discount|savings|tax only|service fee only|excess|not included)\b/i;
// Groups: 1 a currency before the amount, 2 the amount, 3 a currency after it.
const MONEY_TOKEN =
  /(?:([A-Z]{3}|US\$|S\$|A\$|[$€£¥])\s*)?(\d[\d., ]*\d|\d)(?:\s*(?:in\s+)?([A-Z]{3}\b|US\$|S\$|[$€£¥]|円))?/i;
const ADDRESS_RANKS = [
  /^\s*((?:pick[ -]?up |property |hotel )?address|住所)\s*[:\-：]?\s*(.*)$/i,
  /^\s*(location)\s*[:\-]?\s*(.*)$/i,
];
// A "Key: value" line, such as "Phone: +81 …", is its own field.
const KEY_VALUE = /^\s*\p{L}[\p{L} .'/-]{1,30}\s*[:：]/u;
const ALL_LABELS = [START_LABEL, END_LABEL, RANGE_LABEL, NAME_LABEL_ALONE, TOTAL_LABEL, ...ADDRESS_RANKS];
const CURRENCIES = /^(USD|SGD|AUD|EUR|GBP|JPY|KRW|THB|MYR|HKD|TWD|CNY|NZD|CAD|CHF|IDR|PHP|VND|INR)$/;
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR", "TWD"]);
// A small sample of airports and cities; extend it as trips need. A full IATA dataset is not bundled.
const PLACE_ZONES: Record<string, string> = {
  bkk: "Asia/Bangkok",
  dmk: "Asia/Bangkok",
  bangkok: "Asia/Bangkok",
  fuk: "Asia/Tokyo",
  fukuoka: "Asia/Tokyo",
  nrt: "Asia/Tokyo",
  hnd: "Asia/Tokyo",
  tokyo: "Asia/Tokyo",
  kix: "Asia/Tokyo",
  itm: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  kmj: "Asia/Tokyo",
  kumamoto: "Asia/Tokyo",
  oit: "Asia/Tokyo",
  cts: "Asia/Tokyo",
  oka: "Asia/Tokyo",
  sin: "Asia/Singapore",
  singapore: "Asia/Singapore",
  icn: "Asia/Seoul",
  gmp: "Asia/Seoul",
  seoul: "Asia/Seoul",
  pus: "Asia/Seoul",
  hkg: "Asia/Hong_Kong",
  "hong kong": "Asia/Hong_Kong",
  tpe: "Asia/Taipei",
  taipei: "Asia/Taipei",
  kul: "Asia/Kuala_Lumpur",
};

// ---------------------------------------------------------------- text, dates and money

const clean = (text: string) =>
  text
    .replace(/&apos;/g, "'")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[’]/g, "'")
    .trim();
const pad = (n: number | string) => String(n).padStart(2, "0");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function validDate(y: number | string, m: number | string, d: number | string) {
  const date = `${y}-${pad(m)}-${pad(d)}`;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? date : null;
}

type TripWindow = { start: string; end: string; timezone: string };

/** A year for a day and month printed without one: the one that falls inside the trip (±3 days). */
function yearFromTrip(month: number, day: string, trip: TripWindow) {
  for (const year of new Set([trip.start.slice(0, 4), trip.end.slice(0, 4)])) {
    const date = validDate(year, month, day);
    if (date && date >= shift(trip.start, -3) && date <= shift(trip.end, 3)) return date;
  }
  return null;
}

function parseDate(token: string) {
  const t = token.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) return validDate(m[1], m[2], m[3]);
  if ((m = /^(20\d{2})年(\d{1,2})月(\d{1,2})日$/.exec(t))) return validDate(m[1], m[2], m[3]);
  if ((m = new RegExp(`^(\\d{1,2})\\s+(${MONTH})\\s+(20\\d{2})$`, "i").exec(t)))
    return validDate(m[3], monthIndex(m[2]), m[1]);
  if ((m = new RegExp(`^(${MONTH})\\s+(\\d{1,2}),?\\s+(20\\d{2})$`, "i").exec(t)))
    return validDate(m[3], monthIndex(m[1]), m[2]);
  if ((m = /^(\d{2})([A-Z]{3})(\d{2}|\d{4})$/i.exec(t)))
    return validDate(m[3].length === 2 ? `20${m[3]}` : m[3], monthIndex(m[2]), m[1]);
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](20\d{2})$/.exec(t))) {
    const [a, b] = [+m[1], +m[2]];
    if (a > 12 && b <= 12) return validDate(m[3], b, a);
    if (b > 12 && a <= 12) return validDate(m[3], a, b);
    // Both day/month readings are possible: leave it for the user.
    return a === b ? validDate(m[3], a, b) : null;
  }
  return null;
}

function datesIn(text: string): DateToken[] {
  return [...clean(text).matchAll(DATE_TOKEN)].flatMap((m) => {
    const date = parseDate(m[0]);
    return date ? [{ date, index: m.index!, end: m.index! + m[0].length }] : [];
  });
}

/** Large-print dates split over stacked cells: "30" / "NOVEMBER" / "Monday". The weekday must match. */
function stackedDate(texts: string[], trip: TripWindow) {
  const joined = texts.map(clean).join(" ");
  const m = new RegExp(
    `^(\\d{1,2})\\s+(${MONTH})\\b\\.?(?:\\s+(20\\d{2}))?(?:\\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*)?`,
    "i",
  ).exec(joined);
  if (!m) return null;
  const date = m[3] ? validDate(m[3], monthIndex(m[2]), m[1]) : yearFromTrip(monthIndex(m[2]), m[1], trip);
  if (!date) return null;
  if (m[4] && WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] !== m[4].slice(0, 3).toLowerCase()) return null;
  return date;
}

function timesIn(text: string) {
  return [...clean(text).matchAll(TIME_TOKEN)].map((m) => {
    const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(m[0])!;
    let hours = +t[1];
    if (t[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (t[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
    return { time: `${pad(hours)}:${t[2]}`, index: m.index! };
  });
}

function parseMoney(text: string, documentText: string): CostData | null {
  // A tax note may carry its own amount: "¥14,630 (incl. tax ¥1,330)".
  const value = clean(text)
    .replace(/\((?:incl\.?|including|inc\.|excl\.?|tax|taxes)\b[^)]*\)/gi, " ")
    .trim();
  if (EXCLUDE_AMOUNT.test(value) || /[=×]|\bx\s*\d/.test(value)) return null;
  const m = MONEY_TOKEN.exec(value);
  if (!m) return null;
  // The cell must be the amount, not a sentence that mentions one.
  const remainder = (value.slice(0, m.index) + value.slice(m.index + m[0].length)).toLowerCase();
  if (
    !/^[\s.,:;()\-–−]*(approx\.?|approximately|\(?(?:taxes |tax )?incl\w*\.?(?: tax\w*)?\)?)?[\s.,:;()\-–]*$/.test(
      remainder,
    )
  )
    return null;
  const mark = m[1] ?? m[3];
  if (!mark) return null;
  const symbols: Record<string, string> = { "€": "EUR", "£": "GBP", S$: "SGD", US$: "USD", A$: "AUD", 円: "JPY" };
  let currency: string | null = /^[A-Z]{3}$/i.test(mark) ? mark.toUpperCase() : (symbols[mark.toUpperCase()] ?? null);
  // "¥" is also used for yuan; accept JPY only when the document itself points to Japan.
  if (mark === "¥" && /\b(JPY|yen|Japan|Prefecture)\b|円|〒/i.test(documentText)) currency = "JPY";
  if (!currency || !CURRENCIES.test(currency)) return null;
  const raw = m[2].replace(/\s/g, "");
  const last = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  let amount: number;
  if (last < 0) amount = Number(raw);
  else {
    const tail = raw.length - last - 1;
    const mixed = raw.includes(",") && raw.includes(".");
    const twoDecimals = !ZERO_DECIMAL.has(currency);
    if (mixed || ((tail === 2 || tail === 1) && twoDecimals))
      amount = Number(`${raw.slice(0, last).replace(/[.,]/g, "")}.${raw.slice(last + 1)}`);
    else if (tail === 3) amount = Number(raw.replace(/[.,]/g, ""));
    else return null;
  }
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
}

/** The type is a keyword guess: medium when a keyword matched, low (not prefilled) otherwise. */
function guessType(text: string): { type: EventType; confidence: Confidence; keyword: string | null } {
  const rules: [EventType, RegExp][] = [
    ["flight", /\b(flight|airlines?|airways|boarding)\b/i],
    // Before lodging words: rental documents mention hotels and check-in desks.
    ["commute", /\b(rent-?a-?car|car rental|rental car|car hire|vehicle rental|rental period)\b/i],
    ["hotel", /\b(hotel|hostel|inn|resort|ryokan|airbnb|lodging|check-?in|check-?out)\b/i],
    ["food", /\b(restaurant|dinner|lunch|breakfast|brunch|table for|bistro|cafe)\b/i],
    ["commute", /\b(train|rail|bus|coach|ferry|shuttle|transfer|taxi|pick-?up)\b/i],
  ];
  for (const [type, pattern] of rules) {
    const keyword = pattern.exec(text)?.[0];
    if (keyword) return { type, confidence: "medium", keyword };
  }
  return { type: "activity", confidence: "low", keyword: null };
}

// ---------------------------------------------------------------- label search

const isLabel = (text: string) =>
  ALL_LABELS.some((pattern) => {
    const m = pattern.exec(clean(text));
    return m && !(m.at(-1) ?? "").trim();
  });

/**
 * Cells below a label, nearest first: the same column, up to 8 rows, stopping at the next label, and
 * continuing at the top of the next page when the label sits at the bottom of its page. A heading
 * (nothing to its right) also offers every cell of the first row below it.
 */
function cellsBelow(label: Segment, doc: Doc, allColumns = false) {
  const { segments, pageHeights } = doc;
  const heading = allColumns || !rightOf(label, segments).length;
  const rows = new Map<number, Segment[]>();
  const pageHeight = pageHeights[label.page - 1] ?? 842;
  const take = (s: Segment) => rows.set(s.line, [...(rows.get(s.line) ?? []), s]);
  const sameColumn = (s: Segment) => s.x0 < label.x1 && s.x1 > label.x0;
  for (const s of segments)
    if (s.page === label.page && s.y0 >= label.y1 - 1 && s.y0 - label.y1 <= label.h * 12 && (sameColumn(s) || heading))
      take(s);
  if (label.y1 > pageHeight * 0.8)
    for (const s of segments) if (s.page === label.page + 1 && s.y0 < pageHeight * 0.15 && sameColumn(s)) take(s);
  const cells: { s: Segment; depth: number }[] = [];
  [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 8)
    .forEach(([, row], depth) => {
      const offered = depth === 0 && heading ? row : row.filter(sameColumn);
      cells.push(...offered.sort((a, b) => a.x0 - b.x0).map((s) => ({ s, depth })));
    });
  if (allColumns) return cells;
  const stop = cells.findIndex(({ s }) => sameColumn(s) && isLabel(s.text));
  return stop >= 0 ? cells.slice(0, stop) : cells;
}

/** Cells to the right of a label in its row, up to the next label: those belong to that label. */
function rowValues(label: Segment, doc: Doc) {
  const cells = rightOf(label, doc.segments);
  const nextLabel = Math.min(...cells.filter(({ s }) => isLabel(s.text)).map(({ s }) => s.x0));
  return cells.filter(({ s }) => s.x0 < nextLabel && !isLabel(s.text)).sort((a, b) => a.distance - b.distance);
}

/** A row of column headers: the next row has a cell under each, so values are read below. */
function headerRow(label: Segment, doc: Doc) {
  const others = doc.segments.filter((s) => s.page === label.page && s.line === label.line && s.id !== label.id);
  if (others.length < 2 || others.some((s) => /\d/.test(s.text) || clean(s.text).split(" ").length > 4)) return false;
  const next = cellsBelow(label, doc, true)[0];
  if (!next) return false;
  const row = doc.segments.filter((s) => s.line === next.s.line);
  return [label, ...others].every((h) => row.some((c) => c.x0 < h.x1 && c.x1 > h.x0));
}

/**
 * Values for a label: inline after it, then its row up to the next label, then the cells below.
 * Every validating label contributes one candidate, so callers can detect conflicts.
 */
function labelled<T>(
  doc: Doc,
  pattern: RegExp,
  validate: (text: string) => T | null,
  { inlineOnly = false, stacked }: { inlineOnly?: boolean; stacked?: (texts: string[]) => T | null } = {},
): Found<T>[] {
  const { segments } = doc;
  const found: Found<T>[] = [];
  for (const label of labelSegments(segments)) {
    const match = pattern.exec(clean(label.text));
    if (!match) continue;
    // A wrapped label never continues into another field's "Key: value" line.
    if (label.parts && KEY_VALUE.test(clean(segments[label.parts[1]]?.text ?? ""))) continue;
    const rest = (match.at(-1) ?? "").trim();
    const evidence = (text: string, confidence: Confidence): Evidence => ({ page: label.page, text, confidence });
    const inline = rest ? validate(rest) : null;
    if (inline !== null) {
      found.push({ value: inline, evidence: evidence(clean(label.text), "high"), label, segment: label });
      continue;
    }
    // "Pick-up address", "Total Adults …": a different label or a sentence, not this one.
    if (rest && /\p{L}{2}/u.test(rest.replace(/^\([^)]*\)/, ""))) continue;
    if (inlineOnly) continue;
    const exclude = new Set(label.parts ?? []);
    let hit: Found<T> | null = null;
    const across = headerRow(label, doc) ? [] : rowValues(label, doc).filter(({ s }) => !exclude.has(s.id));
    for (const { s } of across) {
      const value = validate(s.text);
      if (value !== null) {
        hit = { value, evidence: evidence(`${clean(label.text)} → ${clean(s.text)}`, "high"), label, segment: s };
        break;
      }
    }
    if (!hit) {
      const below = cellsBelow(label, doc).filter(({ s }) => !exclude.has(s.id));
      for (const { s, depth } of below) {
        const value = validate(s.text);
        if (value !== null) {
          const confidence = depth === 0 ? "high" : "medium";
          hit = { value, evidence: evidence(`${clean(label.text)} → ${clean(s.text)}`, confidence), label, segment: s };
          break;
        }
      }
      if (!hit && stacked) {
        const column = below.filter(({ s }) => s.x0 < label.x1 && s.x1 > label.x0).map(({ s }) => s);
        const value = stacked(column.slice(0, 3).map((s) => s.text));
        if (value !== null)
          hit = {
            value,
            evidence: evidence(
              `${clean(label.text)} → ${column
                .slice(0, 3)
                .map((s) => clean(s.text))
                .join(" / ")}`,
              "medium",
            ),
            label,
            segment: column[0],
          };
      }
    }
    if (hit) found.push(hit);
  }
  return found;
}

/** One value when every candidate agrees; a candidate that another from the same cell extends is not a conflict. */
function resolve<T>(found: Found<T>[]): Resolved<T> | null {
  if (!found.length) return null;
  const squash = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, "") : null);
  const sameCell = (a: Found<T>, b: Found<T>) =>
    Boolean(a.label && b.label) &&
    (a.label!.id === b.label!.id || (b.label!.parts ?? ([] as number[])).includes(a.label!.id));
  const kept = found.filter((f) => {
    const short = squash(f.value);
    return !(
      short &&
      found.some((g) => {
        const long = squash(g.value);
        return g !== f && long && long.length > short.length && long.startsWith(short) && sameCell(f, g);
      })
    );
  });
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const distinct = kept.filter((f, i) => kept.findIndex((g) => same(g.value, f.value)) === i);
  if (distinct.length > 1) return { value: null, conflict: true, evidence: kept.map((f) => f.evidence) };
  const confidence = kept.some((f) => f.evidence.confidence === "high") ? "high" : "medium";
  return {
    value: distinct[0].value,
    confidence,
    evidence: kept.map((f) => f.evidence),
    source: { label: kept[0].label, segment: kept[0].segment },
  };
}

function resolveRanked<T>(groups: Found<T>[][]) {
  for (const group of groups) {
    const result = resolve(group);
    if (result) return result;
  }
  return null;
}

// ---------------------------------------------------------------- fields

type Schedule = {
  start: { date: string; time: string | null } | null;
  end: { date: string; time: string | null } | null;
  confidence: Confidence;
  timeConfidence: Confidence;
  evidence: Evidence[];
  notes: string[];
  route: { from: string; to: string; line?: Line } | null;
  departureCell: Segment | null;
  startSegment: Segment | null;
};

function extractSchedule(doc: Doc, trip: TripWindow, type: EventType): Schedule {
  const { segments, lines } = doc;
  const notes: string[] = [];
  const isLodging = type === "hotel";
  const firstDate = (text: string) => datesIn(text)[0]?.date ?? null;
  const stacked = (texts: string[]) => stackedDate(texts, trip);
  const startFound = labelled(doc, START_LABEL, firstDate, { stacked }).filter(
    (f) => !(type === "flight" && /^\s*arrival/i.test(f.label!.text)),
  );
  // "Arrival" ends a journey but starts a stay.
  const endFound = labelled(doc, END_LABEL, firstDate, { stacked }).filter(
    (f) => !(isLodging && /^\s*arriv/i.test(f.label!.text)),
  );
  let start: Resolved<string> | null = resolve(startFound);
  let end: Resolved<string> | null = resolve(endFound);

  // A range cell with exactly two date tokens, including two in one cell on the same day.
  if (!start?.value || !end?.value) {
    for (const label of labelSegments(segments)) {
      if (!RANGE_LABEL.test(clean(label.text))) continue;
      const cell = rightOf(label, segments)
        .map(({ s }) => s)
        .filter((s) => datesIn(s.text).length)
        .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const tokens = cell.flatMap((s) =>
        datesIn(s.text).map((token, i, all) => ({ ...token, next: all[i + 1]?.index, segment: s })),
      );
      if (tokens.length !== 2) continue;
      const [first, second] = tokens[0].date <= tokens[1].date ? tokens : [tokens[1], tokens[0]];
      const evidence: Evidence = {
        page: label.page,
        text: `${clean(label.text)} → ${cell.map((s) => clean(s.text)).join(" / ")}`,
        confidence: "medium",
      };
      const make = (token: DateToken): Resolved<string> => ({
        value: token.date,
        confidence: "medium",
        evidence: [evidence],
        source: { segment: token.segment, token },
      });
      if (start?.value && start.value !== first.date) start = { value: null, conflict: true, evidence: [evidence] };
      else if (!start?.value) start = make(first);
      if (end?.value && end.value !== second.date) end = { value: null, conflict: true, evidence: [evidence] };
      else if (!end?.value) end = make(second);
    }
  }

  // Flight route: codes from the Departure/Arrival blocks, else an arrow line, else a short "X to Y" heading.
  let route: Schedule["route"] = null;
  let departureCell: Segment | null = null;
  if (type === "flight") {
    const endpoint = (pattern: RegExp) => {
      let cells: Segment[] = [];
      for (const label of labelSegments(segments)) {
        const m = pattern.exec(clean(label.text));
        if (!m || (m.at(-1) ?? "").trim()) continue;
        const row = rowValues(label, doc).map(({ s }) => s);
        cells = row.length ? row : cellsBelow(label, doc).map(({ s }) => s);
        break;
      }
      const coded = cells.find((s) => /\(([A-Z]{3})\)/.test(s.text));
      if (coded) return { name: /\(([A-Z]{3})\)/.exec(coded.text)![1], cell: coded };
      const place = cells.find((s) => /^\p{L}[\p{L} .'()-]{2,40}$/u.test(clean(s.text)) && !datesIn(s.text).length);
      return place ? { name: clean(place.text), cell: place } : null;
    };
    const from = endpoint(/^\s*(departure|depart(?:s|ing)?|from)\s*[:\-]?\s*(.*)$/i);
    const to = endpoint(/^\s*(arrival|arriv(?:es|ing)|to)\s*[:\-]?\s*(.*)$/i);
    if (from && to) {
      route = { from: from.name, to: to.name };
      departureCell = from.cell;
    } else
      for (const line of lines) {
        const text = clean(line.text);
        const r =
          /^\s*([A-Z]{3})\s*(?:→|->|✈)\s*([A-Z]{3})\s*$/.exec(text) ??
          /^\s*(\p{Lu}[\p{L}.' ]{2,30}?)\s*(?:✈|→|->)\s*(\p{Lu}[\p{L}.' ]{2,30}?)\s*$/u.exec(text) ??
          (text.length <= 50
            ? /^\s*(?:flight\s*\d*\s*:\s*)?(\p{L}[\p{L}.']+(?: \p{L}[\p{L}.']+){0,2})\s+to\s+(\p{L}[\p{L}.']+(?: \p{L}[\p{L}.']+){0,2})\s*$/iu.exec(
                text,
              )
            : null);
        if (!r) continue;
        route = { from: r[1].trim(), to: r[2].trim(), line };
        break;
      }
  }

  // A known itinerary layout: a route line followed by one row with a departure date (left) and arrival date (right).
  if (type === "flight" && route?.line && (!start?.value || !end?.value)) {
    for (const next of lines.slice(route.line.index + 1, route.line.index + 8)) {
      const row = segments.filter((s) => s.line === next.index && datesIn(s.text).length).sort((a, b) => a.x0 - b.x0);
      if (row.length !== 2) continue;
      const make = (s: Segment): Resolved<string> => ({
        value: datesIn(s.text)[0].date,
        confidence: "medium",
        evidence: [{ page: s.page, text: `${clean(route!.line!.text)}: ${clean(s.text)}`, confidence: "medium" }],
        source: { segment: s },
      });
      start = make(row[0]);
      end = make(row[1]);
      break;
    }
  }

  // Times next to the date: its own cell, a time cell to the right in the row, or directly above/below.
  const timeOnly = (s: Segment) =>
    !datesIn(s.text).length &&
    timesIn(s.text).length > 0 &&
    clean(s.text).replace(/[\d:\s]|AM|PM|HRS/gi, "").length <= 2;
  const timeNear = (resolved: Resolved<string> | null) => {
    const segment = resolved?.source?.segment;
    if (!segment) return null;
    const text = clean(segment.text);
    const token = resolved.source?.token;
    if (token) {
      const own = timesIn(text).filter(
        (t) => t.index >= token.end && (token.next === undefined || t.index < token.next),
      );
      if (own.length) return { times: own, context: text };
    }
    if (timesIn(text).length) return { times: timesIn(text), context: text };
    const row = rightOf(segment, segments)
      .filter(({ s, distance }) => distance <= segment.h * 12 && timeOnly(s))
      .sort((a, b) => a.distance - b.distance);
    if (row[0]) return { times: timesIn(row[0].s.text), context: clean(row[0].s.text) };
    const column = segments
      .filter(
        (s) =>
          s.page === segment.page &&
          s.id !== segment.id &&
          s.x0 < segment.x1 &&
          s.x1 > segment.x0 &&
          Math.abs(centre(s) - centre(segment)) <= segment.h * 3.5,
      )
      .filter(timeOnly)
      .sort((a, b) => Math.abs(centre(a) - centre(segment)) - Math.abs(centre(b) - centre(segment)));
    return column[0] ? { times: timesIn(column[0].text), context: clean(column[0].text) } : null;
  };

  let startTime: string | null = null;
  let endTime: string | null = null;
  let timeConfidence: Confidence = "high";
  const startNear = timeNear(start);
  const endNear = timeNear(end);
  if (isLodging) {
    // Check-in windows, undecided arrivals and approximate checkouts are notes, never confirmed times.
    for (const [name, near] of [
      ["Check-in", startNear],
      ["Checkout", endNear],
    ] as const)
      if (near) notes.push(`${name}: ${near.context}`);
  } else {
    startTime = startNear?.times[0]?.time ?? null;
    endTime = endNear?.times[0]?.time ?? null;
  }

  let startDate = start?.value ?? null;
  let endDate = end?.value ?? null;
  // Airport-local times: convert each through its endpoint's zone; without both zones, keep the source times for review.
  if (type === "flight" && route && startDate && endDate && startTime && endTime) {
    const fromZone = PLACE_ZONES[route.from.toLowerCase()];
    const toZone = PLACE_ZONES[route.to.toLowerCase()];
    if (fromZone && toZone) {
      const s = dateParts(zonedDateTimeToUtc(startDate, startTime, fromZone), trip.timezone);
      const e = dateParts(zonedDateTimeToUtc(endDate, endTime, toZone), trip.timezone);
      if (s.time !== startTime || e.time !== endTime || s.date !== startDate || e.date !== endDate)
        notes.push(`Source times: ${startDate} ${startTime} ${route.from} → ${endDate} ${endTime} ${route.to}`);
      [startDate, startTime, endDate, endTime] = [s.date, s.time, e.date, e.time];
    } else {
      notes.push(`Source times (timezone unknown): ${startTime} ${route.from} → ${endTime} ${route.to}`);
      timeConfidence = "low";
    }
  }
  // The API needs both times or neither.
  if (!startTime || !endTime) startTime = endTime = null;

  const confidence: Confidence = !start?.value
    ? "low"
    : [start.confidence, end?.confidence ?? "medium"].includes("medium")
      ? "medium"
      : "high";
  return {
    start: startDate ? { date: startDate, time: startTime } : null,
    end: endDate ? { date: endDate, time: endTime } : startDate ? { date: startDate, time: endTime } : null,
    confidence,
    timeConfidence,
    evidence: [...(start?.evidence ?? []), ...(end?.evidence ?? [])],
    notes,
    route,
    departureCell,
    startSegment: start?.source?.segment ?? null,
  };
}

function extractTitle(doc: Doc, type: EventType, route: Schedule["route"]) {
  const { segments } = doc;
  if (type === "flight") {
    const flightNumber = (text: string) => {
      const m = FLIGHT_NUMBER_CELL.exec(clean(text));
      return m ? `${m[1]} ${m[2]}` : null;
    };
    const fromLabel = labelled(doc, /^\s*(flight(?: no\.?| number)?)\s*[:\-]?\s*(.*)$/i, flightNumber);
    const fromCells: Found<string>[] = segments.flatMap((s) => {
      const value = flightNumber(s.text);
      return value ? [{ value, evidence: { page: s.page, text: clean(s.text), confidence: "medium" as const } }] : [];
    });
    const number = resolve(fromLabel.length ? fromLabel : fromCells);
    // Only when the flight number and both route endpoints are found.
    if (number?.value && route)
      return {
        title: `Flight ${number.value} · ${route.from} → ${route.to}`,
        confidence: number.confidence!,
        evidence: number.evidence,
      };
    return null;
  }
  const isName = (text: string) => {
    const value = clean(text);
    if (!/\p{L}{3}/u.test(value) || value.length > 100 || GENERIC_TITLE.test(value) || isLabel(value)) return null;
    if (/^[+\d\s()-]{6,}$/.test(value) || /https?:|www\.|@/.test(value)) return null;
    return value;
  };
  const result = resolve([
    ...labelled(doc, NAME_LABEL, isName, { inlineOnly: true }),
    ...labelled(doc, NAME_LABEL_ALONE, isName),
  ]);
  if (!result?.value) return null;
  return { title: result.value, confidence: result.confidence!, evidence: result.evidence };
}

function extractCost(doc: Doc) {
  const documentText = doc.lines.map((l) => l.text).join("\n");
  const found = labelled(doc, TOTAL_LABEL, (text) => parseMoney(text, documentText)).filter(
    (f) => !EXCLUDE_AMOUNT.test(f.label!.text),
  );
  const rankOf = (f: Found<CostData>) =>
    TOTAL_RANKS.findIndex((names) => names.some((n) => clean(f.label!.text).toLowerCase().startsWith(n)));
  const result = resolveRanked(TOTAL_RANKS.map((_, rank) => found.filter((f) => rankOf(f) === rank)));
  if (!result?.value) return null;
  return { cost: result.value, confidence: result.confidence!, evidence: result.evidence };
}

/** "Achasan-ro 7- gil" and "874- 0041" come from joining wrapped lines; the hyphen joins them. */
const joinHyphenWraps = (value: string) => value.replace(/([\p{L}\d])-\s+([\p{L}\d])/gu, "$1-$2");

function extractLocation(doc: Doc, type: EventType, schedule: Schedule) {
  const { segments } = doc;
  if (type === "flight") {
    // The departure airport: from the Departure block, else the airport cell under the departure date.
    let cell = schedule.departureCell;
    if (!cell && schedule.startSegment) {
      const s = schedule.startSegment;
      cell =
        segments
          .filter(
            (c) =>
              c.page === s.page &&
              c.x0 < s.x1 &&
              c.x1 > s.x0 &&
              c.y0 > s.y1 &&
              c.y0 - s.y1 < s.h * 8 &&
              /\b(airport|intl|international)\b/i.test(c.text),
          )
          .sort((a, b) => a.y0 - b.y0)[0] ?? null;
    }
    if (!cell) return null;
    const anchor = cell;
    const next = segments.find(
      (c) =>
        c.page === anchor.page &&
        Math.abs(c.x0 - anchor.x0) < anchor.h &&
        c.y0 > anchor.y1 - 1 &&
        c.y0 - anchor.y1 < anchor.h * 1.5,
    );
    const value =
      next && /^airport$/i.test(clean(next.text)) ? `${clean(cell.text)} ${clean(next.text)}` : clean(cell.text);
    return {
      value,
      confidence: "medium" as Confidence,
      evidence: [{ page: cell.page, text: value, confidence: "medium" as Confidence }],
    };
  }
  const isAddress = (text: string) => {
    const value = clean(text);
    return /\d/.test(value) && value.length >= 8 && !/@|https?:/.test(value) && !datesIn(value).length ? value : null;
  };
  const result = resolveRanked(ADDRESS_RANKS.map((pattern) => labelled(doc, pattern, isAddress)));
  if (!result?.value) return null;
  const segment = result.source?.segment;
  let value = result.value;
  if (segment && segment !== result.source?.label) {
    const rest = segments
      .filter(
        (s) =>
          s.page === segment.page &&
          s.line === segment.line &&
          s.x0 > segment.x1 &&
          !isLabel(s.text) &&
          s.x0 - segment.x1 < segment.h * 4,
      )
      .sort((a, b) => a.x0 - b.x0);
    value = [value, ...rest.map((s) => clean(s.text))].join(" ");
  }
  // Follow a wrapped address onto the very next line, by centre because tall glyph boxes can overlap it.
  let anchor = segment ?? result.source?.label;
  for (let step = 0; anchor && step < 3 && /[-,]$/.test(value); step += 1) {
    const from: Segment = anchor;
    const next = segments
      .filter(
        (s) =>
          s.page === from.page &&
          s.id !== from.id &&
          centre(s) > centre(from) + from.h * 0.4 &&
          s.y0 - from.y1 <= from.h * 1.5 &&
          Math.abs(s.x0 - from.x0) <= from.h * 2,
      )
      .sort((a, b) => a.y0 - b.y0)[0];
    if (!next || isLabel(next.text) || KEY_VALUE.test(clean(next.text))) break;
    value = `${value}${value.endsWith("-") ? "" : " "}${clean(next.text)}`;
    anchor = next;
  }
  return { value: joinHyphenWraps(value), confidence: result.confidence!, evidence: result.evidence };
}

// ---------------------------------------------------------------- draft

const evidenceText = (evidence: Evidence[] | undefined) =>
  evidence?.length ? `p.${evidence[0].page}: ${evidence[0].text}` : null;

/** Extracts one reviewable draft. Throws a user-facing error when the PDF has no readable text. */
export function extractPdfReservation(text: PdfText, trip: PdfTrip): ReservationDraft {
  const doc: Doc = { ...layout(text.words), pageHeights: text.pageHeights };
  const firstPage = doc.lines
    .filter((l) => l.page === 1)
    .map((l) => l.text)
    .join("\n");
  if (firstPage.replace(/\s/g, "").length < 40)
    throw new Error("This PDF has no readable text. Scanned PDFs need OCR before they can be read.");
  const window: TripWindow = {
    start: trip.startDate.slice(0, 10),
    end: trip.endDate.slice(0, 10),
    timezone: trip.timezone,
  };
  const guessed = guessType(firstPage);
  const schedule = extractSchedule(doc, window, guessed.type);
  const title = extractTitle(doc, guessed.type, schedule.route);
  const cost = extractCost(doc);
  const location = extractLocation(doc, guessed.type, schedule);

  // An OCR layer is never high confidence: values are shown for review.
  const cap = (confidence: Confidence): Confidence => (text.ocrLayer && confidence === "high" ? "medium" : confidence);
  const review: Partial<Record<ReviewField, FieldReview>> = {
    type: { confidence: guessed.confidence, evidence: guessed.keyword && `Guessed from "${clean(guessed.keyword)}"` },
  };
  const shown = (field: ReviewField, confidence: Confidence | undefined, evidence: Evidence[] | undefined) => {
    if (!confidence || confidence === "low") return false;
    review[field] = { confidence: cap(confidence), evidence: evidenceText(evidence) };
    return true;
  };

  const hasDates = shown("dates", schedule.start ? schedule.confidence : undefined, schedule.evidence);
  const hasTimes =
    hasDates &&
    Boolean(schedule.start?.time && schedule.end?.time) &&
    shown("times", schedule.timeConfidence === "low" ? "low" : schedule.confidence, schedule.evidence);
  const hasTitle = shown("title", title?.confidence, title?.evidence);
  const hasCost = shown("cost", cost?.confidence, cost?.evidence);
  const hasLocation = shown("location", location?.confidence, location?.evidence);

  const notes = [
    ...schedule.notes,
    text.ocrLayer ? "Read from the PDF's OCR text layer; check every value." : null,
  ].filter(Boolean);
  const location_: LocationData | null = hasLocation ? { name: location!.value.slice(0, 300) } : null;
  return {
    title: hasTitle ? title!.title.slice(0, 100) : "",
    type: guessed.type,
    date: hasDates ? schedule.start!.date : null,
    endDate: hasDates ? schedule.end!.date : null,
    startTime: hasTimes ? schedule.start!.time : null,
    endTime: hasTimes ? schedule.end!.time : null,
    isAllDay: hasDates && !hasTimes,
    location: location_,
    cost: hasCost ? cost!.cost : null,
    notes: notes.length ? truncateUtf8(notes.join("\n\n"), 2500) : null,
    review,
  };
}
