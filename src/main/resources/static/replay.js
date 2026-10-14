import { partitionColor } from "./diagram-layout.js";
const ns = "http://www.w3.org/2000/svg";
const MOVING = new Set([
  "PRODUCED",
  "REPLICATED",
  "DELIVERED",
  "PROCESSED",
  "COMMITTED",
  "RETRY",
  "FAILED",
  "COMMIT_FAILED",
  "ACKNOWLEDGED",
]);
const durations = {
  PRODUCED: 850,
  REPLICATED: 750,
  DELIVERED: 1100,
  PROCESSED: 500,
  COMMITTED: 850,
  RETRY: 650,
  FAILED: 650,
  COMMIT_FAILED: 650,
  ACKNOWLEDGED: 0,
};

/** Replays real events; never advances engine time. Dependencies preserve causal stage order. */
export class Replay {
  constructor(diagram) {
    this.diagram = diagram;
    this.speed = 1;
    this.clock = 0;
    this.previous = performance.now();
    this.queue = [];
    this.active = [];
    this.done = new Set();
    this.pipelines = new Map();
    this.completed = new Map();
    this.summarized = 0;
    this.obsolete = 0;
    this.step = false;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    this.clock = 0;
    this.previous = performance.now();
    this.step = false;
    this.lastPrune = 0;
    this.summarized = this.obsolete = 0;
    document.getElementById("packets").replaceChildren();
    document.getElementById("active-paths").replaceChildren();
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
    if (!MOVING.has(event.stage) || !event.source) return;
    const key = event.messageId;
    const meta = this.pipelines.get(key) || {
      replicas: [],
      deliveries: new Map(),
    };
    const deliveryKey = event.groupId + "|" + event.generation;
    let dependencies = [];
    if (event.stage === "REPLICATED")
      dependencies = meta.produced ? [meta.produced] : [];
    if (event.stage === "ACKNOWLEDGED")
      dependencies = [meta.produced, ...meta.replicas].filter(Boolean);
    if (event.stage === "DELIVERED")
      dependencies = meta.ack
        ? [meta.ack]
        : [meta.produced, ...meta.replicas].filter(Boolean);
    if (["PROCESSED", "FAILED", "RETRY"].includes(event.stage) && event.groupId)
      dependencies = [meta.deliveries.get(deliveryKey)].filter(Boolean);
    if (event.stage === "COMMITTED")
      dependencies = [
        this.completed.get(event.groupId + "|" + event.partitionKey),
      ].filter(Boolean);
    const job = {
      event,
      dependencies,
      ids: [event.id],
      messages: event.messageId ? [event.messageId] : [],
      count: 1,
      duration: durations[event.stage],
      elapsed: 0,
    };
    if (event.stage === "PRODUCED") meta.produced = event.id;
    if (event.stage === "REPLICATED") meta.replicas.push(event.id);
    if (event.stage === "ACKNOWLEDGED") meta.ack = event.id;
    if (event.stage === "DELIVERED") meta.deliveries.set(deliveryKey, event.id);
    if (event.stage === "PROCESSED")
      this.completed.set(event.groupId + "|" + event.partitionKey, event.id);
    if (key) this.pipelines.set(key, meta);
    // Only queued traffic is combined, so an already moving packet never changes identity.
    if (
      this.queue.length > 60 &&
      !["FAILED", "RETRY", "ACKNOWLEDGED"].includes(event.stage)
    ) {
      const match = this.queue.find(
        (j) =>
          j.event.stage === event.stage &&
          j.event.source === event.source &&
          j.event.destination === event.destination &&
          j.event.partitionKey === event.partitionKey &&
          j.event.groupId === event.groupId &&
          j.event.generation === event.generation,
      );
      if (match) {
        match.ids.push(event.id);
        match.messages.push(...job.messages);
        match.count++;
        match.dependencies.push(...dependencies);
        if (event.stage === "COMMITTED") match.event = event;
        this.summarized++;
        return;
      }
    }
    this.queue.push(job);
    if (this.queue.length > 250) {
      const removed = this.queue.shift();
      this.finish(removed);
      this.summarized += removed.count;
    }
    if (this.pipelines.size > 1200)
      [...this.pipelines.keys()]
        .slice(0, 300)
        .forEach((k) => this.pipelines.delete(k));
  }
  finish(job, obsolete = false) {
    job.ids.forEach((id) => this.done.add(id));
    job.element?.remove();
    job.pathElement?.remove();
    if (obsolete) this.obsolete += job.count;
    if (this.done.size > 6000 && this.clock - (this.lastPrune || 0) > 10000) {
      this.pruneCompleted();
      this.lastPrune = this.clock;
    }
  }
  pruneCompleted() {
    // Retain every dependency still needed by a queued stage or recent message pipeline.
    const needed = new Set(this.completed.values());
    for (const job of [...this.queue, ...this.active])
      job.dependencies.forEach((id) => needed.add(id));
    for (const meta of this.pipelines.values()) {
      [
        meta.produced,
        meta.ack,
        ...meta.replicas,
        ...meta.deliveries.values(),
      ].forEach((id) => needed.add(id));
    }
    this.done.forEach((id) => {
      if (!needed.has(id)) this.done.delete(id);
    });
  }
  visible(job) {
    const { event: e } = job,
      v = this.diagram.view;
    if (e.stage === "ACKNOWLEDGED") return false;
    if (e.stage === "COMMITTED" && !v.commits) return false;
    if (e.stage === "REPLICATED" && !v.replication) return false;
    return (
      !!this.diagram.layout?.nodes.has(e.source) &&
      !!this.diagram.layout?.nodes.has(e.destination || e.source)
    );
  }
  channel(job) {
    return ["PRODUCED", "REPLICATED", "DELIVERED", "COMMITTED"].includes(
      job.event.stage,
    )
      ? job.event.stage
      : job.event.source;
  }
  makePacket(job) {
    const e = job.event;
    const g = document.createElementNS(ns, "g");
    g.setAttribute(
      "class",
      `packet ${e.stage === "COMMITTED" ? "commit" : e.stage === "RETRY" ? "retry" : e.stage.includes("FAILED") ? "failed" : ""}`,
    );
    g.dataset.stage = e.stage;
    g.dataset.message = e.messageId;
    g.dataset.source = e.source;
    g.dataset.destination = e.destination;
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", "-33");
    rect.setAttribute("y", "-16");
    rect.setAttribute("width", "66");
    rect.setAttribute("height", "32");
    rect.setAttribute("rx", "2");
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
      e.stage === "COMMITTED"
        ? "✓ " + e.committedNext
        : e.stage.includes("FAILED")
          ? "× " + (e.messageId || "error")
          : e.stage === "RETRY"
            ? "↻ " + e.messageId
            : e.messageId;
    if (job.count > 1) {
      text.textContent =
        (e.stage === "COMMITTED" ? "✓ " + e.committedNext : e.messageId) +
        " +" +
        (job.count - 1);
      text.style.fontSize = "13px";
    }
    const title = document.createElementNS(ns, "title");
    title.textContent = `Replay · tick ${e.tick} · ${e.description}${job.count > 1 ? " · Bundle: " + job.messages.join(", ") : ""}`;
    g._baseTitle = title.textContent;
    g.append(rect, text, title);
    document.getElementById("packets").append(g);
    return g;
  }
  frame(now, running) {
    const delta = Math.min(100, now - this.previous);
    this.previous = now;
    const advancing = running || this.step;
    if (advancing) {
      this.clock += delta * this.speed;
      // One packet per shared stage trunk prevents racing labels and crossing wire bundles.
      for (const job of [...this.queue]) {
        if (!job.dependencies.every((id) => this.done.has(id))) continue;
        if (!this.visible(job)) {
          this.queue.splice(this.queue.indexOf(job), 1);
          this.finish(job);
          continue;
        }
        if (
          this.active.length >= 8 ||
          this.active.some((j) => this.channel(j) === this.channel(job))
        )
          continue;
        const event = job.event;
        job.stationary = this.reduced || event.stage.includes("FAILED");
        job.route = this.diagram.route(
          event.destination ? event : { ...event, destination: event.source },
        );
        if (!job.route) {
          this.queue.splice(this.queue.indexOf(job), 1);
          this.finish(job);
          continue;
        }
        const point = job.route.point(0);
        if (
          this.active.some(
            (j) =>
              j.point &&
              Math.abs(j.point.x - point.x) < 78 &&
              Math.abs(j.point.y - point.y) < 42,
          )
        )
          continue;
        this.queue.splice(this.queue.indexOf(job), 1);
        job.element = this.makePacket(job);
        job.point = point;
        this.diagram.showPath(job);
        this.active.push(job);
      }
    }
    this.active = this.active.filter((job) => {
      if (!this.visible(job)) {
        this.finish(job, true);
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
        `translate(${job.point.x},${job.point.y})`,
      );
      if (progress >= 1) {
        this.finish(job);
        return false;
      }
      return true;
    });
    if (advancing && !running && !this.queue.length && !this.active.length)
      this.step = false;
    // Collapse labels only at actual crossing points; underlying events remain separate.
    const visible = [];
    for (const job of this.active) {
      const collision = visible.find(
        (j) =>
          j.point &&
          job.point &&
          Math.abs(j.point.x - job.point.x) < 74 &&
          Math.abs(j.point.y - job.point.y) < 38,
      );
      job.element.style.visibility = collision ? "hidden" : "visible";
      if (!collision) visible.push(job);
    }
    // Mark temporarily shared crossings explicitly instead of drawing overlapping IDs.
    for (const job of visible) {
      const nearby = this.active.filter(
        (j) =>
          j !== job &&
          j.point &&
          Math.abs(j.point.x - job.point.x) < 74 &&
          Math.abs(j.point.y - job.point.y) < 38,
      );
      const count = nearby.length;
      const text = job.element.querySelector("text");
      text.style.fontSize = count || job.count > 1 ? "13px" : "16px";
      job.element.querySelector("title").textContent =
        job.element._baseTitle +
        (count
          ? " · Shared crossing: " +
            nearby.map((j) => j.event.description).join(" | ")
          : "");
      if (count)
        text.textContent =
          (job.event.messageId || "✓ " + job.event.committedNext) +
          " ×" +
          (count + 1);
      else
        text.textContent =
          job.count > 1
            ? (job.event.stage === "COMMITTED"
                ? "✓ " + job.event.committedNext
                : job.event.messageId) +
              " +" +
              (job.count - 1)
            : job.event.stage === "COMMITTED"
              ? "✓ " + job.event.committedNext
              : job.event.stage.includes("FAILED")
                ? "× " + (job.event.messageId || "error")
                : job.event.stage === "RETRY"
                  ? "↻ " + job.event.messageId
                  : job.event.messageId;
    }
    document.getElementById("replay-status").textContent =
      `Replay: ${this.queue.length + this.active.length} stages · ${this.summarized} bundled/summarized${this.obsolete ? " · " + this.obsolete + " obsolete routes canceled" : ""}`;
    document.body.classList.toggle("paused", !running && !this.step);
  }
  get stats() {
    return {
      queue: this.queue.length,
      active: this.active.length,
      clock: this.clock,
      summarized: this.summarized,
      obsolete: this.obsolete,
    };
  }
}
