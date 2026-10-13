"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { menuItemClassName } from "@/components/ui/menu-item";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { api } from "@/lib/api-client";
import type { Trip } from "@/types/travel";

export function DeleteTripButton({
  trip,
  onDeleted,
  onError,
  compact = false,
  menuItem = false,
}: {
  trip: Trip;
  onDeleted: () => void;
  onError: (message: string) => void;
  compact?: boolean;
  menuItem?: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<0 | 1 | 2>(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(confirmationStep > 0, dialogRef);

  function requestDelete() {
    if (!deleting) setConfirmationStep(1);
  }

  async function deleteTrip() {
    setDeleting(true);
    setConfirmationStep(0);
    onError("");
    try {
      await api.deleteTrip(trip.id);
      onDeleted();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to delete trip.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!confirmationStep) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setConfirmationStep(0);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmationStep]);

  return (
    <>
      {menuItem ? (
        <button
          type="button"
          className={`${menuItemClassName} text-danger [&_svg]:text-danger`}
          onClick={requestDelete}
          disabled={deleting}
        >
          <Trash2 /> {deleting ? "Deleting…" : "Delete trip"}
        </button>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size={compact ? "icon-sm" : "default"}
          className={compact ? "size-11 sm:size-7" : "min-h-11 sm:min-h-0"}
          onClick={requestDelete}
          disabled={deleting}
          aria-label={`Delete ${trip.title}`}
          title={`Delete ${trip.title}`}
        >
          <Trash2 /> {!compact && (deleting ? "Deleting…" : "Delete trip")}
        </Button>
      )}
      {confirmationStep > 0 &&
        createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-trip-title"
          >
            <div className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-md overflow-y-auto border-t border-foreground bg-panel p-6 text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)]">
              <div className="flex items-start gap-3">
                <Trash2 size={18} aria-hidden className="mt-1 shrink-0 text-danger" />
                <div>
                  <h2 id="delete-trip-title" className="text-lg font-medium tracking-tight">
                    {confirmationStep === 1 ? "Delete this trip?" : "Confirm permanent deletion"}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {confirmationStep === 1 ? (
                      <>
                        This will delete <span className="font-medium text-foreground">{trip.title}</span> and all of
                        its itinerary items and notes.
                      </>
                    ) : (
                      <>
                        There is no undo after deleting{" "}
                        <span className="font-medium text-foreground">{trip.title}</span>. Please confirm that you want
                        to continue.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 sm:min-h-0"
                  onClick={() => setConfirmationStep(0)}
                >
                  Cancel
                </Button>
                {confirmationStep === 1 ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11 sm:min-h-0"
                    onClick={() => setConfirmationStep(2)}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11 sm:min-h-0"
                    onClick={() => void deleteTrip()}
                  >
                    Delete permanently
                  </Button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
