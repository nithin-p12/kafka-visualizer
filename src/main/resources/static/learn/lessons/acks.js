// Level 2 · Link 2: acks = 0 / 1 / all. When does the producer hear back, and what can be lost?
// One map: producer, leader B1 (log, ISR, purgatory, min.insync.replicas), followers B2 and B3, and a timeline that
// compares the three settings side by side. Flows: acks=all, acks=1, acks=0, and min.insync.replicas.
import { PARTITION_COLORS as PC, el, place } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { INK, MONO, BLUE, start, layers, frame, node, part, wire, along, packet, hit, swap, focus, enter, unfocus } from './flowmap.js';

const P0 = PC[0];
const BLK = { w: 36, h: 28, size: 13 }, FBLK = { w: 32, h: 26, size: 12 };
// ---- layout (960 × 460) ----
const PX = 134, PY = { send: 84, future: 150, sender: 216 };
const logX = off => 370 + (off - 98) * 42, LOG_Y = 112;
const FOL = [{ key: 'b2', name: 'B2', y: 92 }, { key: 'b3', name: 'B3', y: 220 }];
const fX = off => -73 + (off - 98) * 38;               // follower log slot, relative to the follower frame (centre 803)
const COLS = [360, 485, 610, 745, 880], COL_NAMES = ['sent', 'at the leader', 'leader wrote it', 'followers have it', 'HW moved'];
const ROWS = { 0: 350, 1: 384, all: 418 };
const ACKS = ['0', '1', 'all'];
// Where each setting hears back on the timeline, and the window where an acknowledged record is not yet safe.
const OUTCOME = {
  0: { col: 0, label: '"sent" · offset -1', band: [0, 4], risk: 'no confirmation at all' },
  1: { col: 2, label: '✓ ack', band: [2, 3], risk: 'acked, only on B1' },
  all: { col: 4, label: '✓ ack', band: null },
};

