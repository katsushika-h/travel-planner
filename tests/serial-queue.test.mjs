import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "../lib/serial-queue.ts";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("serial queue never overlaps tasks and keeps call order", async () => {
  const enqueue = createSerialQueue();
  const events = [];
  let running = 0;
  let maxRunning = 0;
  const task = (name, ms) => async () => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    events.push(`start ${name}`);
    await delay(ms);
    events.push(`end ${name}`);
    running -= 1;
    return name;
  };
  const results = await Promise.all([enqueue(task("a", 15)), enqueue(task("b", 1)), enqueue(task("c", 5))]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.equal(maxRunning, 1);
  assert.deepEqual(events, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("serial queue continues after a rejected task and still reports it", async () => {
  const enqueue = createSerialQueue();
  const failing = enqueue(async () => {
    throw new Error("boom");
  });
  const next = enqueue(async () => "ok");
  await assert.rejects(failing, /boom/);
  assert.equal(await next, "ok");
});
