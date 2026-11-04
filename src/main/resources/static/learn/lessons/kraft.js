// Level 4 · Deep dive: the KRaft controller. Cluster metadata is itself a replicated log (__cluster_metadata)
// kept by a quorum of controllers using Raft: the active controller appends, the others replicate, a majority
// commits, and brokers pull the log into their caches. Flows: a metadata change, controller failover, broker life.
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, INK, start, layers, frame, node, wire, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const CX = [160, 480, 800], CY = 112, BXS = [160, 480, 800], BY = 338;
const CHIP = 52, SHOW = 4;
const MCOL = { reg: '#4f7bd9', topic: '#2f9e8f', part: '#5bb12f', fence: '#ce3434', leader: '#c47d1e' };

function scene(s, { log = [['B1 reg', 'reg'], ['B2 reg', 'reg'], ['B3 reg', 'reg']], active = 0, epoch = 4 } = {}) {
  const v = start(s, { parent: {} });
  Object.assign(v, { active, epoch, alive: [true, true, true], committed: log.length, ctl: [], br: [] });
  for (let i = 0; i < 3; i++) {
    const c = frame(s, v, `c${i}`, CX[i], CY, 240, 150, `Controller ${i + 1}`);
    c.roleT = s.text(c, 106, -57, '', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700 });
    s.text(c, -106, -24, '__cluster_metadata', { 'text-anchor': 'start', 'font-size': 13, 'font-family': MONO, fill: MUTED });
    c.markT = s.text(c, -106, 48, '', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, 'font-weight': 700 });
    c.chips = []; c.entries = log.map(e => ({ label: e[0], kind: e[1] }));
    Object.assign(c, { i });
    v.ctl.push(c);
    drawChips(s, c);
  }
  for (let i = 0; i < 3; i++) {
    const b = frame(s, v, `b${i}`, BXS[i], BY, 240, 104, `Broker B${i + 1}`);
    b.stateT = s.text(b, 106, -34, 'running', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: GREEN });
    b.cacheT = s.text(b, -106, 0, `metadata cache @ ${log.length}`, { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, 'font-weight': 700 });
    b.noteT = s.text(b, -106, 26, '', { 'text-anchor': 'start', 'font-size': 13.5, fill: MUTED });
    Object.assign(b, { i, cache: log.length });
    v.br.push(b);
  }
  node(s, v, 'admin', 480, 428, 340, 36, 'admin client', { size: 14 });

  // controller ↔ controller (followers fetch from the leader)
  wire(v, 'k1-k0', 'M360,100 L280,100'); wire(v, 'k0-k1', 'M280,122 L360,122');
  wire(v, 'k2-k1', 'M680,100 L600,100'); wire(v, 'k1-k2', 'M600,122 L680,122');
  wire(v, 'k2-k0', 'M800,37 C800,10 160,10 160,37'); wire(v, 'k0-k2', 'M176,37 C176,20 784,20 784,37');
  // brokers ↔ controllers 1 and 2
  for (let b = 0; b < 3; b++) for (const k of [0, 1]) {
    const x1 = BXS[b] + (k - .5) * 40, x2 = CX[k] + (b - 1) * 34;
    wire(v, `b${b}-k${k}`, `M${x1 - 6},286 C${x1 - 6},240 ${x2 - 6},230 ${x2 - 6},187`);
    wire(v, `k${k}-b${b}`, `M${x2 + 6},187 C${x2 + 6},236 ${x1 + 6},244 ${x1 + 6},286`);
  }
  wire(v, 'admin-b1', 'M470,410 L470,390'); wire(v, 'b1-admin', 'M490,390 L490,410');
  layers(s, v);
  render(v);
  return v;
}

