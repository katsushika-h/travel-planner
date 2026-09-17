"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { dayIndexForDate, zonedDateTimeToUtc } from "@/lib/date-utils";
import type { TravelObject, Trip } from "@/types/travel";

function addMinutes(date: string, time: string, minutes: number) {
  const value = new Date(`${date}T${time}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return { date: value.toISOString().slice(0, 10), time: value.toISOString().slice(11, 16) };
}

export function CreateItemDialog({ trip, eventTypes, initialDate, open, onOpenChange, onCreated }: { trip: Trip; eventTypes: string[]; initialDate: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (item: TravelObject) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const startDate = trip.startDate.slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(initialDate);
  const [endTime, setEndTime] = useState("10:00");

  function updateStart(date: string, time: string) {
    setSelectedDate(date); setStartTime(time);
    if (date && time) { const suggested = addMinutes(date, time, 60); setEndDate(suggested.date); setEndTime(suggested.time); }
  }

  async function submit(formData: FormData) {
    setSaving(true); setError("");
    try {
      const startDateTime = zonedDateTimeToUtc(selectedDate, startTime, trip.timezone);
      const endDateTime = zonedDateTimeToUtc(endDate, endTime, trip.timezone);
      if (Date.parse(endDateTime) <= Date.parse(startDateTime)) throw new Error("End must be after start.");
      const item = await api.createObject({ tripId: trip.id, title: String(formData.get("title")).trim(), type: String(formData.get("type")), startDateTime, endDateTime, dayIndex: Math.max(1, dayIndexForDate(selectedDate, startDate)), isAllDay: false, tags: [] });
      onCreated(item); onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add itinerary item."); }
    finally { setSaving(false); }
  }

  return <>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true"><form action={submit} className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl">
    <h2 className="text-lg font-semibold">Add itinerary item</h2><p className="mb-5 mt-1 text-sm text-muted-foreground">Scheduled in {trip.timezone}.</p>
    <label className="block text-sm font-medium">Title<input name="title" required autoFocus placeholder="Senso-ji Temple" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label>
    <label className="mt-4 block text-sm font-medium">Type<select name="type" defaultValue="activity" required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2">{eventTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
    <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-medium">Start date<input type="date" value={selectedDate} onChange={(event) => updateStart(event.target.value, startTime)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label><label className="text-sm font-medium">Start time<input type="time" value={startTime} onChange={(event) => updateStart(selectedDate, event.target.value)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label></div>
    <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-medium">End date<input type="date" min={selectedDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label><label className="text-sm font-medium">End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required className="mt-1.5 w-full rounded-md border bg-background px-3 py-2" /></label></div>
    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add item"}</Button></div>
  </form></div>}</>;
}
