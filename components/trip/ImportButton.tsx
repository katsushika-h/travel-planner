"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { ImportReservationDialog } from "@/components/trip/ImportReservationButton";
import { menuItemClassName } from "@/components/ui/menu-item";
import { importGoogleMapsCsv } from "@/lib/google-maps-import";
import { reservationFileAccept } from "@/lib/reservation-import";
import type { TravelObject, Trip } from "@/types/travel";

/** One Import… entry: a .csv goes through the Google Maps flow, any other allowed file opens the reservation review. */
export function ImportButton({
  trip,
  eventTypes,
  onAddType,
  onImported,
  onError,
  onDone,
}: {
  trip: Trip;
  eventTypes: string[];
  onAddType: (type: string) => void;
  onImported: (items: TravelObject[]) => void;
  onError: (message: string) => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ complete: number; total: number } | null>(null);
  const [reservationFile, setReservationFile] = useState<File | null>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    onError("");
    try {
      const { created, failed, newTypes, skipped, duplicateCount, invalidDates, unresolvedCount } =
        await importGoogleMapsCsv(await file.text(), trip, eventTypes, (complete, total) =>
          setImportProgress({ complete, total }),
        );
      for (const type of newTypes) onAddType(type);
      onImported(created);
      if (failed.length || skipped || duplicateCount || invalidDates || unresolvedCount)
        onError(
          `Imported ${created.length} places.${
            failed.length
              ? ` ${failed.length} could not be confirmed: ${failed
                  .slice(0, 3)
                  .map(({ title, reason }) => `${title} (${reason})`)
                  .join(
                    "; ",
                  )}${failed.length > 3 ? `; and ${failed.length - 3} more` : ""}. Check the trip before retrying.`
              : ""
          }${duplicateCount ? ` Skipped ${duplicateCount} ${duplicateCount === 1 ? "duplicate name" : "duplicate names"}.` : ""}${unresolvedCount ? ` ${unresolvedCount} ${unresolvedCount === 1 ? "link did" : "links did"} not contain resolvable coordinates.` : ""}${skipped ? ` Skipped ${skipped} empty rows.` : ""}${invalidDates ? ` ${invalidDates} rows had an unrecognized date or time and were left unscheduled.` : ""}`,
        );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not import the Google Maps CSV.");
    } finally {
      setImporting(false);
      setImportProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (/\.csv$/i.test(file.name)) return void importFile(file);
    if (inputRef.current) inputRef.current.value = "";
    onError("");
    setReservationFile(file);
  }

  const label = importProgress ? `Resolving ${importProgress.complete}/${importProgress.total}` : "Importing…";
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={".csv," + reservationFileAccept}
        className="sr-only"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className={menuItemClassName}
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        {importing ? <LoaderCircle className="animate-spin" /> : <FileUp />}
        {importing ? label : "Import…"}
      </button>
      <p className="pr-4 pb-2 pl-11 text-xs text-muted">Google Maps CSV, PDF, .ics or email</p>
      {reservationFile && (
        <ImportReservationDialog
          file={reservationFile}
          trip={trip}
          eventTypes={eventTypes}
          onAddType={onAddType}
          onImported={onImported}
          onError={onError}
          onDone={onDone}
          onClose={() => setReservationFile(null)}
        />
      )}
    </>
  );
}