// ---- picture ----
function drawChips(s, c) {
  for (const g of c.chips) g.remove();
  const start = Math.max(0, c.entries.length - SHOW);
  c.chips = c.entries.slice(start).map((e, k) => {
    const g = s.box(-80 + k * (CHIP + 4), 12, CHIP, 30, e.label, { parent: c, size: 11.5, rx: 5, fill: '#fff', stroke: MCOL[e.kind], weight: 700, color: MCOL[e.kind] });
    g.off = start + k;
    return g;
  });
}
function role(v, c) {
  if (!v.alive[c.i]) return ['✕ down', RED];
  return c.i === v.active ? ['★ active', AMBER] : ['voter · follower', MUTED];
}
function render(v) {
  for (const c of v.ctl) {
    const [t, col] = role(v, c);
    c.roleT.textContent = t; c.roleT.setAttribute('fill', col);
    c.markT.textContent = `epoch ${v.epoch} · committed ${Math.min(v.committed, c.entries.length)}`;
    c.rect.setAttribute('stroke', v.alive[c.i] ? '#c9ced2' : RED);
    c.rect.setAttribute('fill', v.alive[c.i] ? '#fff' : '#fff4f4');
    for (const g of c.chips) g.setAttribute('opacity', g.off < v.committed ? 1 : .45);
  }
}
async function show(s, v, ...cs) {
  await Promise.all(cs.map(async c => {
    const [t, col] = role(v, c);
    c.rect.setAttribute('stroke', v.alive[c.i] ? '#c9ced2' : RED);
    c.rect.setAttribute('fill', v.alive[c.i] ? '#fff' : '#fff4f4');
    await Promise.all([swap(s, c.roleT, t, col), swap(s, c.markT, `epoch ${v.epoch} · committed ${Math.min(v.committed, c.entries.length)}`, BLUE)]);
    for (const g of c.chips) await s.fade(g, g.off < v.committed ? 1 : .45, 200);
    hit(v, `c${c.i}`);
  }));
}
async function append(s, v, c, entries) {
  c.entries.push(...entries);
  drawChips(s, c);
  for (const g of c.chips.filter(g => g.off >= c.entries.length - entries.length)) { g.setAttribute('opacity', .45); await s.pop(g, 220); }
}
async function replicate(s, v, entries) {
  const L = v.active, followers = [0, 1, 2].filter(i => i !== L && v.alive[i]);
  await Promise.all(followers.map(i => packet(s, v, wireKey(i, L), `Fetch(${v.ctl[i].entries.length})`, BLUE, { ms: 700 })));
  await Promise.all(followers.map(async i => { await packet(s, v, wireKey(L, i), `${entries.length} record${entries.length > 1 ? 's' : ''}`, GREEN, { ms: 700 }); await append(s, v, v.ctl[i], entries); }));
  return followers.length;
}
const wireKey = (from, to) => `k${from}-k${to}`;
async function commit(s, v) {
  const have = [0, 1, 2].filter(i => v.alive[i] && v.ctl[i].entries.length >= v.ctl[v.active].entries.length).length;
  if (have < 2) return false;
  v.committed = v.ctl[v.active].entries.length;
  await show(s, v, ...v.ctl.filter(c => v.alive[c.i]));
  return true;
}
async function brokersFetch(s, v, notes = []) {
  const k = v.active;
  if (k > 1) return;
  await Promise.all(v.br.map(b => packet(s, v, `b${b.i}-k${k}`, `Fetch(@${b.cache})`, BLUE, { ms: 700 })));
  await Promise.all(v.br.map(async b => {
    await packet(s, v, `k${k}-b${b.i}`, `→ @${v.committed}`, GREEN, { ms: 700 });
    b.cache = v.committed;
    await Promise.all([swap(s, b.cacheT, `metadata cache @ ${b.cache}`, BLUE), notes[b.i] != null ? swap(s, b.noteT, notes[b.i], INK) : null]);
    hit(v, `b${b.i}`);
  }));
}

