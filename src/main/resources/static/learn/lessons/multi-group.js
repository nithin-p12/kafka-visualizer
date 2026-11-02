// Level 2 · Link 8: multiple groups. Every consumer group gets every record, keeps its own committed offsets and
// its own lag, and a new group chooses where to start. Map: producer, topic orders (3 partitions), three groups
// with their members, and the __consumer_offsets table with one row per group.
import { PARTITION_COLORS as PC, el, place } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, BLUE, INK, start, layers, frame, node, part, wire, along, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

// ---- layout (960 × 460) ----
const LY = [126, 202, 278], bx = o => 264 + o * 42, CAP = 8;
const G = [
  { key: 'bill', name: 'billing', color: '#2f6fe0', cx: 180, members: [{ key: 'C1', x: 105, parts: [0, 1] }, { key: 'C2', x: 255, parts: [2] }] },
  { key: 'ship', name: 'shipping', color: '#e08a1e', cx: 485, members: [{ key: 'S1', x: 485, parts: [0, 1, 2] }] },
  { key: 'ana', name: 'analytics', color: '#8f4fc4', cx: 793, members: [{ key: 'A1', x: 793, parts: [0, 1, 2] }] },
];
const ROW_Y = { bill: 152, ship: 190, ana: 228 }, COL_X = [790, 832, 874];

