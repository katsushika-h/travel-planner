"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TravelObject } from "@/types/travel";

type Draft = { title: string; noteBody: string };
export function ItemNoteCard({
  item,
  date,
  autoFocus,
  onSave,
  onDelete,
}: {
  item: TravelObject;
  date: string;
  autoFocus: boolean;
  onSave: (id: string, data: Draft) => Promise<void>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `agenda:${date}:${item.id}`,
    data: { item, draggedDate: date },
  });
  const [draft, setDraft] = useState<Draft>({
    title: item.title === "Note" ? "" : item.title,
    noteBody: item.noteBody ?? "",
  });
  const draftRef = useRef(draft);
  const saved = useRef<Draft>({ title: item.title, noteBody: item.noteBody ?? "" });
  const saving = useRef(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = bodyRef.current;
    if (!field) return;
    const fitText = () => {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    };
    fitText();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth;
        fitText();
      }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [draft.noteBody]);
  useLayoutEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const current = draftRef.current;
    if (
      (current.title.trim() || "Note") === saved.current.title &&
      current.noteBody === saved.current.noteBody &&
      !saving.current
    ) {
      const next = { title: item.title === "Note" ? "" : item.title, noteBody: item.noteBody ?? "" };
      draftRef.current = next;
      setDraft(next);
      saved.current = { title: item.title, noteBody: item.noteBody ?? "" };
    }
  }, [item.title, item.noteBody]);
  function change(patch: Partial<Draft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    setStatus("Unsaved changes");
  }
  async function commit() {
    if (saving.current) return;
    saving.current = true;
    setError("");
    try {
      while (true) {
        const next = { title: draftRef.current.title.trim() || "Note", noteBody: draftRef.current.noteBody };
        if (next.title === saved.current.title && next.noteBody === saved.current.noteBody) break;
        setStatus("Saving…");
        await onSave(item.id, next);
        saved.current = next;
      }
      setStatus("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save note.");
      setStatus("Not saved");
    } finally {
      saving.current = false;
    }
  }
  return (
    <article
      id={`day-card-${item.id}`}
      ref={setNodeRef}
      aria-label="Day note"
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}
      className={`group/note relative border-b border-divider sm:ml-[104px] ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex min-w-0">
        <div className="flex w-9 shrink-0 items-start justify-center pt-1 text-faint">
          <button
            type="button"
            data-reorder-handle
            aria-label={`Reorder note ${item.title}`}
            className="flex min-h-11 min-w-11 touch-none items-center justify-center hover:text-foreground sm:hidden sm:min-h-7 sm:min-w-7 sm:group-hover/note:flex sm:group-focus-within/note:flex"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
          </button>
        </div>
        <div className="min-w-0 flex-1 py-1 pr-9">
          <input
            ref={titleRef}
            aria-label="Note title"
            placeholder="Note title (optional)"
            maxLength={100}
            value={draft.title}
            onChange={(event) => change({ title: event.target.value })}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.parentElement?.querySelector("textarea")?.focus();
              }
            }}
            className="min-h-11 w-full min-w-0 border-0 bg-transparent px-1 text-base font-medium text-muted outline-none placeholder:text-faint focus:text-foreground focus:ring-0 sm:min-h-6 sm:text-[13px]"
          />
          <textarea
            ref={bodyRef}
            aria-label="Note text"
            placeholder="Click here to write a note…"
            rows={1}
            maxLength={500}
            value={draft.noteBody}
            onChange={(event) => change({ noteBody: event.target.value })}
            onBlur={() => void commit()}
            className="w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-0.5 text-base leading-snug text-muted outline-none placeholder:text-faint focus:text-foreground focus:ring-0 sm:text-[13px]"
          />
          <div className="absolute top-0 right-0 flex items-center gap-1">
            <span aria-live="polite" className="text-xs text-muted">
              {status}
            </span>
            <span className="group/delete">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 opacity-0 transition-opacity group-hover/delete:opacity-100 group-hover/note:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 sm:min-h-6 sm:min-w-6"
                onClick={onDelete}
                aria-label={`Delete note ${item.title}`}
              >
                <Trash2 size={14} />
              </Button>
            </span>
          </div>
          {error && (
            <div role="alert" className="text-xs text-danger">
              {error}
              <Button type="button" variant="ghost" size="sm" className="ml-1 min-h-11" onClick={() => void commit()}>
                Retry save
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