// ---- flow 1: a metadata change ----
const M = {
  quorum: {
    phase: 'The quorum', on: ['c0', 'c1', 'c2'],
    title: 'Three controllers, one metadata log',
    text: 'In KRaft mode (the only mode since Kafka 4.0, no ZooKeeper) a few controller nodes keep the cluster\'s metadata as a log, __cluster_metadata. Using Raft they elect one active controller, here Controller 1 in epoch 4; the others are voters that replicate its log. It holds broker registrations, topics, partitions, leaders and ISRs.',
    observe: 'Controller 1 ★ active; all three logs hold the three broker registrations.',
    async run(s, v) { hit(v, 'c0'); await s.wait(400); },
  },
  create: {
    phase: 'A change', on: ['admin', 'b1', 'c0'], wires: ['admin-b1', 'b1-k0'],
    title: 'An admin creates topic orders',
    text: 'kafka-topics.sh --create --topic orders --partitions 3 sends CreateTopics to any broker, here B2. Brokers do not change metadata themselves: B2 forwards the request to the active controller.',
    observe: 'CreateTopics goes to B2, then up to Controller 1.',
    async run(s, v) { await packet(s, v, 'admin-b1', 'CreateTopics', BLUE, { ms: 500 }); await packet(s, v, 'b1-k0', 'forward', BLUE, { ms: 800 }); hit(v, 'c0'); },
  },
  decide: {
    phase: 'A change', on: ['c0'],
    title: 'The active controller decides and appends',
    text: 'Controller 1 places the replicas and picks a leader per partition, then appends the result as records: "topic orders" and the partition records (P0 → B1, P1 → B2, P2 → B3). They are in its log but not committed yet (faded).',
    observe: 'New faded chips at the end of Controller 1\'s log.',
    async run(s, v) { await append(s, v, v.ctl[0], [{ label: 'orders', kind: 'topic' }, { label: 'P0→B1', kind: 'part' }, { label: 'P1→B2', kind: 'part' }]); },
  },
  repl: {
    phase: 'A change', on: ['c1', 'c2', 'c0'], wires: ['k1-k0', 'k2-k0', 'k0-k1', 'k0-k2'],
    title: 'The voters fetch the new records',
    text: 'Like partition followers, the other controllers pull: each sends Fetch from its log end and appends what the active controller returns.',
    observe: 'Fetch from Controller 2 and 3; the records appear in their logs.',
    async run(s, v) { await replicate(s, v, [{ label: 'orders', kind: 'topic' }, { label: 'P0→B1', kind: 'part' }, { label: 'P1→B2', kind: 'part' }]); },
  },
  commitEv: {
    phase: 'A change', on: ['c0', 'c1', 'c2'],
    title: 'A majority has them: committed',
    text: 'Once a majority of the voters (2 of 3) has the records, they are committed (the metadata high watermark moves) and become the cluster\'s truth. The controller answers the admin through B2.',
    observe: 'All chips turn solid; "committed 6".',
    async run(s, v) { await commit(s, v); await packet(s, v, 'k0-b1', 'created', GREEN, { ms: 700 }); await packet(s, v, 'b1-admin', '✓ orders created', GREEN, { ms: 500 }); },
  },
  brokers: {
    phase: 'Brokers apply it', on: ['b0', 'b1', 'b2'], wires: ['b0-k0', 'b1-k0', 'b2-k0', 'k0-b0', 'k0-b1', 'k0-b2'],
    title: 'Brokers pull the metadata log too',
    text: 'Every broker continuously fetches __cluster_metadata from the active controller and applies new records to its cache. B1 sees it now leads orders-0, B2 orders-1, B3 orders-2, and they start serving them.',
    observe: 'Each broker\'s cache moves to @6 and notes its new leaderships.',
    async run(s, v) { await brokersFetch(s, v, ['leads orders-0', 'leads orders-1', 'leads orders-2']); },
  },
  beats: {
    phase: 'Brokers apply it', on: ['b0', 'b1', 'b2', 'c0'],
    title: 'The same fetches are the heartbeats',
    text: 'Brokers also heartbeat the active controller every broker.heartbeat.interval.ms (2 s). This is how the controller knows they are alive, and how a broker learns it may stay unfenced.',
    observe: 'Heartbeats from all three brokers to Controller 1.',
    async run(s, v) { await Promise.all(v.br.map(b => packet(s, v, `b${b.i}-k0`, 'heartbeat', MUTED, { ms: 600 }))); hit(v, 'c0'); },
  },
};
// ---- flow 2: the active controller fails ----
const F = {
  die: {
    phase: 'Failure', on: ['c0'],
    title: 'The active controller crashes',
    text: 'Controller 1 goes down. Partition traffic carries on: producers and consumers talk to partition leaders, not to the controller. Only metadata changes (new topics, leader elections) are stuck until there is a new active controller.',
    observe: 'Controller 1 turns red.',
    async run(s, v) { v.alive[0] = false; await show(s, v, v.ctl[0]); await s.shake(v.ctl[0]); },
  },
  timeout: {
    phase: 'Election', on: ['c1', 'c2'],
    title: 'The voters notice: no answers to their fetches',
    text: 'Controllers 2 and 3 stop getting fetch responses. After controller.quorum.fetch.timeout.ms (2 s), Controller 2 becomes a candidate for a new epoch, 5.',
    observe: 'Controller 2: "candidate · epoch 5".',
    async run(s, v) { await swap(s, v.ctl[1].roleT, 'candidate · epoch 5', AMBER); },
  },
  vote: {
    phase: 'Election', on: ['c1', 'c2'], wires: ['k1-k2', 'k2-k1'],
    title: 'It asks for votes and wins a majority',
    text: 'Controller 2 sends Vote(epoch 5) to the others. Controller 3 grants it, because Controller 2\'s log is at least as complete as its own. With its own vote that is 2 of 3: a majority, so Controller 2 is the new active controller.',
    observe: 'Vote request to Controller 3, "granted" back; Controller 2 ★ active, epoch 5.',
    async run(s, v) {
      await packet(s, v, 'k1-k2', 'Vote(epoch 5)', BLUE, { ms: 700 });
      await packet(s, v, 'k2-k1', 'granted', GREEN, { ms: 700 });
      v.active = 1; v.epoch = 5;
      await show(s, v, v.ctl[1], v.ctl[2]);
    },
  },
  follow: {
    phase: 'Recovery', on: ['c2', 'b0', 'b1', 'b2', 'c1'], wires: ['k2-k1', 'b0-k1', 'b1-k1', 'b2-k1'],
    title: 'Everyone follows the new active controller',
    text: 'Controller 3 fetches from Controller 2 now; the brokers discover the new epoch and leader and send their metadata fetches and heartbeats to Controller 2. The whole switch typically takes a few seconds.',
    observe: 'Fetch arrows now point at Controller 2.',
    async run(s, v) {
      await packet(s, v, 'k2-k1', 'Fetch', BLUE, { ms: 600 });
      await Promise.all(v.br.map(b => packet(s, v, `b${b.i}-k1`, 'heartbeat', MUTED, { ms: 700 })));
      hit(v, 'c1');
    },
  },
  works: {
    phase: 'Recovery', on: ['admin', 'b1', 'c1', 'c2'], wires: ['admin-b1', 'b1-k1', 'k1-k2', 'k2-k1'],
    title: 'Changes work again, with 2 of 3',
    text: 'A new topic can be created: Controller 2 appends, Controller 3 replicates, and 2 of 3 is still a majority. A second controller failure would leave 1 of 3 and stop all metadata changes; that is why 3 controllers tolerate 1 failure and 5 tolerate 2.',
    observe: 'A "payments" record is appended and committed by Controllers 2 and 3.',
    async run(s, v) {
      await packet(s, v, 'admin-b1', 'CreateTopics', BLUE, { ms: 500 });
      await packet(s, v, 'b1-k1', 'forward', BLUE, { ms: 700 });
      const e = [{ label: 'payments', kind: 'topic' }];
      await append(s, v, v.ctl[1], e);
      await replicate(s, v, e);
      await commit(s, v);
    },
  },
};
// ---- flow 3: a broker's life ----
const B = {
  reg: {
    phase: 'Joining', on: ['b2', 'c0'], wires: ['b2-k0', 'k0-b2'],
    title: 'A broker registers with the controller',
    text: 'When B3 starts it sends BrokerRegistration (its id, listeners, rack) to the active controller, which records it. B3 starts fenced: it may not lead or host partitions until it has caught up with the metadata log.',
    observe: 'B3 shows "fenced · catching up".',
    async run(s, v) { await swap(s, v.br[2].stateT, 'fenced · catching up', AMBER); await packet(s, v, 'b2-k0', 'BrokerRegistration', BLUE, { ms: 700 }); await packet(s, v, 'k0-b2', 'registered', GREEN, { ms: 700 }); },
  },
  unfence: {
    phase: 'Joining', on: ['b2', 'c0'], wires: ['b2-k0', 'k0-b2'],
    title: 'Caught up: the broker is unfenced',
    text: 'B3 fetches the metadata log up to the committed offset and heartbeats. The controller then unfences it, and it can become leader or follower of partitions.',
    observe: 'B3 "running".',
    async run(s, v) { await packet(s, v, 'b2-k0', 'heartbeat · caught up', MUTED, { ms: 700 }); await swap(s, v.br[2].stateT, 'running', GREEN); hit(v, 'b2'); },
  },
  silent: {
    phase: 'Failure', on: ['b2', 'c0'],
    title: 'B3 stops heartbeating',
    text: 'B3 hangs. After broker.session.timeout.ms (9 s) without heartbeats, the active controller fences it.',
    observe: 'B3 turns red: fenced.',
    async run(s, v) { v.br[2].rect.setAttribute('stroke', RED); v.br[2].rect.setAttribute('fill', '#fff4f4'); await swap(s, v.br[2].stateT, '✕ fenced', RED); },
  },
  records: {
    phase: 'Failure', on: ['c0', 'c1', 'c2'], wires: ['k1-k0', 'k2-k0'],
    title: 'Fencing and new leaders are metadata records',
    text: 'The controller appends "fence B3" and, for every partition B3 led, a record with the new leader and ISR (the election from Level 2). They are replicated and committed like any other change.',
    observe: 'New chips: "B3 fenced", "P2→B1".',
    async run(s, v) {
      const e = [{ label: 'B3 fence', kind: 'fence' }, { label: 'P2→B1', kind: 'leader' }];
      await append(s, v, v.ctl[0], e);
      await replicate(s, v, e);
      await commit(s, v);
    },
  },
  apply: {
    phase: 'Failure', on: ['b0', 'b1'], wires: ['b0-k0', 'b1-k0', 'k0-b0', 'k0-b1'],
    title: 'The other brokers apply it',
    text: 'B1 and B2 fetch the new records: B1 now also leads orders-2. Clients that get NOT_LEADER_OR_FOLLOWER refresh their metadata from any broker and follow.',
    observe: 'B1 notes "leads orders-0, orders-2".',
    async run(s, v) {
      const k = v.active;
      await Promise.all([0, 1].map(i => packet(s, v, `b${i}-k${k}`, `Fetch(@${v.br[i].cache})`, BLUE, { ms: 700 })));
      await Promise.all([0, 1].map(async i => { await packet(s, v, `k${k}-b${i}`, `→ @${v.committed}`, GREEN, { ms: 700 }); v.br[i].cache = v.committed; await swap(s, v.br[i].cacheT, `metadata cache @ ${v.committed}`, BLUE); }));
      await swap(s, v.br[0].noteT, 'leads orders-0, orders-2', AMBER);
    },
  },
  snapshot: {
    phase: 'Housekeeping', on: ['c0', 'c1', 'c2'],
    title: 'Snapshots keep the log short',
    text: 'The metadata log would grow forever, so controllers and brokers periodically write a snapshot of the current state and drop older records. A new broker loads the latest snapshot, then fetches only the records after it.',
    observe: 'The logs are summarised by a snapshot.',
    async run(s, v) { for (const c of v.ctl) await swap(s, c.markT, `snapshot @ ${v.committed} · epoch ${v.epoch}`, MUTED); },
  },
};

