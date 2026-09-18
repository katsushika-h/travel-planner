"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/inspector/MarkdownEditor";
import { api } from "@/lib/api-client";
import { dateParts, dayIndexForDate, zonedDateTimeToUtc } from "@/lib/date-utils";
import type { TravelObject, LocationData } from "@/types/travel";

const currencies = (Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf?.("currency") ?? ["AUD", "CAD", "CNY", "EUR", "GBP", "INR", "JPY", "SGD", "USD"];
const inspectorDefaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const inspectorPalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function inspectorTypeColor(type: string, colors: Record<string, string>) { return colors[type] ?? inspectorDefaultColors[type] ?? inspectorPalette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % inspectorPalette.length]; }
const fieldClass = "min-w-0 w-full border-0 bg-transparent px-0 py-1 text-sm text-foreground outline-none focus:ring-0";
function safeMapsHref(raw: string, name: string) { try { const url = new URL(raw); if (url.protocol === "https:" && (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl" || url.hostname.endsWith("google.com"))) return url.toString(); } catch { /* use search link */ } return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`; }
function PropertyRow({ label, children }: { label: string; children: ReactNode }) { return <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3 py-2"><span className="text-xs text-muted-foreground">{label}</span><div className="min-w-0">{children}</div></div>; }

export function ObjectInspectorPanel({ item, timeZone, tripStartDate, defaultCurrency = "SGD", eventTypes, typeColors, darkMode, onClose, onChange, onDelete }: { item: TravelObject | null; timeZone: string; tripStartDate: string; defaultCurrency?: string; darkMode: boolean; eventTypes: string[]; typeColors: Record<string, string>; onClose: () => void; onChange: (id: string, patch: Partial<TravelObject>, immediate?: boolean) => void; onDelete: (id: string) => Promise<void> }) {
  const [typeOpen, setTypeOpen] = useState(false); const [currencyOpen, setCurrencyOpen] = useState(false); const [currencySearch, setCurrencySearch] = useState(""); const [confirmDelete, setConfirmDelete] = useState(false); const [titleDraft, setTitleDraft] = useState(() => item?.title ?? "(untitled event)"); const [mapMessage, setMapMessage] = useState(""); const [resolvingMap, setResolvingMap] = useState(false); const [imageError, setImageError] = useState("");
  const currentItem = item;
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    function deleteShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if ((event.key === "Backspace" || event.key === "Delete") && !confirmDelete) { event.preventDefault(); setConfirmDelete(true); }
      else if (event.key === "Enter" && confirmDelete && currentItem) {
        event.preventDefault();
        void onDelete(currentItem.id).then(() => setConfirmDelete(false));
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("keydown", deleteShortcut);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("keydown", deleteShortcut); };
  }, [confirmDelete, currentItem, onClose, onDelete]);
  if (!currentItem) return null;
  const location = (item.location ?? null) as LocationData | null; const cost = item.cost as { amount?: number; currency?: string } | null;
  const start = dateParts(item.startDateTime ?? `${tripStartDate}T00:00:00Z`, timeZone); const end = dateParts(item.endDateTime ?? `${tripStartDate}T00:00:00Z`, timeZone);
  const currencySuggestions = currencies.filter((code) => code.toLowerCase().includes(currencySearch.toLowerCase())).slice(0, 15);
  function patchDateTime(which: "start" | "end", value: string) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return;
    const [date, time] = value.split("T");
    const iso = zonedDateTimeToUtc(date, time, timeZone);
    if (which === "start") { const nextEnd = Date.parse((currentItem!.endDateTime ?? "")) <= Date.parse(iso) ? new Date(Date.parse(iso) + 3600000).toISOString() : currentItem!.endDateTime ?? ""; onChange(currentItem!.id, { startDateTime: iso, endDateTime: currentItem!.isAllDay && Date.parse(currentItem!.endDateTime ?? "") < Date.parse(iso) ? iso : nextEnd, dayIndex: Math.max(1, dayIndexForDate(date, tripStartDate)) }); }
    else { onChange(currentItem!.id, { endDateTime: iso }); }
  }
  function saveHeaderImage(value: string | null) {
    if (value === null) { setImageError(""); onChange(currentItem!.id, { headerImage: null }, true); return; }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      setImageError(""); onChange(currentItem!.id, { headerImage: url.toString() }, true);
    } catch { setImageError("Enter a complete http or https image URL."); }
  }
  async function resolveMap() { const url = location?.googleMapsUrl?.trim(); if (!url) return; setResolvingMap(true); setMapMessage(""); try { const result = await api.resolveMapsUrl(url); if (result.name && !location?.name) onChange(currentItem!.id, { location: { ...location, name: result.name, googleMapsUrl: url } }); setMapMessage(result.name ? "Place name found" : "Link saved"); } catch { setMapMessage("Could not find a name automatically"); } finally { setResolvingMap(false); } }
  const mapsUrl = location?.googleMapsUrl ?? "";
  return <aside className="flex h-full min-h-0 flex-col bg-background">
    <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur"><span className="text-xs text-muted-foreground">Autosave is on</span><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inspector"><X /></Button></header>
    {item.headerImage && <section aria-label="Header image" className="group relative h-48 shrink-0 overflow-hidden bg-muted"><img src={item.headerImage} alt="" className="size-full object-cover" /><div className="absolute inset-x-3 top-3 flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><input type="url" defaultValue={item.headerImage} key={item.id + item.headerImage} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = event.target.value.trim(); if (value) saveHeaderImage(value); }} placeholder="Change image URL" aria-label="Header image URL" className="w-64 rounded-md border bg-background/95 px-2 py-1 text-sm shadow-sm outline-none" /><Button type="button" variant="secondary" size="sm" onClick={() => saveHeaderImage(null)}>Remove</Button></div></section>}
    <div className="group relative min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
      {!item.headerImage && <input type="url" defaultValue="" onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = event.target.value.trim(); if (value) saveHeaderImage(value); }} placeholder="Add image URL" aria-label="Add header image URL" className="pointer-events-none absolute right-6 top-3 w-48 rounded-md border bg-background px-2 py-1 text-sm opacity-0 shadow-sm transition-opacity outline-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 sm:right-8" />}
      {imageError && <p className="mb-2 text-xs text-destructive">{imageError}</p>}
      <input value={titleDraft} onChange={(e) => { setTitleDraft(e.target.value); if (e.target.value.trim()) onChange(item.id, { title: e.target.value }); }} onBlur={() => { if (!titleDraft.trim()) { setTitleDraft("(untitled event)"); onChange(item.id, { title: "(untitled event)" }); } }} aria-label="Title" className="mb-4 w-full border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground focus:ring-0" />
      <div className="mb-6">
        <PropertyRow label="Type"><div className="relative"><button type="button" aria-expanded={typeOpen} onClick={() => setTypeOpen(!typeOpen)} className="flex w-full items-center gap-2 py-1 text-left text-sm"><span className="size-3 rounded-sm" style={{ backgroundColor: inspectorTypeColor(item.type, typeColors) }} />{item.type}<ChevronDown size={14} className="ml-auto" /></button>{typeOpen && <div role="listbox" className="absolute left-0 right-0 top-full z-30 max-h-56 overflow-y-auto rounded-md border bg-background p-1 shadow-xl">{eventTypes.map((type) => <button key={type} type="button" role="option" aria-selected={type === item.type} onClick={() => { onChange(item.id, { type }); setTypeOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"><span className="size-3 rounded-sm" style={{ backgroundColor: inspectorTypeColor(type, typeColors) }} />{type}</button>)}</div>}</div></PropertyRow>
        <PropertyRow label="All day"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.isAllDay} onChange={(e) => onChange(item.id, { isAllDay: e.target.checked })} /> All day</label></PropertyRow>
        {item.startDateTime && item.endDateTime ? <PropertyRow label="When"><div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-[10px] text-muted-foreground">Start<input aria-label={item.isAllDay ? "Start date" : "Start date and time"} type={item.isAllDay ? "date" : "datetime-local"} value={item.isAllDay ? start.date : `${start.date}T${start.time}`} onChange={(e) => patchDateTime("start", item.isAllDay && e.target.value ? `${e.target.value}T00:00` : e.target.value)} className={`${fieldClass} text-foreground`} /></label><label className="min-w-0 text-[10px] text-muted-foreground">End<input aria-label={item.isAllDay ? "End date" : "End date and time"} type={item.isAllDay ? "date" : "datetime-local"} value={item.isAllDay ? end.date : `${end.date}T${end.time}`} onChange={(e) => patchDateTime("end", item.isAllDay && e.target.value ? `${e.target.value}T00:00` : e.target.value)} className={`${fieldClass} text-foreground`} /></label></div></PropertyRow> : <PropertyRow label="When"><span className="text-sm text-muted-foreground">Unscheduled · drag it onto a calendar date to plan it</span></PropertyRow>}
        {item.startDateTime && item.endDateTime && <div className="-mt-2 mb-2 flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => onChange(item.id, { startDateTime: null, endDateTime: null, dayIndex: null }, true)}>Remove date</Button></div>}
        <PropertyRow label="Place"><input value={location?.name ?? ""} onChange={(e) => onChange(currentItem!.id, { location: { ...location, name: e.target.value, googleMapsUrl: location?.googleMapsUrl } })} placeholder="Place name" className={fieldClass} /></PropertyRow>
        <PropertyRow label="Maps"><div>{Boolean(mapsUrl || location?.name) && <a href={safeMapsHref(mapsUrl, location?.name ?? item.title)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 pb-1 text-sm text-emerald-800 hover:underline dark:text-emerald-300">{location?.name || "Open in Google Maps"}<ExternalLink size={12} /></a>}<input type="url" value={mapsUrl} onChange={(e) => onChange(item.id, { location: { ...location, googleMapsUrl: e.target.value } })} onBlur={() => void resolveMap()} placeholder="Paste a Google Maps link" className={fieldClass} /><p className="text-[10px] text-muted-foreground">{resolvingMap ? "Looking up place…" : mapMessage}</p></div></PropertyRow>
      </div>
      <div className="mb-6"><PropertyRow label="Cost"><div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3"><input type="number" min="0" step="0.01" value={cost?.amount ?? ""} onChange={(e) => onChange(item.id, { cost: e.target.value ? { amount: Number(e.target.value), currency: cost?.currency ?? defaultCurrency } : null })} placeholder="Amount" className={`${fieldClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} /><div className="relative"><div className="flex items-center"><input value={currencySearch || cost?.currency || defaultCurrency} onChange={(e) => { setCurrencySearch(e.target.value.toUpperCase()); setCurrencyOpen(true); }} onFocus={() => { setCurrencySearch(""); setCurrencyOpen(true); }} maxLength={3} aria-label="Currency" className={`${fieldClass} uppercase`} /><button type="button" aria-label="Show currencies" onClick={() => setCurrencyOpen(!currencyOpen)}><ChevronDown size={14} /></button></div>{currencyOpen && <div role="listbox" className="absolute right-0 top-full z-30 max-h-48 w-28 overflow-y-auto rounded-md border bg-background p-1 shadow-lg">{currencySuggestions.map((code) => <button key={code} type="button" role="option" aria-selected={cost?.currency === code} onClick={() => { onChange(item.id, { cost: cost?.amount != null ? { amount: cost.amount, currency: code } : null }); setCurrencySearch(""); setCurrencyOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">{code}</button>)}</div>}</div></div></PropertyRow><PropertyRow label="Tags"><input value={item.tags?.join(", ") ?? ""} onChange={(e) => onChange(item.id, { tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="museum, booking" className={fieldClass} /></PropertyRow></div>
      <section aria-label="Notes" className="mb-7"><h2 className="mb-2 text-xs font-medium text-muted-foreground">Notes</h2><MarkdownEditor key={item.id} darkMode={darkMode} markdown={item.notes ?? ""} onChange={(notes) => onChange(item.id, { notes: notes || null })} /></section>

      <div className="flex justify-end pb-8">{confirmDelete ? <><Button type="button" variant="destructive" onClick={async () => { await onDelete(item.id); setConfirmDelete(false); }}>Confirm delete</Button><Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete item"><Trash2 /></Button>}</div>
    </div>
  </aside>;
}
