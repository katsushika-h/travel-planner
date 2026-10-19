import type { TravelObject, UpdateTravelObjectInput } from "@/types/travel";

/** Item fields an undo entry captures and restores. */
export const UNDO_FIELDS = [
  "date",
  "endDate",
  "startTime",
  "endTime",
  "placementTime",
  "dayOrder",
  "isAllDay",
  "type",
] as const;

export type UndoField = (typeof UNDO_FIELDS)[number];
export type UndoSnapshot = Map<string, Pick<TravelObject, UndoField>>;

export const UNDO_LIMIT = 20;

/** An undoable change: either restored field values, or items to recreate after a delete. */
export type UndoEntry = {
  label: string;
  /** Field values of the affected items captured before the change. */
  before: UndoSnapshot;
  /** Items removed by the change; undo recreates them (with new ids). */
  deleted?: TravelObject[];
  /** The item a reorder moved; undo puts it back through the reorder API instead of patching every sibling. */
  movedId?: string;
};

/** Capture the undoable fields of the given items. */
export function snapshotItems(items: readonly TravelObject[]): UndoSnapshot {
  const snapshot: UndoSnapshot = new Map();
  for (const item of items) {
    const fields = {} as Pick<TravelObject, UndoField>;
    for (const field of UNDO_FIELDS) (fields as Record<UndoField, unknown>)[field] = item[field];
    snapshot.set(item.id, fields);
  }
  return snapshot;
}

/** Patches that bring current items back to the snapshot, skipping items that are gone or unchanged. */
export function restorePatches(
  snapshot: UndoSnapshot,
  current: readonly TravelObject[],
): { id: string; patch: UpdateTravelObjectInput }[] {
  const patches: { id: string; patch: UpdateTravelObjectInput }[] = [];
  for (const item of current) {
    const saved = snapshot.get(item.id);
    if (!saved) continue;
    const patch: Record<string, unknown> = {};
    for (const field of UNDO_FIELDS) if (item[field] !== saved[field]) patch[field] = saved[field];
    if (Object.keys(patch).length) patches.push({ id: item.id, patch: patch as UpdateTravelObjectInput });
  }
  return patches;
}

/** True when an entry has nothing to restore. */
export function isNoopEntry(entry: UndoEntry, current: readonly TravelObject[]) {
  return !entry.deleted?.length && restorePatches(entry.before, current).length === 0;
}

/** Push onto a bounded stack, dropping the oldest entries. */
export function pushBounded<T>(stack: readonly T[], entry: T, limit = UNDO_LIMIT): T[] {
  return [...stack, entry].slice(-limit);
}

/**
 * Reorder request that puts a moved item back at its snapshot position, or null when it had no day position.
 * The reorder API removes the item before inserting it, so a later slot on the same day is one higher.
 */
export function reorderRestoreRequest(
  saved: Pick<TravelObject, "date" | "dayOrder" | "isAllDay">,
  current: Pick<TravelObject, "date" | "dayOrder">,
): { date: string; dayOrder: number } | null {
  if (!saved.date || saved.dayOrder === null || saved.isAllDay) return null;
  const date = saved.date.slice(0, 10);
  const sameDay = current.date?.slice(0, 10) === date && current.dayOrder !== null;
  return { date, dayOrder: sameDay && current.dayOrder! < saved.dayOrder ? saved.dayOrder + 1 : saved.dayOrder };
}