const trackOf = (steps, opts, pre) => { const t = { continuous: true, steps, enter, build(s) { const v = scene(s, opts); v.track = t; pre?.(v); return v; } }; return t; };
const flowMeta = trackOf(Object.values(M));
const flowFail = trackOf(Object.values(F));
const flowBroker = trackOf(Object.values(B), undefined, v => { v.br[2].cache = 0; v.br[2].cacheT.textContent = 'metadata cache @ 0'; });

// ---- try it ----
let topics = 0;
async function tryCreate(s, v) {
  if (v.active < 0 || !v.alive[v.active]) return 'There is no active controller: metadata changes are stuck until a majority elects one.';
  const name = ['payments', 'shipments', 'refunds', 'audit', 'events'][topics++ % 5];
  const e = [{ label: name.slice(0, 7), kind: 'topic' }];
  await packet(s, v, 'admin-b1', 'CreateTopics', BLUE, { ms: 400 });
  if (v.active <= 1) await packet(s, v, `b1-k${v.active}`, 'forward', BLUE, { ms: 600 });
  await append(s, v, v.ctl[v.active], e);
  const n = await replicate(s, v, e);
  const ok = await commit(s, v);
  if (!ok) return `Controller ${v.active + 1} appended "${name}" but only ${1 + n} of 3 voters have it: no majority, not committed.`;
  await brokersFetch(s, v);
  return `"${name}" committed by ${1 + n} of 3 voters and pulled by the brokers.`;
}
async function tryToggle(s, v, i) {
  const c = v.ctl[i];
  v.alive[i] = !v.alive[i];
  if (v.alive[i]) {
    // catch up from the active controller
    if (v.active >= 0 && v.alive[v.active] && v.active !== i) { c.entries = v.ctl[v.active].entries.map(e => ({ ...e })); drawChips(s, c); }
    await show(s, v, c);
    if (v.active < 0 || !v.alive[v.active]) return electNew(s, v, `Controller ${i + 1} is back.`);
    return `Controller ${i + 1} is back and caught up as a voter.`;
  }
  await show(s, v, c);
  if (i !== v.active) return `Controller ${i + 1} stopped. ${v.alive.filter(Boolean).length} of 3 voters left${v.alive.filter(Boolean).length < 2 ? ': no majority, changes will not commit' : ''}.`;
  return electNew(s, v, `The active Controller ${i + 1} stopped.`);
}
async function electNew(s, v, why) {
  const live = [0, 1, 2].filter(i => v.alive[i]);
  if (live.length < 2) { v.active = -1; await show(s, v, ...v.ctl); return `${why} Only ${live.length} of 3 voters alive: no majority, no active controller. Partitions keep serving, metadata is frozen.`; }
  const cand = live.sort((a, b) => v.ctl[b].entries.length - v.ctl[a].entries.length || a - b)[0];
  v.active = cand; v.epoch++;
  await show(s, v, ...v.ctl);
  return `${why} Controller ${cand + 1} won the vote (${live.length} of 3) and is active in epoch ${v.epoch}.`;
}

