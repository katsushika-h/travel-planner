"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { formatShortcutKey, isApplePlatform, shortcutGroups } from "@/lib/keyboard-shortcuts";

/** Help overlay listing the shortcuts from `lib/keyboard-shortcuts.ts`. Escape, "?" or the scrim closes it. */
export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Only mounted after a user action on the client, so reading the platform here cannot mismatch hydration.
  const [apple] = useState(isApplePlatform);
  useModalFocus(true, dialogRef);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" && event.key !== "?") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="my-auto max-h-[calc(100dvh_-_2rem)] w-full max-w-2xl overflow-y-auto border-t border-foreground bg-panel p-6 text-foreground shadow-[0_24px_48px_rgb(0_0_0/0.18)] outline-none dark:shadow-[0_24px_48px_rgb(0_0_0/0.6)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="keyboard-shortcuts-title" className="text-lg font-medium tracking-tight">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 place-items-center text-muted outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring sm:size-9"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {shortcutGroups.map((group) => (
            <section key={group.title}>
              <h3 className="border-b border-divider pb-2 text-xs text-muted">{group.title}</h3>
              <ul>
                {group.shortcuts.map((shortcut, index) => (
                  <li
                    key={`${shortcut.keys.join("+")}:${index}`}
                    className="flex items-start justify-between gap-4 border-b border-divider py-2 text-sm last:border-b-0"
                  >
                    <span>{shortcut.description}</span>
                    <span className="flex shrink-0 gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-6 border border-divider bg-surface px-1.5 py-0.5 text-center font-mono text-xs text-foreground"
                        >
                          {formatShortcutKey(key, apple)}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
