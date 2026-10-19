/** The day each trip was last viewed in Plan or the Calendar Day view, so switching between them keeps the place. */
const workingDays = new Map<string, string>();

export function workingDay(tripId: string) {
  return workingDays.get(tripId);
}

export function setWorkingDay(tripId: string, date: string) {
  workingDays.set(tripId, date);
}
