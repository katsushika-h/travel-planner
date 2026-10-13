const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return { year, month: monthNames[month - 1] ?? "", day };
}

/** Compact trip date range for headers and menus, e.g. "Apr 3 – 10", "Apr 28 – May 3", "Dec 29, 2026 – Jan 2, 2027". */
export function formatTripDateRange(startDate: string, endDate: string) {
  const start = parts(startDate);
  const end = parts(endDate);
  if (start.year !== end.year)
    return `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
  if (start.month !== end.month) return `${start.month} ${start.day} – ${end.month} ${end.day}`;
  if (start.day !== end.day) return `${start.month} ${start.day} – ${end.day}`;
  return `${start.month} ${start.day}`;
}
