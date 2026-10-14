const test = require("node:test"),
  assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url"),
  { resolve } = require("node:path");
global.matchMedia = () => ({ matches: false });
async function replay() {
  const { Replay } = await import(
    pathToFileURL(resolve("src/main/resources/static/replay.js")).href
  );
  return new Replay({});
}
function event(id, stage, extra = {}) {
  return {
    id,
    stage,
    messageId: "M1",
    partitionKey: "t1:0",
    source: "producer:p1",
    destination: "replica:t1:0:b1",
    groupId: "",
    generation: 1,
    ...extra,
  };
}
test("visual stages depend on real production, replica and delivery events", async () => {
  const r = await replay();
  r.enqueue(event(1, "PRODUCED"));
  r.enqueue(event(2, "REPLICATED"));
  r.enqueue(event(3, "ACKNOWLEDGED"));
  r.enqueue(event(4, "DELIVERED", { groupId: "results-group" }));
  r.enqueue(event(5, "PROCESSED", { groupId: "results-group" }));
  r.enqueue(event(6, "COMMITTED", { messageId: "", groupId: "results-group" }));
  assert.deepEqual(
    r.queue.map((j) => j.dependencies),
    [[], [1], [1, 2], [3], [4], [5]],
  );
});
test("rebalance cancels only stale jobs from its own group", async () => {
  const r = await replay();
  r.enqueue(event(1, "DELIVERED", { groupId: "results-group" }));
  r.enqueue(event(2, "DELIVERED", { groupId: "reports-group" }));
  r.enqueue(event(3, "REBALANCE", { groupId: "results-group", generation: 2 }));
  assert.deepEqual(
    r.queue.map((j) => j.event.groupId),
    ["reports-group"],
  );
  assert(r.done.has(1));
});
test("history pruning keeps pending dependencies while bounding obsolete completion metadata", async () => {
  const r = await replay();
  for (let id = 1; id <= 10000; id++) r.done.add(id);
  r.queue = [{ dependencies: [17] }];
  r.pipelines.set("M1", {
    produced: 40,
    ack: 45,
    replicas: [42],
    deliveries: new Map([["group", 47]]),
  });
  r.completed.set("group|t1:0", 100);
  r.pruneCompleted();
  assert.deepEqual([...r.done], [17, 40, 42, 45, 47, 100]);
});
test("blocked event queues are capped and removed traffic is explicitly counted", async () => {
  const r = await replay();
  for (let id = 1; id <= 1000; id++)
    r.enqueue(
      event(id, "PRODUCED", {
        messageId: "M" + id,
        destination: "replica:t1:" + id + ":b1",
        partitionKey: "t1:" + id,
      }),
    );
  assert.equal(r.queue.length, 250);
  assert.equal(r.summarized, 750);
});
