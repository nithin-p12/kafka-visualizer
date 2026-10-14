const test = require("node:test"),
  assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url"),
  { resolve } = require("node:path");
global.matchMedia = () => ({ matches: false });
global.document = {
  getElementById: () => ({ textContent: "" }),
  body: { classList: { toggle() {} } },
};
const load = (name) =>
  import(
    pathToFileURL(resolve("src/main/resources/static/" + name + ".js")).href
  );
function event(id, stage, n = 1, groupId = "g", consumer = "c1") {
  const message = {
    id: "M" + n,
    offset: n - 1,
    key: "customer",
    payload: "record " + n,
    producerId: "p1",
    tick: n,
  };
  const replica = "replica:t1:0:b1";
  const source =
    stage === "PRODUCED"
      ? "producer:p1"
      : stage === "REPLICATED" ||
          stage === "DELIVERED" ||
          stage === "ACKNOWLEDGED"
        ? replica
        : "consumer:" + consumer;
  const destination =
    stage === "PRODUCED"
      ? replica
      : stage === "REPLICATED"
        ? "replica:t1:0:b2"
        : stage === "ACKNOWLEDGED"
          ? "producer:p1"
          : stage === "DELIVERED"
            ? "consumer:" + consumer
            : stage === "COMMITTED"
              ? "offset-store"
              : stage === "PROCESSED"
                ? "complete:" + consumer
                : source;
  return {
    id,
    stage,
    messageId: stage === "COMMITTED" ? "" : message.id,
    message: stage === "COMMITTED" ? null : message,
    partitionKey: "t1:0",
    source,
    destination,
    groupId: ["PRODUCED", "REPLICATED", "ACKNOWLEDGED"].includes(stage)
      ? ""
      : groupId,
    generation: 1,
    committedNext: n,
    offset: n - 1,
  };
}
function fixture(n = 0) {
  const messages = Array.from(
    { length: Math.min(n, 8) },
    (_, i) => event(0, "PRODUCED", n - Math.min(n, 8) + i + 1).message,
  );
  const replicas = (b) => [
    {
      nodeId: "replica:t1:0:" + b,
      key: "t1:0",
      topicId: "t1",
      topicName: "Topic",
      partition: 0,
      leader: b === "b1",
      leaderId: "b1",
      replicaEnd: n,
      logEnd: n,
      replicaStart: Math.max(0, n - 50),
      messages,
    },
  ];
  return {
    epoch: 1,
    tick: n,
    configuration: {
      producers: [
        { id: "p1", name: "Service", topicId: "t1", automatic: false },
      ],
      topics: [{ id: "t1", name: "Topic" }],
    },
    producerQueues: [
      {
        producerId: "p1",
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: "M" + (n + i + 1),
          key: "",
          payload: "template",
        })),
      },
    ],
    brokers: [
      { id: "b1", replicas: replicas("b1") },
      { id: "b2", replicas: replicas("b2") },
    ],
    groups: ["g", "reports"].map((id, i) => ({
      id,
      generation: 1,
      rebalancing: false,
      consumers: [
        {
          id: "c" + (i + 1),
          groupId: id,
          topicIds: ["t1"],
          online: true,
          paused: false,
          assignments: ["t1:0"],
          processing: null,
          successes: n,
          retries: 0,
          redeliveries: 0,
        },
      ],
      offsets: [
        {
          key: "t1:0",
          ownerId: "c" + (i + 1),
          logEnd: n,
          committedNext: n || null,
          fetchedNext: n,
          completedNext: n,
        },
      ],
    })),
  };
}
async function replay(callbacks = {}) {
  const { Replay } = await load("replay");
  const nodes = new Map(
    [
      "producer:p1",
      "replica:t1:0:b1",
      "replica:t1:0:b2",
      "consumer:c1",
      "consumer:c2",
      "complete:c1",
      "complete:c2",
      "offset-store",
    ].map((id) => [id, {}]),
  );
  const diagram = {
    view: { replication: true, commits: true },
    layout: { nodes },
    route() {
      return {
        points: [
          [0, 0],
          [200, 0],
        ],
        d: "M0 0L200 0",
        point: (p) => ({ x: 200 * p, y: 0 }),
      };
    },
    showPath(j) {
      j.pathElement = { isConnected: true, setAttribute() {}, remove() {} };
    },
  };
  const r = new Replay(diagram, callbacks);
  r.makePacket = () => ({ setAttribute() {}, remove() {}, style: {} });
  return r;
}
function drain(r, now = 0) {
  let frames = 0;
  while (!r.idle && frames++ < 30000) r.frame((now += 100), true);
  assert(r.idle, "All stages must settle without a deadlock");
  return now;
}
test("actual stages preserve production, replication, arrival, failure/retry and commit dependencies", async () => {
  const r = await replay();
  [
    "PRODUCED",
    "REPLICATED",
    "ACKNOWLEDGED",
    "DELIVERED",
    "PROCESSING",
    "FAILED",
    "RETRY",
    "PROCESSED",
    "COMMITTED",
  ].forEach((s, i) => r.enqueue(event(i + 1, s)));
  assert.deepEqual(
    r.queue.map((j) => j.dependencies),
    [[], [1], [1, 2], [3], [4], [5], [6], [7], [8]],
  );
  drain(r);
  assert.equal(r.finished, 9);
});
test("no bundling or eviction after 20, 60, 250 or 1000 messages", async () => {
  const ids = [],
    r = await replay({ finish: (e) => ids.push(e.messageId) });
  for (let i = 1; i <= 1000; i++) r.enqueue(event(i, "PRODUCED", i));
  assert.equal(r.queue.length, 1000);
  assert(r.queue.every((j) => j.ids.length === 1));
  drain(r);
  assert.deepEqual(
    ids,
    Array.from({ length: 1000 }, (_, i) => "M" + (i + 1)),
  );
});
test("300 messages reach both consumers only after their own visible arrival and commit only after processing", async () => {
  const { Presentation } = await load("presentation"),
    p = new Presentation();
  p.sync(fixture(), true);
  let starts = 0,
    now = 0;
  const r = await replay({
    start: (e) => {
      const s = p.snapshot();
      if (e.stage === "PRODUCED") {
        assert(
          !s.brokers[0].replicas[0].messages.some((m) => m.id === e.messageId),
        );
        starts++;
      }
      if (e.stage === "DELIVERED") {
        assert(
          s.brokers.every((b) =>
            b.replicas[0].messages.some((m) => m.id === e.messageId),
          ),
        );
        assert(
          !s.groups.find((g) => g.id === e.groupId).consumers[0].processing,
        );
      }
      if (e.stage === "PROCESSED")
        assert.equal(
          s.groups.find((g) => g.id === e.groupId).consumers[0].processing
            .message.id,
          e.messageId,
        );
      if (e.stage === "COMMITTED")
        assert.equal(
          s.groups.find((g) => g.id === e.groupId).consumers[0].successes,
          e.committedNext,
        );
      p.start(e);
    },
    finish: (e) => p.finish(e),
  });
  let id = 0;
  for (let n = 1; n <= 300; n++) {
    p.sync(fixture(n));
    const events = ["PRODUCED", "REPLICATED", "ACKNOWLEDGED"].map((stage) =>
      event(++id, stage, n),
    );
    for (const [g, c] of [
      ["g", "c1"],
      ["reports", "c2"],
    ])
      for (const stage of ["DELIVERED", "PROCESSING", "PROCESSED", "COMMITTED"])
        events.push(event(++id, stage, n, g, c));
    events.forEach((e) => {
      p.announce(e);
      r.enqueue(e);
    });
    assert.equal(p.snapshot().groups[0].consumers[0].successes, n - 1);
    assert.equal(
      p.snapshot().groups[0].offsets[0].committedNext,
      n === 1 ? null : n - 1,
    );
    assert.equal(p.snapshot().producerQueues[0].messages[0].id, "M" + n);
    now = drain(r, now);
    p.settle();
    const visible = p.snapshot();
    assert(
      visible.groups.every(
        (g) =>
          g.consumers[0].successes === n && g.offsets[0].committedNext === n,
      ),
    );
    assert.equal(visible.producerQueues[0].messages[0].id, "M" + (n + 1));
  }
  assert.equal(starts, 300);
  assert.equal(r.finished, 3300);
  assert.equal(p.histories.get("c1").length, 20);
});
test("rebalance cancels only obsolete ownership and retains independent group journeys", async () => {
  const r = await replay();
  r.enqueue(event(1, "DELIVERED"));
  r.enqueue(event(2, "DELIVERED", 1, "reports", "c2"));
  r.enqueue({ ...event(3, "REBALANCE"), generation: 2 });
  assert.deepEqual(
    r.queue.map((j) => j.event.groupId),
    ["reports"],
  );
  assert(r.done.has(1));
  assert.equal(r.obsolete, 1);
});
test("pause freezes packet positions; independent routes can run while crossings wait", async () => {
  const r = await replay();
  r.enqueue(event(1, "PRODUCED"));
  r.frame(100, true);
  const point = { ...r.active[0].point },
    clock = r.clock;
  r.frame(200, false);
  assert.deepEqual(r.active[0].point, point);
  assert.equal(r.clock, clock);
  assert(
    r.routesConflict(
      {
        points: [
          [0, 0],
          [100, 0],
        ],
      },
      {
        points: [
          [50, -50],
          [50, 50],
        ],
      },
    ),
  );
  assert(
    !r.routesConflict(
      {
        points: [
          [0, 0],
          [100, 0],
        ],
      },
      {
        points: [
          [0, 100],
          [100, 100],
        ],
      },
    ),
  );
});
test("metadata pruning preserves every live dependency", async () => {
  const r = await replay();
  for (let i = 1; i <= 10000; i++) r.done.add(i);
  r.queue = [{ dependencies: [17] }];
  r.pipelines.set("M1", {
    produced: 40,
    ack: 45,
    replicas: [42],
    deliveries: new Map([["g", 47]]),
  });
  r.completed.set("g|t1:0", 100);
  r.pruneCompleted();
  assert.deepEqual([...r.done], [17, 40, 42, 45, 47, 100]);
});
