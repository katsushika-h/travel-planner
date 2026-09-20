export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readTrimmedString(
  value: unknown,
  field: string,
  { optional = false, maxLength, maxBytes }: { optional?: boolean; maxLength?: number; maxBytes?: number } = {},
) {
  if (value === undefined && optional) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  const result = value.trim();
  if (maxLength !== undefined && result.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  if (maxBytes !== undefined && new TextEncoder().encode(result).byteLength > maxBytes) throw new Error(`${field} must be ${maxBytes} bytes or fewer.`);
  return result;
}

export function readDate(value: unknown, field: string, dateOnly = false) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO date string.`);
  }

  const normalized = dateOnly ? `${value}T00:00:00.000Z` : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date string.`);
  }

  return date;
}

export function readTime(value: unknown, field: string) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${field} must be a 24-hour time in HH:MM format.`);
  }
  return value;
}

export function readPlacementTime(value: unknown, field: string) {
  const time = readTime(value, field);
  if (Number(time.slice(3, 5)) % 15 !== 0) {
    throw new Error(`${field} must fall on a 15-minute interval.`);
  }
  return time;
}

export function readTimeZone(value: unknown) {
  const timezone = readTrimmedString(value, "timezone");

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error("timezone must be a valid IANA timezone name.");
  }

  return timezone;
}

export function readTags(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error("tags must be an array of strings.");
  }

  const tags = [...new Set(value.flatMap((tag) => tag.trim().split(/\s+/)).filter(Boolean))];
  if (tags.length > 10) throw new Error("tags must contain 10 entries or fewer.");
  if (tags.some((tag) => tag.length > 50)) throw new Error("tags must be 50 characters or fewer.");
  return tags;
}

export function validateCost(value: unknown) {
  if (value === undefined || value === null) return;
  if (!isRecord(value) || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) throw new Error("cost must have a non-negative numeric amount.");
  if (value.amount >= 10_000_000_000 || String(value.amount).replace(/\D/g, "").length > 10) throw new Error("cost amount must contain 10 digits or fewer.");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) throw new Error("cost must have a three-letter currency code.");
}

export function validateLocation(value: unknown) {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) throw new Error("location must be a JSON object or null.");
  if (value.name !== undefined && (typeof value.name !== "string" || value.name.length > 300)) throw new Error("location name must be 300 characters or fewer.");
}

export function readPositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return value as number;
}

export function readNonNegativeInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value as number;
}

export async function readJsonBody(request: Request): Promise<JsonRecord> {
  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body;
}

export function readEventType(value: unknown, field = "type") {
  const type = readTrimmedString(value, field)!;
  if (type.length > 20) throw new Error(`${field} must be 20 characters or fewer.`);
  return type;
}

export function readHeaderImage(value: unknown) {
  if (value === null) return null;
  const image = readTrimmedString(value, "headerImage")!;
  try {
    const url = new URL(image);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch { /* report the validation error below */ }
  throw new Error("headerImage must be an http or https image URL.");
}
