"use client";

import { useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useItemSaveQueue } from "@/components/layout/useItemSaveQueue";
import { useUndo } from "@/components/layout/useUndo";
import type { useItemSelection } from "@/components/layout/useItemSelection";
import { api } from "@/lib/api-client";
import { duplicableItems, duplicateCreateInput, duplicateDayOrder } from "@/lib/duplicate-item";
import { groupedMoveTarget, oneHourEnd, resizeFixedTimeRange, schedulePatchForMove } from "@/lib/schedule-domain";
import { mergeCreatedTravelObject, sortTravelObjects } from "@/lib/schedule-order";
import { UNDO_FIELDS, pushBounded, restorePatches, snapshotItems, type UndoEntry } from "@/lib/undo-stack";
import type {
  CreateTravelObjectInput,
  LocationData,
  TravelObject,
  Trip,
  UpdateTravelObjectInput,
} from "@/types/travel";

type ItemActionsOptions = {
  activeTrip: Trip | null;
  /** Latest active trip id; responses for a trip that is no longer active are ignored. */
  activeTripKeyRef: RefObject<string | undefined>;
  items: TravelObject[];
  setItems: Dispatch<SetStateAction<TravelObject[]>>;
  selection: ReturnType<typeof useItemSelection>;
  setPendingDeleteIds: Dispatch<SetStateAction<string[] | null>>;
  setError: (message: string) => void;
};

