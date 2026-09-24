"use client";

import { useState } from "react";
import type { TravelObject } from "@/types/travel";

/** Shared item selection and inspector state for workspace views. */
export function useItemSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  function replaceSelection(ids: Iterable<string>, primaryId: string | null = null) {
    const next = new Set(ids);
    setSelectedIds(next);
    setPrimarySelectedId(primaryId && next.has(primaryId) ? primaryId : next.values().next().value ?? null);
  }

  function selectItem(item: TravelObject, additive = false, inspect = true) {
    if (!additive) { replaceSelection([item.id], item.id); if (inspect) setInspectedItemId(item.id); return; }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      setPrimarySelectedId((primary) => next.has(item.id) ? item.id : primary === item.id ? next.values().next().value ?? null : primary);
      if (inspect && !additive) setInspectedItemId(next.has(item.id) ? item.id : next.values().next().value ?? null);
      return next;
    });
  }

  function inspectItem(item: TravelObject) {
    if (!selectedIds.has(item.id)) replaceSelection([item.id], item.id); else setPrimarySelectedId(item.id);
    setInspectedItemId(item.id);
  }

  function clearSelection() { replaceSelection([]); setInspectedItemId(null); }
  function closeInspector() { clearSelection(); }

  return { selectedIds, setSelectedIds, primarySelectedId, setPrimarySelectedId, inspectedItemId, setInspectedItemId, replaceSelection, selectItem, inspectItem, clearSelection, closeInspector };
}
