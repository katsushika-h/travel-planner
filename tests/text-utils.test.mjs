import assert from "node:assert/strict";
import test from "node:test";
import { markdownToPlainText, truncateUtf8 } from "../lib/text-utils.ts";

test("UTF-8 note limits keep complete Unicode characters", () => {
  assert.equal(truncateUtf8("ab😀c", 5), "ab");
  assert.equal(truncateUtf8("ab😀c", 6), "ab😀");
  assert.equal(truncateUtf8("ab😀c", 7), "ab😀c");
  assert.equal(truncateUtf8("é😀", 5), "é");
});

test("plain-text notes decode numeric character references from the editor", () => {
  assert.equal(markdownToPlainText("Testing testing&#x20;\n**Bring** cash&#33;"), "Testing testing\nBring cash!");
  assert.equal(markdownToPlainText("&#x110000; stays"), "&#x110000; stays");
});