function scene(s, { end = [2, 2, 2], groups = ['bill', 'ship'], committed = { bill: [2, 2, 2], ship: [2, 2, 2] } } = {}) {
  const v = start(s, { parent: { log0: 'topic', log1: 'topic', log2: 'topic' } });
  v.end = [...end]; v.committed = {}; v.active = new Set(groups); v.paused = new Set();

  node(s, v, 'prod', 96, 70, 160, 44, 'producer', { sub: 'orders' });
  frame(s, v, 'topic', 400, 190, 440, 262, 'topic orders', { color: MUTED });
  v.blocks = [[], [], []];
  v.marks = {};
  LY.forEach((y, p) => {
    const lane = part(s, v, `log${p}`);
    el('rect', { x: 200, y: y - 28, width: 400, height: 56, rx: 8, fill: '#fff', stroke: PC[p], 'stroke-width': 1.6 }, lane);
    s.text(lane, 214, y - 8, `P${p}`, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 800, fill: PC[p] });
    for (let o = 0; o < v.end[p]; o++) v.blocks[p].push(s.block(bx(o), y - 8, `${o}`, PC[p], { w: 34, h: 26, size: 13, parent: lane }));
    wire(v, `prod-p${p}`, `M176,70 C190,70 186,${y - 8} 200,${y - 8}`);
  });

  // ---- __consumer_offsets: one row per group ----
  frame(s, v, 'offs', 793, 190, 306, 262, '__consumer_offsets');
  v.n.offs.querySelector('text').setAttribute('font-family', MONO);
  const head = (x, t, anchor = 'middle') => s.text(v.n.offs, x - 793, 112 - 190, t, { 'text-anchor': anchor, 'font-size': 13.5, fill: MUTED, 'font-weight': 700 });
  head(656, 'group', 'start'); COL_X.forEach((x, p) => head(x, `P${p}`)); head(934, 'lag', 'end');
  v.cells = {};
  v.endT = s.text(v.n.offs, -137, 280 - 190, '', { 'text-anchor': 'start', 'font-size': 13.5, 'font-family': MONO, fill: MUTED });

  // ---- groups ----
  v.groups = {};
  for (const g of G) {
    const on = groups.includes(g.key);
    const wrap = s.g(0, 0, s.root, on ? {} : { opacity: 0 });
    const f = s.box(g.cx, 393, g.key === 'bill' ? 300 : g.key === 'ship' ? 270 : 306, 106, '', { parent: wrap, rx: 12, stroke: g.color, fill: '#fff' });
    f.classList.add('jn');
    s.text(f, -(g.key === 'bill' ? 150 : g.key === 'ship' ? 135 : 153) + 14, -35, `group ${g.name}`, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 800, fill: g.color });
    f.stateT = s.text(f, (g.key === 'bill' ? 150 : g.key === 'ship' ? 135 : 153) - 14, -35, '', { 'text-anchor': 'end', 'font-size': 13, fill: MUTED });
    v.n[g.key] = f;
    v.groups[g.key] = Object.assign(g, { wrap, frame: f });
    for (const m of g.members) {
      const n = s.box(m.x, 410, g.key === 'bill' ? 130 : 200, 44, '', { parent: wrap, rx: 8, stroke: '#c9ced2' });
      n.classList.add('jn');
      s.text(n, 0, -9, m.key, { 'font-size': 15, 'font-weight': 800, fill: g.color });
      n.sub = s.text(n, 0, 11, m.parts.map(p => `P${p}`).join(' '), { 'font-size': 13.5, 'font-family': MONO, fill: MUTED });
      v.n[m.key] = n; v.parent[m.key] = g.key;
      for (const p of m.parts) {
        const sx = m.x < 400 ? 200 : 600, ly = LY[p] + 12;
        // analytics sits under the offsets table, so its lines come in from the side instead of crossing the table
        const d = g.key === 'ana' ? `M600,${ly} C622,${ly} 618,400 690,404` : `M${sx},${ly} C${sx + (sx === 200 ? -34 : 34)},${ly} ${m.x + (sx === 200 ? -20 : 20)},352 ${m.x},388`;
        const w = wire(v, `${m.key}-p${p}`, d);
        w.style.stroke = g.color; w.style.opacity = on ? .55 : 0;
      }
    }
    wire(v, `${g.key}-offs`, `M${g.cx + 60},340 C${g.cx + 120},330 740,334 760,${ROW_Y[g.key] + 168}`, { hidden: true });
    // its row in the table and its bookmark in each lane
    const r = part(s, v, `row-${g.key}`);
    v.parent[`row-${g.key}`] = 'offs';
    s.text(r, 656, ROW_Y[g.key], g.name, { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: g.color, opacity: on ? 1 : 0 });
    v.cells[g.key] = [...COL_X.map(x => s.text(r, x, ROW_Y[g.key], '', { 'font-size': 14.5, 'font-family': MONO, 'font-weight': 700 })),
      s.text(r, 934, ROW_Y[g.key], '', { 'text-anchor': 'end', 'font-size': 14.5, 'font-family': MONO, 'font-weight': 700 })];
    r.label = r.firstChild;
    const jitter = { bill: -7, ship: 0, ana: 7 }[g.key];
    v.marks[g.key] = LY.map(y => {
      const mk = s.g(bx(0) - 21, y + 19, s.root, on ? {} : { opacity: 0 });
      el('path', { d: 'M-6,5 L6,5 L0,-4 Z', fill: g.color }, mk);
      mk._dx = jitter;
      return mk;
    });
    v.committed[g.key] = committed[g.key] ? [...committed[g.key]] : null;
  }
  layers(s, v);
  for (const g of G) if (v.committed[g.key]) drawGroup(v, g.key);
  v.endT.textContent = `log end: ${v.end.map((e, p) => `P${p} ${e}`).join(' · ')}`;
  return v;
}

// ---- state → picture ----
const lag = (v, k) => v.committed[k] ? v.committed[k].reduce((a, c, p) => a + v.end[p] - c, 0) : null;
const markX = (v, k, p) => bx(v.committed[k][p]) - 21 + v.marks[k][p]._dx;
function drawGroup(v, k) {
  const c = v.committed[k];
  c.forEach((o, p) => { v.cells[k][p].textContent = `${o}`; place(v.marks[k][p], markX(v, k, p), LY[p] + 19); });
  v.cells[k][3].textContent = `${lag(v, k)}`;
  v.cells[k][3].setAttribute('fill', lag(v, k) > 3 ? RED : lag(v, k) ? AMBER : GREEN);
}
async function refresh(s, v, k) {
  const c = v.committed[k];
  await Promise.all([...c.map((o, p) => Promise.all([swap(s, v.cells[k][p], `${o}`), s.move(v.marks[k][p], markX(v, k, p), LY[p] + 19, 450)])),
    swap(s, v.cells[k][3], `${lag(v, k)}`, lag(v, k) > 3 ? RED : lag(v, k) ? AMBER : GREEN)]);
}
async function endText(s, v) { await swap(s, v.endT, `log end: ${v.end.map((e, p) => `P${p} ${e}`).join(' · ')}`); }
async function lagAll(s, v) { for (const k of v.active) if (v.committed[k]) await swap(s, v.cells[k][3], `${lag(v, k)}`, lag(v, k) > 3 ? RED : lag(v, k) ? AMBER : GREEN); }

