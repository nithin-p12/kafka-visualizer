/** Coordinates are independent of ticks/messages: traffic never moves the architecture. */
export const PALETTE = [
  "#5BB12F",
  "#9E579E",
  "#73C5E1",
  "#EB65A0",
  "#4A90E2",
  "#D9A441",
  "#2A9D8F",
  "#6F70C7",
  "#D87A64",
  "#6E8C9E",
];
export const partitionColor = (key) =>
  PALETTE[Number(String(key).split(":")[1]) % PALETTE.length] || "#828384";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function buildLayout(state, view, viewportWidth, viewportHeight) {
  const width = Math.max(1320, viewportWidth),
    available = Math.max(540, viewportHeight);
  const brokerX = Math.round(width * 0.19),
    brokerWidth = Math.round(width * 0.34);
  const groupX = Math.round(width * 0.65),
    consumerX = groupX + 154;
  const brokers = state.brokers.map((b) => ({
    ...b,
    replicas: b.replicas.filter(
      (r) =>
        (!view.topic || r.topicId === view.topic) &&
        (view.followers || r.leader),
    ),
  }));
  const groups = state.groups
    .filter(
      (g) =>
        (!view.group || g.id === view.group) &&
        (!view.topic ||
          !g.consumers.length ||
          g.consumers.some((c) => c.topicIds.includes(view.topic))),
    )
    .map((g) => ({
      ...g,
      consumers: g.consumers.filter(
        (c) => !view.topic || c.topicIds.includes(view.topic),
      ),
    }));
  const producers = state.configuration.producers.filter(
    (p) => !view.topic || p.topicId === view.topic,
  );
  const replicas = brokers.reduce(
    (sum, b) => sum + Math.max(1, b.replicas.length),
    0,
  );
  const members = groups.reduce(
    (sum, g) => sum + Math.max(1, g.consumers.length),
    0,
  );
  const row = clamp(
    (available - 150 - brokers.length * 42) / replicas,
    66,
    108,
  );
  const leaf = clamp(
    (available - 160 - groups.length * 24) / Math.max(1, members),
    78,
    116,
  );
  const brokerHeight =
    brokers.reduce(
      (sum, b) => sum + 42 + Math.max(1, b.replicas.length) * row,
      0,
    ) +
    Math.max(0, brokers.length - 1) * 24;
  const groupHeight = members * leaf + Math.max(0, groups.length - 1) * 30;
  const height = Math.max(
    available,
    brokerHeight + 130,
    groupHeight + 130,
    producers.length > 1 ? producers.length * 300 + 104 : 600,
  );
  const nodes = new Map();
  const brokerNodes = [],
    replicaNodes = [],
    groupNodes = [],
    consumerNodes = [],
    producerNodes = [];
  let y = Math.max(72, (height - brokerHeight) / 2);
  for (const b of brokers) {
    const h = 42 + Math.max(1, b.replicas.length) * row;
    const node = {
      id: "broker:" + b.id,
      kind: "broker",
      data: b,
      x: brokerX,
      y,
      w: brokerWidth,
      h,
      cx: brokerX + 14,
      cy: y + 24,
    };
    brokerNodes.push(node);
    nodes.set(node.id, node);
    b.replicas.forEach((r, i) => {
      const cy = y + 42 + i * row + row / 2;
      const rn = {
        id: r.nodeId,
        kind: "replica",
        data: r,
        broker: b,
        x: brokerX + 35,
        y: cy - 31,
        w: brokerWidth - 50,
        h: 62,
        cx: brokerX + 54,
        cy,
        logX: brokerX + 91,
        cell: clamp((brokerWidth - 120 - 32) / 5, 44, 76),
        right: brokerX + brokerWidth - 14,
      };
      replicaNodes.push(rn);
      nodes.set(rn.id, rn);
    });
    y += h + 24;
  }
  // Keep sparse branches in view even when many replica rows need scrolling.
  const groupBand = Math.min(height, Math.max(available, groupHeight + 144));
  y = Math.max(72, (groupBand - groupHeight) / 2);
  groups.forEach((g, gi) => {
    const h = Math.max(1, g.consumers.length) * leaf,
      cy = y + h / 2;
    const gn = {
      id: "group:" + g.id,
      kind: "group",
      data: g,
      x: groupX - 60,
      y,
      w: 145,
      h,
      cx: groupX + 7,
      cy,
      index: gi,
    };
    groupNodes.push(gn);
    nodes.set(gn.id, gn);
    g.consumers.forEach((c, i) => {
      const cy = y + leaf * (i + 0.5);
      const cn = {
        id: "consumer:" + c.id,
        kind: "consumer",
        data: c,
        group: g,
        x: consumerX - 21,
        y: cy - 43,
        w: width - consumerX - 18,
        h: 76,
        cx: consumerX,
        cy,
        logX: consumerX + 34,
        cell: clamp((width - consumerX - 68 - 24) / 5, 42, 66),
      };
      consumerNodes.push(cn);
      nodes.set(cn.id, cn);
      nodes.set("complete:" + c.id, {
        ...cn,
        id: "complete:" + c.id,
        kind: "complete",
        cx: consumerX,
        cy: cy + 30,
      });
    });
    y += h + 30;
  });
  producers.forEach((p, i) => {
    const producerBand = Math.min(
      height,
      Math.max(available, producers.length * 300 + 104),
    );
    const cy =
      producers.length === 1
        ? Math.min(height, available) / 2
        : 80 + (i * (producerBand - 100)) / producers.length;
    const queueRows =
      producers.length > 1
        ? 6
        : clamp(Math.floor((height - cy - 126) / 28), 6, 10);
    const pn = {
      id: "producer:" + p.id,
      kind: "producer",
      data: p,
      x: 30,
      y: cy - 24,
      w: 190,
      h: 128 + queueRows * 28,
      cx: 125,
      cy,
      queueY: cy + 94,
      queueRows,
    };
    producerNodes.push(pn);
    nodes.set(pn.id, pn);
  });
  nodes.set("offset-store", {
    id: "offset-store",
    kind: "offset",
    cx: brokerX + brokerWidth / 2,
    cy: height - 32,
    x: brokerX + brokerWidth / 2 - 100,
    y: height - 50,
    w: 200,
    h: 35,
  });
  return {
    width,
    height,
    brokerX,
    brokerWidth,
    groupX,
    consumerX,
    nodes,
    brokers: brokerNodes,
    replicas: replicaNodes,
    groups: groupNodes,
    consumers: consumerNodes,
    producers: producerNodes,
  };
}

