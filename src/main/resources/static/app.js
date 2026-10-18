import { Diagram, esc } from "./diagram.js";
import { Replay } from "./replay.js";
import { Presentation } from "./presentation.js";
const $ = (id) => document.getElementById(id),
  clone = (x) => structuredClone(x);
const stages = {
  PRODUCED: "→ Produced",
  REPLICATED: "⇢ Replicated",
  ACKNOWLEDGED: "✓ Acknowledged",
  DELIVERED: "→ Polled",
  PROCESSING: "◉ Processing",
  PROCESSED: "✓ Processed",
  FAILED: "× Failed",
  RETRY: "↻ Retry",
  COMMITTED: "✓ Committed",
  COMMIT_FAILED: "× Commit failed",
  REDELIVERED: "↺ Redelivery",
  REBALANCE: "⇄ Rebalance",
  RETENTION: "⚠ Retention",
  OFFLINE: "● Offline",
};
let state,
  draft,
  dirty = false,
  draftBaseRevision,
  scenarios = [],
  lastEventId = 0,
  currentEpoch;
let eventLog = [],
  currentTab = "events",
  selectedReplica,
  historyPage = 0,
  historyRequest = 0;
let actionQueue = Promise.resolve(),
  pollBusy = false,
  configEditorRevision = -1,
  lastError,
  noticeTimer;
const presentation = new Presentation();
const pendingActions = new Map();
let pendingStep = false,
  stepRequestBusy = false;
let visualDirty = false,
  playbackBusy = false,
  ownsPlayback = false,
  nextTickAt = 0;
const clientId =
  sessionStorage.getItem("kafka-playback-client") || crypto.randomUUID();
sessionStorage.setItem("kafka-playback-client", clientId);
const diagram = new Diagram($("architecture"), $("architecture-viewport")),
  replay = new Replay(diagram, {
    start: (e) => {
      presentation.start(e);
      visualDirty = true;
    },
    finish: (e) => {
      presentation.finish(e);
      visualDirty = true;
    },
    cancel: () => {
      visualDirty = true;
    },
  });