async function produce(s, v, parts = [0, 1, 2]) {
  await Promise.all(parts.map(async p => {
    if (v.end[p] >= CAP) return;
    const o = v.end[p]++;
    await packet(s, v, `prod-p${p}`, `P${p}`, MUTED, { ms: 600 });
    const b = s.block(bx(o), LY[p] - 8, `${o}`, PC[p], { w: 34, h: 26, size: 13, parent: v.n[`log${p}`] });
    v.blocks[p].push(b);
    await s.pop(b, 250);
  }));
  hit(v, 'prod');
  await Promise.all([endText(s, v), lagAll(s, v)]);
}
// One poll by every member of group k: each reads up to 3 new records per owned partition, then the group commits.
async function groupPoll(s, v, k, { max = 3 } = {}) {
  const g = v.groups[k], c = v.committed[k];
  let got = 0;
  await Promise.all(g.members.map(async m => {
    for (const p of m.parts) {
      const n = Math.min(max, v.end[p] - c[p]);
      if (n <= 0) continue;
      got += n;
      const from = c[p];
      await packet(s, v, `${m.key}-p${p}`, n > 1 ? `${from}–${from + n - 1}` : `${from}`, g.color, { ms: 700 });
      c[p] += n;
    }
    hit(v, m.key);
  }));
  if (got) {
    await packet(s, v, `${k}-offs`, 'OffsetCommit', g.color, { ms: 700 });
    hit(v, `row-${k}`);
    await refresh(s, v, k);
  }
  return got;
}
async function showGroup(s, v, k) {
  const g = v.groups[k];
  v.active.add(k);
  await s.show(g.wrap, 400);
  for (const m of g.members) for (const p of m.parts) v.w[`${m.key}-p${p}`].style.opacity = .55;
  v.n[`row-${k}`].firstChild.setAttribute('opacity', 1);
  for (const mk of v.marks[k]) mk.setAttribute('opacity', 1);
}

