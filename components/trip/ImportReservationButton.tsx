"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { menuItemClassName } from "@/components/ui/menu-item";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { api } from "@/lib/api-client";
import { attachmentExtension } from "@/lib/attachment-types";
import {
  parseReservationFile,
  reservationFileAccept,
  type ReservationDraft,
  type ReviewField,
} from "@/lib/reservation-import";
import type { TravelObject, Trip } from "@/types/travel";

type ReviewDraft = ReservationDraft & { include: boolean };
type Schedule = Pick<ReservationDraft, "date" | "endDate" | "startTime" | "endTime">;

const fieldClassName =
  "mt-1 w-full max-sm:min-h-11 rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground";

/** Keep the schedule valid for the API: an end on or after the start, and both times or neither. */
function normalizeSchedule(draft: ReviewDraft, change: Partial<Schedule>): Partial<ReviewDraft> {
  const next = { ...draft, ...change };
  if (!next.date) return { date: null, endDate: null, startTime: null, endTime: null, isAllDay: false };
  const endDate = next.endDate && next.endDate >= next.date ? next.endDate : next.date;
  const timed = Boolean(next.startTime && next.endTime);
  return { ...change, date: next.date, endDate, isAllDay: !timed };
}

async function readDrafts(file: File, trip: Trip): Promise<ReservationDraft[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Reservation files must be 20 MB or smaller.");
  if (!/\.pdf$/i.test(file.name)) return parseReservationFile(file.name, await file.text(), trip.timezone);
  // PDFs are read in the browser; pdf.js loads only now, and the file never leaves the device.
  const [{ readPdfText }, { extractPdfReservation }] = await Promise.all([
    import("@/lib/pdf-text"),
    import("@/lib/pdf-reservation"),
  ]);
  return [extractPdfReservation(await readPdfText(await file.arrayBuffer()), trip)];
}

