"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus<T extends HTMLElement>(open: boolean, dialogRef: RefObject<T | null>) {
  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog = dialog;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? activeDialog).focus();

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!activeDialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInDialog, true);
    return () => {
      document.removeEventListener("keydown", keepFocusInDialog, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, dialogRef]);
}
