import {
  buildLayout,
  partitionColor,
  routePoints,
  pathData,
  routeMetric,
} from "./diagram-layout.js";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const ns = "http://www.w3.org/2000/svg";
const circle = (x, y, r, attrs = "") =>
  `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const label = (x, y, value, cls = "actor-label", anchor = "start") =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(value)}</text>`;
const measure = document.createElement("canvas").getContext("2d");
function wraps(value, limit) {
  measure.font = "14px Segoe UI";
  return measure.measureText(String(value)).width > limit * 7;
}
function fitText(value, width, font = 14) {
  measure.font = font + "px Segoe UI";
  let text = String(value);
  if (measure.measureText(text).width <= width) return text;
  while (text.length && measure.measureText(text + "…").width > width)
    text = text.slice(0, -1);
  return text + "…";
}
function wrapped(x, y, value, limit, anchor = "middle") {
  measure.font = "14px Segoe UI";
  const width = limit * 7,
    text = String(value);
  let first = "";
  for (const char of text) {
    if (measure.measureText(first + char).width > width) break;
    first += char;
  }
  const lines =
    first.length === text.length
      ? [first]
      : [first, fitText(text.slice(first.length), width)];
  return lines
    .map((line, i) => label(x, y + i * 17, line, "actor-label", anchor))
    .join("");
}
function record(
  x,
  y,
  width,
  message,
  key,
  { follower = false, processing = false, failed = false } = {},
) {
  const color = partitionColor(key);
  return `<g><title>${esc(message.id)} · offset ${message.offset ?? "—"} · ${esc(message.key || "∅")} · ${esc(message.payload || "")}</title><rect class="record ${processing ? "processing" : ""} ${failed ? "failed" : ""}" x="${x}" y="${y - 14}" width="${width}" height="28" rx="1" fill="${follower ? "#f5f5f5" : color}" stroke="${color}"/><text x="${x + width / 2}" y="${y + 1}" class="record-number" fill="${follower ? color : "white"}">${esc(message.id)}</text></g>`;
}
function sectors(cx, cy, keys) {
  if (!keys.length)
    return circle(cx, cy, 19, 'class="actor-marker focus-ring"');
  const unique = [...new Set(keys.map(partitionColor))];
  if (unique.length === 1)
    return circle(
      cx,
      cy,
      19,
      `fill="${unique[0]}" stroke="${unique[0]}" class="focus-ring"`,
    );
  return (
    unique
      .map((color, i) => {
        const start = (i / unique.length) * Math.PI * 2 - Math.PI / 2,
          end = ((i + 1) / unique.length) * Math.PI * 2 - Math.PI / 2;
        return `<path d="M${cx} ${cy}L${cx + 19 * Math.cos(start)} ${cy + 19 * Math.sin(start)}A19 19 0 ${end - start > Math.PI ? 1 : 0} 1 ${cx + 19 * Math.cos(end)} ${cy + 19 * Math.sin(end)}Z" fill="${color}"/>`;
      })
      .join("") +
    circle(cx, cy, 19, 'fill="none" stroke="#babdbe" class="focus-ring"')
  );
}

