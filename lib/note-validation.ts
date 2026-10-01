import { readTrimmedString, type JsonRecord } from "./api-validation.ts";
export function readEntryKind(value: unknown): "event" | "note" {
  if (value === undefined || value === "event") return "event";
  if (value === "note") return "note";
  throw new Error("kind must be event or note.");
}
export function readNoteBody(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) throw new Error("noteBody must be text with at most 500 characters.");
  return value;
}
export function validateNoteInput(body: JsonRecord) {
  const allowed = new Set(["tripId", "kind", "type", "title", "noteBody", "date", "endDate", "placementTime", "dayOrder", "startTime", "endTime", "isAllDay"]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new Error(`Unsupported note field: ${key}.`);
  if (body.type !== undefined && body.type !== "unclassified") throw new Error("Notes do not have an event type.");
  if (body.startTime != null || body.endTime != null || (body.isAllDay !== undefined && body.isAllDay !== false)) throw new Error("Notes must remain flexible, without confirmed times.");
}
export function readNoteTitle(value: unknown) {
  if (value === undefined || value === "") return "Note";
  return readTrimmedString(value, "title", { maxLength: 100 })!;
}