/** Item create, edit, move, reorder, and delete actions shared by the workspace views. */
export function useItemActions({
  activeTrip,
  activeTripKeyRef,
  items,
  setItems,
  selection,
  setPendingDeleteIds,
  setError,
}: ItemActionsOptions) {
  const { selectedIds, setSelectedIds, primarySelectedId, setPrimarySelectedId, setInspectedItemId, replaceSelection } =
    selection;
  const [deletingItems, setDeletingItems] = useState(false);
  const { changeItem, cancelPendingSave } = useItemSaveQueue(activeTrip?.id, setItems, setError);
  const undoState = useUndo(activeTrip?.id);
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** Capture the affected items' fields before a change; call before applying it. */
  function recordUndo(label: string, affected: readonly TravelObject[], toast?: string) {
    if (!affected.length) return;
    undoState.record({ label, before: snapshotItems(affected) }, toast);
  }

  /** Recreate deleted items from their last known fields (new ids; attachments are not restored). */
  async function recreateItems(deleted: readonly TravelObject[], tripId: string) {
    for (const item of deleted) {
      const isNote = item.kind === "note";
      const created = await api.createObject({
        tripId,
        kind: item.kind,
        title: item.title,
        type: item.type,
        date: item.date,
        endDate: item.endDate,
        startTime: item.startTime,
        endTime: item.endTime,
        placementTime: item.placementTime,
        isAllDay: item.isAllDay,
        ...(isNote
          ? { noteBody: item.noteBody ?? "", ...(item.dayOrder !== null ? { dayOrder: item.dayOrder } : {}) }
          : {
              location: item.location ?? null,
              cost: item.cost ?? null,
              notes: item.notes ?? undefined,
              tags: item.tags ?? [],
              headerImage: item.headerImage ?? undefined,
            }),
      });
      if (activeTripKeyRef.current !== tripId) return;
      if (!isNote && item.date && item.dayOrder !== null) {
        const reordered = await api.reorderObjects({
          tripId,
          objectId: created.id,
          date: item.date.slice(0, 10),
          dayOrder: item.dayOrder,
        });
        if (activeTripKeyRef.current === tripId) setItems(sortTravelObjects(reordered));
      } else setItems((current) => (item.date ? mergeCreatedTravelObject(current, created) : [...current, created]));
    }
  }

  /** Revert (or re-apply) the latest entry through the normal save path so saves stay serialized. */
  async function stepHistory(direction: "undo" | "redo") {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    const from = direction === "undo" ? undoState.undoStack : undoState.redoStack;
    const to = direction === "undo" ? undoState.redoStack : undoState.undoStack;
    const entry = from.current.at(-1);
    if (!entry) return;
    from.current = from.current.slice(0, -1);
    if (entry.deleted?.length) {
      try {
        await recreateItems(entry.deleted, tripId);
        undoState.showToast("Restored. Attachments and expense links are not restored.", false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not restore the deleted item.");
      }
      return;
    }
    const patches = restorePatches(entry.before, itemsRef.current);
    if (!patches.length) return void stepHistory(direction);
    const inverse: UndoEntry = {
      label: entry.label,
      before: snapshotItems(itemsRef.current.filter((item) => patches.some(({ id }) => id === item.id))),
    };
    to.current = pushBounded(to.current, inverse);
    for (const { id, patch } of patches) changeItem(id, patch, true);
    undoState.showToast(`${direction === "undo" ? "Undid" : "Redid"}: ${entry.label}`, false);
  }

  async function openCreateItem(
    date?: string,
    time?: string,
    type = "unclassified",
    title = "(untitled event)",
    dayOrder?: number,
    location: LocationData | null = null,
  ) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    let schedule: Pick<
      CreateTravelObjectInput,
      "date" | "endDate" | "startTime" | "endTime" | "placementTime" | "dayOrder"
    >;
    if (!date) schedule = { date: null, endDate: null, startTime: null, endTime: null, placementTime: null };
    else if (!time)
      schedule = { date, endDate: date, startTime: null, endTime: null, placementTime: "09:00", dayOrder: null };
    else {
      const { endDate, endTime } = oneHourEnd(date, time, activeTrip.timezone);
      schedule = { date, endDate, startTime: time, endTime, placementTime: null, dayOrder: null };
    }
    try {
      const created = await api.createObject({
        tripId,
        title,
        type,
        ...schedule,
        isAllDay: false,
        location,
        cost: null,
        notes: null,
        tags: [],
      });
      if (activeTripKeyRef.current !== tripId) return;
      if (date && !time && dayOrder !== undefined) {
        const reordered = await api.reorderObjects({ tripId, objectId: created.id, date, dayOrder });
        if (activeTripKeyRef.current !== tripId) return;
        setItems(sortTravelObjects(reordered));
      } else setItems((current) => (date ? mergeCreatedTravelObject(current, created) : [...current, created]));
      replaceSelection([created.id], created.id);
      setInspectedItemId(created.id);
    } catch (cause) {
      if (activeTripKeyRef.current === tripId)
        setError(cause instanceof Error ? cause.message : "Could not create itinerary item.");
    }
  }

  async function createNote(date: string, order: number) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    const created = await api.createObject({
      tripId,
      kind: "note",
      type: "unclassified",
      title: "Note",
      noteBody: "",
      date,
      endDate: date,
      isAllDay: false,
      dayOrder: order,
    });
    if (activeTripKeyRef.current !== tripId) return;
    setItems((current) => mergeCreatedTravelObject(current, created));
    return created.id;
  }

  async function saveNote(id: string, data: { title: string; noteBody: string }) {
    const tripId = activeTrip?.id;
    const updated = await api.updateObject(id, data);
    if (activeTripKeyRef.current !== tripId) return;
    // A content response must not overwrite a concurrent move or reorder.
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, title: updated.title, noteBody: updated.noteBody, updatedAt: updated.updatedAt }
          : item,
      ),
    );
  }

  async function deleteItem(id: string) {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    cancelPendingSave(id);
    const removed = itemsRef.current.filter((item) => item.id === id);
    await api.deleteObject(id);
    if (activeTripKeyRef.current !== tripId) return;
    recordDelete(removed);
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      setPrimarySelectedId((primary) => (primary === id ? (next.values().next().value ?? null) : primary));
      return next;
    });
    setInspectedItemId((current) => (current === id ? null : current));
  }

  function recordDelete(removed: readonly TravelObject[]) {
    if (!removed.length) return;
    const label = removed.length === 1 ? "delete item" : `delete ${removed.length} items`;
    undoState.record(
      { label, before: snapshotItems([]), deleted: [...removed] },
      removed.length === 1 ? "Item deleted." : `${removed.length} items deleted.`,
    );
  }

  function applyMove(item: TravelObject, date: string, time?: string) {
    const patch = schedulePatchForMove(item, date, time);
    if (patch) changeItem(item.id, patch, true);
  }

  async function moveItem(item: TravelObject, date: string, time?: string) {
    if (!activeTrip) return;
    recordUndo("move item", [item], "Item moved.");
    applyMove(item, date, time);
  }

  function resizeItem(item: TravelObject, edge: "start" | "end", time: string) {
    if (!activeTrip || !item.date || !item.startTime || !item.endTime) return;
    const date = item.date.slice(0, 10);
    recordUndo("resize item", [item]);
    const schedule = {
      ...resizeFixedTimeRange(date, item.endDate?.slice(0, 10) ?? null, item.startTime, item.endTime, edge, time),
      isAllDay: false,
    };
    changeItem(item.id, { ...schedule, placementTime: null }, true);
  }

  function changeSelectedItems(
    ids: string[],
    patchForItem: (item: TravelObject) => UpdateTravelObjectInput,
    immediate = true,
  ) {
    const affected = items.filter((item) => ids.includes(item.id));
    const patches = affected.map((item) => ({ item, patch: patchForItem(item) }));
    if (patches.some(({ patch }) => UNDO_FIELDS.some((field) => field in patch))) recordUndo("edit items", affected);
    for (const { item, patch } of patches) changeItem(item.id, patch, immediate);
  }

  async function deleteSelectedItems(ids: string[]) {
    const tripId = activeTrip?.id;
    if (!tripId || deletingItems) return;
    setDeletingItems(true);
    for (const id of ids) cancelPendingSave(id);
    const removing = itemsRef.current.filter((item) => ids.includes(item.id));
    const deleted = new Set<string>();
    for (const id of ids) {
      try {
        await api.deleteObject(id);
        deleted.add(id);
      } catch {
        /* keep failed items selected below */
      }
    }
    setDeletingItems(false);
    if (activeTripKeyRef.current !== tripId) return;
    const failed = ids.filter((id) => !deleted.has(id));
    recordDelete(removing.filter((item) => deleted.has(item.id)));
    setItems((current) => current.filter((item) => !deleted.has(item.id)));
    setPendingDeleteIds(null);
    replaceSelection(failed, failed.includes(primarySelectedId ?? "") ? primarySelectedId : (failed[0] ?? null));
    setInspectedItemId((current) => (current && deleted.has(current) ? (failed[0] ?? null) : current));
    if (failed.length)
      setError(`Could not delete ${failed.length === 1 ? "one selected item" : `${failed.length} selected items`}.`);
  }

  function selectedActionItems(item: TravelObject) {
    return selectedIds.has(item.id) ? items.filter((candidate) => selectedIds.has(candidate.id)) : [item];
  }

  async function moveSelectedItems(item: TravelObject, date: string, time?: string) {
    const moving = selectedActionItems(item);
    recordUndo("move items", moving, moving.length === 1 ? "Item moved." : `${moving.length} items moved.`);
    for (const candidate of moving) {
      const target = groupedMoveTarget(item, candidate, date, activeTrip?.timezone ?? "UTC", time);
      applyMove(candidate, target.date, target.time);
    }
  }

  async function moveSelectedItemsToDay(item: TravelObject, date: string) {
    const moving = selectedActionItems(item);
    recordUndo("move items", moving, moving.length === 1 ? "Item moved." : `${moving.length} items moved.`);
    for (const candidate of moving) applyMove(candidate, date);
  }

  async function unscheduleSelectedItems(item: TravelObject) {
    const moving = selectedActionItems(item);
    recordUndo("unschedule items", moving, moving.length === 1 ? "Item unscheduled." : "Items unscheduled.");
    for (const candidate of moving)
      changeItem(
        candidate.id,
        { date: null, endDate: null, placementTime: null, isAllDay: false, dayOrder: null },
        true,
      );
  }

  async function reorderItem(
    item: TravelObject,
    date: string,
    order: number,
    clearTime = false,
    placementTime?: string,
  ) {
    if (!activeTrip) return;
    const tripId = activeTrip.id;
    if (item.isAllDay) {
      if (item.date?.slice(0, 10) !== date) await moveItem(item, date);
      return;
    }
    // The server renumbers siblings on reorder, so snapshot every item.
    recordUndo("reorder items", itemsRef.current, "Item moved.");
    try {
      const updated = await api.reorderObjects({
        tripId,
        objectId: item.id,
        date,
        dayOrder: order,
        clearTime,
        placementTime,
      });
      if (activeTripKeyRef.current === tripId) setItems(sortTravelObjects(updated));
    } catch (cause) {
      if (activeTripKeyRef.current === tripId)
        setError(cause instanceof Error ? cause.message : "Could not reorder itinerary.");
    }
  }

  /** Copies events (notes are skipped) directly after their originals, then selects the copies. */
  async function duplicateItems(ids: string[]) {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    const wanted = new Set(ids);
    const originals = duplicableItems(sortTravelObjects(items.filter((item) => wanted.has(item.id))));
    const createdIds: string[] = [];
    let working = items;
    try {
      for (const original of originals) {
        const source = working.find((item) => item.id === original.id) ?? original;
        const created = await api.createObject(duplicateCreateInput(source));
        if (activeTripKeyRef.current !== tripId) return;
        working = mergeCreatedTravelObject(working, created);
        createdIds.push(created.id);
        const dayOrder = duplicateDayOrder(source);
        if (dayOrder !== null && created.date) {
          working = sortTravelObjects(
            await api.reorderObjects({ tripId, objectId: created.id, date: created.date.slice(0, 10), dayOrder }),
          );
          if (activeTripKeyRef.current !== tripId) return;
        }
      }
    } catch (cause) {
      if (activeTripKeyRef.current === tripId)
        setError(cause instanceof Error ? cause.message : "Could not duplicate items.");
    }
    if (activeTripKeyRef.current !== tripId) return;
    if (working !== items) setItems(working);
    if (createdIds.length) {
      replaceSelection(createdIds, createdIds[createdIds.length - 1]);
      setInspectedItemId(createdIds.length === 1 ? createdIds[0] : null);
    }
  }

  async function moveType(item: TravelObject, type: string) {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    const moving = selectedActionItems(item);
    recordUndo(
      "change type",
      moving.filter((candidate) => candidate.type !== type),
    );
    try {
      const changed = await Promise.all(
        moving.map((candidate) =>
          candidate.type === type ? Promise.resolve(candidate) : api.updateObject(candidate.id, { type }),
        ),
      );
      if (activeTripKeyRef.current !== tripId) return;
      const byId = new Map(changed.map((candidate) => [candidate.id, candidate]));
      setItems((current) => sortTravelObjects(current.map((candidate) => byId.get(candidate.id) ?? candidate)));
    } catch (cause) {
      if (activeTripKeyRef.current === tripId)
        setError(cause instanceof Error ? cause.message : "Could not change item type.");
    }
  }

  return {
    changeItem,
    openCreateItem,
    createNote,
    saveNote,
    deleteItem,
    resizeItem,
    changeSelectedItems,
    deleteSelectedItems,
    deletingItems,
    moveSelectedItems,
    moveSelectedItemsToDay,
    unscheduleSelectedItems,
    reorderItem,
    duplicateItems,
    moveType,
    undoToast: undoState.toast,
    dismissUndoToast: undoState.dismissToast,
    undo: () => void stepHistory("undo"),
    redo: () => void stepHistory("redo"),
  };
}
