import assert from "node:assert/strict";
import test from "node:test";
import { ORIGINAL, PATCHED, patchShaderSource } from "../scripts/patch-maplibre-shader.mjs";

const shader = (expression) => `if (normal.z==0.0) {directional*=((1.0-u_vertical_gradient)+(${expression}));}`;

test("replaces every copy of MapLibre's wall gradient with 1 − 0.25 × (1 − t)", () => {
  const result = patchShaderSource(`${shader(ORIGINAL)} … ${shader(ORIGINAL)}`);
  assert.equal(result.replaced, 2);
  assert.equal(result.source, `${shader(PATCHED)} … ${shader(PATCHED)}`);
});

test("is idempotent", () => {
  const once = patchShaderSource(shader(ORIGINAL)).source;
  const twice = patchShaderSource(once);
  assert.equal(twice.replaced, 0);
  assert.equal(twice.alreadyPatched, 1);
  assert.equal(twice.source, once);
});

test("reports a source without the expression, so the install can fail", () => {
  const result = patchShaderSource("void main() {}");
  assert.deepEqual([result.replaced, result.alreadyPatched], [0, 0]);
});

test("the patched shader is darker at the base (t = 0) by 25% and unchanged at the top (t = 1)", () => {
  const factor = new Function("t", `return ${PATCHED.replace("u_vertical_gradient*", "")};`);
  assert.equal(factor(0), 0.75);
  assert.equal(factor(0.5), 0.875);
  assert.equal(factor(1), 1);
});