export class Diagram {
  constructor(svg, viewport) {
    this.svg = svg;
    this.viewport = viewport;
    this.zoom = 1;
    this.layout = null;
    this.paths = new Map();
    this.signature = "";
    this.view = {};
  }
  update(state, view, histories, unused, selected) {
    this.state = state;
    this.view = view;
    const signature = JSON.stringify([
      this.viewport.clientWidth,
      this.viewport.clientHeight,
      view.topic,
      view.group,
      view.followers,
      view.commits,
      state.configuration.producers.map((p) => [p.id, p.topicId]),
      state.brokers.map((b) => [
        b.id,
        b.replicas.map((r) => [r.nodeId, view.followers || r.leader]),
      ]),
      state.groups.map((g) => [
        g.id,
        g.consumers.map((c) => [c.id, c.topicIds]),
      ]),
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.layout = buildLayout(
        state,
        view,
        this.viewport.clientWidth,
        this.viewport.clientHeight,
      );
      this.paths.clear();
      document.getElementById("active-paths").replaceChildren();
      this.resize();
    }
    const l = this.layout;
    let scaffold =
      label(45, 35, "PRODUCERS", "scene-heading") +
      label(l.brokerX, 35, "BROKERS · PHYSICAL REPLICAS", "scene-heading") +
      label(l.groupX - 48, 35, "CONSUMER GROUPS · LOGICAL", "scene-heading");
    for (const b of l.brokers) {
      const rs = l.replicas.filter((r) => r.broker.id === b.data.id);
      if (rs.length) {
        const x = b.x + 17;
        scaffold +=
          `<path class="branch-line" d="M${x} ${rs[0].cy}V${rs.at(-1).cy}"/>` +
          rs
            .map(
              (r) =>
                `<path class="branch-line" d="M${x} ${r.cy}H${r.cx - 19}"/>`,
            )
            .join("");
      }
    }
    for (const g of l.groups) {
      const cs = l.consumers.filter((c) => c.group.id === g.data.id),
        x = g.cx + 77;
      if (cs.length)
        scaffold +=
          `<path class="branch-line" d="M${g.cx + 20} ${g.cy}H${x}M${x} ${cs[0].cy}V${cs.at(-1).cy}"/>` +
          cs
            .map(
              (c) =>
                `<path class="branch-line" d="M${x} ${c.cy}H${c.cx - 19}"/>`,
            )
            .join("");
    }
    document.getElementById("scaffold").innerHTML = scaffold;
    const items = [];
    for (const p of l.producers) {
      const data = state.configuration.producers.find(
        (x) => x.id === p.data.id,
      );
      p.data = data;
      const queue =
        state.producerQueues?.find((q) => q.producerId === data.id)?.messages ||
        [];
      const waiting = queue[0]?.status.startsWith("Waiting")
        ? queue[0].status
        : state.manualStatus?.startsWith("Waiting") ||
            state.manualStatus?.startsWith("Stored")
          ? state.manualStatus
          : "";
      const blocks = queue
        .slice(0, p.queueRows)
        .map(
          (m, i) =>
            `<g class="queued-message" data-message="${esc(m.id)}"><title>${esc(m.id)} · ${esc(m.status)} · key ${esc(m.key || "∅")} · ${esc(m.payload)} · no Kafka offset yet</title><rect x="${p.cx - 42}" y="${p.queueY + i * 28}" width="84" height="26" rx="2" fill="#828384" stroke="${i === 0 ? "#1677ff" : "none"}" stroke-width="2"/>${label(p.cx, p.queueY + i * 28 + 14, m.id, "record-number", "middle").replace('class="record-number"', 'class="record-number" fill="white"')}</g>`,
        )
        .join("");
      items.push({
        node: p,
        html: `<title>${esc(data.name)} publishes to ${esc(state.configuration.topics.find((t) => t.id === data.topicId)?.name)}. ${data.automatic ? "Click for actions." : "Click or press Enter/Space to publish the next queued message. Edit in Configuration."}</title>${circle(p.cx, p.cy, 22, 'class="actor-marker focus-ring"')}${label(p.cx, p.cy + 1, "P", "actor-symbol", "middle")}${wrapped(p.cx, p.cy + 48, data.name, 20)}${label(p.cx, p.cy + 84, "Next → pending FIFO", "status-text", "middle")}${blocks}${queue.length > p.queueRows ? label(p.cx, p.queueY + p.queueRows * 28 + 16, queue.length - p.queueRows + " more pending", "status-text", "middle") : ""}${waiting ? label(p.cx, p.queueY + p.queueRows * 28 + 34, fitText(waiting, 190, 11), "status-text", "middle") : ""}`,
      });
    }
    for (const b of l.brokers) {
      const data = state.brokers.find((x) => x.id === b.data.id);
      b.data = data;
      items.push({
        node: b,
        html: `<title>${esc(data.name)} hosts separate replica logs. Click for stop/restart.</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" class="broker-band"/><rect x="${b.x - 22}" y="${b.y + 8}" width="32" height="32" rx="4" class="power-button"/>${label(b.x - 6, b.y + 29, "⏻", "power-icon", "middle")}${label(b.x + 25, b.y + 29, fitText(data.name, b.w - 55, 15), "broker-label")}${!data.online ? circle(b.x + 12, b.y + 13, 5, 'class="offline-indicator"') : ""}`,
      });
    }
    for (const n of l.replicas) {
      const r = state.brokers
          .find((b) => b.id === n.broker.id)
          .replicas.find((r) => r.nodeId === n.id),
        color = partitionColor(r.key);
      n.data = r;
      n.broker = state.brokers.find((b) => b.id === n.broker.id);
      const workers = state.groups
        .flatMap((g) => g.consumers)
        .filter((c) => c.processing?.partitionKey === r.key);
      items.push({
        node: n,
        html: `<title>${esc(r.topicName)} / P${r.partition} @ ${esc(n.broker.name)} · ${r.leader ? "Leader" : "Follower"} · ${r.available ? "available" : "unavailable"} · click to inspect</title><path class="branch-line" d="M${n.cx + 19} ${n.cy}H${n.right}"/>${circle(n.cx, n.cy, 19, `class="focus-ring" fill="${r.leader ? color : "#f5f5f5"}" stroke="${color}"`)}${label(n.cx, n.cy + 1, "P" + r.partition, "partition-number", "middle").replace('class="partition-number"', `class="partition-number" fill="${r.leader ? "white" : color}"`)}${label(n.logX, n.cy - 22, fitText(r.topicName, n.w - 160, 12), "topic-label")}${label(n.right, n.cy - 22, r.leader ? "L · leader" : "F · follower", "role-label", "end").replace('class="role-label"', `class="role-label" fill="${color}"`)}<rect x="${n.logX - 5}" y="${n.cy - 19}" width="${n.cell + 10}" height="38" class="record-frame"/>${r.messages
          .slice(-5)
          .reverse()
          .map((m, i) =>
            record(n.logX + i * (n.cell + 8), n.cy, n.cell, m, r.key, {
              follower: !r.leader,
              processing: workers.some((c) => c.processing.message.id === m.id),
              failed: workers.some(
                (c) =>
                  c.status === "FAILED" && c.processing.message.id === m.id,
              ),
            }),
          )
          .join(
            "",
          )}${!r.available ? label(n.right, n.cy + 31, "Unavailable", "status-text", "end").replace('class="status-text"', 'class="status-text" fill="#ce3434"') : ""}`,
      });
    }
    for (const n of l.groups) {
      const g = state.groups.find((g) => g.id === n.data.id);
      n.data = g;
      items.push({
        node: n,
        html: `<title>${esc(g.id)}: logical membership, independent offsets. Lag ${g.lag}. Click for details.</title>${circle(n.cx, n.cy, 20, 'class="actor-marker focus-ring"')}${label(n.cx, n.cy + 1, String.fromCharCode(65 + n.index), "actor-symbol", "middle")}${wrapped(n.cx, n.cy + 39, g.id, 19)}${g.rebalancing ? label(n.cx, n.cy - 30, "⇄ Rebalance", "status-text", "middle") : ""}`,
      });
    }
    for (const n of l.consumers) {
      const c = state.groups
        .flatMap((g) => g.consumers)
        .find((c) => c.id === n.data.id);
      n.data = c;
      const keys = c.assignments.filter(
        (k) => !view.topic || k.split(":")[0] === view.topic,
      );
      const recent = (histories.get(c.id) || [])
        .filter(
          (e) =>
            e.groupId === c.groupId &&
            (!view.topic || e.partitionKey.split(":")[0] === view.topic),
        )
        .slice(-5)
        .reverse();
      const messages = c.processing
        ? [
            {
              message: c.processing.message,
              key: c.processing.partitionKey,
              current: true,
            },
            ...recent
              .filter((e) => e.messageId !== c.processing.message.id)
              .map((e) => ({
                message: e.message || { id: e.messageId, offset: e.offset },
                key: e.partitionKey,
              })),
          ].slice(0, 5)
        : recent.map((e) => ({
            message: e.message || { id: e.messageId, offset: e.offset },
            key: e.partitionKey,
          }));
      items.push({
        node: n,
        html: `<title>${esc(c.name)} · ${esc(c.groupId)} · ${keys.length ? keys.map((k) => this.partitionName(k)).join(", ") : "no assigned partition"} · ${c.status} · ${c.rate} msg/s · click for actions</title><path class="branch-line" d="M${n.cx + 19} ${n.cy}H${l.width - 30}"/>${sectors(n.cx, n.cy, c.online ? keys : [])}${label(n.cx, n.cy + 1, c.id.replace(/[^0-9]/g, "") || "C", "partition-number", "middle").replace('class="partition-number"', `class="partition-number" fill="${keys.length && c.online ? "white" : "#828384"}"`)}${wrapped(n.logX, n.cy - (wraps(c.name, Math.max(22, Math.floor((l.width - n.logX - 20) / 8))) ? 44 : 25), c.name, Math.max(22, Math.floor((l.width - n.logX - 20) / 8)), "start")}${messages.map((m, i) => record(n.logX + i * (n.cell + 6), n.cy, n.cell, m.message, m.key, { processing: m.current, failed: m.current && c.status === "FAILED" })).join("")}${label(n.logX, n.cy + 31, c.online ? (c.status === "IDLE" ? "Idle · no assigned partition" : c.paused ? "Paused" : c.status === "FAILED" ? "× Failed attempt" : c.processing ? `Processing ${c.processing.message.id}` : `✓ ${c.successes} processed`) : "● Offline", "status-text")}${view.commits ? label(l.width - 28, n.cy + 31, this.commitLabel(c), "commit-text", "end") : ""}${!c.online ? circle(n.cx + 17, n.cy - 15, 5, 'class="offline-indicator"') : ""}`,
      });
    }
    if (view.commits) {
      const n = l.nodes.get("offset-store");
      items.push({
        node: n,
        html: `<title>Simulated __consumer_offsets: group + partition → next offset. Not an additional physical server.</title><rect x="${n.x}" y="${n.y}" width="200" height="34" rx="4" fill="#f0f2f5" stroke="#a7c59c"/>${label(n.cx, n.cy + 5, "✓ Group offset storage", "commit-text", "middle")}`,
      });
    }
    this.reconcile(items, selected);
  }
  reconcile(items, selected) {
    const parent = document.getElementById("diagram-nodes");
    const existing = new Map([...parent.children].map((e) => [e.id, e]));
    for (const { node, html } of items) {
      let el = existing.get(node.id);
      if (!el) {
        el = document.createElementNS(ns, "g");
        el.id = node.id;
        parent.append(el);
      }
      existing.delete(node.id);
      const classes = [
        "node-action",
        node.kind === "replica"
          ? "replica"
          : node.kind === "consumer"
            ? "consumer-node"
            : node.kind === "group"
              ? "group-box"
              : node.kind === "broker"
                ? "broker"
                : "producer-node",
        selected?.nodeId === node.id ? "selected" : "",
        node.kind === "replica" && node.data.leader ? "is-leader" : "",
        node.data?.online === false || node.broker?.online === false
          ? "offline-node"
          : "",
      ].join(" ");
      el.setAttribute("class", classes);
      el.dataset.node = node.id;
      el.dataset.kind = node.kind;
      el.dataset.sourceId = node.data?.id ?? node.id;
      if (node.kind === "replica") {
        el.dataset.partition = node.data.key;
        el.dataset.broker = node.broker.id;
      }
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        node.kind === "replica"
          ? `Inspect ${node.data.topicName} P${node.data.partition} at ${node.broker.name}`
          : node.data?.name || node.data?.id || "Offset store",
      );
      if (el._markup !== html) {
        el.innerHTML = html;
        el._markup = html;
      }
    }
    existing.forEach((el) => el.remove());
    // Use the actual rendered label bounds: custom names can wrap to two lines.
    this.layout.deliveryObstacles = [
      ...parent.querySelectorAll(
        ".group-box text, .group-box circle, .consumer-node text.actor-label",
      ),
    ].map((el) => {
      const r = el.getBBox();
      return {
        left: r.x,
        right: r.x + r.width,
        top: r.y,
        bottom: r.y + r.height,
      };
    });
  }
  partitionName(key) {
    const [id, p] = key.split(":");
    return `${this.state.configuration.topics.find((t) => t.id === id)?.name || id} / P${p}`;
  }
  commitLabel(c) {
    const g = this.state.groups.find((g) => g.id === c.groupId);
    return g.offsets
      .filter((o) => o.ownerId === c.id && o.committedNext != null)
      .map((o) => `P${o.partition} next ${o.committedNext}`)
      .join(" · ");
  }
  route(event) {
    const points = routePoints(this.layout, event);
    return points
      ? { points, d: pathData(points), ...routeMetric(points) }
      : null;
  }
  showPath(job) {
    if (!job.route || job.stationary) return;
    let el = document.createElementNS(ns, "path");
    el.setAttribute("d", job.route.d);
    el.setAttribute(
      "class",
      `connection ${job.event.stage === "COMMITTED" ? "commit" : job.event.stage === "REPLICATED" ? "replication" : "delivery"}`,
    );
    const title = document.createElementNS(ns, "title");
    title.textContent = `${job.event.sourceName} → ${job.event.destinationName} · ${this.partitionName(job.event.partitionKey)}${job.event.groupId ? " · " + job.event.groupId : ""}`;
    el.append(title);
    document.getElementById("active-paths").append(el);
    job.pathElement = el;
  }
  resize() {
    if (!this.layout) return;
    this.svg.setAttribute(
      "viewBox",
      `0 0 ${this.layout.width} ${this.layout.height}`,
    );
    this.svg.style.width = this.layout.width * this.zoom + "px";
    this.svg.style.height = this.layout.height * this.zoom + "px";
  }
  fit() {
    if (!this.layout) return;
    this.zoom = Math.max(
      0.85,
      Math.min(
        1,
        this.viewport.clientWidth / this.layout.width,
        this.viewport.clientHeight / this.layout.height,
      ),
    );
    this.resize();
    this.viewport.scrollTo(0, 0);
  }
  zoomBy(factor) {
    this.zoom = Math.max(0.85, Math.min(1.8, this.zoom * factor));
    this.resize();
  }
}
