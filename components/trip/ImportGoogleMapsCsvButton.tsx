"use client";

import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { TravelObject, Trip } from "@/types/travel";

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { row.push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += character;
  }
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function truncateUtf8(value: string, maxBytes: number) { let result = ""; for (const character of value) { if (new TextEncoder().encode(result + character).byteLength > maxBytes) break; result += character; } return result; }

export function ImportGoogleMapsCsvButton({ trip, onImported, onError }: { trip: Trip; onImported: (items: TravelObject[]) => void; onError: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); onError("");
    try {
      const rows = parseCsv(await file.text());
      const header = rows.shift()?.map((cell) => cell.trim().toLowerCase());
      const titleIndex = header?.indexOf("title") ?? -1; const noteIndex = header?.indexOf("note") ?? -1; const urlIndex = header?.indexOf("url") ?? -1;
      if (titleIndex < 0 || noteIndex < 0 || urlIndex < 0) throw new Error("This CSV needs Title, Note, and URL columns from a Google Maps export.");
      const records = rows.map((row) => ({ title: row[titleIndex]?.trim() ?? "", notes: row[noteIndex]?.trim() ?? "", url: row[urlIndex]?.trim() ?? "" })).filter((record) => record.title && record.url);
      if (!records.length) throw new Error("No Google Maps places were found in this CSV.");
      const created = await Promise.all(records.map((record) => api.createObject({ tripId: trip.id, title: record.title.slice(0, 100), type: "unclassified", startDateTime: null, endDateTime: null, dayIndex: null, isAllDay: false, location: { name: record.title.slice(0, 300), googleMapsUrl: record.url }, cost: null, notes: truncateUtf8(record.notes, 2500) || null, tags: [] })));
      onImported(created);
      if (records.length !== rows.length) onError(`Imported ${created.length} places. Skipped ${rows.length - records.length} empty rows.`);
    } catch (error) { onError(error instanceof Error ? error.message : "Could not import the Google Maps CSV."); }
    finally { setImporting(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  return <><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importFile(event.target.files?.[0])} /><Button type="button" variant="outline" disabled={importing} onClick={() => inputRef.current?.click()}>{importing ? <LoaderCircle className="animate-spin" /> : <FileUp />}Import Maps CSV</Button></>;
}