const view = {
  topic: "",
  group: "",
  followers: true,
  replication: true,
  commits: false,
};
try {
  const saved = JSON.parse(localStorage.getItem("kafka-view") || "null");
  for (const key of ["followers", "replication", "commits"])
    if (typeof saved?.[key] === "boolean") view[key] = saved[key];
} catch {}
function saveView() {
  try {
    localStorage.setItem("kafka-view", JSON.stringify(view));
  } catch {}
}
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => ($("notice").hidden = true),
    error ? 9000 : 4000,
  );
}
async function api(path, options = {}) {
  const response = await fetch("/api/simulation" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.message || data.detail || "Request failed (" + response.status + ")",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
function action(task) {
  actionQueue = actionQueue.then(task).catch((e) => notice(e.message, true));
  return actionQueue;
}
function command(type, targetId, extra = {}) {
  if (["RESET", "RESUME", "START", "PAUSE", "PRODUCE"].includes(type))
    pendingStep = false;
  if (type === "PRODUCE") {
    const q = state?.producerQueues.find((q) => q.producerId === targetId);
    if (
      !q ||
      q.messages.filter((m) => m.requested).length +
        (pendingActions.get(targetId) || 0) >=
        10
    )
      return Promise.resolve();
    pendingActions.set(targetId, (pendingActions.get(targetId) || 0) + 1);
    updateModes();
  }
  return action(async () => {
    try {
      if (type === "RESET") replay.reset();
      const data = await api("/commands", {
        method: "POST",
        body: JSON.stringify({ type, targetId, ...extra }),
      });
      receive(data);
      if (type === "PAUSE") replay.step = false;
      if (type === "STEP" || (type === "PRODUCE" && !data.running))
        replay.step = true;
    } finally {
      if (type === "PRODUCE") {
        pendingActions.set(
          targetId,
          Math.max(0, (pendingActions.get(targetId) || 0) - 1),
        );
        updateModes();
      }
    }
  });
}
function receive(next) {
  if (state && next.revision < state.revision) return;
  const first = !state;
  const newEpoch = currentEpoch !== next.epoch;
  // A reset deliberately discards the previous epoch's events. Its ID gap is
  // not a disconnected client and must not seed future records into the UI.
  const eventGap = next.eventGap && !newEpoch;
  if (newEpoch || eventGap) {
    replay.reset();
    presentation.reset();
    currentEpoch = next.epoch;
    lastEventId = 0;
    eventLog = [];
    selectedReplica = null;
    if ($("inspector").open) $("inspector").close();
  }
  if (
    state?.running &&
    !next.running &&
    next.scenarioId === 6 &&
    next.scenarioPhase === 3
  )
    replay.step = true;
  state = next;
  const seed = (first && next.messageCount > 0) || eventGap;
  presentation.sync(next, seed);
  if (seed) presentation.seedHistory(next);
  if (!dirty) {
    draft = clone(next.configuration);
    draftBaseRevision = next.configRevision;
  }
  if (eventGap) {
    notice(
      "Reconnected: existing retained history loaded. New messages will animate individually.",
    );
  }
  for (const event of next.events.filter((e) => e.id > lastEventId)) {
    eventLog.push(event);
    if (!seed) {
      presentation.announce(event);
      replay.enqueue(event);
    }
  }
  if (next.playbackPaused && !pendingStep) replay.step = false;
  else if (!replay.idle) replay.step = true;
  if (replay.idle) presentation.settle();
  eventLog = eventLog.slice(-200);
  lastEventId = Math.max(lastEventId, next.latestEventId);
  render();
  lastError = null;
}
function setHtml(el, html) {
  if (el.innerHTML !== html) el.innerHTML = html;
}
function options(items, selected, emptyLabel = null) {
  return (
    (emptyLabel ? '<option value="">' + esc(emptyLabel) + "</option>" : "") +
    items
      .map((item) => {
        const id = typeof item === "string" ? item : item.id,
          name = typeof item === "string" ? item : item.name;
        return (
          '<option value="' +
          esc(id) +
          '" ' +
          (id === selected ? "selected" : "") +
          ">" +
          esc(name) +
          "</option>"
        );
      })
      .join("")
  );
}
function partitionLabel(key) {
  return diagram.partitionName(key);
}
function renderFilters() {
  const t = $("topic-filter").value,
    g = $("group-filter").value,
    p = $("manual-producer").value;
  setHtml(
    $("topic-filter"),
    options(state.configuration.topics, t, "All topics"),
  );
  setHtml(
    $("group-filter"),
    options(state.configuration.groups, g, "All groups"),
  );
  setHtml(
    $("manual-producer"),
    options(
      state.configuration.producers,
      p || state.configuration.producers[0].id,
    ),
  );
  view.topic = $("topic-filter").value;
  view.group = $("group-filter").value;
}
function renderArchitecture() {
  if (state)
    diagram.update(
      presentation.snapshot(),
      view,
      presentation.histories,
      null,
      selectedReplica,
    );
}
function updateModes() {
  const auto = state.configuration.producers.every((p) => p.automatic),
    manual = state.configuration.producers.every((p) => !p.automatic);
  $("auto-mode").classList.toggle("selected", auto);
  $("manual-mode").classList.toggle("selected", manual);
  $("quick-produce").hidden = !manual;
  const q = state.producerQueues.find(
    (q) => q.producerId === $("manual-producer").value,
  );
  const full =
    q &&
    q.messages.filter((m) => m.requested).length +
      (pendingActions.get(q.producerId) || 0) >=
      10;
  $("quick-produce").disabled = $("produce").disabled = !!full;
  document.querySelector(".manual-fields").hidden = !manual;
  $("production-mode-hint").textContent = auto
    ? "Automatic publishing uses each producer’s rate."
    : manual
      ? "Publish with Produce One, the selected producer, or N."
      : "Mixed producer settings. Choose Auto or Manual to change all producers.";
}
function render() {
  if (!dirty && configEditorRevision !== state.configRevision) renderEditor();
  renderFilters();
  renderArchitecture();
  if (!$("bottom-panel").hidden) renderPanel();
  updateSliders();
  updateModes();
  $("playback").textContent =
    state.canAdvance || (!replay.idle && replay.step) ? "Ⅱ Pause" : "▶ Resume";
  $("step").disabled = state.canAdvance || pendingStep;
  const c = state.configuration,
    factors = c.topics.map((t) => t.replicationFactor);
  const rf =
    Math.min(...factors) === Math.max(...factors)
      ? factors[0]
      : Math.min(...factors) + "–" + Math.max(...factors);
  const mode = c.producers.every((p) => p.automatic)
    ? "Auto"
    : c.producers.every((p) => !p.automatic)
      ? "Manual"
      : "Mixed";
  const scenario = scenarios.find((s) => s.id === state.scenarioId);
  const summary = scenario
    ? "Scenario " + scenario.id + ": " + scenario.name
    : "Custom · " +
      c.brokers.length +
      " brokers · " +
      c.topics.length +
      " topics · " +
      c.topics.reduce((n, t) => n + t.partitions, 0) +
      " partitions · RF " +
      rf +
      " · " +
      c.producers.length +
      " prod · " +
      c.consumers.length +
      " cons · " +
      c.groups.length +
      " groups · " +
      mode;
  $("setup-summary").textContent = summary;
  $("setup-summary").title =
    summary + (state.manualStatus ? " · " + state.manualStatus : "");
  $("clock").textContent =
    "Tick " + state.tick + " · " + (state.tick / 10).toFixed(1) + "s";
  if (selectedReplica && $("inspector").open) renderInspector(false);
}
function renderPanel() {
  const state = presentation.snapshot();
  let html;
  if (currentTab === "events")
    html =
      eventLog
        .slice()
        .reverse()
        .map(
          (e) =>
            `<div class="event-row"><span class="event-time">${(e.tick / 10).toFixed(1)}s</span><span class="event-stage ${esc(e.stage)}">${esc(stages[e.stage] || e.stage)}</span><span>${esc(e.description)}</span></div>`,
        )
        .join("") ||
      '<p class="hint">Start or produce one message to watch events.</p>';
  else if (currentTab === "offsets")
    html = `<table><thead><tr><th>Group</th><th>Topic / partition</th><th>Owner</th><th>Fetched next</th><th>Completed next</th><th>✓ Committed next</th><th>Log end</th><th>⚠ Lag</th><th>Expired</th></tr></thead><tbody>${state.groups.flatMap((g) => g.offsets.map((o) => `<tr><td>${esc(g.id)}</td><td>${esc(o.topicName)} / P${o.partition}</td><td>${esc(o.ownerName)}</td><td>${o.fetchedNext ?? "—"}</td><td>${o.completedNext ?? "—"}</td><td class="commit">${o.committedNext ?? "not committed"}</td><td>${o.logEnd}</td><td class="lag">${o.lag}</td><td>${o.expiredBacklog}</td></tr>`)).join("")}</tbody></table>`;
  else
    html = `<table><thead><tr><th>Consumer</th><th>Group</th><th>Status</th><th>Current message</th><th>✓ Processed</th><th>↻ Retries</th><th>↺ Redeliveries</th></tr></thead><tbody>${state.groups.flatMap((g) => g.consumers.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(g.id)}</td><td>${esc(c.status)}</td><td>${esc(c.processing?.message.id || "—")}</td><td>${c.successes}</td><td>${c.retries}</td><td>${c.redeliveries}</td></tr>`)).join("")}</tbody></table>`;
  setHtml($("panel-content"), html);
}
function updateSliders() {
  for (const [type, items] of [
    ["producer", state.configuration.producers],
    ["consumer", state.configuration.consumers],
  ]) {
    const uniform = items.every((x) => x.rate === items[0].rate);
    if (document.activeElement !== $(type + "-speed"))
      $(type + "-speed").value = items[0].rate;
    $(type + "-speed-value").textContent = uniform
      ? `${items[0].rate} msg/s`
      : "per instance";
  }
}

function renderEditor() {
  if (!draft) return;
  configEditorRevision = state.configRevision;
  const section = (name, key, rows, limit) =>
    `<details class="config-section"><summary>${name}<span>${draft[key].length} / ${limit}</span></summary>${rows}<button class="add-button" data-add="${key}" ${draft[key].length >= limit ? "disabled" : ""}>＋ Add ${name.replace(/s$/, "").toLowerCase()}</button></details>`;
  const nameField = (key, item, i) =>
    `<div class="row-title"><input aria-label="${key} name" data-key="${key}" data-index="${i}" data-field="name" value="${esc(item.name)}" maxlength="80"><button class="remove" data-remove="${key}" data-index="${i}" aria-label="Delete ${esc(item.name)}">×</button></div>`;
  const brokers = draft.brokers
    .map(
      (b, i) => `<div class="editor-row">${nameField("brokers", b, i)}</div>`,
    )
    .join("");
  const topics = draft.topics
    .map(
      (t, i) =>
        `<div class="editor-row">${nameField("topics", t, i)}<label>Partitions <input type="number" min="1" max="10" data-key="topics" data-index="${i}" data-field="partitions" value="${t.partitions}"></label><label>Replication <input type="number" min="1" max="${draft.brokers.length}" data-key="topics" data-index="${i}" data-field="replicationFactor" value="${t.replicationFactor}"></label></div>`,
    )
    .join("");
  const producers = draft.producers
    .map(
      (p, i) =>
        `<div class="editor-row">${nameField("producers", p, i)}<label>Target topic <select data-key="producers" data-index="${i}" data-field="topicId">${options(draft.topics, p.topicId)}</select></label><label>Rate (msg/s) <input type="number" min=".25" max="10" step=".25" data-key="producers" data-index="${i}" data-field="rate" value="${p.rate}"></label><label>Auto publish <input type="checkbox" data-key="producers" data-index="${i}" data-field="automatic" ${p.automatic ? "checked" : ""}></label><label>Message key <input data-key="producers" data-index="${i}" data-field="key" value="${esc(p.key)}" placeholder="empty = round-robin"></label><label>Payload <input data-key="producers" data-index="${i}" data-field="payload" value="${esc(p.payload)}"></label></div>`,
    )
    .join("");
  const groups = draft.groups
    .map(
      (g, i) =>
        `<div class="editor-row"><div class="row-title"><input aria-label="Group ID" data-key="groups" data-index="${i}" data-field="groupId" value="${esc(g)}" maxlength="80"><button class="remove" data-remove="groups" data-index="${i}" aria-label="Delete ${esc(g)} group and its consumers">×</button></div></div>`,
    )
    .join("");
  const consumers = draft.consumers
    .map(
      (c, i) =>
        `<div class="editor-row">${nameField("consumers", c, i)}<label>Group ID <select data-key="consumers" data-index="${i}" data-field="groupId">${options(draft.groups, c.groupId)}</select></label><label>Rate (msg/s) <input type="number" min=".25" max="10" step=".25" data-key="consumers" data-index="${i}" data-field="rate" value="${c.rate}"></label><span class="hint">Subscribed topics</span><div class="subscriptions">${draft.topics.map((t) => `<label><input type="checkbox" data-key="consumers" data-index="${i}" data-field="topicIds" data-topic="${esc(t.id)}" ${c.topicIds.includes(t.id) ? "checked" : ""}>${esc(t.name)}</label>`).join("")}</div></div>`,
    )
    .join("");
  $("config-editor").innerHTML =
    section("Brokers", "brokers", brokers, 5) +
    section("Topics", "topics", topics, 3) +
    section("Producers", "producers", producers, 3) +
    section("Consumer groups", "groups", groups, 10) +
    section("Consumers", "consumers", consumers, 10) +
    `
    <details class="config-section"><summary>Offsets & retention</summary><div class="settings-grid"><label>Automatic safe commits <input type="checkbox" data-setting="autoCommit" ${draft.autoCommit ? "checked" : ""}></label><label>Commit interval (seconds)<input type="number" min=".1" max="60" step=".1" data-setting="commitIntervalTicks" value="${draft.commitIntervalTicks / 10}"></label><label>Records / partition<input type="number" min="1" max="500" data-setting="retentionLimit" value="${draft.retentionLimit}"></label></div></details>`;
  updateDraftStatus();
}
function requiresReset(next, old = state.configuration) {
  if (
    JSON.stringify(old.brokers.map((b) => b.id)) !==
    JSON.stringify(next.brokers.map((b) => b.id))
  )
    return true;
  return old.topics.some((t) => {
    const n = next.topics.find((x) => x.id === t.id);
    return (
      !n ||
      n.partitions < t.partitions ||
      n.replicationFactor !== t.replicationFactor
    );
  });
}
function updateDraftStatus() {
  $("draft-status").textContent = dirty
    ? "Unapplied draft"
    : "Live configuration";
  const reset = dirty && requiresReset(draft);
  $("apply").textContent = reset
    ? "Apply Configuration & Reset"
    : "Apply Configuration";
  $("apply-impact").textContent = reset
    ? "Topology change: applying clears messages and offsets and pauses the simulation. Partition decreases rebuild this simulation."
    : dirty
      ? "Apply preserves records and offsets. Membership, group and subscription edits trigger a rebalance. New group IDs have independent offsets."
      : "Edit names and subscriptions to model your services.";
  $("apply-impact").style.color = reset ? "var(--failure)" : "";
}
function editDraft(event) {
  const el = event.target,
    { key, index, field, setting } = el.dataset;
  if (!key && !setting) return;
  dirty = true;
  if (setting)
    draft[setting] =
      el.type === "checkbox"
        ? el.checked
        : setting === "commitIntervalTicks"
          ? Math.round(Number(el.value) * 10)
          : Number(el.value);
  else if (key === "groups") {
    const old = draft.groups[Number(index)];
    draft.groups[Number(index)] = el.value;
    draft.consumers.forEach((c) => {
      if (c.groupId === old) c.groupId = el.value;
    });
    if (event.type === "change") renderEditor();
  } else if (field === "topicIds") {
    const consumer = draft.consumers[Number(index)];
    consumer.topicIds = el.checked
      ? [...new Set([...consumer.topicIds, el.dataset.topic])]
      : consumer.topicIds.filter((t) => t !== el.dataset.topic);
  } else
    draft[key][Number(index)][field] =
      el.type === "checkbox"
        ? el.checked
        : el.type === "number"
          ? Number(el.value)
          : el.value;
  updateDraftStatus();
}
function newId(prefix) {
  return prefix + "_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
}
function modifyEntity(event) {
  const el = event.target.closest("button");
  if (!el) return;
  const key = el.dataset.add || el.dataset.remove;
  if (!key) return;
  if (el.dataset.add) {
    const count = draft[key].length + 1;
    if (key === "brokers")
      draft.brokers.push({ id: newId("b"), name: `Broker-${count}` });
    if (key === "topics")
      draft.topics.push({
        id: newId("t"),
        name: `topic-${count}`,
        partitions: 3,
        replicationFactor: Math.min(2, draft.brokers.length),
      });
    if (key === "producers")
      draft.producers.push({
        id: newId("p"),
        name: `ServiceProducer-${count}`,
        topicId: draft.topics[0].id,
        rate: 1,
        automatic: true,
        key: "",
        payload: "Service event",
      });
    if (key === "groups") draft.groups.push(`service-group-${count}`);
    if (key === "consumers")
      draft.consumers.push({
        id: newId("c"),
        name: `ResultsService-${count}`,
        groupId: draft.groups[0],
        topicIds: [draft.topics[0].id],
        rate: 1,
      });
  } else {
    const i = Number(el.dataset.index),
      item = draft[key][i];
    if (draft[key].length <= 1) {
      notice(
        `Keep at least one ${key === "groups" ? "group" : key.slice(0, -1)}.`,
        true,
      );
      return;
    }
    if (key === "groups" && draft.consumers.every((c) => c.groupId === item)) {
      notice(
        "Move at least one consumer to another group before deleting this group.",
        true,
      );
      return;
    }
    draft[key].splice(i, 1);
    if (key === "topics") {
      draft.producers.forEach((p) => {
        if (p.topicId === item.id) p.topicId = draft.topics[0].id;
      });
      draft.consumers.forEach((c) => {
        c.topicIds = c.topicIds.filter((id) => id !== item.id);
        if (!c.topicIds.length) c.topicIds = [draft.topics[0].id];
      });
    }
    if (key === "groups")
      draft.consumers = draft.consumers.filter((c) => c.groupId !== item);
    if (key === "brokers")
      draft.topics.forEach(
        (t) =>
          (t.replicationFactor = Math.min(
            t.replicationFactor,
            draft.brokers.length,
          )),
      );
  }
  dirty = true;
  renderEditor();
}
async function applyDraft() {
  const next = clone(draft),
    reset = requiresReset(next),
    revision = draftBaseRevision;
  const result = await api("/configuration", {
    method: "PUT",
    body: JSON.stringify({
      configuration: next,
      reset,
      configRevision: revision,
    }),
  });
  dirty = false;
  configEditorRevision = -1;
  receive(result);
  notice(
    reset
      ? "Configuration applied; simulation reset and paused."
      : "Configuration applied.",
  );
}
function liveRate(type, value) {
  return action(async () => {
    const config = clone(state.configuration);
    config[type].forEach((x) => (x.rate = value));
    const result = await api("/configuration", {
      method: "PUT",
      body: JSON.stringify({
        configuration: config,
        reset: false,
        configRevision: state.configRevision,
      }),
    });
    if (dirty) {
      draft[type].forEach((x) => (x.rate = value));
      draftBaseRevision = result.configRevision;
    }
    receive(result);
  });
}

function inspect(key, brokerId) {
  const replica = state.brokers
    .find((b) => b.id === brokerId)
    ?.replicas.find((r) => r.key === key);
  if (!replica) return;
  selectedReplica = { key, brokerId, nodeId: replica.nodeId };
  historyPage = 0;
  $("inspector").showModal();
  renderInspector(true);
  renderArchitecture();
}
async function renderInspector(loadHistory) {
  const selection = selectedReplica;
  if (!selection) return;
  const replicas = state.brokers.flatMap((b) =>
    b.replicas
      .filter((r) => r.key === selection.key)
      .map((r) => ({ ...r, broker: b })),
  );
  const selected = replicas.find((r) => r.broker.id === selection.brokerId);
  if (!selected) return;
  $("inspector-title").textContent =
    `${selected.topicName} / P${selected.partition}`;
  const header = `<div class="inspector-meta"><span>Replica retained start: ${selected.replicaStart}</span><span>Partition start: ${selected.logStart}</span><span>Log end / next offset: ${selected.logEnd}</span><span>${selected.available ? "Available" : "Unavailable"}</span><span>Commit = next offset to consume</span></div>
    <section class="inspector-section"><h3>Physical replicas</h3><table><thead><tr><th>Broker</th><th>Role</th><th>State</th><th>Replica end</th></tr></thead><tbody>${replicas.map((r) => `<tr><td>${esc(r.broker.name)}</td><td>${r.leader ? "◆ Leader" : "◇ Follower"}</td><td>${!r.broker.online ? "● Offline" : r.inSync ? "✓ In sync" : "↻ Catching up"}</td><td>${r.replicaEnd}</td></tr>`).join("")}</tbody></table></section>
    <section class="inspector-section"><h3>Independent group positions</h3><table><thead><tr><th>Group</th><th>Consumer</th><th>Fetched</th><th>Completed</th><th>✓ Committed next</th><th>⚠ Lag</th></tr></thead><tbody>${state.groups.flatMap((g) => g.offsets.filter((o) => o.key === selection.key).map((o) => `<tr><td>${esc(g.id)}</td><td>${esc(o.ownerName)}</td><td>${o.fetchedNext ?? "—"}</td><td>${o.completedNext ?? "—"}</td><td class="commit">${o.committedNext ?? "not committed"}</td><td class="lag">${o.lag}</td></tr>`)).join("")}</tbody></table></section>`;
  const oldHistory =
    $("inspector-history")?.outerHTML ||
    '<section id="inspector-history" class="inspector-section">Loading history…</section>';
  setHtml($("inspector-content"), header + oldHistory);
  if (loadHistory) {
    const request = ++historyRequest;
    try {
      const [topicId, number] = selection.key.split(":");
      const history = await api(
        `/partitions/${encodeURIComponent(topicId)}/${number}/history?brokerId=${encodeURIComponent(selection.brokerId)}&page=${historyPage}`,
      );
      if (
        request !== historyRequest ||
        selectedReplica?.nodeId !== selection.nodeId
      )
        return;
      historyPage = history.page;
      $("inspector-history").innerHTML =
        `<h3>Retained log at ${esc(selected.broker.name)}</h3><div class="history-controls"><span>${history.total} records · page ${history.page + 1} / ${history.pages}</span><div><button id="history-prev" ${history.page === 0 ? "disabled" : ""}>← Previous</button><button id="history-refresh">↻ Refresh</button><button id="history-next" ${history.page >= history.pages - 1 ? "disabled" : ""}>Next →</button></div></div><table><thead><tr><th>Message</th><th>Offset</th><th>Key</th><th>Payload</th></tr></thead><tbody>${history.messages.map((m) => `<tr><td>${esc(m.id)}</td><td>${m.offset}</td><td>${esc(m.key || "∅")}</td><td class="payload">${esc(m.payload)}</td></tr>`).join("")}</tbody></table>`;
    } catch (e) {
      notice(e.message, true);
    }
  }
}

$("config-editor").addEventListener("input", editDraft);
$("config-editor").addEventListener("change", editDraft);
$("config-editor").addEventListener("click", modifyEntity);
$("apply").onclick = () => action(applyDraft);
$("discard").onclick = () => {
  dirty = false;
  draft = clone(state.configuration);
  draftBaseRevision = state.configRevision;
  renderEditor();
};
$("save-config").onclick = () => {
  const blob = new Blob([JSON.stringify(draft, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kafka-visualizer-configuration.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  notice(
    dirty
      ? "Saved configuration draft. Apply it to activate."
      : "Saved active configuration.",
  );
};
$("load-config").onclick = () => $("config-file").click();
$("config-file").onchange = async () => {
  try {
    const file = $("config-file").files[0];
    if (!file) return;
    if (file.size > 100000)
      throw new Error("Configuration file must be smaller than 100 KB.");
    const imported = JSON.parse(await file.text());
    validateImport(imported);
    draft = imported;
    draftBaseRevision = state.configRevision;
    dirty = true;
    renderEditor();
    notice(
      "JSON loaded as a draft. Review the impact and Apply Configuration.",
    );
  } catch (e) {
    notice(e.message, true);
  } finally {
    $("config-file").value = "";
  }
};
function validateImport(c) {
  if (c?.schemaVersion !== 1)
    throw new Error("Unsupported configuration schemaVersion. Expected 1.");
  for (const [key, min, max] of [
    ["brokers", 1, 5],
    ["topics", 1, 3],
    ["producers", 1, 3],
    ["consumers", 1, 10],
    ["groups", 1, 10],
  ])
    if (!Array.isArray(c[key]) || c[key].length < min || c[key].length > max)
      throw new Error(`Invalid ${key} list.`);
  if (c.groups.some((g) => typeof g !== "string"))
    throw new Error("Group IDs must be strings.");
  for (const key of ["brokers", "topics", "producers", "consumers"])
    if (
      c[key].some(
        (x) => !x || typeof x.id !== "string" || typeof x.name !== "string",
      )
    )
      throw new Error(`Invalid ${key} definitions.`);
  if (
    c.consumers.some(
      (x) => !Array.isArray(x.topicIds) || typeof x.groupId !== "string",
    )
  )
    throw new Error("Consumers require a group ID and topicIds list.");
  if (
    c.producers.some(
      (x) => typeof x.key !== "string" || typeof x.payload !== "string",
    )
  )
    throw new Error("Producers require string key and payload templates.");
}

function closeMore() {
  $("more-menu").hidden = true;
  $("more-toggle").setAttribute("aria-expanded", "false");
}
function showSidebar(show) {
  $("sidebar").hidden = !show;
  $("toggle-sidebar").textContent = show
    ? "← Hide Configuration"
    : "→ Show Configuration";
  $("toggle-sidebar").setAttribute("aria-expanded", String(show));
  closeMore();
}
function selectTab(tab) {
  const custom = tab === "custom";
  $("custom-panel").hidden = !custom;
  $("scenarios-panel").hidden = custom;
  for (const [id, on] of [
    ["custom-tab", custom],
    ["scenarios-tab", !custom],
  ]) {
    $(id).classList.toggle("selected", on);
    $(id).setAttribute("aria-selected", String(on));
  }
}
let focusCamera;
function focusView(on) {
  if (document.body.classList.contains("focus-view") === on) return;
  const viewport = $("architecture-viewport");
  if (on)
    focusCamera = {
      zoom: diagram.zoom,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
  document.body.classList.toggle("focus-view", on);
  $("exit-focus").hidden = !on;
  closeMore();
  requestAnimationFrame(() => {
    renderArchitecture();
    if (on) {
      diagram.fit();
      if (!document.activeElement.closest?.("#architecture"))
        viewport.focus({ preventScroll: true });
    } else if (focusCamera) {
      diagram.zoom = focusCamera.zoom;
      diagram.resize();
      viewport.scrollTo(focusCamera.left, focusCamera.top);
    }
  });
}
function togglePlayback() {
  if (state) {
    const advancing = state.canAdvance || (!replay.idle && replay.step);
    if (advancing) replay.step = false;
    command(advancing ? "PAUSE" : "RESUME");
  }
}
function produceOne(id = $("manual-producer").value) {
  command("PRODUCE", id, {
    key: $("message-key").value,
    payload: $("message-payload").value || null,
  });
}
function productionMode(automatic) {
  action(async () => {
    const config = clone(state.configuration);
    config.producers.forEach((p) => (p.automatic = automatic));
    const next = await api("/configuration", {
      method: "PUT",
      body: JSON.stringify({
        configuration: config,
        reset: false,
        configRevision: state.configRevision,
      }),
    });
    if (dirty) {
      draft.producers.forEach((p) => (p.automatic = automatic));
      draftBaseRevision = next.configRevision;
    }
    receive(next);
  });
}
function componentActions(id) {
  const node = diagram.layout.nodes.get(id);
  if (!node) return;
  const kind = node.kind,
    data = node.data;
  $("component-title").textContent = data.name || data.id || "Group";
  let description = "",
    buttons = [];
  const btn = (type, text, target = data.id) =>
    '<button data-command="' +
    type +
    '" data-id="' +
    esc(target) +
    '">' +
    text +
    "</button>";
  if (kind === "producer") {
    $("manual-producer").value = data.id;
    description =
      "Target: " +
      state.configuration.topics.find((t) => t.id === data.topicId)?.name +
      " · " +
      data.rate +
      " msg/s · " +
      (data.automatic ? "Auto" : "Manual");
    buttons = [
      btn("PRODUCE", "＋ Produce template message"),
      '<button data-edit="producers">Edit name, topic or message</button>',
    ];
  }
  if (kind === "broker") {
    description =
      "Physical replica host. Stopping it preserves its simulated log and triggers eligible leader elections.";
    buttons = [
      btn(
        data.online ? "BROKER_STOP" : "BROKER_RESTART",
        data.online ? "⏻ Stop broker" : "⏻ Restart broker",
      ),
      '<button data-edit="brokers">Edit broker name</button>',
    ];
  }
  if (kind === "consumer") {
    description =
      data.groupId +
      " · " +
      data.status +
      " · " +
      data.rate +
      " msg/s · " +
      data.assignments.map(partitionLabel).join(", ");
    buttons = [
      btn(
        data.online ? "CONSUMER_STOP" : "CONSUMER_RESTART",
        data.online ? "Crash before commit" : "Restart consumer",
      ),
    ];
    if (data.online)
      buttons.push(
        btn(
          data.paused ? "CONSUMER_RESUME" : "CONSUMER_PAUSE",
          data.paused ? "Resume consumer" : "Pause consumer",
        ),
        btn("FAIL", "× Fail current / next attempt"),
        btn("COMMIT", "✓ Commit completed work"),
      );
    buttons.push(
      '<button data-edit="consumers">Edit name, group or subscriptions</button>',
    );
  }
  if (kind === "group") {
    description =
      "Logical group, independent offsets. Lag " +
      data.lag +
      ". " +
      data.consumers.map((c) => c.name).join(", ");
    buttons = ['<button data-edit="groups">Edit group or membership</button>'];
  }
  $("component-description").textContent = description;
  $("component-buttons").innerHTML = buttons.join("");
  $("component-actions").dataset.node = id;
  $("component-actions").showModal();
}
$("component-buttons").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const node = diagram.layout.nodes.get($("component-actions").dataset.node);
  $("component-actions").close();
  if (b.dataset.command) command(b.dataset.command, b.dataset.id);
  else if (b.dataset.edit) {
    showSidebar(true);
    selectTab("custom");
    const key = b.dataset.edit,
      index =
        key === "groups"
          ? draft.groups.indexOf(node.data.id)
          : draft[key].findIndex((x) => x.id === node.data.id);
    const field = document.querySelector(
      '[data-key="' + key + '"][data-index="' + index + '"]',
    );
    if (field) {
      field.closest("details").open = true;
      field.scrollIntoView({ block: "center" });
      field.focus();
    }
  }
};
$("close-component").onclick = () => $("component-actions").close();
$("playback").onclick = togglePlayback;
$("reset").onclick = () => command("RESET");
$("step").onclick = () => {
  closeMore();
  pendingStep = true;
  replay.step = true;
  $("step").disabled = true;
};
$("produce").onclick = () => produceOne();
$("quick-produce").onclick = () => produceOne();
$("auto-mode").onclick = () => productionMode(true);
$("manual-mode").onclick = () => productionMode(false);
$("toggle-sidebar").onclick = () => showSidebar($("sidebar").hidden);
$("close-sidebar").onclick = () => showSidebar(false);
$("custom-tab").onclick = () => selectTab("custom");
$("scenarios-tab").onclick = () => selectTab("scenarios");
$("focus").onclick = () => focusView(true);
$("exit-focus").onclick = () => focusView(false);
$("more-toggle").onclick = () => {
  const show = $("more-menu").hidden;
  $("more-menu").hidden = !show;
  $("more-toggle").setAttribute("aria-expanded", String(show));
};
$("toggle-legend").onclick = () => {
  $("legend").hidden = !$("legend").hidden;
  $("toggle-legend").textContent = $("legend").hidden
    ? "Show legend"
    : "Hide legend";
  closeMore();
};
function diagnostics(show) {
  $("bottom-panel").hidden = !show;
  $("toggle-diagnostics").textContent = show
    ? "Hide diagnostics"
    : "Show diagnostics";
  closeMore();
  if (show) renderPanel();
}
$("toggle-diagnostics").onclick = () => diagnostics($("bottom-panel").hidden);
$("close-diagnostics").onclick = () => diagnostics(false);
$("rebalance").onclick = () => {
  closeMore();
  command("REBALANCE");
};
$("commit").onclick = () => {
  closeMore();
  command("COMMIT");
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      currentTab = b.dataset.tab;
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      renderPanel();
    }),
);
$("animation-buttons").onclick = (e) => {
  const b = e.target.closest("[data-speed]");
  if (b) {
    replay.speed = Number(b.dataset.speed);
    document
      .querySelectorAll("[data-speed]")
      .forEach((x) => x.classList.toggle("selected", x === b));
  }
};
for (const [id, key] of [
  ["show-replication", "replication"],
  ["show-commits", "commits"],
  ["show-followers", "followers"],
]) {
  $(id).checked = view[key];
  $(id).onchange = (e) => {
    view[key] = e.target.checked;
    saveView();
    renderArchitecture();
  };
}
for (const filter of ["topic-filter", "group-filter"])
  $(filter).onchange = () => {
    view.topic = $("topic-filter").value;
    view.group = $("group-filter").value;
    renderArchitecture();
    diagram.fit();
  };
$("zoom-in").onclick = () => diagram.zoomBy(1.15);
$("zoom-out").onclick = () => diagram.zoomBy(1 / 1.15);
$("zoom-fit").onclick = $("fit-view").onclick = () => diagram.fit();
function nodeClick(e) {
  const node = e.target.closest("[data-node]");
  if (!node) return;
  if (node.dataset.kind === "replica")
    inspect(node.dataset.partition, node.dataset.broker);
  else if (
    node.dataset.kind === "producer" &&
    !diagram.layout.nodes.get(node.dataset.node)?.data.automatic
  ) {
    const producer = diagram.layout.nodes.get(node.dataset.node).data;
    $("manual-producer").value = producer.id;
    command("PRODUCE", producer.id);
  } else if (node.dataset.kind !== "offset")
    componentActions(node.dataset.node);
}
$("architecture").onclick = nodeClick;
$("architecture").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    nodeClick(e);
  }
};
$("close-inspector").onclick = () => {
  $("inspector").close();
  selectedReplica = null;
  renderArchitecture();
};
$("inspector").addEventListener("click", (e) => {
  if (e.target.id === "history-prev") {
    historyPage--;
    renderInspector(true);
  }
  if (e.target.id === "history-next") {
    historyPage++;
    renderInspector(true);
  }
  if (e.target.id === "history-refresh") renderInspector(true);
});
for (const type of ["producer", "consumer"]) {
  $(type + "-speed").oninput = (e) =>
    ($(type + "-speed-value").textContent = e.target.value + " msg/s");
  $(type + "-speed").onchange = (e) =>
    liveRate(type + "s", Number(e.target.value));
}
$("scenario-select").onchange = () => {
  $("scenario-explanation").textContent =
    scenarios.find((s) => s.id === Number($("scenario-select").value))
      ?.explanation || "";
};
$("run-scenario").onclick = () =>
  action(async () => {
    const next = await api("/scenarios/" + $("scenario-select").value, {
      method: "POST",
    });
    dirty = false;
    configEditorRevision = -1;
    receive(next);
    showSidebar(false);
    notice("Scenario started; previous messages and offsets reset.");
  });
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "Escape") {
    focusView(false);
    closeMore();
    return;
  }
  if (
    e.target.matches("input,select,textarea,[contenteditable],button") ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlayback();
  }
  if (e.key.toLowerCase() === "n") produceOne();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#more-menu,#more-toggle")) closeMore();
});
new ResizeObserver(() => {
  if (state) {
    renderArchitecture();
  }
}).observe($("architecture-viewport"));
async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    receive(await api("/state?afterEventId=" + lastEventId));
  } catch (e) {
    if (lastError !== e.message) notice("Connection error: " + e.message, true);
    lastError = e.message;
  } finally {
    pollBusy = false;
  }
}
async function initialize() {
  try {
    scenarios = await api("/scenarios");
    $("scenario-select").innerHTML = scenarios
      .map(
        (s) =>
          '<option value="' +
          s.id +
          '">' +
          s.id +
          ". " +
          esc(s.name) +
          "</option>",
      )
      .join("");
    $("scenario-select").onchange();
    await poll();
    await claimPlayback();
    diagram.fit();
  } catch (e) {
    notice(e.message, true);
  }
}
async function claimPlayback() {
  try {
    const next = await api("/playback", {
      method: "POST",
      body: JSON.stringify({
        action: ownsPlayback ? "HEARTBEAT" : "CLAIM",
        clientId,
        epoch: state.epoch,
        expectedTick: state.tick,
        completedEventId: lastEventId,
      }),
    });
    ownsPlayback = next.playbackOwner === clientId;
    receive(next);
  } catch (e) {
    if (e.status === 409) ownsPlayback = false;
    else notice(e.message, true);
  }
}
async function drive(now) {
  if (
    !state ||
    !ownsPlayback ||
    playbackBusy ||
    !replay.idle ||
    !state.canAdvance ||
    now < nextTickAt
  )
    return;
  playbackBusy = true;
  nextTickAt = now + 100;
  try {
    receive(
      await api("/playback", {
        method: "POST",
        body: JSON.stringify({
          action: "ADVANCE",
          clientId,
          epoch: state.epoch,
          expectedTick: state.tick,
          completedEventId: lastEventId,
        }),
      }),
    );
  } catch (e) {
    if (e.status === 409) await poll();
    else notice(e.message, true);
  } finally {
    playbackBusy = false;
  }
}
function frame(now) {
  const wasIdle = replay.idle;
  replay.frame(now, !!state?.canAdvance);
  if (!wasIdle && replay.idle) {
    presentation.settle();
    visualDirty = true;
  }
  if (visualDirty && state) {
    visualDirty = false;
    renderArchitecture();
    if (!$("bottom-panel").hidden) renderPanel();
    updateModes();
    $("step").disabled = state.canAdvance || pendingStep;
    $("playback").textContent =
      state.canAdvance || (!replay.idle && replay.step)
        ? "Ⅱ Pause"
        : "▶ Resume";
  }
  drive(now);
  if (pendingStep && replay.idle && !stepRequestBusy) {
    stepRequestBusy = true;
    command("STEP").finally(() => {
      pendingStep = false;
      stepRequestBusy = false;
      visualDirty = true;
    });
  }
  requestAnimationFrame(frame);
}
await initialize();
setInterval(poll, 150);
setInterval(claimPlayback, 2500);
requestAnimationFrame(frame);
window.kafkaLab = {
  get state() {
    return state;
  },
  get playback() {
    return replay.stats;
  },
  get layout() {
    return {
      ...diagram.layout,
      nodes: [...diagram.layout.nodes.values()].map(
        ({ data, broker, group, ...n }) => n,
      ),
    };
  },
  requiresReset,
  get visibleState() {
    return presentation.snapshot();
  },
  get ownsPlayback() {
    return ownsPlayback;
  },
};