function scene(s, { acks = 'all', reference = true } = {}) {
  const v = start(s, { acks, parent: { send: 'prod', future: 'prod', sender: 'prod', log: 'b1', marks: 'b1', isr: 'b1', cfg: 'b1', purg: 'b1', hand: 'b1', row0: 'tl', row1: 'tl', rowall: 'tl' } });
  v.off = 100; v.leo = 100; v.hw = 100;

  // ---- producer ----
  frame(s, v, 'prod', PX, 155, 240, 250, 'Producer', { color: '#7a4aa3', fill: '#fcfaff', stroke: '#d8b7e9' });
  node(s, v, 'send', PX, PY.send, 210, 44, 'send(ORD101)', { sub: `acks=${acks}` });
  node(s, v, 'future', PX, PY.future, 210, 44, 'Future', { sub: 'not sent yet' });
  node(s, v, 'sender', PX, PY.sender, 210, 44, 'sender thread', { sub: 'idle' });
  for (const k of ['send', 'future', 'sender']) v.n[k].s.setAttribute('font-family', MONO);

  // ---- leader B1 ----
  frame(s, v, 'b1', 455, 155, 330, 250, 'Broker B1', { right: '★ leader' });
  v.n.b1.right.setAttribute('x', -60); v.n.b1.right.setAttribute('text-anchor', 'start');
  const marks = part(s, v, 'marks');
  v.marksT = s.text(marks, 606, 48, 'LEO 100 · HW 100', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  const cfg = part(s, v, 'cfg');
  s.text(cfg, 304, 76, 'min.insync.replicas = 2', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: MUTED });
  const log = part(s, v, 'log');
  s.text(log, 304, LOG_Y, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.log = [98, 99].map(o => s.block(logX(o), LOG_Y, `${o}`, P0, { ...BLK, parent: log }));
  const isr = part(s, v, 'isr');
  v.isrT = s.text(isr, 304, 166, 'ISR {B1, B2, B3}', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: '#3d4a55' });
  node(s, v, 'purg', 566, 176, 92, 56, 'purgatory', { sub: '(empty)', size: 14 });
  node(s, v, 'hand', 455, 244, 300, 36, 'request handler', { size: 15 });
  v.n.hand.t.setAttribute('text-anchor', 'start'); v.n.hand.t.setAttribute('x', -136);
  v.handT = s.text(v.n.hand, 138, 0, '', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });

  // ---- followers ----
  v.fol = FOL.map(f => {
    const b = frame(s, v, f.key, 803, f.y, 286, 116, `Broker ${f.name}`);
    b.state = s.text(b, 129, -40, 'follower · in ISR', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });
    s.text(b, -129, 4, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.blocks = [98, 99].map(o => s.block(fX(o), 4, `${o}`, P0, { ...FBLK, parent: b }));
    b.leoT = s.text(b, -129, 38, 'LEO 100', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    return Object.assign(b, f, { end: 100, online: true, inIsr: true });
  });

  // ---- timeline: when each setting hears back ----
  frame(s, v, 'tl', 480, 371, 932, 150, 'When does the producer hear back?', { color: INK });
  COLS.forEach((x, i) => {
    s.text(v.n.tl, x - 480, -47, COL_NAMES[i], { 'font-size': 13.5, fill: MUTED, 'font-weight': 600 });
    el('line', { x1: x - 480, x2: x - 480, y1: -36, y2: 64, stroke: '#eceef0', 'stroke-dasharray': '3 4' }, v.n.tl);
  });
  v.rows = {};
  for (const a of ACKS) {
    const r = part(s, v, `row${a}`);
    s.text(r, 34, ROWS[a], `acks=${a}`, { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    el('line', { x1: COLS[0], x2: COLS[4], y1: ROWS[a], y2: ROWS[a], stroke: '#d3d9e0', 'stroke-width': 2 }, r);
    r.ticks = [];
    v.rows[a] = r;
    if (reference === 'every' || (reference && a !== acks)) outcome(s, v, a, { faint: true });
  }

  // ---- wires ----
  wire(v, 'send-sender', `M${PX - 60},${PY.send + 22} C${PX - 80},150 ${PX - 80},170 ${PX - 60},${PY.sender - 22}`);
  wire(v, 'sender-hand', 'M239,216 C272,216 276,240 305,240');
  wire(v, 'hand-future', 'M305,252 C262,252 276,150 239,150');
  wire(v, 'sender-future', `M${PX},${PY.sender - 22} L${PX},${PY.future + 22}`);
  wire(v, 'hand-log', `M455,226 C455,170 ${logX(100)},150 ${logX(100)},${LOG_Y}`, { hidden: true });
  wire(v, 'log-hand', `M${logX(100)},${LOG_Y} C${logX(100)},150 455,170 455,226`, { hidden: true });
  wire(v, 'hand-purg', 'M556,226 L556,204');
  wire(v, 'purg-hand', 'M576,204 L576,226');
  wire(v, 'b2-hand', 'M660,84 C628,84 640,232 605,232');
  wire(v, 'hand-b2', 'M605,240 C650,240 626,100 660,100');
  wire(v, 'b3-hand', 'M660,212 C634,212 636,248 605,248');
  wire(v, 'hand-b3', 'M605,256 C646,256 632,228 660,228');
  layers(s, v);
  return v;
}

// ---- timeline drawing ----
function tick(s, v, a, col) {
  const d = el('circle', { cx: COLS[col], cy: ROWS[a], r: 5, fill: '#9aa3a9' }, v.rows[a]);
  v.rows[a].ticks.push(d);
  return s.pop(d, 200);
}
// The outcome of a setting on its row: the moment the producer hears back, plus the risk window, if any.
async function outcome(s, v, a, { faint = false } = {}) {
  const o = OUTCOME[a], r = v.rows[a], g = s.g(0, 0, r, faint ? { opacity: .38 } : {});
  if (o.band) {
    const [c1, c2] = o.band, x = COLS[c1], w = COLS[c2] - x;
    const band = el('rect', { x, y: ROWS[a] - 9, width: w, height: 18, rx: 9, fill: '#ce343424', stroke: '#ce343466' }, g);
    s.text(g, x + w / 2, ROWS[a], o.risk, { 'font-size': 13, 'font-weight': 700, fill: RED });
    if (!faint) { band.setAttribute('width', 0); await s.clock.tween(600, t => band.setAttribute('width', w * t)); }
  }
  const color = a === '0' ? MUTED : GREEN, x = COLS[o.col];
  const m = s.g(x, ROWS[a], g);
  el('circle', { r: 10, fill: color, stroke: '#fff', 'stroke-width': 2 }, m);
  s.text(m, 0, 0, a === '0' ? '…' : '✓', { 'font-size': 13, 'font-weight': 800, fill: '#fff' });
  s.text(m, -16, -1, o.label, { 'text-anchor': 'end', 'font-size': 13.5, 'font-weight': 700, fill: color });
  if (!faint) await s.pop(m, 300);
  return g;
}

// ---- broker-side motion ----
const marks = (s, v) => swap(s, v.marksT, `LEO ${v.leo} · HW ${v.hw}`, BLUE);
const isrText = v => `ISR {${['B1', ...v.fol.filter(f => f.inIsr).map(f => f.name)].join(', ')}}`;
async function append(s, v, off) {
  const b = s.block(455, 226, `${off}`, P0, { ...BLK, parent: v.packs });
  await s.pop(b, 200);
  const p = v.w['hand-log'];
  p.setAttribute('d', `M455,226 C455,170 ${logX(off)},150 ${logX(off)},${LOG_Y}`);
  await along(s, v, b, 'hand-log', 700);
  b.remove();
  v.log.push(s.block(logX(off), LOG_Y, `${off}`, P0, { ...BLK, parent: v.n.log }));
  v.leo = off + 1;
  hit(v, 'log');
  await marks(s, v);
}
async function followersFetch(s, v, off) {
  const live = v.fol.filter(f => f.online);
  await Promise.all(live.map(f => packet(s, v, `${f.key}-hand`, `Fetch(${off})`, BLUE, { ms: 700 })));
  hit(v, 'hand');
  await Promise.all(live.map(async f => {
    await packet(s, v, `hand-${f.key}`, `record ${off}`, GREEN, { ms: 700 });
    f.blocks.push(s.block(fX(off), 4, `${off}`, P0, { ...FBLK, parent: f }));
    f.end = off + 1;
    hit(v, f.key);
    await swap(s, f.leoT, `LEO ${f.end}`, BLUE);
  }));
}
async function nextFetch(s, v, off) {
  const live = v.fol.filter(f => f.online);
  await Promise.all(live.map(f => packet(s, v, `${f.key}-hand`, `Fetch(${off + 1})`, BLUE, { ms: 600 })));
  v.hw = Math.min(v.leo, ...v.fol.filter(f => f.inIsr).map(f => f.end));
  hit(v, 'marks');
  await marks(s, v);
}
const respond = async (s, v, label, color = GREEN) => { await packet(s, v, 'hand-future', label, color, { ms: 1000 }); hit(v, 'future'); };

// ---- the events, per setting ----
const sendEv = a => ({
  phase: 'Producer', on: ['send', 'sender'], wire: 'send-sender',
  title: `send() with acks=${a}`,
  text: a === 'all' ? 'acks=all (the default since Kafka 3.0) asks the leader to reply only when every in-sync replica has the record.'
    : a === '1' ? 'acks=1 asks the leader to reply as soon as the record is in its own log, without waiting for followers.'
      : 'acks=0 tells the producer not to wait for any reply at all.',
  observe: `send(ORD101) with acks=${a} hands the record to the sender thread.`,
  async run(s, v) { hit(v, 'send'); await packet(s, v, 'send-sender', 'ORD101', MUTED, { ms: 600 }); hit(v, 'sender'); await swap(s, v.n.sender.s, 'batch for P0', INK); },
});
const requestEv = a => ({
  phase: 'Producer', on: ['sender', 'hand', 'row' + a], wire: 'sender-hand',
  title: 'ProduceRequest to the leader',
  text: `The request carries the record and acks=${a}. The setting travels with every request: the broker does not have its own acks setting.`,
  observe: `A ProduceRequest (acks=${a}) travels to B1; the timeline starts at "sent".`,
  async run(s, v) {
    await tick(s, v, a, 0);
    await packet(s, v, 'sender-hand', `ProduceRequest acks=${a}`, BLUE, { ms: 1000 });
    hit(v, 'hand');
    await tick(s, v, a, 1);
  },
});
const isrCheck = {
  phase: 'Leader', on: ['hand', 'isr', 'cfg'],
  title: 'acks=all: is the ISR big enough?',
  text: 'Before writing an acks=all record, the leader compares the ISR with min.insync.replicas. The ISR has 3 members and the minimum is 2, so the write is allowed.',
  observe: 'The handler shows ISR 3 ≥ 2 ✓.',
  async run(s, v) { await swap(s, v.handT, 'ISR 3 ≥ min.insync 2 ✓', GREEN); hit(v, 'hand'); },
};
const appendEv = a => ({
  phase: 'Leader', on: ['hand', 'log', 'marks', 'row' + a], wire: 'hand-log',
  title: 'B1 writes offset 100',
  text: 'The leader appends the record to its log as offset 100, and its LEO becomes 101. Whatever acks says, this write is the same.',
  observe: 'Record 100 lands in B1\'s .log; LEO 101. The timeline reaches "leader wrote it".',
  async run(s, v) { await append(s, v, 100); await tick(s, v, a, 2); },
});
const parkEv = {
  phase: 'Leader', on: ['purg', 'hand'], wire: 'hand-purg',
  title: 'The request waits in purgatory',
  text: 'With acks=all the leader holds the request until the high watermark passes offset 100, meaning every ISR member has it, or until request.timeout.ms runs out.',
  observe: 'Purgatory shows "waiting for B2, B3".',
  async run(s, v) { await packet(s, v, 'hand-purg', 'park', AMBER, { ms: 400 }); hit(v, 'purg'); await swap(s, v.n.purg.s, 'waits: B2, B3', AMBER); },
};
const fetchEv = (a, extra = '') => ({
  phase: 'Followers', on: ['b2', 'b3', 'hand', 'row' + a], wires: ['b2-hand', 'b3-hand', 'hand-b2', 'hand-b3'],
  title: 'The followers fetch offset 100',
  text: `B2 and B3 send Fetch(100), get record 100 back and append it to their own logs. Their LEO becomes 101.${extra}`,
  observe: 'Fetch(100) goes up from each follower, record 100 comes back, and both LEOs turn 101.',
  async run(s, v) { await followersFetch(s, v, 100); await tick(s, v, a, 3); },
});
const hwEv = a => ({
  phase: 'Followers', on: ['b2', 'b3', 'marks', 'row' + a], wires: ['b2-hand', 'b3-hand'],
  title: 'Their next fetch moves the HW to 101',
  text: 'The followers\' next Fetch(101) tells B1 they have offset 100. Every ISR member is at 101, so the high watermark moves to 101: offset 100 is now committed.',
  observe: 'B1 shows HW 101; the timeline reaches "HW moved".',
  async run(s, v) { await nextFetch(s, v, 100); await tick(s, v, a, 4); },
});
const ackAll = {
  phase: 'Reply', on: ['purg', 'hand', 'future', 'rowall'], wires: ['purg-hand', 'hand-future'],
  title: 'Now B1 replies: offset 100',
  text: 'Purgatory releases the request and B1 sends the ProduceResponse with partition 0, offset 100. The Future completes. The producer heard back last, but the record is on all three brokers.',
  observe: 'A green ProduceResponse; the Future shows ✓ offset 100; the acks=all row gets its ✓ at "HW moved".',
  async run(s, v) {
    await packet(s, v, 'purg-hand', 'done', GREEN, { ms: 400 });
    await swap(s, v.n.purg.s, '(empty)', MUTED);
    await respond(s, v, 'ProduceResponse @100');
    await swap(s, v.n.future.s, '✓ offset 100', GREEN);
    await outcome(s, v, 'all');
  },
};
const ack1 = {
  phase: 'Reply', on: ['hand', 'future', 'row1'], wire: 'hand-future',
  title: 'B1 replies right away',
  text: 'With acks=1 there is no waiting: the leader answers as soon as offset 100 is in its own log. The Future completes with offset 100, while B2 and B3 do not have the record yet.',
  observe: 'The ProduceResponse leaves before any follower has record 100; the acks=1 row gets its ✓ at "leader wrote it".',
  async run(s, v) {
    await respond(s, v, 'ProduceResponse @100');
    await swap(s, v.n.future.s, '✓ offset 100', GREEN);
    await outcome(s, v, '1');
  },
};
const risk1 = {
  phase: 'Reply', on: ['log', 'isr', 'row1'],
  title: 'The risk window',
  text: 'The producer was told "done", but only B1 has offset 100. If B1 crashed now, B2 or B3 would become leader without it and the acknowledged record would be gone. The red band on the timeline is this window.',
  observe: 'B1\'s record 100 is outlined red; the band runs from "leader wrote it" to "followers have it".',
  async run(s, v) { const b = v.log.at(-1); b.rect.setAttribute('stroke', RED); b.rect.setAttribute('stroke-width', 3); await s.pulse(b); },
};
const close1 = {
  ...hwEv('1'),
  title: 'The window closes when the followers catch up',
  text: 'The followers\' next fetch moves the HW to 101 and the record is safe. With acks=1 the producer had already moved on; it never learns whether this happened.',
  async run(s, v) { await hwEv('1').run(s, v); v.log.at(-1).rect.removeAttribute('stroke'); },
};
const sent0 = {
  phase: 'Producer', on: ['sender', 'future', 'row0'], wires: ['sender-hand', 'sender-future'],
  title: 'The request leaves, and the producer calls it done',
  text: 'With acks=0 the Future completes as soon as the request is written to the network. RecordMetadata has offset -1: the producer never learns where the record went, or whether it arrived.',
  observe: 'The Future shows "sent · offset -1" while the request is still on its way; the acks=0 row gets its mark at "sent".',
  async run(s, v) {
    await tick(s, v, '0', 0);
    await Promise.all([packet(s, v, 'sender-future', 'done', MUTED, { ms: 500 }).then(() => swap(s, v.n.future.s, '"sent" · offset -1', MUTED)),
      packet(s, v, 'sender-hand', 'ProduceRequest acks=0', BLUE, { ms: 1000 })]);
    hit(v, 'hand');
    await tick(s, v, '0', 1);
    await outcome(s, v, '0');
  },
};
const none0 = {
  phase: 'Reply', on: ['hand', 'future'],
  title: 'B1 writes it, and replies nothing',
  text: 'The leader stores the record exactly as before but sends no ProduceResponse. Errors are never reported back, so retries cannot help: if B1 had been down, the record would simply be gone.',
  observe: 'The handler notes "acks=0 → no reply"; nothing travels back.',
  async run(s, v) { await swap(s, v.handT, 'acks=0 → no reply', RED); await s.shake(v.n.hand); },
};
const compare = a => ({
  phase: 'Compare', on: ['row0', 'row1', 'rowall'],
  title: 'Side by side',
  text: a === 'all' ? 'acks=all hears back last: after the high watermark moves. In exchange, an acknowledged record survives the loss of any broker while one in-sync replica is left. Use it for anything you cannot lose.'
    : a === '1' ? 'acks=1 hears back one step after the leader\'s write: lower latency, but a leader crash in the red window loses acknowledged data. Fine for data you can afford to lose now and then.'
      : 'acks=0 hears back immediately and learns nothing: highest throughput, no guarantee. Only for data like metrics or logs where losing some is acceptable.',
  observe: 'The three rows: where each setting gets its answer, and where it is exposed.',
  async run(s, v) { for (const a2 of ACKS) { hit(v, 'row' + a2); await s.wait(350); } },
});

// ---- min.insync.replicas ----
const down = (f, { title, text, observe }) => ({
  phase: 'Shrinking ISR', on: [f, 'isr'],
  title, text, observe,
  async run(s, v) {
    const b = v.fol.find(x => x.key === f);
    b.online = false; b.inIsr = false;
    b.rect.setAttribute('stroke', RED); b.rect.setAttribute('fill', '#fff4f4');
    await swap(s, b.state, '✕ down · out of ISR', RED);
    hit(v, f);
    await swap(s, v.isrT, isrText(v), AMBER);
  },
});
const M = {
  b3down: down('b3', {
    title: 'B3 stops fetching and leaves the ISR',
    text: 'B3 crashes. When it has not caught up for replica.lag.time.max.ms (30 s), the leader removes it from the ISR. The ISR is now {B1, B2}: two members, still at the minimum of 2.',
    observe: 'B3 turns red; ISR {B1, B2}.',
  }),
  okWrite: {
    phase: 'Shrinking ISR', on: ['sender', 'hand', 'cfg', 'log', 'b2'], wires: ['sender-hand', 'hand-log', 'b2-hand', 'hand-b2'],
    title: 'acks=all still works: ISR 2 ≥ 2',
    text: 'A new acks=all record passes the check (ISR 2 ≥ min.insync.replicas 2). B1 writes offset 100 and waits only for the ISR, which is now just B2. B3 is not waited for.',
    observe: 'ISR 2 ≥ 2 ✓; record 100 reaches B1 and B2, not B3.',
    async run(s, v) {
      await packet(s, v, 'sender-hand', 'ProduceRequest acks=all', BLUE, { ms: 900 });
      await swap(s, v.handT, 'ISR 2 ≥ min.insync 2 ✓', GREEN);
      await append(s, v, 100);
      await followersFetch(s, v, 100);
    },
  },
  okAck: {
    phase: 'Shrinking ISR', on: ['marks', 'future', 'b2'], wires: ['b2-hand', 'hand-future'],
    title: 'HW moves with B2 alone, and the write succeeds',
    text: 'B2\'s next fetch moves the HW to 101 (B3 is out of the ISR, so it does not hold the HW back). The producer gets offset 100. The record now lives on two brokers.',
    observe: 'HW 101; the Future shows ✓ offset 100.',
    async run(s, v) { await nextFetch(s, v, 100); await respond(s, v, 'ProduceResponse @100'); await swap(s, v.n.future.s, '✓ offset 100', GREEN); },
  },
  b2down: down('b2', {
    title: 'B2 goes down too: ISR {B1}',
    text: 'Now B2 also fails and drops out of the ISR. Only the leader is left: an ISR of 1, below min.insync.replicas = 2.',
    observe: 'B2 turns red; ISR {B1}.',
  }),
  reject: {
    phase: 'Shrinking ISR', on: ['sender', 'hand', 'cfg', 'isr', 'future'], wires: ['sender-hand', 'hand-future'],
    title: 'The next acks=all write is refused',
    text: 'The ISR (1) is below min.insync.replicas (2), so the leader rejects the acks=all write with NOT_ENOUGH_REPLICAS, without appending it. Kafka refuses rather than accept a record that only one broker holds.',
    observe: 'The handler shows ISR 1 < 2 ✕ and an error goes back; nothing is added to the .log.',
    async run(s, v) {
      await swap(s, v.n.future.s, 'pending (offset 101)', AMBER);
      await packet(s, v, 'sender-hand', 'ProduceRequest acks=all', BLUE, { ms: 900 });
      await swap(s, v.handT, 'ISR 1 < min.insync 2 ✕', RED);
      await s.shake(v.n.hand);
      await respond(s, v, 'NOT_ENOUGH_REPLICAS', RED);
    },
  },
  retry: {
    phase: 'Shrinking ISR', on: ['sender', 'future'],
    title: 'The producer retries, then gives up',
    text: 'NOT_ENOUGH_REPLICAS is retriable, so the producer keeps retrying until delivery.timeout.ms (2 minutes) runs out, then fails the Future with an exception. acks=1 writes would still succeed: min.insync.replicas only applies to acks=all.',
    observe: 'The sender shows "retrying…"; the Future fails after the timeout.',
    async run(s, v) {
      await swap(s, v.n.sender.s, 'retrying… (2 min)', AMBER);
      await s.pulse(v.n.sender, 2);
      await swap(s, v.n.future.s, '✕ NotEnoughReplicas', RED);
    },
  },
};

const trackOf = (a, steps, opts = {}) => { const t = { continuous: true, build: s => { const v = scene(s, { acks: a, ...opts }); v.track = t; return v; }, enter, steps }; return t; };
const flowAll = trackOf('all', [sendEv('all'), requestEv('all'), isrCheck, appendEv('all'), parkEv, fetchEv('all'), hwEv('all'), ackAll, compare('all')]);
const flowOne = trackOf('1', [sendEv('1'), requestEv('1'), appendEv('1'), ack1, risk1, fetchEv('1'), close1, compare('1')]);
const flowZero = trackOf('0', [sendEv('0'), sent0, appendEv('0'), none0, fetchEv('0', ' Replication does not depend on acks.'), hwEv('0'), compare('0')]);
const flowIsr = trackOf('all', [M.b3down, M.okWrite, M.okAck, M.b2down, M.reject, M.retry], { reference: 'every' });

// ---- try it: real rules on a small cluster ----
async function trySend(s, v, a) {
  const off = v.off;
  if (off > 103) { v.message = 'This sandbox holds four records. Switch tabs and back to start again.'; return; }
  await swap(s, v.n.future.s, 'pending', AMBER);
  await packet(s, v, 'sender-hand', `ProduceRequest acks=${a}`, BLUE, { ms: 800 });
  const isr = 1 + v.fol.filter(f => f.inIsr).length;
  if (a === '0') await swap(s, v.n.future.s, '"sent" · offset -1', MUTED);
  if (a === 'all' && isr < 2) {
    await swap(s, v.handT, `ISR ${isr} < min.insync 2 ✕`, RED);
    await respond(s, v, 'NOT_ENOUGH_REPLICAS', RED);
    await swap(s, v.n.future.s, '✕ NotEnoughReplicas', RED);
    v.message = `Refused: the ISR has ${isr} member and acks=all needs at least min.insync.replicas = 2. Nothing was written. acks=1 or 0 would still be accepted.`;
    return;
  }
  await swap(s, v.handT, a === 'all' ? `ISR ${isr} ≥ min.insync 2 ✓` : `acks=${a}: no ISR check`, a === 'all' ? GREEN : MUTED);
  await append(s, v, off);
  if (a === '1') { await respond(s, v, `ProduceResponse @${off}`); await swap(s, v.n.future.s, `✓ offset ${off}`, GREEN); }
  const live = v.fol.filter(f => f.online);
  if (live.length) { await followersFetch(s, v, off); }
  v.hw = Math.min(v.leo, ...v.fol.filter(f => f.inIsr).map(f => f.end));
  if (live.length) await nextFetch(s, v, off); else await marks(s, v);
  if (a === 'all') { await respond(s, v, `ProduceResponse @${off}`); await swap(s, v.n.future.s, `✓ offset ${off}`, GREEN); }
  if (a === '0') await swap(s, v.handT, 'acks=0 → no reply', MUTED);
  v.off++;
  const copies = 1 + live.length;
  v.message = a === 'all' ? `acks=all: the producer heard back after HW reached ${v.hw}. Offset ${off} is on ${copies} broker${copies > 1 ? 's' : ''} (every ISR member).`
    : a === '1' ? `acks=1: the producer heard back right after B1's write, ${live.length ? 'before the followers copied it' : 'and no follower is online to copy it'}. Now on ${copies} broker${copies > 1 ? 's' : ''}.`
      : `acks=0: the producer only knows it was sent (offset -1). B1 stored it as offset ${off}; it is on ${copies} broker${copies > 1 ? 's' : ''}.`;
}
async function toggle(s, v, key) {
  const f = v.fol.find(x => x.key === key);
  f.online = !f.online;
  if (!f.online) {
    f.inIsr = false;
    f.rect.setAttribute('stroke', RED); f.rect.setAttribute('fill', '#fff4f4');
    await swap(s, f.state, '✕ down · out of ISR', RED);
    await swap(s, v.isrT, isrText(v), AMBER);
    v.message = `${f.name} stopped. After replica.lag.time.max.ms the leader drops it from the ISR (here at once): ${isrText(v)}.`;
    return;
  }
  f.rect.setAttribute('stroke', '#c9ced2'); f.rect.setAttribute('fill', '#fff');
  await swap(s, f.state, 'follower · catching up', AMBER);
  for (let o = f.end; o < v.leo; o++) {
    await packet(s, v, `${key}-hand`, `Fetch(${o})`, BLUE, { ms: 500 });
    await packet(s, v, `hand-${key}`, `record ${o}`, GREEN, { ms: 500 });
    f.blocks.push(s.block(fX(o), 4, `${o}`, P0, { ...FBLK, parent: f }));
    f.end = o + 1;
    await swap(s, f.leoT, `LEO ${f.end}`, BLUE);
  }
  f.inIsr = true;
  await swap(s, f.state, 'follower · in ISR', MUTED);
  await swap(s, v.isrT, isrText(v), '#3d4a55');
  v.hw = Math.min(v.leo, ...v.fol.filter(x => x.inIsr).map(x => x.end));
  await marks(s, v);
  v.message = `${f.name} is back, fetched what it missed and rejoined the ISR: ${isrText(v)}.`;
}

export default {
  id: 'acks', n: 14, title: 'acks = 0 / 1 / all', tagline: 'When the producer hears back',
  docked: true,
  guide: {
    what: 'acks is a producer setting that says how many replicas must have a record before the leader answers: none (0), the leader (1) or every in-sync replica (all). Replication itself is the same; only the moment of the answer, and so the risk, changes.',
    fits: 'Second link of Level 2: producer ↔ leader ↔ followers. Key → partition decided where a record goes; acks decides when the producer may consider it written. Next: the replication flow itself.',
  },
  flows: [
    { id: 'all', short: 'acks=all', label: 'acks=all', about: 'Reply once every in-sync replica has it.', track: flowAll },
    { id: 'one', short: 'acks=1', label: 'acks=1', about: 'Reply after the leader\'s own write.', track: flowOne },
    { id: 'zero', short: 'acks=0', label: 'acks=0', about: 'No reply at all.', track: flowZero },
    { id: 'isr', short: 'min.insync', label: 'min.insync.replicas', about: 'What acks=all does when brokers fail.', track: flowIsr },
  ],
  watch: flowAll,
  tryIt: {
    intro: 'Pick acks and press send(). Stop B2 or B3 to shrink the ISR, then send with acks=all, acks=1 and acks=0 and compare.',
    observe: 'acks=all is refused when the ISR drops below min.insync.replicas (2); acks=1 and 0 keep going but with fewer copies.',
    controls: [
      { type: 'choice', name: 'acks', label: 'acks', options: ['all', '1', '0'] },
      { type: 'button', label: 'send()', primary: true, run: 'one' },
      { type: 'button', label: 'Stop / start B2', run: 'b2' },
      { type: 'button', label: 'Stop / start B3', run: 'b3' },
    ],
    build(s) {
      const v = scene(s, { acks: 'all', reference: false });
      v.track = flowAll;
      v.message = 'Press send(). Then stop a follower or two and send again.';
      return v;
    },
    async one(s, v, input) { unfocus(v); v.n.send.s.textContent = `acks=${input.acks}`; await trySend(s, v, input.acks); },
    async b2(s, v) { unfocus(v); await toggle(s, v, 'b2'); },
    async b3(s, v) { unfocus(v); await toggle(s, v, 'b3'); },
    readout: v => `B1 <b>LEO ${v.leo} · HW ${v.hw}</b> · <b>${isrText(v)}</b> · min.insync.replicas <b>2</b> · Producer: <b>${v.n.future.s.textContent}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Retries and idempotence, durability settings, and the acks=all latency cost.',
    continuous: true,
    build(s) { const v = scene(s, { acks: 'all' }); v.track = this; return v; },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['sender', 'future'],
        title: 'acks and retries: duplicates without idempotence',
        text: 'If a reply is lost after the leader wrote the record, the producer retries and the leader could write it twice. enable.idempotence=true (default since 3.0, requires acks=all) gives each batch a producer id and sequence number, so the leader drops the duplicate. See the idempotence deep dive.',
        observe: 'The sender and Future: where a lost reply turns into a retry.',
        async run(s, v) { await swap(s, v.n.sender.s, 'retry with seq #7', AMBER); await swap(s, v.n.future.s, 'dup dropped by leader', GREEN); },
      },
      {
        on: ['cfg', 'isr'],
        title: 'The usual durable setup',
        text: 'replication.factor=3, min.insync.replicas=2, acks=all: every acknowledged write is on at least two brokers, and the topic keeps accepting writes with one broker down. With min.insync.replicas=3 a single broker failure would stop writes.',
        observe: 'min.insync.replicas = 2 next to an ISR of three.',
        async run(s, v) { hit(v, 'cfg'); await s.wait(600); },
      },
      {
        on: ['tl', 'row0', 'row1', 'rowall'],
        title: 'What acks=all costs',
        text: 'acks=all adds the time for the slowest in-sync follower to fetch, usually a few milliseconds in one data centre. Batching (linger.ms, batch.size) and max.in.flight.requests hide most of it, so throughput stays high even though each send waits longer.',
        observe: 'On the timeline, acks=all answers two columns after acks=1.',
        async run(s, v) { hit(v, 'rowall'); await s.wait(600); },
      },
      {
        on: ['hand', 'log'],
        title: 'Not enough replicas after append',
        text: 'If the ISR shrinks after the record was appended but before it was replicated, the leader answers NOT_ENOUGH_REPLICAS_AFTER_APPEND. The record may be in the log anyway, so a retry can duplicate it unless idempotence is on.',
        observe: 'The handler names the "after append" error.',
        async run(s, v) { await swap(s, v.handT, 'NOT_ENOUGH_REPLICAS_AFTER_APPEND', RED); },
      },
    ],
  },
  takeaway: 'acks sets when the leader answers: 0 never, 1 after its own write, all after every in-sync replica has the record. With acks=all, min.insync.replicas is the floor: below it, writes are refused instead of accepted with too few copies.',
  recap: {
    points: [
      'acks is set by the producer and sent with every request.',
      'acks=0: no reply, offset -1, no retries: possible silent loss.',
      'acks=1: reply after the leader\'s write; lost if the leader dies before followers copy it.',
      'acks=all (default since 3.0): reply after the whole ISR has it (HW passes it).',
      'min.insync.replicas: below it, acks=all writes get NOT_ENOUGH_REPLICAS; acks=1/0 are not affected.',
      'Durable setup: RF=3, min.insync.replicas=2, acks=all, idempotence on.',
    ],
    interview: [
      { q: 'Explain acks=0, 1 and all.', a: '**acks=0**: the producer does not wait; offset unknown, errors invisible. **acks=1**: the **leader** replies after its own write; if it dies before followers copy the record, an acknowledged write is lost. **acks=all**: the leader replies after **every in-sync replica** has the record; it survives a broker failure as long as one ISR member remains.' },
      { q: 'Does acks=all mean all replicas?', a: 'No: all **in-sync** replicas. A follower that fell out of the ISR is not waited for. That is why **min.insync.replicas** exists: with RF=3 and min.insync=2, acks=all guarantees at least **two copies**, and writes are **refused** (NOT_ENOUGH_REPLICAS) when fewer are in sync.' },
      { q: 'Which settings give no data loss?', a: '**replication.factor=3**, **min.insync.replicas=2**, **acks=all**, **enable.idempotence=true** (no duplicates on retry), and **unclean.leader.election.enable=false** so an out-of-sync replica never becomes leader.' },
      { q: 'What happens when the ISR is smaller than min.insync.replicas?', a: 'acks=all writes are rejected with **NOT_ENOUGH_REPLICAS** (retriable), so the producer retries until **delivery.timeout.ms**. Reads still work, and **acks=1/0** writes are still accepted. The topic is effectively read-only for durable producers until a follower catches up and rejoins.' },
    ],
  },
  quiz: {
    q: 'RF=3, min.insync.replicas=2, acks=all. Two of the three brokers holding the partition go down. What happens to new writes?',
    options: ['They succeed with one copy', 'They are rejected with NOT_ENOUGH_REPLICAS', 'They wait until the brokers return, then succeed instantly', 'They are written to another partition'],
    answer: 1,
    why: 'The ISR is down to the leader alone (1), below min.insync.replicas (2), so acks=all writes are refused. The producer retries until delivery.timeout.ms.',
  },
  related: ['key-routing', 'replica', 'journey'],
};
