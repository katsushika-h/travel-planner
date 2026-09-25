type DatedObject = { date: Date | string | null; endDate: Date | string | null };

function dateOnly(value: Date | string | null) {
  return value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Return canonical date-only schedule fields in every travel-object response. */
export function serializeTravelObject<T extends DatedObject>(item: T) {
  return { ...item, date: dateOnly(item.date), endDate: dateOnly(item.endDate) };
}
