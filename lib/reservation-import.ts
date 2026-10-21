import { dateParts, zonedDateTimeToUtc } from "./date-utils.ts";
import { truncateUtf8 } from "./text-utils.ts";
import type { CostData, EventType, LocationData } from "../types/travel.ts";

/** An unsaved item read from a reservation file, shown for review before it is created. */
export interface ReservationDraft {
  title: string;
  type: EventType;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: LocationData | null;
  cost: CostData | null;
  notes: string | null;
  /** Where each value came from; PDF drafts set it so the review dialog can show evidence. */
  review?: Partial<Record<ReviewField, FieldReview>>;
}

export type ReviewField = "type" | "title" | "dates" | "times" | "cost" | "location";

/** Medium values are prefilled but highlighted; low values are not prefilled. */
export interface FieldReview {
  confidence: "high" | "medium" | "low";
  evidence: string | null;
}

/** Trip-local date and optional time, plus the source text when the wall-clock time changed. */
interface LocalMoment {
  date: string;
  time: string | null;
  shiftedFrom: string | null;
}

type JsonRecord = Record<string, unknown>;

export const reservationFileAccept = ".ics,.eml,.html,.htm,.pdf";

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validDate(date: string) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function addMinutes(date: string, time: string, minutes: number) {
  const value = new Date(Date.parse(`${date}T${time}:00Z`) + minutes * 60_000).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

/** Converts an absolute instant to the trip timezone, remembering the source when the clock time moves. */
function fromInstant(utcMs: number, sourceDate: string, sourceTime: string, source: string, timeZone: string) {
  if (!Number.isFinite(utcMs)) return null;
  const local = dateParts(new Date(utcMs), timeZone);
  const shifted = local.date !== sourceDate || local.time !== sourceTime;
  return { date: local.date, time: local.time, shiftedFrom: shifted ? source : null };
}

/** Reads ISO 8601 dates and date-times; offsets are converted to the trip timezone, floating times are kept. */
export function localFromIso(value: unknown, timeZone: string): LocalMoment | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return validDate(text) ? { date: text, time: null, shiftedFrom: null } : null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
    text,
  );
  if (!match || !validDate(match[1])) return null;
  const [, date, hours, minutes, zone] = match;
  const time = `${hours}:${minutes}`;
  if (!zone) return { date, time, shiftedFrom: null };
  const offset = zone === "Z" ? "Z" : zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
  return fromInstant(Date.parse(`${date}T${time}:00${offset}`), date, time, text, timeZone);
}

/** Reads an iCalendar DATE or DATE-TIME, honouring UTC and IANA TZID values. */
function localFromIcs(value: string, tzid: string | undefined, timeZone: string): LocalMoment | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hours, minutes, utc] = match;
  const date = `${year}-${month}-${day}`;
  if (!validDate(date)) return null;
  if (hours === undefined) return { date, time: null, shiftedFrom: null };
  const time = `${hours}:${minutes}`;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const source = `${date} ${time}${utc ? " UTC" : tzid ? ` ${tzid}` : ""}`;
  if (utc) return fromInstant(Date.parse(`${date}T${time}:00Z`), date, time, source, timeZone);
  // Unknown (for example Windows) zone names are treated as trip-local floating times.
  if (tzid && validTimeZone(tzid))
    return fromInstant(Date.parse(zonedDateTimeToUtc(date, time, tzid)), date, time, source, timeZone);
  return { date, time, shiftedFrom: null };
}

/** Builds valid canonical schedule fields; a start without a usable end gets a default duration. */
function schedule(start: LocalMoment | null, end: LocalMoment | null, defaultMinutes: number) {
  if (!start) return { date: null, endDate: null, startTime: null, endTime: null, isAllDay: false };
  if (start.time === null) {
    const endDate = end && end.date > start.date ? end.date : start.date;
    return { date: start.date, endDate, startTime: null, endTime: null, isAllDay: true };
  }
  const endsAfterStart =
    end?.time != null && (end.date > start.date || (end.date === start.date && end.time > start.time));
  const finish = endsAfterStart
    ? { date: end.date, time: end.time! }
    : addMinutes(start.date, start.time, defaultMinutes);
  return { date: start.date, endDate: finish.date, startTime: start.time, endTime: finish.time, isAllDay: false };
}

function sourceTimesNote(...moments: (LocalMoment | null)[]) {
  const shifted = moments.filter((moment) => moment?.shiftedFrom).map((moment) => moment!.shiftedFrom);
  return shifted.length ? `Converted to the trip timezone from: ${shifted.join(" → ")}` : null;
}

function finishNotes(lines: (string | null | undefined)[]) {
  const text = lines
    .map((line) => line?.trim())
    .filter(Boolean)
    .join("\n\n");
  return text ? truncateUtf8(text, 2500) : null;
}

