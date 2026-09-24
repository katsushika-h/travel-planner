"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { parseGoogleMapsCsv } from "@/lib/google-maps-csv";
import type { TravelObject, Trip } from "@/types/travel";

function truncateUtf8(value: string, maxBytes: number) { let result = ""; for (const character of value) { if (new TextEncoder().encode(result + character).byteLength > maxBytes) break; result += character; } return result; }
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

export function ImportGoogleMapsCsvButton({ trip, eventTypes, onAddType, onImported, onError, compact = false }: { trip: Trip; eventTypes: string[]; onAddType: (type: string) => void; onImported: (items: TravelObject[]) => void; onError: (message: string) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ complete: number; total: number } | null>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); onError("");
    try {
      const { records, newTypes, skipped, invalidDates } = parseGoogleMapsCsv(await file.text(), trip.timezone, eventTypes);
      let resolvedCount = 0;
      let unresolvedCount = 0;
      setImportProgress({ complete: 0, total: records.length });
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
          setImportProgress({ complete: resolvedCount, total: records.length });
        }
      });
      const created = await Promise.all(resolvedRecords.map((record) => api.createObject({ tripId: trip.id, title: record.title.slice(0, 100), type: record.type, date: record.schedule.date, endDate: record.schedule.endDate, startTime: record.schedule.startTime, endTime: record.schedule.endTime, isAllDay: record.schedule.isAllDay, location: record.location, cost: null, notes: truncateUtf8(record.notes, 2500) || null, tags: [] })));
      for (const type of newTypes) onAddType(type);
      onImported(created);
      if (skipped || invalidDates || unresolvedCount) onError(`Imported ${created.length} places.${unresolvedCount ? ` ${unresolvedCount} ${unresolvedCount === 1 ? "link did" : "links did"} not contain resolvable coordinates.` : ""}${skipped ? ` Skipped ${skipped} empty rows.` : ""}${invalidDates ? ` ${invalidDates} rows had an unrecognized date or time and were left unscheduled.` : ""}`);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not import the Google Maps CSV."); }
    finally { setImporting(false); setImportProgress(null); if (inputRef.current) inputRef.current.value = ""; }
  }

  const label = importProgress ? `Resolving ${importProgress.complete}/${importProgress.total}` : "Import Maps CSV";
  return <><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importFile(event.target.files?.[0])} /><Button type="button" variant="ghost" size={compact ? "icon" : "sm"} className={compact ? "mx-auto" : "w-full justify-start"} aria-label={label} title={compact ? label : undefined} disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? <LoaderCircle className="animate-spin" /> : <FileUp />}{!compact && label}</Button></>;
}
