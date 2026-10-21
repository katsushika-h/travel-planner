"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { moveMenuFocus, useMenuDismiss } from "@/components/layout/TripMenu";

export type SheetAction = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Return focus to the trigger after the action (for actions that stay on the same screen). */
  restoreFocus?: boolean;
};

/**
 * Phone bottom sheet with a short list of actions. Escape and the scrim close it and return focus to
 * `triggerRef`; arrow keys move between actions and Tab stays inside the sheet.
 */
export function ActionSheet({
  title,
  actions,
  triggerRef,
  onClose,
}: {
  title: string;
  actions: SheetAction[];
  triggerRef: RefObject<HTMLElement | null>;
  onClose: (restoreFocus: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useMenuDismiss(true, rootRef, triggerRef, onClose);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    moveMenuFocus(event, panelRef.current);
    if (event.key !== "Tab") return;
    const buttons = [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown} className="sm:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close menu"
        className="fixed inset-0 z-[70] bg-scrim"
        onClick={() => onClose(true)}
      />
      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[85dvh] flex-col overflow-y-auto border-t border-foreground bg-panel pb-[max(0.5rem,env(safe-area-inset-bottom))] text-foreground"
      >
        <p className="truncate border-b border-divider px-4 py-3 text-xs text-muted">{title}</p>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              action.onSelect();
              onClose(action.restoreFocus ?? false);
            }}
            className="min-h-12 px-4 text-left text-sm outline-none hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:text-faint"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