// ---- events ----
const ALL = ['log0', 'log1', 'log2'];
const F1 = {
  setup: {
    phase: 'Two groups', on: ['bill', 'ship', 'C1', 'C2', 'S1', ...ALL],
    title: 'Two groups read the same topic',
    text: 'The billing service runs as group billing with two instances; the shipping service as group shipping with one. Inside each group the partitions are split (assignment); across groups nothing is shared: shipping\'s S1 owns all three partitions for itself.',
    observe: 'Blue lines: billing C1 ← P0, P1; C2 ← P2. Orange lines: shipping S1 ← P0, P1, P2.',
    async run(s, v) { hit(v, 'bill'); hit(v, 'ship'); await s.wait(400); },
  },
  table: {
    phase: 'Two groups', on: ['offs', 'row-bill', 'row-ship', ...ALL],
    title: 'Each group has its own row of bookmarks',
    text: '__consumer_offsets keeps a committed offset per group and partition. Both groups are caught up at offset 2 in every partition, so both have lag 0. The triangles under the partitions are the same bookmarks.',
    observe: 'Two rows in the table; blue and orange triangles under each partition.',
    async run(s, v) { hit(v, 'row-bill'); hit(v, 'row-ship'); await s.wait(400); },
  },
  write: {
    phase: 'One record, two deliveries', on: ['prod', 'log0', 'row-bill', 'row-ship'], wire: 'prod-p0',
    title: 'A new order lands in P0',
    text: 'The producer writes one record to P0 at offset 2. It is stored once, in one partition. Both groups now have lag 1 on P0.',
    observe: 'Block 2 appears in P0; both lag cells turn 1.',
    async run(s, v) { await produce(s, v, [0]); },
  },
  bill: {
    phase: 'One record, two deliveries', on: ['C1', 'log0', 'row-bill'], wires: ['C1-p0'],
    title: 'billing reads it and commits',
    text: 'C1 owns P0 in billing, so it fetches offset 2, charges the order and commits 3 for group billing. Shipping\'s bookmark does not move.',
    observe: 'A blue packet from P0 to C1; billing\'s P0 cell becomes 3, its lag 0.',
    async run(s, v) { await groupPoll(s, v, 'bill'); },
  },
  ship: {
    phase: 'One record, two deliveries', on: ['S1', 'log0', 'row-ship'], wires: ['S1-p0'],
    title: 'shipping reads the very same record',
    text: 'S1 fetches offset 2 from P0 too and creates a shipment for it, then commits 3 for group shipping. The record was delivered once per group: this is publish/subscribe.',
    observe: 'An orange packet from P0 to S1; shipping\'s P0 cell becomes 3.',
    async run(s, v) { await groupPoll(s, v, 'ship'); },
  },
  stays: {
    phase: 'One record, two deliveries', on: ['log0'],
    title: 'Reading removes nothing',
    text: 'Offset 2 is still in P0 after both groups read it. Records leave the log only by retention (time or size), never because a consumer read them. Any number of groups can read the same data.',
    observe: 'Block 2 is still there.',
    async run(s, v) { await s.pulse(v.blocks[0][2]); },
  },
  more: {
    phase: 'More traffic', on: ['prod', ...ALL, 'bill', 'ship', 'C1', 'C2', 'S1'], wires: ['prod-p0', 'prod-p1', 'prod-p2', 'C1-p0', 'C1-p1', 'C2-p2', 'S1-p0', 'S1-p1', 'S1-p2'],
    title: 'More orders: each group reads them all',
    text: 'One record goes to each partition. Billing\'s two members read their own partitions in parallel; shipping\'s single member reads all three. Each group commits for itself.',
    observe: 'Blue and orange packets for every new record; both rows end with lag 0.',
    async run(s, v) { await produce(s, v); await Promise.all([groupPoll(s, v, 'bill'), groupPoll(s, v, 'ship')]); },
  },
  rule: {
    phase: 'More traffic', on: ['bill', 'ship', 'C1', 'C2', 'S1', 'offs'],
    title: 'The rule',
    text: 'Within a group: each record is handled by one member (work is shared, a queue). Across groups: each group gets every record (a broadcast). One topic serves both patterns at once.',
    observe: 'Two groups, each with its own lines and its own row.',
    async run(s, v) { hit(v, 'bill'); hit(v, 'ship'); hit(v, 'offs'); await s.wait(400); },
  },
};
const F2 = {
  stop: {
    phase: 'Different speeds', on: ['ship', 'S1'],
    title: 'shipping stops for a while',
    text: 'The shipping service is down for a deploy (or stuck on a bad record). Billing is not affected: it is a different group with its own members and offsets.',
    observe: 'The shipping group shows "stopped".',
    async run(s, v) { v.paused.add('ship'); await swap(s, v.groups.ship.frame.stateT, '⏸ stopped', AMBER); },
  },
  burst: {
    phase: 'Different speeds', on: ['prod', ...ALL, 'bill', 'C1', 'C2', 'row-bill', 'row-ship'], wires: ['prod-p0', 'prod-p1', 'prod-p2', 'C1-p0', 'C1-p1', 'C2-p2'],
    title: 'Orders keep coming; only billing keeps up',
    text: 'Two records per partition arrive. Billing reads and commits them; shipping\'s bookmarks stay where they were, so its lag grows to 6.',
    observe: 'Billing lag 0, shipping lag 6 (red).',
    async run(s, v) { for (let k = 0; k < 2; k++) await produce(s, v); await groupPoll(s, v, 'bill'); },
  },
  apart: {
    phase: 'Different speeds', on: ['offs', 'row-bill', 'row-ship', ...ALL],
    title: 'Lag is per group',
    text: 'Consumer lag is measured for each group separately (kafka-consumer-groups.sh --describe --group shipping). A lagging group costs the brokers nothing extra: the records are on disk anyway.',
    observe: 'Blue triangles at the end of each partition, orange ones two records behind.',
    async run(s, v) { hit(v, 'row-ship'); await s.wait(400); },
  },
  retention: {
    phase: 'Different speeds', on: ['log0', 'ship'],
    title: 'But retention does not wait for anyone',
    text: 'If shipping stayed down longer than retention.ms (7 days by default), the oldest segments would be deleted before it read them. Its committed offset would then be out of range and auto.offset.reset decides where it restarts: records can be missed. Size retention to your slowest group.',
    observe: 'Shipping\'s bookmark points at records that only exist while retention allows.',
    async run(s, v) { await swap(s, v.groups.ship.frame.stateT, '⏸ stopped · retention 7 d', RED); },
  },
  resume: {
    phase: 'Catching up', on: ['ship', 'S1', ...ALL, 'row-ship'], wires: ['S1-p0', 'S1-p1', 'S1-p2'],
    title: 'shipping comes back and catches up',
    text: 'S1 restarts, resumes from its group\'s committed offsets and reads the backlog at its own pace, up to max.poll.records per poll. Billing never noticed any of this.',
    observe: 'Orange packets carry 2 records per partition; shipping\'s lag returns to 0.',
    async run(s, v) { v.paused.delete('ship'); await swap(s, v.groups.ship.frame.stateT, 'catching up', GREEN); await groupPoll(s, v, 'ship'); },
  },
};
const F3 = {
  arrive: {
    phase: 'A new group', on: ['ana', 'A1', 'offs'],
    title: 'A new group: analytics',
    text: 'A new service starts with group.id=analytics. The group has no committed offsets yet, so it has to decide where to begin in each partition.',
    observe: 'Group analytics appears; its row in the table is empty.',
    async run(s, v) { await showGroup(s, v, 'ana'); await swap(s, v.groups.ana.frame.stateT, 'no committed offsets', AMBER); },
  },
  latest: {
    phase: 'Where to start', on: ['ana', 'A1', 'row-ana', ...ALL],
    title: 'auto.offset.reset=latest: only new records',
    text: 'With the default latest, analytics starts at the log end of each partition (3, 3, 3). It ignores everything already in the topic and only sees what is written from now on.',
    observe: 'Purple triangles jump to the end of each partition; lag 0.',
    async run(s, v) { v.committed.ana = [...v.end]; drawGroup(v, 'ana'); hit(v, 'row-ana'); await swap(s, v.groups.ana.frame.stateT, 'reset: latest', MUTED); },
  },
  earliest: {
    phase: 'Where to start', on: ['ana', 'A1', 'row-ana', ...ALL],
    title: 'auto.offset.reset=earliest: the whole history',
    text: 'With earliest, analytics starts at the beginning of the log (offset 0 here, or the oldest record retention kept). It will read every order ever stored, which is how you backfill a new service.',
    observe: 'The purple triangles move back to offset 0; lag 9.',
    async run(s, v) { v.committed.ana = [0, 0, 0]; await refresh(s, v, 'ana'); await swap(s, v.groups.ana.frame.stateT, 'reset: earliest', BLUE); },
  },
  backfill: {
    phase: 'Where to start', on: ['A1', ...ALL, 'row-ana'], wires: ['A1-p0', 'A1-p1', 'A1-p2'],
    title: 'It reads the history without touching the others',
    text: 'A1 reads offsets 0–2 in every partition and commits 3 for group analytics. Billing and shipping keep their own bookmarks; three groups now read orders independently.',
    observe: 'Purple packets with 0–2; analytics lag back to 0.',
    async run(s, v) { await groupPoll(s, v, 'ana'); await swap(s, v.groups.ana.frame.stateT, 'caught up', GREEN); },
  },
  reset: {
    phase: 'Replay', on: ['offs', 'row-ship'],
    title: 'Replaying on purpose',
    text: 'An existing group can be rewound while it is stopped: kafka-consumer-groups.sh --reset-offsets --group shipping --to-datetime 2026-11-01T00:00 --execute (or --to-earliest, --shift-by -100). Its members then re-read from there. Other groups are untouched.',
    observe: 'Only shipping\'s row would change.',
    async run(s, v) { hit(v, 'row-ship'); await s.wait(400); },
  },
};

