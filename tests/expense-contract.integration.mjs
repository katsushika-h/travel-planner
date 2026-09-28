import assert from "node:assert/strict";

const baseUrl = process.env.API_BASE_URL;
if (!baseUrl) throw new Error("Set API_BASE_URL to a running isolated Travel Planner server.");

async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const tripIds = [];
try {
  const makeTrip = async (title) => {
    const response = await request("/api/trips", "POST", { title, startDate: "2026-10-01", endDate: "2026-10-05", timezone: "Asia/Singapore", defaultCurrency: "SGD" });
    assert.equal(response.status, 201);
    tripIds.push(response.body.id);
    return response.body.id;
  };
  const firstTrip = await makeTrip("Expense fixture A");
  const secondTrip = await makeTrip("Expense fixture B");
  const firstPath = `/api/trips/${firstTrip}/expenses`;
  const secondPath = `/api/trips/${secondTrip}/expenses`;
  assert.deepEqual(await request(firstPath), { status: 200, body: [] });

  const item = await request("/api/travel-objects", "POST", { tripId: firstTrip, title: "Museum", type: "activity", date: null, isAllDay: false, location: null, cost: { amount: 25, currency: "SGD" }, notes: null, tags: [] });
  const otherItem = await request("/api/travel-objects", "POST", { tripId: secondTrip, title: "Other trip", type: "activity", date: null, isAllDay: false, location: null, cost: null, notes: null, tags: [] });
  assert.equal(item.status, 201);
  assert.equal(otherItem.status, 201);

  const input = { description: "Advance tickets", date: "2026-09-20", amount: "12.345", currency: "SGD", category: "activities", notes: "Bought before departure", travelObjectId: item.body.id };
  const created = await request(firstPath, "POST", input);
  assert.equal(created.status, 201);
  assert.equal(created.body.amount, "12.345");
  assert.equal(created.body.date, "2026-09-20");
  assert.equal(created.body.travelObjectId, item.body.id);
  assert.equal((await request(firstPath)).body.length, 1);
  assert.deepEqual(await request(secondPath), { status: 200, body: [] });
  assert.equal((await request(`/api/expenses/${created.body.id}`)).body.tripId, firstTrip);

  for (const amount of [0.1, "0", "1.2345", "10000000000"]) {
    const invalid = await request(firstPath, "POST", { ...input, amount });
    assert.equal(invalid.status, 400);
  }
  assert.equal((await request(firstPath, "POST", { ...input, date: "2026-02-30" })).status, 400);
  assert.deepEqual(await request(firstPath, "POST", { ...input, travelObjectId: otherItem.body.id }), { status: 400, body: { error: "Linked item must belong to this trip." } });
  assert.deepEqual(await request(`/api/expenses/${created.body.id}`, "PATCH", { travelObjectId: otherItem.body.id }), { status: 400, body: { error: "Linked item must belong to this trip." } });

  const updated = await request(`/api/expenses/${created.body.id}`, "PATCH", { amount: "0.1", category: "transport", notes: null });
  assert.equal(updated.status, 200);
  assert.deepEqual([updated.body.amount, updated.body.category, updated.body.notes], ["0.100", "transport", null]);
  assert.equal((await request(`/api/travel-objects/${item.body.id}`, "DELETE")).status, 204);
  assert.equal((await request(`/api/expenses/${created.body.id}`)).body.travelObjectId, null);
  assert.equal((await request(`/api/expenses/${created.body.id}`, "DELETE")).status, 204);
  assert.equal((await request(`/api/expenses/${created.body.id}`)).status, 404);

  const secondExpense = await request(secondPath, "POST", { ...input, travelObjectId: null });
  assert.equal(secondExpense.status, 201);
  assert.equal((await request(`/api/trips/${secondTrip}`, "DELETE")).status, 204);
  tripIds.splice(tripIds.indexOf(secondTrip), 1);
  assert.equal((await request(`/api/expenses/${secondExpense.body.id}`)).status, 404);
  assert.equal((await request(secondPath)).status, 404);
} finally {
  for (const tripId of tripIds) await request(`/api/trips/${tripId}`, "DELETE");
}