/** Orthogonal routing in reserved gutters; group markers are never network hops. */
export function routePoints(layout, event) {
  const a = layout.nodes.get(event.source),
    b = layout.nodes.get(event.destination);
  if (!a || !b) return null;
  const { brokerX, brokerWidth, consumerX } = layout;
  if (event.stage === "PRODUCED")
    return [
      [a.cx, a.queueY + 13],
      [brokerX - 44, a.queueY + 13],
      [brokerX - 44, b.cy],
      [b.cx - 20, b.cy],
    ];
  if (event.stage === "REPLICATED")
    return [
      [a.cx - 20, a.cy],
      [brokerX - 18, a.cy],
      [brokerX - 18, b.cy],
      [b.cx - 20, b.cy],
    ];
  if (event.stage === "DELIVERED") {
    const lane = brokerX + brokerWidth + 32;
    const entryX = consumerX - 43;
    // Include packet size, not only the thin line, when clearing group labels.
    const obstacles =
      layout.deliveryObstacles ||
      layout.groups.map((g) => ({
        left: g.cx - 68,
        right: g.cx + 68,
        top: g.cy - 24,
        bottom: g.cy + 66,
      }));
    const relevant = obstacles.filter(
      (o) => o.right + 41 > lane && o.left - 41 < entryX,
    );
    const candidates = [
      a.cy,
      b.cy,
      b.cy - 60,
      b.cy + 60,
      ...relevant.flatMap((o) => [o.top - 24, o.bottom + 24]),
    ];
    const clear = (y) =>
      relevant.every((o) => y <= o.top - 24 || y >= o.bottom + 24);
    const direction = Math.sign(a.cy - b.cy);
    const entryY =
      candidates.filter(clear).sort((u, v) => {
        const length = (y) => Math.abs(a.cy - y) + Math.abs(b.cy - y);
        return (
          length(u) - length(v) ||
          (Math.sign(v - b.cy) === direction) -
            (Math.sign(u - b.cy) === direction) ||
          Math.abs(u - a.cy) - Math.abs(v - a.cy)
        );
      })[0] ?? b.cy;
    return [
      [a.right, a.cy],
      [lane, a.cy],
      [lane, entryY],
      [entryX, entryY],
      [entryX, b.cy],
      [b.cx - 20, b.cy],
    ];
  }
  if (event.stage === "COMMITTED")
    return [
      [a.cx - 20, a.cy],
      [consumerX - 44, a.cy],
      [consumerX - 44, layout.height - 66],
      [b.cx, layout.height - 66],
      [b.cx, b.cy - 15],
    ];
  if (event.stage === "PROCESSED")
    return [
      [a.cx - 20, a.cy],
      [a.cx - 35, a.cy],
      [a.cx - 35, b.cy],
      [b.cx, b.cy],
    ];
  if (event.stage === "RETRY")
    return [
      [a.cx - 18, a.cy],
      [a.cx - 40, a.cy],
      [a.cx - 40, a.cy + 30],
      [a.cx, a.cy + 30],
      [a.cx, a.cy + 18],
    ];
  if (event.stage === "FAILED" || event.stage === "COMMIT_FAILED")
    return [
      [a.cx, a.cy],
      [a.cx, a.cy],
    ];
  return null;
}
export const pathData = (points) =>
  points.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
export function routeMetric(points) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const length = lengths.reduce((a, b) => a + b, 0);
  return {
    length,
    point(progress) {
      let remaining = length * progress;
      for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
          const f = lengths[i] ? Math.min(1, remaining / lengths[i]) : 0;
          return {
            x: points[i][0] + (points[i + 1][0] - points[i][0]) * f,
            y: points[i][1] + (points[i + 1][1] - points[i][1]) * f,
          };
        }
        remaining -= lengths[i];
      }
      return { x: points[0][0], y: points[0][1] };
    },
  };
}
