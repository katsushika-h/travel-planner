import { readDate, readPlacementTime, readTime, type JsonRecord } from "./api-validation.ts";

/** Parse canonical PATCH fields, preserving partial-update semantics. */
export function readUpdateScheduleFields(body: JsonRecord) {
  const fields: {
    date?: Date | null;
    endDate?: Date | null;
    startTime?: string | null;
    endTime?: string | null;
    placementTime?: string | null;
  } = {};
  if (body.date !== undefined) fields.date = body.date === null ? null : readDate(body.date, "date", true);
  if (body.endDate !== undefined) fields.endDate = body.endDate === null ? null : readDate(body.endDate, "endDate", true);
  if (body.startTime !== undefined) fields.startTime = body.startTime === null ? null : readTime(body.startTime, "startTime");
  if (body.endTime !== undefined) fields.endTime = body.endTime === null ? null : readTime(body.endTime, "endTime");
  if (body.placementTime !== undefined) fields.placementTime = body.placementTime === null ? null : readPlacementTime(body.placementTime, "placementTime");
  return fields;
}

/** Preserve POST defaults and validation order while returning persisted fields. */
export function readCreateSchedule(body: JsonRecord) {
  const date = body.date === undefined || body.date === null ? null : readDate(body.date, "date", true);
  const endDate = date === null ? null : body.endDate === undefined || body.endDate === null ? date : readDate(body.endDate, "endDate", true);
  const startTime = body.startTime === undefined || body.startTime === null ? null : readTime(body.startTime, "startTime");
  const endTime = body.endTime === undefined || body.endTime === null ? null : readTime(body.endTime, "endTime");
  const placementTime = body.placementTime === undefined ? null : body.placementTime === null ? null : readPlacementTime(body.placementTime, "placementTime");
  const isAllDay = body.isAllDay === true;
  if (date === null && (endDate !== null || placementTime !== null || isAllDay)) throw new Error("Unscheduled items cannot have an end date, placement time, or be all-day.");
  if (date && endDate! < date) throw new Error("endDate must be on or after date.");
  if (isAllDay && (startTime || endTime)) throw new Error("All-day items cannot have times.");
  if (!isAllDay && (startTime === null) !== (endTime === null)) throw new Error("startTime and endTime must both be set or both be null.");
  if (placementTime && (isAllDay || startTime || endTime)) throw new Error("placementTime is only for flexible items without confirmed times.");
  if (!isAllDay && date && startTime && endTime && endDate!.getTime() === date.getTime() && endTime <= startTime) throw new Error("endTime must be after startTime on the same date.");
  return { date, endDate, startTime, endTime, placementTime, isAllDay };
}

/** Normalize the final PATCH schedule after canonical fields are applied. */
export function normalizeUpdatedScheduleData(data: Record<string, unknown>, existing: {
  date: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  placementTime: string | null;
  isAllDay: boolean;
}) {
  const isAllDay = (data.isAllDay as boolean | undefined) ?? existing.isAllDay;
  const date = data.date !== undefined ? data.date as Date | null : existing.date;
  const endDate = data.endDate !== undefined ? data.endDate as Date | null : existing.endDate;
  const startTime = data.startTime !== undefined ? data.startTime as string | null : existing.startTime;
  const endTime = data.endTime !== undefined ? data.endTime as string | null : existing.endTime;
  const placementTime = data.placementTime !== undefined ? data.placementTime as string | null : existing.placementTime;
  if (date === null) {
    data.date = null;
    data.endDate = null;
    data.placementTime = null;
    data.dayOrder = null;
    data.isAllDay = false;
    if ((startTime === null) !== (endTime === null)) {
      throw new Error("startTime and endTime must both be set or both be null.");
    }
  } else {
    const finalEndDate = endDate ?? date;
    if (finalEndDate < date) throw new Error("endDate must be on or after date.");
    data.endDate = finalEndDate;
    if (isAllDay) {
      if (startTime || endTime) throw new Error("All-day items cannot have times.");
      data.startTime = null;
      data.endTime = null;
      data.placementTime = null;
    } else if ((startTime === null) !== (endTime === null)) {
      throw new Error("startTime and endTime must both be set or both be null.");
    } else if (startTime && endTime && finalEndDate.getTime() === date.getTime() && endTime <= startTime) {
      throw new Error("endTime must be after startTime on the same date.");
    } else if (startTime && endTime) {
      if (data.placementTime !== undefined && placementTime) throw new Error("placementTime is only for flexible items without confirmed times.");
      data.placementTime = null;
    } else {
      data.placementTime = placementTime ?? "09:00";
    }
  }
  return data;
}
