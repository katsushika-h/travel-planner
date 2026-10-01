import { sortDayDisplayItems } from "./schedule-order.ts";
import type { TravelObject } from "../types/travel.ts";

export function isNote(item: { kind?: string }) { return item.kind === "note"; }
export function eventItems<T extends { kind?: string }>(items: readonly T[]): T[] { return items.filter((item) => !isNote(item)); }
/** Week drop IDs refer to the full Day sequence, including notes hidden from Week. */
export function weekDropPositions(items: readonly TravelObject[], date: string): Map<string, number> {
  return new Map(sortDayDisplayItems(items.filter((item) => item.date?.slice(0, 10) === date)).map((item, index) => [item.id, index]));
}
