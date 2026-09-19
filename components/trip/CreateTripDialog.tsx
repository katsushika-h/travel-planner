"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { Trip } from "@/types/travel";

const zones = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] })
  .supportedValuesOf?.("timeZone") ?? [];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextDate(date: string) {
  if (!date) return "";
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function CreateTripDialog({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(() => localDate());
  const [endDate, setEndDate] = useState(() => nextDate(localDate()));
  const [defaultCurrency, setDefaultCurrency] = useState("SGD");

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } }
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    try {
      const trip = await api.createTrip({
        title: String(formData.get("title")),
        startDate: String(formData.get("startDate")),
        endDate: String(formData.get("endDate")),
        timezone: String(formData.get("timezone")),
        defaultCurrency: String(formData.get("defaultCurrency")).toUpperCase(),
      });
      onCreated(trip);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create trip.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> New trip</Button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true">
          <form action={submit} className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-lg font-semibold">Create a trip</h2><p className="text-sm text-muted-foreground">Your destination timezone is used throughout the itinerary.</p></div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close"><X /></Button>
            </div>
            <label className="block text-sm font-medium">Trip name<input name="title" required maxLength={50} placeholder="Japan spring escape" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Start date<input name="startDate" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setEndDate(nextDate(event.target.value)); }} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
              <label className="text-sm font-medium">End date<input name="endDate" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
            </div>
            <label className="mt-4 block text-sm font-medium">IANA timezone<input name="timezone" list="create-iana-timezones" required defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} placeholder="Type a city or region, e.g. Tokyo" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /><datalist id="create-iana-timezones">{[...new Set(["UTC", Intl.DateTimeFormat().resolvedOptions().timeZone, ...zones])].map((zone) => <option key={zone} value={zone} />)}</datalist><span className="mt-1 block text-xs font-normal text-muted-foreground">Type to filter valid IANA timezone names.</span></label>
            <label className="mt-4 block text-sm font-medium">Default currency<input name="defaultCurrency" required maxLength={3} pattern="[A-Za-z]{3}" value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase())} placeholder="SGD" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 uppercase" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Use a three-letter currency code, such as SGD, USD, or JPY.</span></label>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create trip"}</Button></div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
