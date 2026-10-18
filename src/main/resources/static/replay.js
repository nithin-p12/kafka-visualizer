import { partitionColor } from "./diagram-layout.js?v=20261018-2";
const ns = "http://www.w3.org/2000/svg";
const DURATIONS = {
  ASSIGNMENT: 950,
  PRODUCED: 850,
  REPLICATED: 750,
  DELIVERED: 1100,
  PROCESSED: 500,
  COMMITTED: 850,
  RETRY: 650,
  FAILED: 650,
  COMMIT_FAILED: 650,
};
const FLOW = new Set([
  ...Object.keys(DURATIONS),
  "ACKNOWLEDGED",
  "PROCESSING",
  "REDELIVERED",
]);
/** A bounded tick batch of actual events. No bundling, eviction or hidden packets. */
export class Replay {
  constructor(diagram, callbacks = {}) {
    this.diagram = diagram;
    this.callbacks = callbacks;
    this.speed = 1;
    this.clock = 0;
    this.previous = performance.now();
    this.queue = [];
    this.active = [];
    this.done = new Set();
    this.pipelines = new Map();
    this.completed = new Map();
    this.partitionTails = new Map();
    this.replicaTails = new Map();
    this.assignmentTails = new Map();
    this.consumerAssignmentTails = new Map();
    this.step = false;
    this.obsolete = 0;
    this.finished = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  get idle() {
    return !this.queue.length && !this.active.length;
  }
  reset() {
    for (const j of this.active) {
      j.element?.remove();
      j.pathElement?.remove();
    }
    this.queue = [];
    this.active = [];
    this.done.clear();
    this.pipelines.clear();
    this.completed.clear();
    this.partitionTails.clear();
    this.replicaTails.clear();
    this.assignmentTails.clear();
    this.consumerAssignmentTails.clear();
    this.clock = 0;
    this.previous = performance.now();
    this.step = false;
    this.obsolete = 0;
    this.finished = 0;
  }
  cancelGroup(group, generation) {
    const stale = (j) =>
      j.event.groupId === group && j.event.generation < generation;
    this.queue = this.queue.filter((j) => {
      if (!stale(j)) return true;
      this.finish(j, true);
      return false;
    });
    this.active = this.active.filter((j) => {
      if (!stale(j)) return true;
      this.finish(j, true);
      return false;
    });
  }
  enqueue(event) {
    if (event.stage === "REBALANCE") {
      this.cancelGroup(event.groupId, event.generation);
      return;
    }
    if (!FLOW.has(event.stage) || !event.source) return;
    const key = event.messageId,
      meta = this.pipelines.get(key) || { replicas: [], deliveries: new Map() };
    const deliveryKey = event.groupId + "|" + event.generation;
    let dependencies = [];
    if (event.stage === "ASSIGNMENT") {
      const owner = event.groupId + "|" + event.destination;
      dependencies = [this.consumerAssignmentTails.get(owner)].filter(Boolean);
      this.consumerAssignmentTails.set(owner, event.id);
      this.assignmentTails.set(event.groupId + "|" + event.partitionKey, event.id);
    }
    if (event.stage === "PRODUCED")
      dependencies = [...this.assignmentTails.values(), this.partitionTails.get(event.partitionKey)].filter(
        Boolean,
      );
    if (event.stage === "REPLICATED")
      dependencies = [
        meta.produced,
        this.replicaTails.get(event.destination),
      ].filter(Boolean);
    if (event.stage === "ACKNOWLEDGED")
      dependencies = [meta.produced, ...meta.replicas].filter(Boolean);
    if (event.stage === "DELIVERED")
      dependencies = [
        meta.ack || meta.produced,
        this.assignmentTails.get(event.groupId + "|" + event.partitionKey),
        ...(!meta.ack ? meta.replicas : []),
      ].filter(Boolean);
    if (
      ["PROCESSING", "PROCESSED", "FAILED", "RETRY", "REDELIVERED"].includes(
        event.stage,
      ) &&
      event.groupId
    )
      dependencies = [meta.deliveries.get(deliveryKey)].filter(Boolean);
    if (event.stage === "COMMITTED")
      dependencies = [
        this.completed.get(event.groupId + "|" + event.partitionKey),
      ].filter(Boolean);
    const job = {
      event,
      dependencies,
      ids: [event.id],
      duration: DURATIONS[event.stage] || 0,
      elapsed: 0,
    };
    if (event.stage === "PRODUCED") {
      meta.produced = event.id;
      this.partitionTails.set(event.partitionKey, event.id);
    }
    if (event.stage === "REPLICATED") {
      meta.replicas.push(event.id);
      this.replicaTails.set(event.destination, event.id);
    }
    if (event.stage === "ACKNOWLEDGED") meta.ack = event.id;
    if (
      [
        "DELIVERED",
        "PROCESSING",
        "PROCESSED",
        "FAILED",
        "RETRY",
        "REDELIVERED",
      ].includes(event.stage)
    )
      meta.deliveries.set(deliveryKey, event.id);
    if (event.stage === "PROCESSED")
      this.completed.set(event.groupId + "|" + event.partitionKey, event.id);
    if (key) this.pipelines.set(key, meta);
    this.queue.push(job);
  }
  finish(job, obsolete = false) {
    this.done.add(job.event.id);
    job.element?.remove();
    job.pathElement?.remove();
    if (obsolete) {
      this.obsolete++;
      this.callbacks.cancel?.(job.event);
    } else {
      this.finished++;
      this.callbacks.finish?.(job.event);
    }
  }
  pruneCompleted() {
    // At a settled tick all old dependencies are complete. Keep only recent message pipelines.
    if (this.pipelines.size > 500 && this.idle) {
      for (const key of [...this.pipelines.keys()].slice(
        0,
        this.pipelines.size - 500,
      ))
        this.pipelines.delete(key);
    }
    const needed = new Set([
      ...this.completed.values(),
      ...this.partitionTails.values(),
      ...this.replicaTails.values(),
      ...this.assignmentTails.values(),
      ...this.consumerAssignmentTails.values(),
    ]);
    for (const job of [...this.queue, ...this.active])
      job.dependencies.forEach((id) => needed.add(id));
    for (const meta of this.pipelines.values())
      [
        meta.produced,
        meta.ack,
        ...meta.replicas,
        ...meta.deliveries.values(),
      ].forEach((id) => needed.add(id));
    for (const id of this.done) if (!needed.has(id)) this.done.delete(id);
  }
  visible(job) {
    const e = job.event,
      v = this.diagram.view;
    if (!DURATIONS[e.stage] || e.stage === "ACKNOWLEDGED") return false;
    if (e.stage === "COMMITTED" && !v.commits) return false;
    if (e.stage === "REPLICATED" && !v.replication) return false;
    return (
      !!this.diagram.layout?.nodes.has(e.source) &&
      !!this.diagram.layout?.nodes.has(e.destination || e.source)
    );
  }
  routesConflict(a, b) {
    // Reserve the entire swept packet corridor; crossing routes wait instead of hiding labels.
    const segments = (route) =>
      route.points.slice(1).map((p, i) => ({
        left: Math.min(p[0], route.points[i][0]) - 41,
        right: Math.max(p[0], route.points[i][0]) + 41,
        top: Math.min(p[1], route.points[i][1]) - 24,
        bottom: Math.max(p[1], route.points[i][1]) + 24,
      }));
    return segments(a).some((x) =>
      segments(b).some(
        (y) =>
          x.left < y.right &&
          x.right > y.left &&
          x.top < y.bottom &&
          x.bottom > y.top,
      ),
    );
  }
  makePacket(job) {
    const e = job.event,
      g = document.createElementNS(ns, "g");
    g.setAttribute(
      "class",
      "packet " +
        (e.stage === "COMMITTED"
          ? "commit"
          : e.stage === "RETRY"
            ? "retry"
            : e.stage.includes("FAILED")
              ? "failed"
              : ""),
    );
    Object.assign(g.dataset, {
      stage: e.stage,
      message: e.messageId,
      source: e.source,
      destination: e.destination,
    });
    const rect = document.createElementNS(ns, "rect");
    for (const [k, v] of Object.entries({
      x: -33,
      y: -16,
      width: 66,
      height: 32,
      rx: 2,
    }))
      rect.setAttribute(k, v);
    rect.setAttribute(
      "fill",
      e.stage === "PRODUCED"
        ? "#828384"
        : e.stage.includes("FAILED")
          ? "#ce3434"
          : partitionColor(e.partitionKey),
    );
    const text = document.createElementNS(ns, "text");
    text.setAttribute("fill", "white");
    text.setAttribute("y", "1");
    text.textContent =
      e.stage === "ASSIGNMENT"
        ? "P" + e.partitionKey.split(":")[1] + " → " + e.destinationName
        : e.stage === "COMMITTED"
        ? "✓ " + e.committedNext
        : e.stage === "RETRY"
          ? "↻ " + e.messageId
          : e.stage.includes("FAILED")
            ? "× " + (e.messageId || "error")
            : e.messageId;
    if (text.textContent.length > 6) text.style.fontSize = "13px";
    if (e.stage === "ASSIGNMENT") text.textContent = "Assign P" + e.partitionKey.split(":")[1];
    const title = document.createElementNS(ns, "title");
    title.textContent = e.description;
    g.append(rect, text, title);
    document.getElementById("packets").append(g);
    return g;
  }
  frame(now, running, held = false) {
    const delta = Math.max(0, Math.min(100, now - this.previous));
    this.previous = now;
    const advancing = !held && (running || this.step);
    if (advancing) {
      this.clock += delta * this.speed;
      for (const job of [...this.queue]) {
        if (!job.dependencies.every((id) => this.done.has(id))) continue;
        if (!this.visible(job)) {
          this.queue.splice(this.queue.indexOf(job), 1);
          this.callbacks.start?.(job.event);
          this.finish(job);
          continue;
        }
        const e = job.event;
        // Completion is a timed state change in the existing consumer tile, not a second delivery.
        if (e.stage === "PROCESSED") {
          this.queue.splice(this.queue.indexOf(job), 1);
          this.callbacks.start?.(e);
          job.local = true;
          this.active.push(job);
          continue;
        }
        job.route = this.diagram.route(
          e.destination ? e : { ...e, destination: e.source },
        );
        if (!job.route) {
          this.queue.splice(this.queue.indexOf(job), 1);
          this.callbacks.start?.(e);
          this.finish(job);
          continue;
        }
        if (
          this.active.length >= 8 ||
          this.active.some((j) => !j.local && this.routesConflict(j.route, job.route))
        )
          continue;
        this.queue.splice(this.queue.indexOf(job), 1);
        this.callbacks.start?.(e);
        job.element = this.makePacket(job);
        job.stationary = this.reduced || e.stage.includes("FAILED");
        job.point = job.route.point(0);
        this.diagram.showPath(job);
        this.active.push(job);
      }
    }
    this.active = this.active.filter((job) => {
      if (job.local) {
        if (advancing) job.elapsed += delta * this.speed;
        if (job.elapsed < job.duration) return true;
        this.finish(job);
        return false;
      }
      const route = this.diagram.route(
        job.event.destination
          ? job.event
          : { ...job.event, destination: job.event.source },
      );
      if (!route) {
        this.finish(job, true);
        return false;
      }
      job.route = route;
      job.pathElement?.setAttribute("d", route.d);
      if (advancing) job.elapsed += delta * this.speed;
      if (!job.stationary && !job.pathElement?.isConnected)
        this.diagram.showPath(job);
      const progress = Math.min(1, job.elapsed / job.duration);
      job.point = route.point(job.stationary ? 1 : progress);
      job.element.setAttribute(
        "transform",
        "translate(" + job.point.x + "," + job.point.y + ")",
      );
      if (progress >= 1) {
        this.finish(job);
        return false;
      }
      return true;
    });
    if (this.idle) {
      this.step = false;
      this.pruneCompleted();
    }
    document.getElementById("replay-status").textContent =
      "Flow: " +
      (this.queue.length + this.active.length) +
      " individual stages" +
      (this.obsolete
        ? " · " + this.obsolete + " obsolete ownership routes canceled"
        : "");
    document.body.classList.toggle("paused", !advancing);
  }
  get stats() {
    return {
      queue: this.queue.length,
      active: this.active.length,
      clock: this.clock,
      finished: this.finished,
      obsolete: this.obsolete,
      idle: this.idle,
    };
  }
}
