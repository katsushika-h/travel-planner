const defaultColors: Record<string, string> = {
  unclassified: "#64748b",
  flight: "#0ea5e9",
  hotel: "#8b5cf6",
  food: "#f97316",
  commute: "#f59e0b",
  activity: "#10b981",
  sightseeing: "#f43f5e",
};
const palette = ["#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#64748b"];

export function defaultTypeColor(type: string) {
  return defaultColors[type] ?? palette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length];
}

export function typeColor(type: string, colors: Record<string, string>) {
  return colors[type] ?? defaultTypeColor(type);
}
