"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Download, ExternalLink, FileText, LoaderCircle, Paperclip, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/inspector/MarkdownEditor";
import { api } from "@/lib/api-client";
import type { TravelAttachment, TravelObject, LocationData, UpdateTravelObjectInput } from "@/types/travel";

const currencies = (Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf?.("currency") ?? ["AUD", "CAD", "CNY", "EUR", "GBP", "INR", "JPY", "SGD", "USD"];
const inspectorDefaultColors: Record<string, string> = { unclassified: "#64748b", flight: "#0ea5e9", hotel: "#8b5cf6", food: "#f97316", commute: "#f59e0b", activity: "#10b981", sightseeing: "#f43f5e" };
const inspectorPalette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];
function inspectorTypeColor(type: string, colors: Record<string, string>) { return colors[type] ?? inspectorDefaultColors[type] ?? inspectorPalette[[...type].reduce((sum, char) => sum + char.charCodeAt(0), 0) % inspectorPalette.length]; }
function oneHourAfter(time: string) { const value = new Date(`2000-01-01T${time}:00Z`); value.setUTCHours(value.getUTCHours() + 1); return value.toISOString().slice(11, 16); }
function normalize24HourTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/\D/g, "");
  const candidate = /^\d{3,4}$/.test(compact) ? `${compact.slice(0, -2).padStart(2, "0")}:${compact.slice(-2)}` : trimmed;
  const match = candidate.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour <= 23 ? `${String(hour).padStart(2, "0")}:${match[2]}` : null;
}
function formatFileSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function truncateUtf8(value: string, maxBytes: number) { let result = ""; for (const character of value) { if (new TextEncoder().encode(result + character).byteLength > maxBytes) break; result += character; } return result; }
const fieldClass = "min-w-0 w-full border-0 bg-transparent px-0 py-1 text-sm text-foreground outline-none focus:ring-0";
function safeMapsHref(raw: string, name: string) { try { const url = new URL(raw); if (url.protocol === "https:" && (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl" || url.hostname.endsWith("google.com"))) return url.toString(); } catch { /* use search link */ } return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`; }
function PropertyRow({ label, children }: { label: string; children: ReactNode }) { return <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3 py-2"><span className="text-xs text-muted-foreground">{label}</span><div className="min-w-0">{children}</div></div>; }

export function ObjectInspectorPanel({ item, defaultCurrency = "SGD", eventTypes, typeColors, darkMode, onClose, onChange, onDelete }: { item: TravelObject | null; timeZone: string; tripStartDate: string; defaultCurrency?: string; darkMode: boolean; eventTypes: string[]; typeColors: Record<string, string>; onClose: () => void; onChange: (id: string, patch: UpdateTravelObjectInput, immediate?: boolean) => void; onDelete: (id: string) => Promise<void> }) {
  const [typeOpen, setTypeOpen] = useState(false); const [currencyOpen, setCurrencyOpen] = useState(false); const [currencySearch, setCurrencySearch] = useState(""); const [confirmDelete, setConfirmDelete] = useState(false); const [titleDraft, setTitleDraft] = useState(() => item?.title ?? "(untitled event)"); const [tagDraft, setTagDraft] = useState(""); const [mapMessage, setMapMessage] = useState(""); const [resolvingMap, setResolvingMap] = useState(false); const [imageError, setImageError] = useState(""); const [attachments, setAttachments] = useState<TravelAttachment[]>([]); const [attachmentError, setAttachmentError] = useState(""); const [uploading, setUploading] = useState(false); const [loadingAttachments, setLoadingAttachments] = useState(true); const [dragActive, setDragActive] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  const currentItem = item;
  const itemId = item?.id;
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    void api.attachments(itemId).then((result) => { if (!cancelled) setAttachments(result); }).catch((error) => { if (!cancelled) setAttachmentError(error instanceof Error ? error.message : "Could not load attachments."); }).finally(() => { if (!cancelled) setLoadingAttachments(false); });
    return () => { cancelled = true; };
  }, [itemId]);
  if (!currentItem) return null;
  const location = (item.location ?? null) as LocationData | null; const cost = item.cost as { amount?: number; currency?: string } | null;
  const dateValue = item.date?.slice(0, 10) ?? "";
  const endDateValue = item.endDate?.slice(0, 10) ?? dateValue;
  const startTimeValue = item.startTime ?? "";
  const endTimeValue = item.endTime ?? "";
  const currencySuggestions = currencies.filter((code) => code.toLowerCase().includes(currencySearch.toLowerCase())).slice(0, 15);
  function patchDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    onChange(currentItem!.id, { date: value, ...(endDateValue && endDateValue < value ? { endDate: value } : {}) });
  }
  function patchEndDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || dateValue && value < dateValue) return;
    onChange(currentItem!.id, { endDate: value || dateValue });
  }
  function patchTime(which: "startTime" | "endTime", value: string) {
    const patch: UpdateTravelObjectInput = { [which]: value || null, isAllDay: false };
    if (which === "startTime" && value && (!endTimeValue || value >= endTimeValue)) patch.endTime = oneHourAfter(value);
    onChange(currentItem!.id, patch);
  }
  function saveHeaderImage(value: string | null) {
    if (value === null) { setImageError(""); onChange(currentItem!.id, { headerImage: null }, true); return; }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      setImageError(""); onChange(currentItem!.id, { headerImage: url.toString() }, true);
    } catch { setImageError("Enter a complete http or https image URL."); }
  }
  function commitTag(value: string) {
    const nextTags = value.trim().split(/\s+/).filter(Boolean).map((tag) => tag.slice(0, 50));
    if (!nextTags.length) return;
    const tags = currentItem!.tags ?? [];
    const merged = [...new Set([...tags, ...nextTags])].slice(0, 10);
    if (merged.length !== tags.length || merged.some((tag, index) => tag !== tags[index])) onChange(currentItem!.id, { tags: merged });
    setTagDraft("");
  }
  async function resolveMap() { const url = location?.googleMapsUrl?.trim(); if (!url) return; setResolvingMap(true); setMapMessage(""); try { const result = await api.resolveMapsUrl(url); const hasCoordinates = result.lat != null && result.lng != null; const foundName = result.name && !location?.name ? result.name : location?.name; if (hasCoordinates || foundName !== location?.name) onChange(currentItem!.id, { location: { ...location, name: foundName, googleMapsUrl: url, ...(hasCoordinates ? { lat: result.lat!, lng: result.lng! } : {}) } }, true); setMapMessage(hasCoordinates ? result.coordinateSource === "featureId" ? "Approximate coordinates found" : "Coordinates found" : result.name ? "Place name found; this link has no coordinates" : "Link saved; no coordinates found"); } catch { setMapMessage("Could not resolve this Google Maps link"); } finally { setResolvingMap(false); } }
  async function uploadAttachments(files: Iterable<File>) { const selected = [...files]; if (!selected.length) return; setUploading(true); setAttachmentError(""); try { const uploaded = await Promise.all(selected.map((file) => api.uploadAttachment(currentItem!.id, file))); setAttachments((current) => [...uploaded, ...current]); } catch (error) { setAttachmentError(error instanceof Error ? error.message : "Could not upload attachment."); } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; } }
  async function removeAttachment(attachment: TravelAttachment) { setAttachmentError(""); try { await api.deleteAttachment(currentItem!.id, attachment.id); setAttachments((current) => current.filter((entry) => entry.id !== attachment.id)); } catch (error) { setAttachmentError(error instanceof Error ? error.message : "Could not remove attachment."); } }
  const mapsUrl = location?.googleMapsUrl ?? "";
  function focusNextEntryField(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLElement && target.isContentEditable)) return;
    const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]')];
    const currentIndex = fields.indexOf(target);
    if (currentIndex < 0) return;
    const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    const next = fields[nextIndex];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }
  return <aside onKeyDown={focusNextEntryField} onInputCapture={(event) => { const target = event.target; if (target instanceof HTMLInputElement && target.type === "number") { let remainingDigits = 10; let decimalSeen = false; target.value = [...target.value].filter((character) => { if (/\d/.test(character)) { remainingDigits -= 1; return remainingDigits >= 0; } if (character === "." && !decimalSeen) { decimalSeen = true; return true; } return false; }).join(""); } }} className="flex h-full min-h-0 flex-col bg-background">
    <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur"><span className="text-xs text-muted-foreground">Autosave is on</span><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inspector"><X /></Button></header>
    {item.headerImage && <section aria-label="Header image" className="group relative h-48 shrink-0 overflow-hidden bg-muted"><img src={item.headerImage} alt="" className="size-full object-cover" /><div className="absolute inset-x-3 top-3 flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><input type="url" defaultValue={item.headerImage} key={item.id + item.headerImage} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = event.target.value.trim(); if (value) saveHeaderImage(value); }} placeholder="Change image URL" aria-label="Header image URL" className="w-64 rounded-md border bg-background/95 px-2 py-1 text-sm shadow-sm outline-none" /><Button type="button" variant="secondary" size="sm" onClick={() => saveHeaderImage(null)}>Remove</Button></div></section>}
    <div className="group relative min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
      {!item.headerImage && <div className="mb-2 flex justify-end"><input type="url" defaultValue="" onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = event.target.value.trim(); if (value) saveHeaderImage(value); }} placeholder="Add image URL" aria-label="Add header image URL" className="w-full max-w-64 rounded-md border bg-background px-2 py-1 text-sm shadow-sm outline-none" /></div>}
      {imageError && <p className="mb-2 text-xs text-destructive">{imageError}</p>}
      <input value={titleDraft} maxLength={100} onChange={(e) => { setTitleDraft(e.target.value); if (e.target.value.trim()) onChange(item.id, { title: e.target.value }); }} onBlur={() => { if (!titleDraft.trim()) { setTitleDraft("(untitled event)"); onChange(item.id, { title: "(untitled event)" }); } }} aria-label="Title" className="mb-4 w-full border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground focus:ring-0" />
      <div className="mb-6">
        <PropertyRow label="Type"><div className="relative"><button type="button" aria-expanded={typeOpen} onClick={() => setTypeOpen(!typeOpen)} className="flex w-full items-center gap-2 py-1 text-left text-sm"><span className="size-3 rounded-sm" style={{ backgroundColor: inspectorTypeColor(item.type, typeColors) }} />{item.type}<ChevronDown size={14} className="ml-auto" /></button>{typeOpen && <div role="listbox" className="absolute left-0 right-0 top-full z-30 max-h-56 overflow-y-auto rounded-md border bg-background p-1 shadow-xl">{eventTypes.map((type) => <button key={type} type="button" role="option" aria-selected={type === item.type} onClick={() => { onChange(item.id, { type }); setTypeOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"><span className="size-3 rounded-sm" style={{ backgroundColor: inspectorTypeColor(type, typeColors) }} />{type}</button>)}</div>}</div></PropertyRow>
        <PropertyRow label="All day"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.isAllDay} onChange={(e) => onChange(item.id, e.target.checked ? { isAllDay: true, startTime: null, endTime: null, placementTime: null } : { isAllDay: false })} /> All day</label></PropertyRow>
        <PropertyRow label="Dates"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"><label className="min-w-0 text-[10px] text-muted-foreground">Start<input aria-label="Start date" type="date" value={dateValue} onChange={(e) => patchDate(e.target.value)} className={`${fieldClass} text-foreground`} /></label><label className="min-w-0 text-[10px] text-muted-foreground">End<input aria-label="End date" type="date" min={dateValue || undefined} value={endDateValue} onChange={(e) => patchEndDate(e.target.value)} className={`${fieldClass} text-foreground`} /></label><Button type="button" variant="ghost" size="icon-sm" disabled={!dateValue} aria-label="Remove date" title="Move to unscheduled while keeping saved times" onClick={() => onChange(item.id, { date: null, isAllDay: false }, true)}><Trash2 size={15} /></Button></div></PropertyRow>
        <PropertyRow label="Time (24h)"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"><label className="min-w-0 text-[10px] text-muted-foreground">Start<input key={`${item.id}:start:${startTimeValue}`} aria-label="Start time in 24-hour format" type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM" disabled={item.isAllDay} defaultValue={startTimeValue} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = normalize24HourTime(event.currentTarget.value); if (value === null) { event.currentTarget.value = startTimeValue; return; } event.currentTarget.value = value; patchTime("startTime", value); }} className={`${fieldClass} font-mono tabular-nums text-foreground`} /></label><label className="min-w-0 text-[10px] text-muted-foreground">End<input key={`${item.id}:end:${endTimeValue}`} aria-label="End time in 24-hour format" type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM" disabled={item.isAllDay} defaultValue={endTimeValue} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const value = normalize24HourTime(event.currentTarget.value); if (value === null) { event.currentTarget.value = endTimeValue; return; } event.currentTarget.value = value; patchTime("endTime", value); }} className={`${fieldClass} font-mono tabular-nums text-foreground`} /></label><Button type="button" variant="ghost" size="icon-sm" disabled={!startTimeValue && !endTimeValue} aria-label="Remove time" title="Make this a flexible item" onClick={() => onChange(item.id, { startTime: null, endTime: null, isAllDay: false }, true)}><Trash2 size={15} /></Button></div></PropertyRow>
        <PropertyRow label="Place"><input value={location?.name ?? ""} maxLength={300} onChange={(e) => onChange(currentItem!.id, { location: { ...location, name: e.target.value, googleMapsUrl: location?.googleMapsUrl } })} placeholder="Place name" className={fieldClass} /></PropertyRow>
        <PropertyRow label="Maps"><div>{Boolean(mapsUrl || location?.name) && <a href={safeMapsHref(mapsUrl, location?.name ?? item.title)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 pb-1 text-sm text-emerald-800 hover:underline dark:text-emerald-300">{location?.name || "Open in Google Maps"}<ExternalLink size={12} /></a>}<input type="url" value={mapsUrl} onChange={(e) => onChange(item.id, { location: { ...location, googleMapsUrl: e.target.value } })} onBlur={() => void resolveMap()} placeholder="Paste a Google Maps link" className={fieldClass} /><p className="text-[10px] text-muted-foreground">{resolvingMap ? "Looking up place…" : mapMessage}</p></div></PropertyRow>
      </div>
      <div className="mb-6"><PropertyRow label="Cost"><div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3"><input type="number" min="0" step="0.01" value={cost?.amount ?? ""} onChange={(e) => onChange(item.id, { cost: e.target.value ? { amount: Number(e.target.value), currency: cost?.currency ?? defaultCurrency } : null })} placeholder="Amount" className={`${fieldClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} /><div className="relative"><div className="flex items-center"><input value={currencySearch || cost?.currency || defaultCurrency} onChange={(e) => { setCurrencySearch(e.target.value.toUpperCase()); setCurrencyOpen(true); }} onFocus={() => { setCurrencySearch(""); setCurrencyOpen(true); }} maxLength={3} aria-label="Currency" className={`${fieldClass} uppercase`} /><button type="button" aria-label="Show currencies" onClick={() => setCurrencyOpen(!currencyOpen)}><ChevronDown size={14} /></button></div>{currencyOpen && <div role="listbox" className="absolute right-0 top-full z-30 max-h-48 w-28 overflow-y-auto rounded-md border bg-background p-1 shadow-lg">{currencySuggestions.map((code) => <button key={code} type="button" role="option" aria-selected={cost?.currency === code} onClick={() => { onChange(item.id, { cost: cost?.amount != null ? { amount: cost.amount, currency: code } : null }); setCurrencySearch(""); setCurrencyOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">{code}</button>)}</div>}</div></div></PropertyRow><PropertyRow label="Tags"><div className="flex min-h-8 flex-wrap items-center gap-1.5">{(item.tags ?? []).map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{tag}<button type="button" aria-label={`Remove ${tag} tag`} onClick={() => onChange(item.id, { tags: (item.tags ?? []).filter((entry) => entry !== tag) })} className="rounded-full text-emerald-800/70 hover:text-rose-700 dark:text-emerald-100/70 dark:hover:text-rose-300">×</button></span>)}<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); commitTag(event.currentTarget.value); } else if (event.key === "Backspace" && !event.currentTarget.value && item.tags?.length) { onChange(item.id, { tags: item.tags.slice(0, -1) }); } }} onBlur={() => commitTag(tagDraft)} placeholder={item.tags?.length ? "Add tag" : "Type a tag, then press Space"} aria-label="Add tag" className="min-w-28 flex-1 border-0 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground" /></div></PropertyRow></div>
      <section aria-label="Notes" className="mb-7"><h2 className="mb-2 text-xs font-medium text-muted-foreground">Notes</h2><MarkdownEditor key={item.id} darkMode={darkMode} markdown={item.notes ?? ""} onChange={(notes) => onChange(item.id, { notes: truncateUtf8(notes, 2500) || null })} /></section>
      <section aria-label="Attachments" className="mb-7"><h2 className="mb-2 text-xs font-medium text-muted-foreground">Attachments</h2><input ref={inputRef} type="file" multiple className="sr-only" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(event) => void uploadAttachments(event.target.files ?? [])} /><p className="mb-2 text-[11px] text-muted-foreground">JPG, PNG, PDF, DOCX, spreadsheets, presentations, TXT, or CSV · up to 20 MB each</p>{attachmentError && <p className="mb-2 text-xs text-destructive">{attachmentError}</p>}{loadingAttachments ? <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin" /> Loading attachments</div> : attachments.length ? <ul className="mb-2 divide-y rounded-md border">{attachments.map((attachment) => { const attachmentUrl = `/api/travel-objects/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.id)}`; return <li key={attachment.id} className="flex items-center gap-2 px-3 py-2"><FileText size={16} className="shrink-0 text-muted-foreground" /><a href={attachmentUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline" title={`Open ${attachment.fileName}`}>{attachment.fileName}</a><span className="shrink-0 text-[11px] text-muted-foreground">{formatFileSize(attachment.size)}</span><a href={`${attachmentUrl}?download=1`} className="rounded p-1.5 hover:bg-muted" aria-label={`Download ${attachment.fileName}`} title="Download"><Download size={15} /></a><button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.fileName}`} title="Remove"><Trash2 size={15} /></button></li>; })}</ul> : null}<button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); if (!uploading) setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!uploading) void uploadAttachments(event.dataTransfer.files); }} className={`flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground transition hover:bg-muted disabled:cursor-wait ${dragActive ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : ""}`}><Paperclip size={18} />{uploading ? "Attaching files…" : "Click or drag files here to attach"}<span className="text-[11px]">Keep tickets, confirmations, and documents with this item.</span></button></section>

      <div className="flex justify-end pb-8">{confirmDelete ? <><Button type="button" variant="destructive" onClick={async () => { await onDelete(item.id); setConfirmDelete(false); }}>Confirm delete</Button><Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete item"><Trash2 /></Button>}</div>
    </div>
  </aside>;
}