export default {
  id: 'kraft', n: 27, title: 'KRaft controller', tagline: 'Who manages cluster metadata',
  docked: true,
  guide: {
    what: 'In KRaft mode a small quorum of controllers stores all cluster metadata as a replicated log, __cluster_metadata, using the Raft protocol: one active controller appends changes, the voters replicate them, a majority commits them, and brokers pull the log into their caches.',
    fits: 'Deep dive behind Cluster and Leader election: it explains who decides leaders and ISRs, and why Kafka no longer needs ZooKeeper.',
  },
  flows: [
    { id: 'meta', short: 'metadata change', label: 'A metadata change', about: 'Append, replicate, majority commit, brokers apply.', track: flowMeta },
    { id: 'fail', short: 'controller failover', label: 'The active controller fails', about: 'A Raft vote picks a new one.', track: flowFail },
    { id: 'broker', short: 'broker life', label: 'A broker\'s life', about: 'Register, unfence, fence, snapshots.', track: flowBroker },
  ],
  watch: flowMeta,
  tryIt: {
    intro: 'Create topics and stop or start controllers. Changes commit only with a majority (2 of 3); losing the active controller triggers a vote.',
    observe: 'With 2 of 3 controllers everything works; with 1 of 3 nothing can be committed, but brokers keep serving partitions.',
    controls: [
      { type: 'choice', name: 'which', label: 'Controller', options: ['1', '2', '3'] },
      { type: 'button', label: 'Stop / start it', run: 'toggle' },
      { type: 'button', label: 'Create a topic', primary: true, run: 'create' },
    ],
    build(s) { topics = 0; const v = scene(s); v.message = 'Create a topic, then stop Controller 1 and create another.'; return v; },
    async create(s, v) { unfocus(v); v.message = await tryCreate(s, v); },
    async toggle(s, v, input) { unfocus(v); v.message = await tryToggle(s, v, +input.which - 1); },
    readout: v => `Active: <b>${v.active >= 0 && v.alive[v.active] ? `Controller ${v.active + 1}` : 'none'}</b> · epoch <b>${v.epoch}</b> · voters alive <b>${v.alive.filter(Boolean).length} / 3</b> · committed <b>${v.committed}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Combined mode, quorum sizing, and what moved from ZooKeeper.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['c0', 'b0'],
        title: 'Dedicated or combined',
        text: 'process.roles=controller makes a dedicated controller; process.roles=broker,controller runs both in one JVM (combined mode), fine for small or development clusters. Production clusters usually run 3 or 5 dedicated controllers.',
        observe: 'Controllers and brokers can share machines in small clusters.',
        async run(s, v) { await swap(s, v.br[0].noteT, 'process.roles=broker,controller?', BLUE); },
      },
      {
        on: ['c0', 'c1', 'c2'],
        title: 'Quorum size',
        text: 'A quorum of n voters needs a majority of floor(n/2)+1 to commit: 3 voters survive 1 failure, 5 survive 2. Even numbers add cost without extra safety. controller.quorum.voters (or bootstrap servers) lists them.',
        observe: '3 voters: majority 2.',
        async run(s, v) { hit(v, 'c1'); await s.wait(500); },
      },
      {
        on: ['c0'],
        title: 'What changed from ZooKeeper',
        text: 'With ZooKeeper, one broker acted as controller and pushed state to brokers; failover meant reloading everything from ZooKeeper, slow with many partitions. KRaft keeps metadata as an event log that brokers already cache, so controller failover takes seconds and clusters scale to millions of partitions. Kafka 4.0 removed ZooKeeper.',
        observe: 'The metadata log is the new source of truth.',
        async run(s, v) { await swap(s, v.ctl[0].markT, 'no ZooKeeper since Kafka 4.0', BLUE); },
      },
    ],
  },
  takeaway: 'KRaft keeps cluster metadata in __cluster_metadata, a log replicated by a Raft quorum of controllers. The active controller appends changes (topics, leaders, ISRs, fencing), a majority commits them, brokers pull them into their caches and heartbeat to stay unfenced. If the active controller fails, the voters elect a new one within seconds.',
  recap: {
    points: [
      'Metadata is a log: __cluster_metadata, replicated across controller voters with Raft.',
      'One active controller appends; voters fetch; a majority (2 of 3) commits.',
      'Brokers forward admin changes to the controller and pull metadata into their caches.',
      'Broker heartbeats keep it unfenced; missing them (9 s) gets it fenced and its partitions re-elected.',
      'Active controller failure → vote in a new epoch; partition traffic is unaffected.',
      'Snapshots bound the log; Kafka 4.0 has no ZooKeeper.',
    ],
    interview: [
      { q: 'What is KRaft?', a: 'Kafka\'s **built-in metadata quorum** that replaced ZooKeeper (gone in Kafka 4.0). A set of **controller** nodes runs **Raft** over a metadata log, **__cluster_metadata**. The **active controller** appends changes, the other **voters** replicate them, a **majority** commits them, and **brokers fetch** the log into a local cache.' },
      { q: 'What happens when the active controller dies?', a: 'Voters stop getting fetch responses and, after the fetch timeout, one becomes a **candidate in a new epoch** and asks for **votes**; a voter grants it if the candidate\'s log is at least as up to date. With a **majority** it becomes active. Brokers move to it. **Produce and fetch traffic continue** throughout; only metadata changes pause briefly.' },
      { q: 'How many controllers should a cluster have?', a: 'An **odd number**, usually **3** (tolerates 1 failure) or **5** (tolerates 2). A change needs a majority, floor(n/2)+1; an even count adds no tolerance.' },
      { q: 'How does a broker join and leave in KRaft?', a: 'It sends **BrokerRegistration**, starts **fenced**, catches up on the metadata log and is **unfenced** once it heartbeats in sync. If heartbeats stop for **broker.session.timeout.ms**, the controller **fences** it and writes new leaders for its partitions as metadata records.' },
    ],
  },
  quiz: {
    q: 'A KRaft cluster has 3 controllers. Two of them go down. What still works?',
    options: ['Everything, the last controller takes over', 'Produce and consume on existing partitions, but no metadata changes', 'Nothing, the cluster stops', 'Only topic creation'],
    answer: 1,
    why: 'With 1 of 3 voters there is no majority, so no active controller and no committed metadata changes. Brokers keep serving the partitions they already lead.',
  },
  related: ['cluster', 'election', 'isr'],
};
