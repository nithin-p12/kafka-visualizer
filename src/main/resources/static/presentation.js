/** Messages and positions change at visible stage boundaries, never on future snapshots. */
export class Presentation {
  constructor() {
    this.reset();
  }
  reset() {
    this.raw = null;
    this.logs = new Map();
    this.ends = new Map();
    this.workers = new Map();
    this.commits = new Map();
    this.histories = new Map();
    this.departures = new Map();
    this.generations = new Map();
  }
  sync(state, seed = false) {
    this.raw = state;
    for (const b of state.brokers)
      for (const r of b.replicas) {
        if (!this.logs.has(r.nodeId)) {
          this.logs.set(r.nodeId, new Map());
          this.ends.set(r.nodeId, 0);
        }
        if (seed) {
          this.logs.set(
            r.nodeId,
            new Map(r.messages.map((m) => [m.offset, m])),
          );
          this.ends.set(r.nodeId, r.replicaEnd);
        }
      }
    for (const g of state.groups) {
      const changed =
        this.generations.has(g.id) &&
        this.generations.get(g.id) !== g.generation;
      this.generations.set(g.id, g.generation);
      for (const c of g.consumers) {
        if (!this.workers.has(c.id))
          this.workers.set(c.id, {
            processing: null,
            failed: false,
            successes: 0,
            retries: 0,
            redeliveries: 0,
            fetched: new Map(),
            completed: new Map(),
            owned: new Set(),
          });
        const w = this.workers.get(c.id);
        if (changed || !c.online) {
          w.processing = null;
          w.failed = false;
          w.fetched.clear();
          w.completed.clear();
          w.owned.clear();
        }
        if (seed)
          Object.assign(w, {
            owned: new Set(c.assignments),
            processing: c.processing,
            successes: c.successes,
            retries: c.retries,
            redeliveries: c.redeliveries,
          });
      }
      if (seed)
        for (const o of g.offsets) {
          this.commits.set(g.id + "|" + o.key, o.committedNext);
          const w = this.workers.get(o.ownerId);
          if (w) {
            w.fetched.set(o.key, o.fetchedNext);
            w.completed.set(o.key, o.completedNext);
          }
        }
    }
  }
  seedHistory(state) {
    for (const g of state.groups)
      for (const c of g.consumers)
        this.histories.set(
          c.id,
          (state.events || [])
            .filter(
              (e) =>
                e.stage === "PROCESSED" &&
                e.source === "consumer:" + c.id &&
                e.groupId === g.id,
            )
            .slice(-20),
        );
  }
  announce(e) {
    if (e.stage === "PRODUCED" && e.message) {
      const id = e.message.producerId,
        entries = this.departures.get(id) || [];
      entries.push({
        ...e.message,
        requested: true,
        status: "Waiting to depart",
      });
      this.departures.set(id, entries);
    }
  }
  start(e) {
    if (e.stage === "PRODUCED")
      this.departures.set(
        e.message.producerId,
        (this.departures.get(e.message.producerId) || []).filter(
          (m) => m.id !== e.messageId,
        ),
      );
  }
  finish(e) {
    if (["PRODUCED", "REPLICATED"].includes(e.stage) && e.message) {
      const log = this.logs.get(e.destination);
      if (log) {
        log.set(e.offset, e.message);
        this.ends.set(
          e.destination,
          Math.max(this.ends.get(e.destination) || 0, e.offset + 1),
        );
      }
    }
    const id =
        ["DELIVERED", "ASSIGNMENT"].includes(e.stage) ? e.destination.slice(9) : e.source?.slice(9),
      w = this.workers.get(id);
    if (w) {
      if (e.stage === "ASSIGNMENT") w.owned.add(e.partitionKey);
      if (e.stage === "DELIVERED") {
        w.processing = {
          message: e.message,
          partitionKey: e.partitionKey,
          progress: 0,
        };
        w.failed = false;
        w.fetched.set(e.partitionKey, e.offset + 1);
      }
      if (e.stage === "FAILED") w.failed = true;
      if (e.stage === "RETRY") {
        w.failed = false;
        w.retries++;
      }
      if (e.stage === "REDELIVERED") w.redeliveries++;
      if (e.stage === "PROCESSED") {
        w.processing = null;
        w.failed = false;
        w.successes++;
        w.completed.set(e.partitionKey, e.offset + 1);
        const recent = this.histories.get(id) || [];
        recent.push(e);
        this.histories.set(id, recent.slice(-20));
      }
    }
    if (e.stage === "COMMITTED")
      this.commits.set(e.groupId + "|" + e.partitionKey, e.committedNext);
  }
  settle() {
    if (!this.raw) return;
    for (const b of this.raw.brokers)
      for (const r of b.replicas) {
        const log = this.logs.get(r.nodeId);
        for (const offset of log.keys())
          if (offset < r.replicaStart) log.delete(offset);
        // Recovery and initial history do not have per-record events.
        for (const m of r.messages) log.set(m.offset, m);
        this.ends.set(r.nodeId, r.replicaEnd);
      }
    for (const g of this.raw.groups) {
      for (const c of g.consumers)
        Object.assign(this.workers.get(c.id), {
          owned: new Set(c.assignments),
          processing: c.processing,
          successes: c.successes,
          retries: c.retries,
          redeliveries: c.redeliveries,
          failed: c.status === "FAILED",
        });
      for (const o of g.offsets) {
        this.commits.set(g.id + "|" + o.key, o.committedNext);
        const w = this.workers.get(o.ownerId);
        if (w) {
          w.fetched.set(o.key, o.fetchedNext);
          w.completed.set(o.key, o.completedNext);
        }
      }
    }
  }
  snapshot() {
    if (!this.raw) return null;
    const state = structuredClone(this.raw);
    for (const b of state.brokers)
      for (const r of b.replicas) {
        r.messages = [...(this.logs.get(r.nodeId)?.values() || [])]
          .sort((a, b) => a.offset - b.offset)
          .slice(-8);
        r.replicaEnd = this.ends.get(r.nodeId) || 0;
        const leader = "replica:" + r.key + ":" + r.leaderId;
        r.logEnd =
          this.ends.get(leader) ??
          Math.max(
            0,
            ...state.brokers
              .flatMap((b) => b.replicas)
              .filter((x) => x.key === r.key)
              .map((x) => this.ends.get(x.nodeId) || 0),
          );
      }
    for (const g of state.groups) {
      for (const c of g.consumers) {
        const w = this.workers.get(c.id);
        const assignmentCount = c.assignments.length;
        const processing = w.processing ? structuredClone(w.processing) : null;
        if (processing && c.processing?.message.id === processing.message.id)
          processing.progress = c.processing.progress;
        Object.assign(c, {
          assignments: [...w.owned],
          processing,
          successes: w.successes,
          retries: w.retries,
          redeliveries: w.redeliveries,
        });
        if (c.online && !c.paused && !g.rebalancing)
          c.status = w.processing
            ? w.failed
              ? "FAILED"
              : "PROCESSING"
            : c.assignments.length < assignmentCount
              ? "ASSIGNING"
              : c.assignments.length ? "WAITING" : "IDLE";
      }
      for (const o of g.offsets) {
        const w = this.workers.get(o.ownerId),
          r = state.brokers
            .flatMap((b) => b.replicas)
            .find((r) => r.key === o.key);
        o.logEnd = r?.logEnd || 0;
        o.committedNext = this.commits.get(g.id + "|" + o.key) ?? null;
        o.fetchedNext =
          w?.fetched.get(o.key) ?? (o.ownerId ? o.committedNext || 0 : null);
        o.completedNext =
          w?.completed.get(o.key) ?? (o.ownerId ? o.committedNext || 0 : null);
        o.lag = Math.max(0, o.logEnd - (o.committedNext || 0));
      }
      g.lag = g.offsets.reduce((sum, o) => sum + o.lag, 0);
      // Attribute committed-offset lag only to partitions whose ownership has visibly arrived.
      for (const c of g.consumers)
        c.lag = g.offsets.filter(o => o.ownerId === c.id && c.assignments.includes(o.key))
          .reduce((sum, o) => sum + o.lag, 0);
    }
    state.producerQueues = (state.producerQueues || []).map((q) => ({
      ...q,
      messages: [
        ...(this.departures.get(q.producerId) || []),
        ...q.messages,
      ].slice(0, 10),
    }));
    return state;
  }
}
