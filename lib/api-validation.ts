export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readTrimmedString(
  value: unknown,
  field: string,
  { optional = false }: { optional?: boolean } = {},
) {
  if (value === undefined && optional) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }

  return value.trim();
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

  return value.map((tag) => tag.trim()).filter(Boolean);
}

export function readPositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${field} must be a positive integer.`);
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
