"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { menuItemClassName } from "@/components/ui/menu-item";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { api } from "@/lib/api-client";
import type { Trip } from "@/types/travel";

const zones =
  (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf?.("timeZone") ?? [];

export function EditTripDialog({
  trip,
  onSaved,
  menuItem = false,
}: {
  trip: Trip;
  onSaved: (trip: Trip) => void;
  menuItem?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, dialogRef);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

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

  return (
    <>
      {menuItem ? (
        <button type="button" className={menuItemClassName} onClick={() => setOpen(true)}>
          <Pencil /> Edit trip
        </button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 sm:size-7"
          onClick={() => setOpen(true)}
          aria-label="Edit trip settings"
          title="Edit trip settings"
        >
          <Pencil />
        </Button>
      )}
      {open &&
        createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/80 backdrop-blur-[2px] p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-trip-title"
          >
            <form
              action={submit}
              className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-md overflow-y-auto border-t border-foreground bg-panel p-6 text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)]"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 id="edit-trip-title" className="text-lg font-medium tracking-tight">
                    Trip settings
                  </h2>
                  <p className="text-sm text-muted">Changes apply to this trip and its itinerary.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-11 sm:size-7"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X />
                </Button>
              </div>
              <label className="block text-xs font-normal text-muted">
                Trip name
                <input
                  name="title"
                  required
                  maxLength={50}
                  defaultValue={trip.title}
                  className="mt-1 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground"
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-normal text-muted">
                  Start date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={trip.startDate.slice(0, 10)}
                    required
                    className="mt-1 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground"
                  />
                </label>
                <label className="text-xs font-normal text-muted">
                  End date
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={trip.endDate.slice(0, 10)}
                    required
                    className="mt-1 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-normal text-muted">
                IANA timezone
                <input
                  name="timezone"
                  required
                  list="edit-iana-timezones"
                  defaultValue={trip.timezone}
                  className="mt-1 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground"
                />
                <datalist id="edit-iana-timezones">
                  {[...new Set(["UTC", trip.timezone, ...zones])].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </label>
              <label className="mt-4 block text-xs font-normal text-muted">
                Default currency
                <input
                  name="defaultCurrency"
                  required
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  defaultValue={trip.defaultCurrency ?? "SGD"}
                  className="mt-1 w-full rounded-none border-0 border-b border-input-rule bg-transparent px-0 py-1.5 text-[15px] font-normal text-foreground outline-none focus:border-foreground uppercase"
                />
              </label>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="ghost" className="min-h-11 sm:min-h-0" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="min-h-11 sm:min-h-0" disabled={saving}>
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