export function ImportReservationButton({
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const open = file !== null;
  useModalFocus(open, dialogRef);

  useEffect(() => {
    if (!open || saving) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setFile(null);
    }
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open, saving]);

  async function readFile(chosen: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!chosen) return;
    onError("");
    setReading(true);
    try {
      const parsed = await readDrafts(chosen, trip);
      setDrafts(parsed.map((draft) => ({ ...draft, include: true })));
      setError("");
      setFile(chosen);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not read the reservation file.");
    } finally {
      setReading(false);
    }
  }

  function update(index: number, change: Partial<ReviewDraft>) {
    setDrafts((current) => current.map((draft, at) => (at === index ? { ...draft, ...change } : draft)));
  }

  function updateSchedule(index: number, change: Partial<Schedule>) {
    setDrafts((current) =>
      current.map((draft, at) => (at === index ? { ...draft, ...normalizeSchedule(draft, change) } : draft)),
    );
  }

  async function create() {
    if (!file) return;
    const chosen = drafts.flatMap((draft, index) => (draft.include ? [index] : []));
    if (chosen.some((index) => !drafts[index].title.trim())) return setError("Every included item needs a title.");
    if (chosen.some((index) => Boolean(drafts[index].startTime) !== Boolean(drafts[index].endTime)))
      return setError("Enter both a start and an end time, or neither.");
    setSaving(true);
    setError("");
    const created: TravelObject[] = [];
    const attach = attachmentExtension(file.name) !== null;
    let attachFailures = 0;
    try {
      for (const index of chosen) {
        const { title, type, date, endDate, startTime, endTime, isAllDay, location, cost, notes } = drafts[index];
        const item = await api.createObject({
          tripId: trip.id,
          kind: "event",
          title: title.trim(),
          type,
          date,
          endDate,
          startTime,
          endTime,
          isAllDay,
          location: location?.name?.trim() ? location : null,
          cost,
          notes,
        });
        created.push(item);
        // Never offer an item again once it exists.
        update(index, { include: false });
        if (!eventTypes.includes(item.type)) onAddType(item.type);
        if (attach) await api.uploadAttachment(item.id, file).catch(() => (attachFailures += 1));
      }
      onImported(created);
      if (attachFailures) onError(`Created ${created.length} items, but the reservation file could not be attached.`);
      else if (!attach) onError(`Created ${created.length} items. Saved web pages are not stored as attachments.`);
      setFile(null);
      onDone();
    } catch (cause) {
      if (created.length) onImported(created);
      setError(
        `${created.length ? `Created ${created.length} of ${chosen.length} items. ` : ""}${
          cause instanceof Error ? cause.message : "Could not create the items."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  const typeOptions = (current: string) => [...new Set([...eventTypes, current])];
  const count = drafts.filter((draft) => draft.include).length;

  /** Where a PDF value came from, or that the PDF did not give one. */
  function evidence(draft: ReviewDraft, field: ReviewField, empty: boolean): ReactNode {
    if (!draft.review) return null;
    const review = draft.review[field];
    if (field === "type" && review?.confidence === "low")
      return <span className="text-accent">Not detected in the file; choose a type.</span>;
    if (!review || empty) return <span>Not found in the file.</span>;
    return (
      <>
        {review.confidence === "medium" && <span className="text-accent">Check · </span>}
        <span className="break-words">{review.evidence}</span>
      </>
    );
  }

  const hint = (content: ReactNode) => content && <span className="mt-1 block text-[11px] text-muted">{content}</span>;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={reservationFileAccept}
        className="sr-only"
        onChange={(event) => void readFile(event.target.files?.[0])}
      />
      <button type="button" className={menuItemClassName} disabled={reading} onClick={() => inputRef.current?.click()}>
        {reading ? <LoaderCircle className="animate-spin" /> : <Ticket />}
        {reading ? "Reading reservation…" : "Import reservation"}
      </button>
      {open &&
        createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-reservation-title"
          >
            <form
              action={create}
              className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-lg overflow-y-auto border-t border-foreground bg-panel p-6 text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)]"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="import-reservation-title" className="text-lg font-medium tracking-tight">
                    Review reservation
                  </h2>
                  <p className="truncate text-sm text-muted">
                    From {file.name}. Times are shown in {trip.timezone}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-11 sm:size-7"
                  onClick={() => setFile(null)}
                  disabled={saving}
                  aria-label="Close"
                >
                  <X />
                </Button>
              </div>
              <ul className="space-y-5">
                {drafts.map((draft, index) => (
                  <li key={index} className="border-b border-divider pb-4 last:border-b-0">
                    {drafts.length > 1 && (
                      <label className="mb-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.include}
                          onChange={(event) => update(index, { include: event.target.checked })}
                        />
                        Create this item
                      </label>
                    )}
                    <fieldset disabled={!draft.include} className="space-y-4 disabled:opacity-50">
                      <div className="grid grid-cols-[1fr_8rem] gap-3">
                        <label className="text-xs font-normal text-muted">
                          Title
                          <input
                            value={draft.title}
                            maxLength={100}
                            required={draft.include}
                            onChange={(event) => update(index, { title: event.target.value })}
                            className={fieldClassName}
                          />
                          {hint(evidence(draft, "title", !draft.title))}
                        </label>
                        <label className="text-xs font-normal text-muted">
                          Type
                          <select
                            value={draft.type}
                            onChange={(event) => update(index, { type: event.target.value })}
                            className={`${fieldClassName} capitalize`}
                          >
                            {typeOptions(draft.type).map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          {hint(evidence(draft, "type", false))}
                        </label>
                      </div>
                      <div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs font-normal text-muted">
                            Start date
                            <input
                              type="date"
                              value={draft.date ?? ""}
                              onChange={(event) => updateSchedule(index, { date: event.target.value || null })}
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-normal text-muted">
                            End date
                            <input
                              type="date"
                              value={draft.endDate ?? ""}
                              min={draft.date ?? undefined}
                              disabled={!draft.date}
                              onChange={(event) => updateSchedule(index, { endDate: event.target.value || null })}
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-normal text-muted">
                            Start time
                            <input
                              type="time"
                              value={draft.startTime ?? ""}
                              disabled={!draft.date}
                              onChange={(event) => updateSchedule(index, { startTime: event.target.value || null })}
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-normal text-muted">
                            End time
                            <input
                              type="time"
                              value={draft.endTime ?? ""}
                              disabled={!draft.date}
                              onChange={(event) => updateSchedule(index, { endTime: event.target.value || null })}
                              className={fieldClassName}
                            />
                          </label>
                        </div>
                        {hint(evidence(draft, "dates", !draft.date))}
                        {draft.startTime && hint(evidence(draft, "times", false))}
                      </div>
                      <label className="block text-xs font-normal text-muted">
                        Place
                        <input
                          value={draft.location?.name ?? ""}
                          maxLength={300}
                          onChange={(event) =>
                            update(index, { location: { ...draft.location, name: event.target.value } })
                          }
                          className={fieldClassName}
                        />
                        {hint(evidence(draft, "location", !draft.location?.name))}
                      </label>
                      <div>
                        <div className="grid grid-cols-[1fr_5rem] gap-3">
                          <label className="text-xs font-normal text-muted">
                            Planned cost
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={draft.cost?.amount ?? ""}
                              onChange={(event) =>
                                update(index, {
                                  cost:
                                    event.target.value === ""
                                      ? null
                                      : {
                                          amount: Number(event.target.value),
                                          currency: draft.cost?.currency ?? trip.defaultCurrency ?? "SGD",
                                        },
                                })
                              }
                              className={`${fieldClassName} font-mono`}
                            />
                          </label>
                          <label className="text-xs font-normal text-muted">
                            Currency
                            <input
                              value={draft.cost?.currency ?? ""}
                              maxLength={3}
                              pattern="[A-Za-z]{3}"
                              disabled={!draft.cost}
                              onChange={(event) =>
                                draft.cost &&
                                update(index, {
                                  cost: { ...draft.cost, currency: event.target.value.toUpperCase() },
                                })
                              }
                              className={`${fieldClassName} font-mono uppercase`}
                            />
                          </label>
                        </div>
                        {hint(evidence(draft, "cost", !draft.cost))}
                      </div>
                      {draft.notes && (
                        <p className="line-clamp-4 whitespace-pre-line break-words text-xs text-muted">{draft.notes}</p>
                      )}
                    </fieldset>
                  </li>
                ))}
              </ul>
              {attachmentExtension(file.name) && (
                <p className="mt-4 text-xs text-muted">The original file is attached to each new item.</p>
              )}
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 sm:min-h-0"
                  onClick={() => setFile(null)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" className="min-h-11 sm:min-h-0" disabled={saving || !count}>
                  {saving ? "Creating…" : count === 1 ? "Create item" : `Create ${count} items`}
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
