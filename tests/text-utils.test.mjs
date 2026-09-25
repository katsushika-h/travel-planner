import assert from "node:assert/strict";
import test from "node:test";
import { truncateUtf8 } from "../lib/text-utils.ts";

test("UTF-8 note limits keep complete Unicode characters", () => {
  assert.equal(truncateUtf8("ab😀c", 5), "ab");
  assert.equal(truncateUtf8("ab😀c", 6), "ab😀");
  assert.equal(truncateUtf8("ab😀c", 7), "ab😀c");
  assert.equal(truncateUtf8("é😀", 5), "é");
});