const trackOf = (steps, opts) => { const t = { continuous: true, steps, enter, build(s) { const v = scene(s, opts); v.track = t; return v; } }; return t; };
const flowTwo = trackOf(Object.values(F1));
const flowPace = trackOf(Object.values(F2));
const flowLate = trackOf(Object.values(F3), { end: [3, 3, 3], committed: { bill: [3, 3, 3], ship: [3, 3, 3] } });

export default {
  id: 'multi-group', n: 20, title: 'Multiple groups', tagline: 'Every group gets every record',
  docked: true,
  guide: {
    what: 'Every consumer group receives every record of the topics it subscribes to. Each group keeps its own committed offsets and lag, and a new group picks its starting point with auto.offset.reset.',
    fits: 'Last link of Level 2: many groups on one topic. Inside a group work is shared; across groups data is broadcast. Next: the end-to-end journey of one message.',
  },
  flows: [
    { id: 'two', short: 'two groups', label: 'Two groups, one topic', about: 'The same record is delivered once per group.', track: flowTwo },
    { id: 'pace', short: 'own pace', label: 'Different speeds', about: 'Lag is per group; retention is not.', track: flowPace },
    { id: 'late', short: 'new group', label: 'A new group joins late', about: 'auto.offset.reset: latest vs earliest.', track: flowLate },
  ],
  watch: flowTwo,
  tryIt: {
    intro: 'Produce orders, let each group poll, and add the analytics group starting from the earliest or latest offset.',
    observe: 'Each group reads every record and has its own lag; one group being slow does not affect another.',
    controls: [
      { type: 'choice', name: 'reset', label: 'analytics starts at', options: ['earliest', 'latest'] },
      { type: 'button', label: 'Produce', primary: true, run: 'produce' },
      { type: 'button', label: 'billing polls', run: 'bill' },
      { type: 'button', label: 'shipping polls', run: 'ship' },
      { type: 'button', label: 'analytics polls', run: 'ana' },
    ],
    build(s) { const v = scene(s); v.message = 'Produce a few orders, then poll with one group at a time.'; return v; },
    async produce(s, v) {
      unfocus(v);
      if (v.end.every(e => e >= CAP)) { v.message = 'The sandbox partitions are full. Switch tabs and back to start again.'; return; }
      await produce(s, v);
      v.message = `One order per partition. Lag: ${[...v.active].filter(k => v.committed[k]).map(k => `${v.groups[k].name} ${lag(v, k)}`).join(', ')}.`;
    },
    async bill(s, v) { unfocus(v); const n = await groupPoll(s, v, 'bill'); v.message = n ? `billing read ${n} record${n > 1 ? 's' : ''} across its two members and committed.` : 'billing is caught up.'; },
    async ship(s, v) { unfocus(v); const n = await groupPoll(s, v, 'ship'); v.message = n ? `shipping read ${n} record${n > 1 ? 's' : ''} with its single member, independently of billing.` : 'shipping is caught up.'; },
    async ana(s, v, input) {
      unfocus(v);
      if (!v.active.has('ana')) {
        await showGroup(s, v, 'ana');
        v.committed.ana = input.reset === 'earliest' ? [0, 0, 0] : [...v.end];
        drawGroup(v, 'ana');
        await refresh(s, v, 'ana');
        v.message = `analytics joined with auto.offset.reset=${input.reset}: it starts at ${input.reset === 'earliest' ? 'offset 0, with the whole history to read' : 'the log end, seeing only new orders'}. Lag ${lag(v, 'ana')}.`;
        return;
      }
      const n = await groupPoll(s, v, 'ana');
      v.message = n ? `analytics read ${n} record${n > 1 ? 's' : ''}.` : 'analytics is caught up.';
    },
    readout: v => `${[...v.active].filter(k => v.committed[k]).map(k => `<b style="color:${v.groups[k].color}">${v.groups[k].name}</b> lag ${lag(v, k)}`).join(' · ')} · log end ${v.end.join(' / ')}<br>${v.message}`,
  },
  deeper: {
    note: 'Fan-out cost, naming groups, and inspecting them.',
    continuous: true,
    build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['log0', 'log1', 'log2'],
        title: 'What another group costs',
        text: 'Each extra group adds fetch traffic and one row per partition in __consumer_offsets, but no extra storage: all groups read the same log. Recent data comes from the page cache, so many groups reading the tail is cheap; a group backfilling old data reads from disk.',
        observe: 'One copy of the data, read by every group.',
        async run(s, v) { hit(v, 'topic'); await s.wait(500); },
      },
      {
        on: ['bill', 'ship'],
        title: 'One group per application',
        text: 'Use one group.id per logical consumer (billing-service, shipping-service), the same for all its instances. Two instances with different group ids would each process everything twice; two different services sharing an id would steal each other\'s partitions.',
        observe: 'Group ids name applications, not instances.',
        async run(s, v) { await swap(s, v.groups.bill.frame.stateT, 'group.id=billing-service', BLUE); },
      },
      {
        on: ['offs', 'row-bill', 'row-ship'],
        title: 'Inspecting groups',
        text: 'kafka-consumer-groups.sh --list shows every group; --describe --group billing shows each partition\'s current offset, log end offset, lag and owner. Empty groups keep their offsets for offsets.retention.minutes (7 days) after the last member leaves.',
        observe: 'The table is what --describe prints, one row per group and partition.',
        async run(s, v) { hit(v, 'offs'); await s.wait(500); },
      },
    ],
  },
  takeaway: 'Every group gets every record; inside a group the partitions are split. Each group has its own committed offsets and lag in __consumer_offsets, reading removes nothing, and a new group starts at the log end (latest) or the beginning (earliest).',
  recap: {
    points: [
      'Within a group, each partition has one owner: work is shared.',
      'Across groups, every group reads every record: broadcast.',
      'Committed offsets and lag are per group and partition.',
      'Reading does not delete; only retention removes records.',
      'A slow group does not slow others, but retention can outrun it.',
      'New group: auto.offset.reset=latest (default) or earliest; reset-offsets replays on purpose.',
    ],
    interview: [
      { q: 'How do multiple consumer groups read the same topic?', a: 'Each **group** is an independent subscriber: it gets **every record**, keeps its **own committed offsets** in __consumer_offsets and its **own lag**. Inside a group the partitions are **split** among members. So Kafka is a **queue within a group** and **pub/sub across groups**.' },
      { q: 'Does consuming a message remove it from Kafka?', a: 'No. Records stay until **retention** (retention.ms / retention.bytes) or **compaction** removes them. Consumers only move their **offsets**, so any number of groups can read, and a group can **rewind** and read again.' },
      { q: 'What does auto.offset.reset do?', a: 'It applies when a group has **no committed offset** for a partition (a new group) or the committed offset is **out of range** (deleted by retention). **latest** (default) starts at the log end, **earliest** at the oldest retained record, **none** throws an error.' },
      { q: 'How would you reprocess a topic from yesterday?', a: 'Stop the group, then **kafka-consumer-groups.sh --reset-offsets --group G --to-datetime … --execute** (or seek() in code), and restart it. Or use a **new group id** with earliest. Other groups are unaffected.' },
    ],
  },
  quiz: {
    q: 'Groups billing (2 members) and shipping (1 member) subscribe to orders. One record is written. How many times is it delivered?',
    options: ['Once in total', 'Twice: once per group', 'Three times: once per consumer', 'It depends on the partition count'],
    answer: 1,
    why: 'Inside a group a record goes to one member; every group gets its own copy. Two groups → two deliveries, regardless of how many members each has.',
  },
  related: ['group', 'commit-lag', 'retention'],
};
