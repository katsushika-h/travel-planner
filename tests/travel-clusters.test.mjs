import assert from "node:assert/strict";
import test from "node:test";
import { CLUSTER_WALK_METERS, clusterDay, planDay } from "../lib/travel-clusters.ts";

const ok = (fromId, toId, meters) => ({ fromId, toId, status: "ok", meters, seconds: meters / 1.3, walkable: true });
const gap = (fromId, toId, status) => ({ fromId, toId, status });
const stop = (id) => ({ kind: "stop", id });
const park = (id) => ({ kind: "parking", id });
const seg = (mode, from, to, role) => ({ mode, from, to, role });

test("clusterDay: all walkable is one cluster", () => {
  assert.deepEqual(clusterDay([ok("A", "B", 500), ok("B", "C", 800)]), [["A", "B", "C"]]);
});

test("clusterDay: all far is one cluster per stop", () => {
  assert.deepEqual(clusterDay([ok("A", "B", 5000), ok("B", "C", 9000)]), [["A"], ["B"], ["C"]]);
});

test("clusterDay: boundary and gaps", () => {
  assert.deepEqual(clusterDay([ok("A", "B", 2000)]), [["A", "B"]]);
  assert.deepEqual(clusterDay([ok("A", "B", 2000.01)]), [["A"], ["B"]]);
  assert.deepEqual(
    clusterDay([ok("A", "B", 100), gap("B", "C", "unmapped"), ok("C", "D", 100), gap("D", "E", "transfer")]),
    [["A", "B"], ["C", "D"], ["E"]],
  );
  assert.deepEqual(clusterDay([ok("A", "B", 3000)], { walkMeters: 3000 }), [["A", "B"]]);
  assert.deepEqual(clusterDay([]), []);
  assert.equal(CLUSTER_WALK_METERS, 2000);
});

test("planDay: empty legs", () => {
  assert.deepEqual(planDay([], "drive"), []);
  assert.deepEqual(planDay([], "walk"), []);
});

test("planDay drive: all walkable walks with no car movement", () => {
  const plan = planDay([ok("A", "B", 500), ok("B", "C", 800)], "drive");
  assert.deepEqual(
    plan.map((p) => p.mode),
    ["walk", "walk"],
  );
  assert.deepEqual(plan[1].segments, [seg("walk", stop("B"), stop("C"), "leg")]);
});

test("planDay drive: all far drives, no to-car segments", () => {
  const plan = planDay([ok("A", "B", 5000), ok("B", "C", 9000)], "drive");
  assert.deepEqual(
    plan.map((p) => p.mode),
    ["drive", "drive"],
  );
  assert.deepEqual(plan[0].segments, [seg("drive", stop("A"), stop("B"), "leg")]);
  assert.deepEqual(plan[1].segments, [seg("drive", stop("B"), stop("C"), "leg")]);
});

test("planDay drive: mixed day walks back to the car before driving", () => {
  const plan = planDay([ok("A", "B", 500), ok("B", "C", 500), ok("C", "D", 9000)], "drive");
  assert.deepEqual(
    plan.map((p) => p.mode),
    ["walk", "walk", "drive"],
  );
  assert.deepEqual(plan[2].segments, [
    seg("walk", stop("C"), stop("A"), "to-car"),
    seg("drive", stop("A"), stop("D"), "leg"),
  ]);
});

test("planDay drive: parking at A and D", () => {
  const plan = planDay([ok("A", "B", 500), ok("B", "D", 9000)], "drive", { parkingStopIds: new Set(["A", "D"]) });
  assert.deepEqual(plan[1].segments, [
    seg("walk", stop("B"), park("A"), "to-car"),
    seg("drive", park("A"), park("D"), "leg"),
    seg("walk", park("D"), stop("D"), "from-parking"),
  ]);
  const direct = planDay([ok("A", "D", 9000)], "drive", { parkingStopIds: new Set(["A", "D"]) });
  assert.deepEqual(direct[0].segments, [
    seg("walk", stop("A"), park("A"), "to-car"),
    seg("drive", park("A"), park("D"), "leg"),
    seg("walk", park("D"), stop("D"), "from-parking"),
  ]);
});

test("planDay drive: overrides", () => {
  const forced = planDay([ok("A", "B", 500), ok("B", "C", 500)], "drive", { overrides: { "B>C": "drive" } });
  assert.deepEqual(forced[1].mode, "drive");
  assert.deepEqual(forced[1].segments, [
    seg("walk", stop("B"), stop("A"), "to-car"),
    seg("drive", stop("A"), stop("C"), "leg"),
  ]);
  const walked = planDay([ok("A", "B", 9000), ok("B", "C", 9000)], "drive", { overrides: { "A>B": "walk" } });
  assert.deepEqual(walked[0].mode, "walk");
  assert.deepEqual(walked[1].segments, [
    seg("walk", stop("B"), stop("A"), "to-car"),
    seg("drive", stop("A"), stop("C"), "leg"),
  ]);
});

test("planDay drive: unmapped and transfer legs reset the car", () => {
  for (const status of ["unmapped", "transfer"]) {
    const plan = planDay([ok("A", "B", 500), gap("B", "C", status), ok("C", "D", 9000)], "drive");
    assert.equal(plan[1].mode, null);
    assert.deepEqual(plan[1].segments, []);
    assert.equal(plan[1].status, status);
    assert.deepEqual(plan[2].segments, [seg("drive", stop("C"), stop("D"), "leg")]);
  }
  const parked = planDay([gap("A", "B", "transfer"), ok("B", "C", 9000)], "drive", { parkingStopIds: new Set(["B"]) });
  assert.deepEqual(parked[1].segments, [
    seg("walk", stop("B"), park("B"), "to-car"),
    seg("drive", park("B"), stop("C"), "leg"),
  ]);
});

test("planDay walk mode ignores overrides and has no car", () => {
  const plan = planDay([ok("A", "B", 9000), gap("B", "C", "unmapped")], "walk", {
    overrides: { "A>B": "drive" },
    parkingStopIds: new Set(["A", "B"]),
  });
  assert.deepEqual(plan[0].mode, "walk");
  assert.deepEqual(plan[0].segments, [seg("walk", stop("A"), stop("B"), "leg")]);
  assert.equal(plan[1].mode, null);
});
