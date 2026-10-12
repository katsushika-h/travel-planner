import assert from "node:assert/strict";
import test from "node:test";
import { attachmentContentType, attachmentExtension } from "../lib/attachment-types.ts";

test("attachment types come from the allowed extension, not the upload", () => {
  assert.equal(attachmentContentType("Boarding Pass.PDF"), "application/pdf");
  assert.equal(attachmentContentType("receipt.jpeg"), "image/jpeg");
  assert.equal(attachmentContentType("notes.txt"), "text/plain; charset=utf-8");
});

test("unsupported or scriptable names never receive a renderable type", () => {
  for (const name of ["page.html", "image.svg", "noextension", "toString", "x.constructor"]) {
    assert.equal(attachmentExtension(name), null);
    assert.equal(attachmentContentType(name), "application/octet-stream");
  }
});
