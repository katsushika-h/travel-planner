"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { Trip } from "@/types/travel";

const zones = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] })
  .supportedValuesOf?.("timeZone") ?? [];

export function EditTripDialog({ trip, onSaved }: { trip: Trip; onSaved: (trip: Trip) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateTrip(trip.id, {
        title: String(formData.get("title")),
        startDate: String(formData.get("startDate")),
        endDate: String(formData.get("endDate")),
        timezone: String(formData.get("timezone")),
        defaultCurrency: String(formData.get("defaultCurrency")).toUpperCase(),
      });
      onSaved(updated);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save trip settings.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Edit trip settings" title="Edit trip settings"><Pencil /></Button>
    {open && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-trip-title">
      <form action={submit} className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 id="edit-trip-title" className="text-lg font-semibold">Trip settings</h2><p className="text-sm text-muted-foreground">Changes apply to this trip and its itinerary.</p></div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close"><X /></Button>
        </div>
        <label className="block text-sm font-medium">Trip name<input name="title" required defaultValue={trip.title} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">Start date<input name="startDate" type="date" defaultValue={trip.startDate.slice(0, 10)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
          <label className="text-sm font-medium">End date<input name="endDate" type="date" defaultValue={trip.endDate.slice(0, 10)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
        </div>
        <label className="mt-4 block text-sm font-medium">IANA timezone<input name="timezone" required list="edit-iana-timezones" defaultValue={trip.timezone} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /><datalist id="edit-iana-timezones">{[...new Set(["UTC", trip.timezone, ...zones])].map((zone) => <option key={zone} value={zone} />)}</datalist></label>
        <label className="mt-4 block text-sm font-medium">Default currency<input name="defaultCurrency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={trip.defaultCurrency ?? "SGD"} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 uppercase" /></label>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></div>
      </form>
    </div>, document.body)}
  </>;
}
