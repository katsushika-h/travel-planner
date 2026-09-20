"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({ title, description, items = [], onCancel, onConfirm }: { title: string; description: string; items?: string[]; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onConfirm(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } } document.addEventListener("keydown", onKeyDown, true); return () => document.removeEventListener("keydown", onKeyDown, true); }, [onCancel, onConfirm]);
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"><div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-2xl"><h2 id="confirm-dialog-title" className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p>{items.length > 0 && <ul className="mt-4 max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-2 text-sm">{items.map((item, index) => <li key={`${item}:${index}`} className="truncate px-2 py-1">{item}</li>)}</ul>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" variant="destructive" onClick={onConfirm}>Delete</Button></div></div></div>, document.body);
}