function clip(value: string, length: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

function guessType(text: string): EventType {
  if (/\b(flight|airlines?|airways|boarding)\b/i.test(text)) return "flight";
  if (/\b(hotel|hostel|inn|resort|ryokan|airbnb|lodging|check-?in)\b/i.test(text)) return "hotel";
  if (/\b(restaurant|dinner|lunch|breakfast|brunch|table for|bistro|cafe)\b/i.test(text)) return "food";
  if (/\b(train|rail|bus|coach|ferry|shuttle|transfer|taxi|car rental|rental car|pick-?up)\b/i.test(text))
    return "commute";
  return "activity";
}

// ---------------------------------------------------------------------------
// iCalendar

function unfoldIcs(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeIcs(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, character: string) =>
    character === "n" || character === "N" ? "\n" : character,
  );
}

interface IcsProperty {
  value: string;
  params: Record<string, string>;
}

function readIcsEvents(text: string) {
  const events: Map<string, IcsProperty>[] = [];
  let current: Map<string, IcsProperty> | null = null;
  let nested = 0;
  for (const line of unfoldIcs(text).split("\n")) {
    const separator = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (separator < 0) continue;
    const [name, ...rawParams] = line.slice(0, separator).split(";");
    const key = name.toUpperCase();
    const value = line.slice(separator + 1);
    if (key === "BEGIN" && value.toUpperCase() === "VEVENT") current = new Map();
    else if (current && key === "BEGIN") nested += 1;
    else if (current && key === "END" && nested) nested -= 1;
    else if (current && key === "END" && value.toUpperCase() === "VEVENT") {
      events.push(current);
      current = null;
    } else if (current && !nested && !current.has(key)) {
      const params: Record<string, string> = {};
      for (const param of rawParams) {
        const [paramName, ...paramValue] = param.split("=");
        params[paramName.toUpperCase()] = paramValue.join("=").replace(/^"|"$/g, "");
      }
      current.set(key, { value, params });
    }
  }
  return events;
}

