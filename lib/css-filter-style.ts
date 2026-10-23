/**
 * Applies a CSS `filter` (the `--map-tile-filter` theme token) to the colours of a MapLibre style, using the Filter
 * Effects formulas, so a vector map gets the dark palette of a filtered raster map while the canvas stays unfiltered
 * and 3D buildings keep normal lighting (lit roofs, walls darkening toward the base).
 */

type Rgba = [r: number, g: number, b: number, a: number];
type Operation = { name: string; amount: number };
type StyleLayer = { type: string; paint?: Record<string, unknown> };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Parses #rgb, #rrggbb, rgb(a) and hsl(a) colours to 0–1 RGBA; anything else returns null. */
export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
    return [r, g, b, 1];
  }
  const call = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!call) return null;
  const parts = call[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const numbers = parts.map((part) => parseFloat(part));
  if (numbers.some((number) => Number.isNaN(number))) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? numbers[3] / 100 : numbers[3];
  if (call[1].startsWith("rgb")) return [numbers[0] / 255, numbers[1] / 255, numbers[2] / 255, alpha];
  return [...hslToRgb(numbers[0], numbers[1] / 100, numbers[2] / 100), alpha];
}

function angle(value: string) {
  const number = parseFloat(value);
  if (value.endsWith("turn")) return number * 360;
  if (value.endsWith("rad")) return (number * 180) / Math.PI;
  return number;
}

/** Parses a CSS filter list such as `invert(1) hue-rotate(180deg) brightness(0.88)`; `none` gives no operations. */
export function parseFilter(filter: string): Operation[] {
  return [...filter.matchAll(/([a-z-]+)\(\s*([^)]*?)\s*\)/g)].map(([, name, value]) => ({
    name,
    amount: name === "hue-rotate" ? angle(value) : value.endsWith("%") ? parseFloat(value) / 100 : parseFloat(value),
  }));
}

function multiply(matrix: number[][], [r, g, b]: number[]) {
  return matrix.map(([x, y, z]) => x * r + y * g + z * b);
}

function apply([r, g, b]: number[], { name, amount }: Operation): number[] {
  switch (name) {
    case "invert":
      return [r, g, b].map((c) => amount * (1 - c) + (1 - amount) * c);
    case "brightness":
      return [r, g, b].map((c) => c * amount);
    case "contrast":
      return [r, g, b].map((c) => (c - 0.5) * amount + 0.5);
    case "saturate": {
      const s = amount;
      return multiply(
        [
          [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
          [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
          [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
        ],
        [r, g, b],
      );
    }
    case "hue-rotate": {
      const cos = Math.cos((amount * Math.PI) / 180);
      const sin = Math.sin((amount * Math.PI) / 180);
      return multiply(
        [
          [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928],
          [0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283],
          [0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072],
        ],
        [r, g, b],
      );
    }
    default:
      return [r, g, b];
  }
}

/** Runs one colour through the filter list, clamping after each step as browsers do. */
export function filterColor(color: string, operations: Operation[]): string | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const rgb = operations.reduce((current, operation) => apply(current, operation).map(clamp), parsed.slice(0, 3));
  const [r, g, b] = rgb.map((c) => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${Number(parsed[3].toFixed(3))})`;
}

function recolour(value: unknown, operations: Operation[]): unknown {
  if (typeof value === "string") return filterColor(value, operations) ?? value;
  if (Array.isArray(value)) return value.map((entry) => recolour(entry, operations));
  return value;
}

/** Raster paint that approximates the same filter on raster layers (the shaded-relief layer). */
function rasterPaint(operations: Operation[]) {
  const paint: Record<string, number> = { "raster-brightness-min": 0, "raster-brightness-max": 1 };
  for (const { name, amount } of operations) {
    if (name === "invert" && amount >= 0.5)
      [paint["raster-brightness-min"], paint["raster-brightness-max"]] = [
        paint["raster-brightness-max"],
        paint["raster-brightness-min"],
      ];
    if (name === "brightness") {
      paint["raster-brightness-min"] *= amount;
      paint["raster-brightness-max"] *= amount;
    }
    if (name === "hue-rotate") paint["raster-hue-rotate"] = amount;
    if (name === "saturate") paint["raster-saturation"] = Math.max(-1, Math.min(1, amount - 1));
    if (name === "contrast") paint["raster-contrast"] = Math.max(-1, Math.min(1, amount - 1));
  }
  return paint;
}

/** Returns a copy of the style with every paint colour run through the CSS filter; `none` returns it unchanged. */
export function filterStyle<T extends { layers: StyleLayer[] }>(style: T, filter: string): T {
  const operations = parseFilter(filter);
  if (!operations.length) return style;
  const filtered = structuredClone(style);
  for (const layer of filtered.layers) {
    if (layer.type === "raster") {
      layer.paint = { ...layer.paint, ...rasterPaint(operations) };
      continue;
    }
    if (!layer.paint) continue;
    for (const [property, value] of Object.entries(layer.paint))
      if (property.endsWith("color")) layer.paint[property] = recolour(value, operations);
    // Pattern fills are sprite images that cannot be recoloured, so they are faded instead.
    if ("fill-pattern" in layer.paint) layer.paint["fill-opacity"] = 0.15;
  }
  return filtered;
}
