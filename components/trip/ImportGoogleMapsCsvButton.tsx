"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importGoogleMapsCsv } from "@/lib/google-maps-import";
import type { TravelObject, Trip } from "@/types/travel";

export function ImportGoogleMapsCsvButton({ trip, eventTypes, onAddType, onImported, onError, compact = false }: { trip: Trip; eventTypes: string[]; onAddType: (type: string) => void; onImported: (items: TravelObject[]) => void; onError: (message: string) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ complete: number; total: number } | null>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); onError("");
    try {
      const { created, failed, newTypes, skipped, invalidDates, unresolvedCount } = await importGoogleMapsCsv(await file.text(), trip, eventTypes, (complete, total) => setImportProgress({ complete, total }));
      for (const type of newTypes) onAddType(type);
      onImported(created);
      if (failed.length || skipped || invalidDates || unresolvedCount) onError(`Imported ${created.length} places.${failed.length ? ` ${failed.length} could not be confirmed: ${failed.slice(0, 3).map(({ title, reason }) => `${title} (${reason})`).join("; ")}${failed.length > 3 ? `; and ${failed.length - 3} more` : ""}. Check the trip before retrying.` : ""}${unresolvedCount ? ` ${unresolvedCount} ${unresolvedCount === 1 ? "link did" : "links did"} not contain resolvable coordinates.` : ""}${skipped ? ` Skipped ${skipped} empty rows.` : ""}${invalidDates ? ` ${invalidDates} rows had an unrecognized date or time and were left unscheduled.` : ""}`);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not import the Google Maps CSV."); }
    finally { setImporting(false); setImportProgress(null); if (inputRef.current) inputRef.current.value = ""; }
  }

  const label = importProgress ? `Resolving ${importProgress.complete}/${importProgress.total}` : "Import Maps CSV";
  return <><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importFile(event.target.files?.[0])} /><Button type="button" variant="ghost" size={compact ? "icon" : "sm"} className={compact ? "mx-auto" : "w-full justify-start"} aria-label={label} title={compact ? label : undefined} disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? <LoaderCircle className="animate-spin" /> : <FileUp />}{!compact && label}</Button></>;
}
