const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");
const load = () =>
  import(
    pathToFileURL(resolve("src/main/resources/static/diagram-layout.js")).href
  );
function fixture() {
  const configuration = { producers: [{ id: "p1", topicId: "t1" }] };
  const brokers = Array.from({ length: 3 }, (_, b) => ({
    id: "b" + b,
    name: "Broker-" + b,
    online: true,
    replicas: Array.from({ length: 2 }, (_, p) => ({
      nodeId: `replica:t1:${p}:b${b}`,
      key: "t1:" + p,
      topicId: "t1",
      partition: p,
      leader: b === p,
    })),
  }));
  const groups = Array.from({ length: 3 }, (_, g) => ({
    id: "g" + g,
    consumers: Array.from({ length: 2 }, (_, c) => ({
      id: `c${g}${c}`,
      topicIds: ["t1"],
      assignments: ["t1:" + c],
    })),
  }));
  return { configuration, brokers, groups };
}
const view = { followers: true, commits: false, topic: "", group: "" };
test("partition identity matches reference and is shared by replicas", async () => {
  const { partitionColor } = await load();
  assert.equal(partitionColor("topic:0"), "#5BB12F");
  assert.equal(partitionColor("topic:1"), "#9E579E");
  assert.equal(partitionColor("topic:2"), "#73C5E1");
  assert.equal(partitionColor("topic:3"), "#EB65A0");
  assert.equal(partitionColor("renamed:1"), partitionColor("topic:1"));
});
test("horizontal layout contains every replica inside its broker and fits default viewport", async () => {
  const { buildLayout } = await load(),
    l = buildLayout(fixture(), view, 1920, 1004);
  assert.equal(l.height, 1004);
  assert.equal(l.replicas.length, 6);
  assert.equal(l.consumers.length, 6);
  assert(l.producers[0].cx < l.brokers[0].x);
  assert(l.brokers[0].x + l.brokers[0].w < l.groups[0].x);
  for (const r of l.replicas) {
    const b = l.brokers.find((b) => b.data.id === r.broker.id);
    assert(r.x >= b.x && r.x + r.w <= b.x + b.w);
    assert(r.cy > b.y && r.cy < b.y + b.h);
  }
  for (const c of l.consumers) assert(c.x + c.w <= l.width);
});
test("tick and message changes never move component positions", async () => {
  const { buildLayout } = await load(),
    s = fixture(),
    a = buildLayout(s, view, 1920, 1004);
  s.tick = 100;
  s.brokers[0].replicas[0].messages = [{ id: "M20" }];
  const b = buildLayout(s, view, 1920, 1004);
  assert.deepEqual(
    [...a.nodes].map(([id, n]) => [id, n.cx, n.cy]),
    [...b.nodes].map(([id, n]) => [id, n.cx, n.cy]),
  );
});
test("sparse branches stay visible when broker replicas require scrolling", async () => {
  const { buildLayout } = await load(),
    s = fixture();
  s.brokers.forEach((b) => {
    b.replicas = Array.from({ length: 30 }, (_, p) => ({
      nodeId: `replica:t1:${p}:` + b.id,
      key: "t1:" + p,
      topicId: "t1",
      partition: p,
      leader: true,
    }));
  });
  s.groups = s.groups.slice(0, 1);
  const l = buildLayout(s, view, 1920, 1004);
  assert(l.height > 1004);
  assert(l.producers[0].cy < 1004);
  assert(l.consumers.every((c) => c.cy < 1004));
});
test("filters and mobile retain horizontal architecture at readable dimensions", async () => {
  const { buildLayout } = await load(),
    l = buildLayout(
      fixture(),
      { ...view, group: "g0", followers: false },
      390,
      744,
    );
  assert.equal(l.width, 1320);
  assert.equal(l.groups.length, 1);
  assert(l.replicas.every((r) => r.data.leader));
  assert(l.producers[0].cx < l.brokers[0].x && l.brokers[0].x < l.groups[0].cx);
});
test("event routes terminate at actual sources and destinations and use routing gutters", async () => {
  const { buildLayout, routePoints, routeMetric } = await load(),
    l = buildLayout(fixture(), view, 1920, 1004);
  const event = {
    stage: "DELIVERED",
    source: "replica:t1:0:b0",
    destination: "consumer:c00",
    groupId: "g0",
    partitionKey: "t1:0",
  };
  const points = routePoints(l, event),
    destination = l.nodes.get(event.destination),
    source = l.nodes.get(event.source);
  assert.deepEqual(points[0], [source.right, source.cy]);
  assert.deepEqual(points.at(-1), [destination.cx - 20, destination.cy]);
  const metric = routeMetric(points);
  assert.deepEqual(metric.point(0), { x: source.right, y: source.cy });
  assert.deepEqual(metric.point(1), {
    x: destination.cx - 20,
    y: destination.cy,
  });
  assert.equal(routePoints(l, { ...event, destination: "missing" }), null);
});
test("delivery uses available lower space instead of detouring over a group", async () => {
  const { routePoints } = await load();
  const source = { cx: 320, right: 790, cy: 224 };
  const consumer = { cx: 1154, cy: 188 };
  const group = { cx: 1007, cy: 120 };
  const layout = {
    brokerX: 260,
    brokerWidth: 530,
    consumerX: 1154,
    groups: [group],
    nodes: new Map([
      ["source", source],
      ["target", consumer],
    ]),
  };
  const route = routePoints(layout, {
    stage: "DELIVERED",
    source: "source",
    destination: "target",
  });
  assert.equal(route[2][1], 224);
  assert(route.every((p) => p[1] >= consumer.cy));
  source.cy = 40;
  consumer.cy = 52;
  const upper = routePoints(layout, {
    stage: "DELIVERED",
    source: "source",
    destination: "target",
  });
  assert.equal(upper[2][1], 40);
});
test("delivery clears measured group labels by the packet half-height plus margin", async () => {
  const { routePoints } = await load();
  const layout = {
    brokerX: 260,
    brokerWidth: 530,
    consumerX: 1154,
    groups: [],
    deliveryObstacles: [{ left: 950, right: 1090, top: 170, bottom: 200 }],
    nodes: new Map([
      ["source", { right: 790, cy: 190 }],
      ["target", { cx: 1154, cy: 188 }],
    ]),
  };
  const route = routePoints(layout, {
    stage: "DELIVERED",
    source: "source",
    destination: "target",
  });
  assert.equal(route[2][1], 224);
  assert(route[2][1] - 16 > 200);
});
