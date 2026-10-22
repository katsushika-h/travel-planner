// Patches MapLibre's fill-extrusion shader so building walls shade by ambient occlusion relative to their own height:
// with the base at t = 0 and the top at t = 1, the wall colour is × (1 − 0.25 × (1 − t)), a smooth gradient from 25%
// darker at the ground to the original at the roof. MapLibre's own vertical gradient is fixed to a 150 m reference
// height and cannot be configured. Runs on postinstall (also in the Docker dependencies stage); it is idempotent and
// fails the install if a MapLibre upgrade changes the expression, so the patch is never silently lost.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const ORIGINAL =
  "u_vertical_gradient*clamp((t+gradient_base)*pow(gradient_height/150.0,0.5),mix(0.7,0.98,1.0-u_lightintensity),1.0)";
export const PATCHED = "u_vertical_gradient*(1.0-0.25*(1.0-t))";

/** Returns the patched source and how many expressions were replaced or already patched. */
export function patchShaderSource(source) {
  const replaced = source.split(ORIGINAL).length - 1;
  return {
    source: replaced ? source.replaceAll(ORIGINAL, PATCHED) : source,
    replaced,
    alreadyPatched: source.split(PATCHED).length - 1,
  };
}

function main() {
  const require = createRequire(import.meta.url);
  const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
  for (const file of ["maplibre-gl.mjs", "maplibre-gl-dev.mjs"]) {
    const path = join(dist, file);
    const { source, replaced, alreadyPatched } = patchShaderSource(readFileSync(path, "utf8"));
    if (!replaced && !alreadyPatched)
      throw new Error(
        `maplibre-gl ${file}: extrusion gradient expression not found; update scripts/patch-maplibre-shader.mjs`,
      );
    if (replaced) writeFileSync(path, source);
    console.log(`maplibre-gl ${file}: ${replaced} patched, ${alreadyPatched} already patched`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