/** Parses each VEVENT of an iCalendar file; cancelled events are skipped. */
export function parseIcsReservations(text: string, timeZone: string): ReservationDraft[] {
  return readIcsEvents(text).flatMap((event) => {
    if (event.get("STATUS")?.value.toUpperCase() === "CANCELLED") return [];
    const read = (key: string) => {
      const value = event.get(key)?.value;
      return value ? unescapeIcs(value).trim() : "";
    };
    const startProperty = event.get("DTSTART");
    const endProperty = event.get("DTEND");
    const start = startProperty ? localFromIcs(startProperty.value, startProperty.params.TZID, timeZone) : null;
    let end = endProperty ? localFromIcs(endProperty.value, endProperty.params.TZID, timeZone) : null;
    // iCalendar all-day ends are exclusive.
    if (end && end.time === null) {
      const previous = addMinutes(end.date, "00:00", -1440).date;
      end = { ...end, date: start && previous < start.date ? start.date : previous };
    }
    const summary = read("SUMMARY");
    const description = read("DESCRIPTION");
    const place = read("LOCATION");
    const [lat, lng] = read("GEO")
      .split(";")
      .map((part) => (part.trim() ? Number(part) : NaN));
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
    const location: LocationData | null =
      place || hasGeo ? { ...(place ? { name: clip(place, 300) } : {}), ...(hasGeo ? { lat, lng } : {}) } : null;
    const type = guessType(`${summary} ${description}`);
    return [
      {
        title: clip(summary || place || "Reservation", 100),
        type,
        ...schedule(start, end, type === "food" ? 90 : 60),
        location,
        cost: null,
        notes: finishNotes([description, sourceTimesNote(start, end)]),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// schema.org JSON-LD in HTML pages and emails

function decodeBytes(bytes: Uint8Array, charset: string) {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function decodeQuotedPrintable(body: string, charset: string) {
  const raw = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let index = 0; index < raw.length; index += 1) {
    const hex = raw[index] === "=" ? raw.slice(index + 1, index + 3) : "";
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else {
      const codePoint = raw.codePointAt(index)!;
      const character = String.fromCodePoint(codePoint);
      bytes.push(...encoder.encode(character));
      index += character.length - 1;
    }
  }
  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBase64(body: string, charset: string) {
  try {
    const binary = atob(body.replace(/\s+/g, ""));
    return decodeBytes(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      charset,
    );
  } catch {
    return "";
  }
}

function headerParam(header: string, name: string) {
  const match = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(header);
  return match?.[1] ?? match?.[2] ?? "";
}

/** Decoded bodies of every non-multipart MIME part of an email. */
function mimeBodies(message: string, depth = 0): string[] {
  const text = message.replace(/\r\n?/g, "\n");
  const split = text.indexOf("\n\n");
  if (split < 0 || depth > 10) return [text];
  const headers = new Map<string, string>();
  for (const line of text
    .slice(0, split)
    .replace(/\n[ \t]+/g, " ")
    .split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const body = text.slice(split + 2);
  const contentType = headers.get("content-type") ?? "text/plain";
  const boundary = headerParam(contentType, "boundary");
  if (/^multipart\//i.test(contentType) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1);
    return parts
      .filter((part) => !part.startsWith("--"))
      .flatMap((part) => mimeBodies(part.replace(/^[ \t]*\n/, ""), depth + 1));
  }
  const charset = headerParam(contentType, "charset");
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
  if (encoding === "base64") return [decodeBase64(body, charset)];
  if (encoding === "quoted-printable") return [decodeQuotedPrintable(body, charset)];
  return [body];
}

function jsonLdNodes(html: string) {
  const nodes: JsonRecord[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) {
      nodes.push(value);
      if (Array.isArray(value["@graph"])) value["@graph"].forEach(visit);
    }
  };
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of scripts) {
    try {
      visit(JSON.parse(json.trim()));
    } catch {
      // Ignore malformed blocks; other blocks may still describe the reservation.
    }
  }
  return nodes;
}

function types(node: unknown) {
  if (!isRecord(node)) return [];
  const value = node["@type"];
  return (Array.isArray(value) ? value : [value])
    .filter((type): type is string => typeof type === "string")
    .map((type) => type.replace(/^https?:\/\/schema\.org\//, ""));
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value)) return str(value.name);
  return "";
}

function address(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return "";
  return ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"]
    .map((key) => str(value[key]))
    .filter(Boolean)
    .join(", ");
}

function placeOf(value: unknown): LocationData | null {
  if (typeof value === "string") return value.trim() ? { name: clip(value, 300) } : null;
  if (!isRecord(value)) return null;
  const name = str(value.name) || str(value.iataCode);
  const street = address(value.address);
  const geo = isRecord(value.geo) ? value.geo : value;
  const lat = Number(geo.latitude);
  const lng = Number(geo.longitude);
  const hasGeo = geo.latitude != null && geo.longitude != null && Number.isFinite(lat) && Number.isFinite(lng);
  if (!name && !street && !hasGeo) return null;
  return {
    ...(name || street ? { name: clip(name || street, 300) } : {}),
    ...(street && street !== name ? { address: clip(street, 300) } : {}),
    ...(hasGeo ? { lat, lng } : {}),
  };
}

function costOf(reservation: JsonRecord): CostData | null {
  const total = reservation.totalPrice;
  const spec = isRecord(total) ? total : null;
  const price = str(spec ? spec.price : total).replace(/,/g, "");
  const amount = Number(price);
  const currency = str(spec?.priceCurrency ?? reservation.priceCurrency).toUpperCase();
  if (!price || !Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  return { amount: Math.round(amount * 1000) / 1000, currency };
}

function airportLabel(value: unknown) {
  if (!isRecord(value)) return str(value);
  return str(value.iataCode) || str(value.name);
}

function draftFromReservation(reservation: JsonRecord, timeZone: string): ReservationDraft | null {
  const [kind = "Reservation"] = types(reservation);
  const status = str(reservation.reservationStatus);
  if (/Cancelled$/i.test(status)) return null;
  const target = isRecord(reservation.reservationFor) ? reservation.reservationFor : {};
  const confirmation = str(reservation.reservationNumber);
  const provider = str(reservation.provider) || str(reservation.broker) || str(target.provider);
  const base = {
    cost: costOf(reservation),
    confirmation: confirmation ? `Confirmation: ${confirmation}` : null,
    provider: provider ? `Booked with ${provider}` : null,
  };
  const draft = (
    title: string,
    type: EventType,
    start: LocalMoment | null,
    end: LocalMoment | null,
    location: LocationData | null,
    defaultMinutes: number,
    details: (string | null)[] = [],
  ): ReservationDraft => ({
    title: clip(title || "Reservation", 100),
    type,
    ...schedule(start, end, defaultMinutes),
    location,
    cost: base.cost,
    notes: finishNotes([base.confirmation, base.provider, ...details, sourceTimesNote(start, end)]),
  });

  if (kind === "FlightReservation") {
    const airline = isRecord(target.airline) ? str(target.airline.iataCode) || str(target.airline) : "";
    const number = str(target.flightNumber);
    const flight = number && airline && !number.startsWith(airline) ? `${airline}${number}` : number;
    const from = airportLabel(target.departureAirport);
    const to = airportLabel(target.arrivalAirport);
    return draft(
      [`Flight${flight ? ` ${flight}` : ""}`, from && to ? `${from} → ${to}` : ""].filter(Boolean).join(" "),
      "flight",
      localFromIso(target.departureTime, timeZone),
      localFromIso(target.arrivalTime, timeZone),
      placeOf(target.departureAirport),
      120,
      [str(reservation.airplaneSeat) ? `Seat ${str(reservation.airplaneSeat)}` : null],
    );
  }
  if (kind === "LodgingReservation")
    return draft(
      str(target) || "Hotel stay",
      "hotel",
      localFromIso(reservation.checkinTime ?? reservation.checkinDate, timeZone),
      localFromIso(reservation.checkoutTime ?? reservation.checkoutDate, timeZone),
      placeOf(target),
      60,
    );
  if (kind === "FoodEstablishmentReservation") {
    const party = str(reservation.partySize);
    return draft(
      str(target) || "Restaurant",
      "food",
      localFromIso(reservation.startTime, timeZone),
      localFromIso(reservation.endTime, timeZone),
      placeOf(target),
      90,
      [party ? `Party of ${party}` : null],
    );
  }
  if (kind === "TrainReservation" || kind === "BusReservation" || kind === "BoatReservation") {
    const mode = kind === "TrainReservation" ? "Train" : kind === "BusReservation" ? "Bus" : "Ferry";
    const departure = target.departureStation ?? target.departureBusStop ?? target.departureBoatTerminal;
    const arrival = target.arrivalStation ?? target.arrivalBusStop ?? target.arrivalBoatTerminal;
    const number = str(target.trainNumber) || str(target.busNumber);
    const from = str(departure);
    const to = str(arrival);
    return draft(
      [`${mode}${number ? ` ${number}` : ""}`, from && to ? `${from} → ${to}` : ""].filter(Boolean).join(" "),
      "commute",
      localFromIso(target.departureTime, timeZone),
      localFromIso(target.arrivalTime, timeZone),
      placeOf(departure),
      60,
    );
  }
  if (kind === "RentalCarReservation")
    return draft(
      `Car rental${provider ? ` · ${provider}` : ""}`,
      "commute",
      localFromIso(reservation.pickupTime, timeZone),
      localFromIso(reservation.dropoffTime, timeZone),
      placeOf(reservation.pickupLocation),
      60,
      [
        str(reservation.dropoffLocation)
          ? `Drop-off: ${address(reservation.dropoffLocation) || str(reservation.dropoffLocation)}`
          : null,
      ],
    );
  if (kind === "EventReservation")
    return draft(
      str(target) || "Event",
      "activity",
      localFromIso(target.startDate ?? reservation.startTime, timeZone),
      localFromIso(target.endDate ?? reservation.endTime, timeZone),
      placeOf(target.location),
      120,
    );
  const title = str(target) || str(reservation.name);
  return draft(
    title,
    guessType(`${kind} ${title}`),
    localFromIso(reservation.startTime ?? target.startDate, timeZone),
    localFromIso(reservation.endTime ?? target.endDate, timeZone),
    placeOf(target.location ?? target),
    60,
  );
}

/** Parses schema.org reservations embedded as JSON-LD in an HTML page or email. */
export function parseJsonLdReservations(html: string, timeZone: string): ReservationDraft[] {
  return jsonLdNodes(html).flatMap((node) => {
    if (!types(node).some((type) => type.endsWith("Reservation"))) return [];
    return draftFromReservation(node, timeZone) ?? [];
  });
}

/** Reads reservations from a supported file; throws a user-facing error when none are found. */
export function parseReservationFile(fileName: string, text: string, timeZone: string): ReservationDraft[] {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  let drafts: ReservationDraft[];
  if (extension === "ics" || /^\s*BEGIN:VCALENDAR/i.test(text)) drafts = parseIcsReservations(text, timeZone);
  else if (extension === "eml") {
    // Prefer structured markup; fall back to an attached calendar invite.
    const bodies = mimeBodies(text);
    drafts = bodies.flatMap((body) => parseJsonLdReservations(body, timeZone));
    if (!drafts.length)
      drafts = bodies
        .filter((body) => /^\s*BEGIN:VCALENDAR/i.test(body))
        .flatMap((body) => parseIcsReservations(body, timeZone));
  } else if (extension === "html" || extension === "htm") drafts = parseJsonLdReservations(text, timeZone);
  else throw new Error("Choose a PDF, an .ics calendar file, an .eml email, or a saved .html confirmation page.");
  // Emails and pages often repeat the same block, for example in plain and HTML parts.
  const seen = new Set<string>();
  drafts = drafts.filter((draft) => {
    const key = JSON.stringify(draft);
    return !seen.has(key) && Boolean(seen.add(key));
  });
  if (!drafts.length)
    throw new Error(
      "No reservation details were found in this file. Booking emails need schema.org markup; try the .ics invite instead.",
    );
  return drafts;
}
