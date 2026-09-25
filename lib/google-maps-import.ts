import { api } from "./api-client.ts";
import { parseGoogleMapsCsv } from "./google-maps-csv.ts";
import { truncateUtf8 } from "./text-utils.ts";
import type { Trip } from "../types/travel.ts";

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
}

/** Resolve locations and create the parsed rows while preserving links without coordinates. */
export async function importGoogleMapsCsv(text: string, trip: Pick<Trip, "id" | "timezone">, eventTypes: readonly string[], onProgress: (complete: number, total: number) => void) {
  const { records, newTypes, skipped, invalidDates } = parseGoogleMapsCsv(text, trip.timezone, eventTypes);
  let resolvedCount = 0;
  let unresolvedCount = 0;
  onProgress(0, records.length);
  const resolvedRecords = await mapWithConcurrency(records, 4, async (record) => {
    try {
      const result = await api.resolveMapsUrl(record.url);
      const hasCoordinates = result.lat != null && result.lng != null;
      if (!hasCoordinates) unresolvedCount += 1;
      return { ...record, location: { name: record.title.slice(0, 300), googleMapsUrl: record.url, ...(hasCoordinates ? { lat: result.lat!, lng: result.lng! } : {}) } };
    } catch {
      unresolvedCount += 1;
      return { ...record, location: { name: record.title.slice(0, 300), googleMapsUrl: record.url } };
    } finally {
      resolvedCount += 1;
      onProgress(resolvedCount, records.length);
    }
  });
  const outcomes = await Promise.allSettled(resolvedRecords.map((record) => api.createObject({ tripId: trip.id, title: record.title.slice(0, 100), type: record.type, date: record.schedule.date, endDate: record.schedule.endDate, startTime: record.schedule.startTime, endTime: record.schedule.endTime, isAllDay: record.schedule.isAllDay, location: record.location, cost: null, notes: truncateUtf8(record.notes, 2500) || null, tags: [] })));
  const created = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  const failed = outcomes.flatMap((outcome, index) => outcome.status === "rejected" ? [{ title: resolvedRecords[index].title, reason: outcome.reason instanceof Error ? outcome.reason.message : "Could not create place." }] : []);
  const createdTypes = new Set(created.map((item) => item.type));
  return { created, failed, newTypes: newTypes.filter((type) => createdTypes.has(type)), skipped, invalidDates, unresolvedCount };
}
