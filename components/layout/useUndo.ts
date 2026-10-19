"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { pushBounded, type UndoEntry } from "@/lib/undo-stack";

export type UndoToast = { message: string; canUndo: boolean };

/** In-memory undo/redo stacks for the active trip, plus the toast shown after a change. */
export function useUndo(activeTripId: string | undefined) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [toast, setToast] = useState<(UndoToast & { tripId?: string }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, canUndo: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, canUndo, tripId: activeTripId });
      timer.current = setTimeout(() => setToast(null), 8000);
    },
    [activeTripId],
  );

  // A trip switch drops history so undo never touches another trip's items.
  useLayoutEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    if (timer.current) clearTimeout(timer.current);
  }, [activeTripId]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Record a new undoable change; a fresh change invalidates redo. */
  function record(entry: UndoEntry, toastMessage?: string) {
    undoStack.current = pushBounded(undoStack.current, entry);
    redoStack.current = [];
    if (toastMessage) showToast(toastMessage, true);
    else dismissToast();
  }

  return {
    undoStack,
    redoStack,
    toast: toast?.tripId === activeTripId ? toast : null,
    showToast,
    dismissToast,
    record,
  };
}
