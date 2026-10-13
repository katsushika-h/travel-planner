"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useModalFocus } from "@/components/ui/use-modal-focus";

export function ConfirmDialog({
  title,
  description,
  items = [],
  pending = false,
  confirmOnDelete = false,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  items?: string[];
  pending?: boolean;
  confirmOnDelete?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useModalFocus(true, dialogRef);
  useEffect(() => {
    if (confirmOnDelete) confirmButtonRef.current?.focus();
  }, [confirmOnDelete]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (confirmOnDelete && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        event.stopPropagation();
        if (!pending && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey) onConfirm();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel, onConfirm, pending, confirmOnDelete]);
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        ref={dialogRef}
        className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-md overflow-y-auto border-t border-foreground bg-panel p-6 text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)]"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-medium tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        {items.length > 0 && (
          <ul className="mt-4 max-h-48 overflow-y-auto border-y border-divider text-sm">
            {items.map((item, index) => (
              <li key={`${item}:${index}`} className="truncate border-b border-divider py-2 last:border-b-0">
                {item}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-3 sm:min-h-9"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            className="min-h-11 px-4 sm:min-h-9"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
