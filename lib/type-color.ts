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
  return (
    defaultColors[type] ??
    palette[[...type].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length]
  );
}

export function typeColor(type: string, colors: Record<string, string>) {
  return colors[type] ?? defaultTypeColor(type);
}

const themeBackgrounds = { light: "#ffffff", dark: "#0e0e0e" } as const;
const minimumTextContrast = 4.5;

function parseHex(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function toHex(channels: [number, number, number]) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio between two hex colours, or 1 when either cannot be parsed. */
export function contrastRatio(first: string, second: string) {
  const a = parseHex(first);
  const b = parseHex(second);
  if (!a || !b) return 1;
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A readable heading-text shade of a type colour: darker on the light theme, lighter on the dark theme,
 * mixed until it reaches 4.5:1 against the theme background. Unparseable colours are returned unchanged.
 */
export function typeTextColor(color: string, theme: "light" | "dark") {
  const channels = parseHex(color);
  if (!channels) return color;
  const background = themeBackgrounds[theme];
  const target = theme === "light" ? 0 : 255;
  // Start from a visible shift (roughly Tailwind 700 / 300 for 500-level colours), then deepen as needed.
  for (let amount = theme === "light" ? 0.22 : 0.4; amount <= 1; amount += 0.02) {
    const mixed = toHex(channels.map((channel) => channel + (target - channel) * amount) as [number, number, number]);
    if (contrastRatio(mixed, background) >= minimumTextContrast) return mixed;
  }
  return theme === "light" ? "#000000" : "#FFFFFF";
}
