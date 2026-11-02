// Level 3: the journey of one message, event by event, on one fixed map of the whole route.
// Every node and wire is drawn from the start. Each event lights its own nodes and wire, a packet glides along
// the wire, and everything else blurs back. Flows: acks=all (the happy path), acks=1 and acks=0.
import { PARTITION_COLORS as PC, el, place } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';

const P0 = PC[0], INK = '#203347', MONO = 'Consolas, monospace';
const BLUE = '#2f6fe0', PURPLE = '#8f4fc4';
const BLK = { w: 38, h: 30, size: 14 }, SBLK = { w: 34, h: 26, size: 13 };

// ---- layout (960 × 460) ----
const PX = 114;                                       // producer column centre
const NODE_Y = { app: 82, meta: 156, ser: 230, part: 288, acc: 348, sender: 406 };
const LOG_Y = 86, IDX_Y = 128, TIX_Y = 168, HAND_Y = 228;
const logX = off => 352 + (off - 96) * 44;
const FOL = [{ key: 'b2', x: 348, name: 'B2', req: 318, res: 378 }, { key: 'b3', x: 594, name: 'B3', req: 564, res: 624 }];
const FY = 345, fSlot = off => -28 + (off - 99) * 40;
const CX = 836;

function frame(s, v, key, x, y, w, h, title, { color = INK, fill = '#fff', stroke = '#c9ced2', right } = {}) {
  const g = s.box(x, y, w, h, '', { fill, stroke, rx: 12 });
  g.classList.add('jn');
  s.text(g, -w / 2 + 14, -h / 2 + 18, title, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700, fill: color });
  if (right) g.right = s.text(g, w / 2 - 14, -h / 2 + 18, right, { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: AMBER });
  v.n[key] = g;
  return g;
}
function node(s, v, key, x, y, w, h, title, { sub, mono, size = 15, color = INK } = {}) {
  const g = s.box(x, y, w, h, '', { rx: 8 });
  g.classList.add('jn');
  g.t = s.text(g, 0, sub != null ? -9 : 0, title, { 'font-size': size, 'font-weight': 650, fill: color, 'font-family': mono ? MONO : null });
  if (sub != null) g.s = s.text(g, 0, 11, sub, { 'font-size': 14, fill: MUTED, 'font-family': mono ? MONO : null });
  v.n[key] = g;
  return g;
}
// A group that only takes part in focus (no box of its own), e.g. a file row or a text line.
function part(s, v, key) { const g = s.g(0, 0); g.classList.add('jn'); v.n[key] = g; return g; }
function wire(v, key, d, { hidden = false, arrow = true } = {}) {
  const p = el('path', { d, class: `jw${hidden ? ' hidden-wire' : ''}`, 'marker-end': arrow && !hidden ? 'url(#learn-arrow)' : null }, v.wires);
  v.w[key] = p;
  return p;
}
function entry(s, parent, x, y, t, w) {
  const e = s.box(x, y, w, 28, t, { parent, size: 14, fill: '#f6f7fb', stroke: '#d5d9dc', rx: 5, weight: 600 });
  e.label.setAttribute('font-family', MONO);
  return e;
}

function scene(s, { acks = 'all' } = {}) {
  const v = { acks, n: {}, w: {} };
  v.wires = s.g(0, 0);

  // ---- producer ----
  frame(s, v, 'prod', PX, 236, 200, 412, 'Producer', { color: '#7a4aa3', fill: '#fcfaff', stroke: '#d8b7e9' });
  v.acksT = s.text(v.n.prod, 86, -188, `acks=${acks}`, { 'text-anchor': 'end', 'font-size': 14, 'font-family': MONO, fill: MUTED });
  node(s, v, 'app', PX, NODE_Y.app, 172, 44, 'send(ORD101, order)', { sub: 'your code', mono: true, size: 14 });
  v.n.app.s.setAttribute('font-family', 'Segoe UI, Arial, sans-serif');
  const meta = node(s, v, 'meta', PX, NODE_Y.meta, 172, 80, '');
  meta.t.setAttribute('y', -26); meta.t.textContent = 'metadata cache';
  v.metaEmpty = s.text(meta, 0, 10, '(empty)', { 'font-size': 15, fill: MUTED });
  v.metaRows = ['P0 → B1', 'P1 → B2', 'P2 → B3'].map((t, i) => s.text(meta, 0, -6 + i * 18, t, { 'font-size': 15, 'font-family': MONO, 'font-weight': 700, fill: PC[i], opacity: 0 }));
  node(s, v, 'ser', PX, NODE_Y.ser, 172, 44, 'serializer', { sub: 'key, value → bytes' });
  node(s, v, 'part', PX, NODE_Y.part, 172, 48, 'partitioner', { sub: 'hash(key) % 3', mono: false });
  v.n.part.s.setAttribute('font-family', MONO);
  node(s, v, 'acc', PX, NODE_Y.acc, 172, 44, 'accumulator', { sub: 'batch for P0: empty' });
  node(s, v, 'sender', PX, NODE_Y.sender, 172, 44, 'sender thread', { sub: 'idle' });

  // ---- leader B1 ----
  frame(s, v, 'b1', 471, 144, 470, 228, 'Broker B1', { right: '★ leader of orders-0' });
  v.n.b1.right.setAttribute('x', -125); v.n.b1.right.setAttribute('text-anchor', 'start');
  const marks = part(s, v, 'marks');
  v.leoT = s.text(marks, 612, 48, 'LEO 100', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.hwT = s.text(marks, 694, 48, 'HW 100', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  const row = (key, y, label) => { const g = part(s, v, key); s.text(g, 248, y, label, { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 }); return g; };
  const log = row('log', LOG_Y, '.log');
  v.log = [96, 97, 98, 99].map(o => s.block(logX(o), LOG_Y, `${o}`, P0, { ...BLK, parent: log }));
  v.hole = s.box(logX(100), LOG_Y, BLK.w, BLK.h, '', { parent: log, dash: '4 3', stroke: P0, rx: 3 });
  v.byteT = s.text(log, logX(100) + 24, LOG_Y, '', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: MUTED });
  const idx = row('idx', IDX_Y, '.index');
  v.idx = [entry(s, idx, 375, IDX_Y, '0 → 0', 70), entry(s, idx, 466, IDX_Y, '52 → 4410', 96)];
  const tix = row('tix', TIX_Y, '.timeindex');
  v.tix = [entry(s, tix, 400, TIX_Y, '17:59:58 → 52', 122)];
  node(s, v, 'purg', 656, 128, 76, 112, '');
  v.n.purg.t.setAttribute('y', -38); v.n.purg.t.textContent = 'purgatory'; v.n.purg.t.setAttribute('font-size', 14);
  v.purgT = [0, 1, 2].map(i => s.text(v.n.purg, 0, -10 + i * 20, '', { 'font-size': 14, fill: MUTED }));
  v.purgT[0].textContent = '(empty)';
  node(s, v, 'hand', 472, HAND_Y, 448, 40, 'request handler', { size: 15 });
  v.n.hand.t.setAttribute('text-anchor', 'start'); v.n.hand.t.setAttribute('x', -210);
  v.handT = s.text(v.n.hand, 214, 0, '', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });

  // ---- followers ----
  for (const f of FOL) {
    const b = frame(s, v, f.key, f.x, FY, 224, 110, `Broker ${f.name}`);
    s.text(b, 98, -37, 'follower', { 'text-anchor': 'end', 'font-size': 15, fill: MUTED });
    s.text(b, -98, 0, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.blocks = [s.block(fSlot(99), 0, '99', P0, { ...SBLK, parent: b })];
    b.hole = s.box(fSlot(100), 0, SBLK.w, SBLK.h, '', { parent: b, dash: '4 3', stroke: P0, rx: 3 });
    b.leo = s.text(b, -98, 36, 'LEO 100', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    Object.assign(b, f);
  }
  v.fol = FOL.map(f => v.n[f.key]);
  const isr = part(s, v, 'isr');
  v.isrT = s.text(isr, 471, 428, 'ISR {B1, B2, B3} · B1 sees B2 at 100, B3 at 100', { 'font-size': 15, 'font-weight': 650, fill: '#3d4a55' });

  // ---- consumer side ----
  frame(s, v, 'cons', CX, 144, 220, 228, 'Consumer', { color: '#13968a', fill: '#f7fcfb', stroke: '#bfe4df' });
  s.text(v.n.cons, 96, -96, 'group orders-app', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED });
  node(s, v, 'poll', CX, 90, 180, 40, 'poll()', { size: 15 });
  node(s, v, 'deser', CX, 144, 180, 36, 'deserializer');
  node(s, v, 'listen', CX, 198, 180, 40, 'listener: process order', { size: 14 });
  const pos = part(s, v, 'pos');
  v.posT = s.text(pos, CX, 238, 'position: 100', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  frame(s, v, 'coord', CX, FY, 220, 110, 'Group coordinator');
  s.text(v.n.coord, 0, -6, '__consumer_offsets', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.committedT = s.text(v.n.coord, 0, 24, 'orders-0 → 100', { 'font-size': 15, 'font-family': MONO, fill: MUTED, 'font-weight': 700 });

  // ---- wires (requests and responses travel on separate curves) ----
  const vline = (x, y1, y2) => `M${x},${y1} L${x},${y2}`;
  wire(v, 'app-meta', vline(PX, NODE_Y.app + 22, NODE_Y.meta - 40));
  wire(v, 'meta-ser', vline(PX, NODE_Y.meta + 40, NODE_Y.ser - 22));
  wire(v, 'ser-part', vline(PX, NODE_Y.ser + 22, NODE_Y.part - 24));
  wire(v, 'part-acc', vline(PX, NODE_Y.part + 24, NODE_Y.acc - 22));
  wire(v, 'acc-sender', vline(PX, NODE_Y.acc + 22, NODE_Y.sender - 22));
  wire(v, 'meta-hand', 'M200,142 C232,142 222,216 248,216');
  wire(v, 'hand-meta', 'M248,226 C214,226 234,166 200,166');
  wire(v, 'sender-hand', 'M200,400 C236,400 222,236 248,236');
  wire(v, 'hand-sender', 'M248,244 C226,244 230,414 200,414');
  wire(v, 'sender-app', `M28,${NODE_Y.sender} C4,${NODE_Y.sender} 4,${NODE_Y.app} 28,${NODE_Y.app}`);
  wire(v, 'hand-purg', 'M656,208 L656,184');
  wire(v, 'purg-hand', 'M640,184 L640,208');
  wire(v, 'hand-log', `M420,208 C420,150 ${logX(100)},140 ${logX(100)},${LOG_Y}`, { hidden: true });
  wire(v, 'log-hand', `M${logX(100)},${LOG_Y} C${logX(100)},140 420,150 420,208`, { hidden: true });
  for (const f of FOL) {
    wire(v, `${f.key}-hand`, vline(f.req, FY - 55, HAND_Y + 20));
    wire(v, `hand-${f.key}`, vline(f.res, HAND_Y + 20, FY - 55));
  }
  wire(v, 'cons-hand', 'M746,84 C716,84 726,222 696,222');
  wire(v, 'hand-cons', 'M696,236 C724,236 714,98 746,98');
  wire(v, 'poll-deser', vline(CX, 110, 126));
  wire(v, 'deser-listen', vline(CX, 162, 178));
  wire(v, 'cons-coord', vline(CX - 16, 258, FY - 55));
  wire(v, 'coord-cons', vline(CX + 16, FY - 55, 258));

  v.packs = s.g(0, 0);
  return v;
}

// ---- motion helpers ----
// Glide a node along a wire (eased), or along a straight line when there is no wire.
function along(s, v, n, key, ms = 1000) {
  const p = v.w[key], L = p.getTotalLength();
  return s.clock.tween(ms, t => { const q = p.getPointAtLength(L * t); place(n, q.x, q.y); });
}
// A message on a wire: a coloured dot with its label riding just above it.
async function packet(s, v, key, label, color = BLUE, { ms = 1100, keep = false } = {}) {
  const g = s.g(0, 0, v.packs);
  const w = label.length * 7.6 + 18;
  el('rect', { x: -w / 2, y: -34, width: w, height: 24, rx: 12, fill: '#fff', stroke: color, 'stroke-width': 1.4 }, g);
  s.text(g, 0, -22, label, { 'font-size': 13.5, 'font-weight': 700, fill: color });
  el('circle', { r: 7, fill: color, stroke: '#fff', 'stroke-width': 2 }, g);
  v.w[key].style.setProperty('--wc', color);
  await along(s, v, g, key, ms);
  if (keep) return g;
  await s.fade(g, 0, 180);
  g.remove();
}
// Move to the wire's start first (when the node is elsewhere), then glide along it. ms 0: only the first move.
async function ride(s, v, n, key, ms = 900, lead = 300) {
  const q = v.w[key].getPointAtLength(0);
  if (Math.hypot((n._x ?? 0) - q.x, (n._y ?? 0) - q.y) > 2) await s.move(n, q.x, q.y, lead);
  if (ms) await along(s, v, n, key, ms);
}
function unfocus(v) {
  for (const n of Object.values(v.n)) n.classList.remove('on', 'ctx', 'dim');
  for (const p of Object.values(v.w)) p.classList.remove('live', 'trail');
}
// The record moving between two producer boxes: a small bead that glides from one to the next and is absorbed.
async function bead(s, v, from, to, color) {
  const b = el('circle', { r: 7, fill: color, stroke: '#fff', 'stroke-width': 2 }, v.packs);
  place(b, PX, NODE_Y[from]);
  await s.move(b, PX, NODE_Y[to], 650);
  await s.fade(b, 0, 150);
  b.remove();
  hit(v, to);
}
function hit(v, key) {
  const n = v.n[key];
  if (!n || !n.isConnected) return;
  n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit');
}
// Change a text smoothly: fade out, swap, fade in.
async function swap(s, t, str, color) {
  await s.fade(t, 0, 160);
  t.textContent = str;
  if (color) t.setAttribute('fill', color);
  await s.fade(t, 1, 220);
}
const shape = (b, w, h) => { b.rect.setAttribute('width', w); b.rect.setAttribute('x', -w / 2); b.rect.setAttribute('height', h); b.rect.setAttribute('y', -h / 2); };

// Focus: the event's nodes stay sharp, frames holding them stay readable, everything else blurs back.
const PARENT = { app: 'prod', meta: 'prod', ser: 'prod', part: 'prod', acc: 'prod', sender: 'prod', marks: 'b1', log: 'b1', idx: 'b1', tix: 'b1', purg: 'b1', hand: 'b1', isr: null, poll: 'cons', deser: 'cons', listen: 'cons', pos: 'cons' };
function focus(v, on = [], wires = [], trail = []) {
  const set = new Set(on), ctx = new Set(on.map(k => PARENT[k]).filter(Boolean));
  for (const [k, n] of Object.entries(v.n)) {
    const lit = set.has(k);
    n.classList.toggle('on', lit);
    n.classList.toggle('ctx', !lit && ctx.has(k));
    n.classList.toggle('dim', !lit && !ctx.has(k));
  }
  const live = new Set(wires), past = new Set(trail);
  for (const [k, p] of Object.entries(v.w)) {
    p.classList.toggle('live', live.has(k));
    p.classList.toggle('trail', !live.has(k) && past.has(k));
  }
  v.packs.classList.remove('dim');
}
const wiresOf = st => [st.wire, ...(st.wires ?? [])].filter(Boolean);
// The track's enter(): light this event, and keep every wire travelled so far as a trail.
const enter = (s, v, i) => {
  const steps = v.track.steps;
  focus(v, steps[i].on, wiresOf(steps[i]), steps.slice(0, i).flatMap(wiresOf));
};

// ---- the events ----
const E = {
  send: {
    phase: 'Producer', on: ['app'],
    title: 'Your code calls send()',
    text: 'kafkaTemplate.send("orders", "ORD101", order). The producer builds a record: topic orders, key ORD101, the order as the value, a timestamp and optional headers.',
    observe: 'send() now holds the record ORD101.',
    async run(s, v) { hit(v, 'app'); await swap(s, v.n.app.s, 'record: key ORD101', INK); },
  },
  metaCheck: {
    phase: 'Producer', on: ['app', 'meta'], wire: 'app-meta',
    title: 'First: does it know where orders lives?',
    text: 'Before anything else, send() checks its metadata cache for topic orders. Right after start-up the cache is empty, so send() has to wait for metadata (up to max.block.ms).',
    observe: 'The lookup reaches the metadata cache and finds it empty.',
    async run(s, v) { await bead(s, v, 'app', 'meta', '#9aa3a9'); await s.shake(v.n.meta); await swap(s, v.metaEmpty, '(empty): fetch it', AMBER); },
  },
  metaReq: {
    phase: 'Producer', on: ['meta', 'hand'], wire: 'meta-hand',
    title: 'MetadataRequest to the bootstrap broker',
    text: 'The producer only knows bootstrap.servers, here B1:9092. It sends a MetadataRequest for topic orders. Any broker can answer; it does not have to be a leader.',
    observe: 'A blue MetadataRequest travels to B1\'s request handler.',
    async run(s, v) { await packet(s, v, 'meta-hand', 'MetadataRequest(orders)'); hit(v, 'hand'); },
  },
  metaRes: {
    phase: 'Producer', on: ['hand', 'meta'], wire: 'hand-meta',
    title: 'B1 replies with brokers, partitions and leaders',
    text: 'The MetadataResponse lists the brokers (B1, B2, B3), the partitions of orders (P0, P1, P2) and the leader and replicas of each. The producer caches it and refreshes it only when needed.',
    observe: 'A green MetadataResponse comes back and the cache fills in: one leader per partition.',
    async run(s, v) {
      await packet(s, v, 'hand-meta', 'MetadataResponse', GREEN);
      hit(v, 'meta');
      await s.fade(v.metaEmpty, 0, 150);
      for (const r of v.metaRows) await s.show(r, 180);
    },
  },
  serialize: {
    phase: 'Producer', on: ['ser'], wire: 'meta-ser',
    title: 'Serialize the key and the value',
    text: 'Kafka only moves bytes. The key serializer and value serializer you configured (String, JSON, Avro…) turn ORD101 and the order object into byte arrays.',
    observe: 'The record moves into the serializer and becomes bytes.',
    async run(s, v) { await bead(s, v, 'meta', 'ser', '#65727a'); await swap(s, v.n.ser.s, 'ORD101 → 4f 52 44 31…', INK); },
  },
  partition: {
    phase: 'Producer', on: ['part', 'meta'], wire: 'ser-part',
    title: 'The partitioner picks P0',
    text: 'With a key, the default partitioner computes murmur2(key) & 0x7fffffff % 3. For ORD101 that is 0, so the record goes to partition P0. This runs in the producer, not on a broker.',
    observe: 'The partitioner shows murmur2(ORD101) % 3 = 0, in P0 green.',
    async run(s, v) { await bead(s, v, 'ser', 'part', '#65727a'); await swap(s, v.n.part.s, 'murmur2(ORD101)%3 = 0', P0); },
  },
  accumulate: {
    phase: 'Producer', on: ['acc', 'app'], wire: 'part-acc',
    title: 'It joins P0\'s batch, and send() returns',
    text: 'The record is appended to the batch for P0 in the accumulator (the producer\'s buffer). send() now returns a Future at once: your code does not wait for the network.',
    observe: 'The accumulator now holds 1 record for P0, and send() shows "returned a Future".',
    async run(s, v) {
      await bead(s, v, 'part', 'acc', P0);
      await swap(s, v.n.acc.s, 'batch for P0: 1 record');
      await swap(s, v.n.app.s, '⏳ returned a Future', AMBER);
    },
  },
  drain: {
    phase: 'Producer', on: ['sender', 'meta'], wire: 'acc-sender',
    title: 'The sender thread takes the batch; P0\'s leader is B1',
    text: 'A background sender thread drains ready batches (full, or after linger.ms). It looks up P0\'s leader in the metadata (B1) and groups the batches going to that broker into one request.',
    observe: 'The batch moves to the sender thread, and P0 → B1 lights up in the cache.',
    async run(s, v) {
      await bead(s, v, 'acc', 'sender', P0);
      await Promise.all([swap(s, v.n.acc.s, 'batch for P0: drained'), swap(s, v.n.sender.s, 'P0 batch → B1', INK)]);
      for (const [i, r] of v.metaRows.entries()) s.fade(r, i ? .3 : 1, 250);
      await s.pulse(v.n.sender);
    },
  },
  produceReq: acks => ({
    phase: 'Producer', on: ['sender', 'hand'], wire: 'sender-hand',
    title: 'ProduceRequest to B1',
    text: `The sender sends one ProduceRequest to B1 carrying the batch for orders-0, with acks=${acks} and a timeout. Writes always go to the partition leader.`,
    observe: `A ProduceRequest (P0, acks=${acks}) carries the record to B1.`,
    async run(s, v) {
      await packet(s, v, 'sender-hand', `ProduceRequest P0 acks=${acks}`, BLUE, { ms: 1200 });
      hit(v, 'hand');
      v.rec = s.block(248, 236, '', P0, { ...BLK, parent: v.packs });
      await s.pop(v.rec, 250);
      await s.move(v.rec, 420, HAND_Y, 400);
    },
  }),
  validate: acks => ({
    phase: 'Leader write', on: ['hand'],
    title: 'B1 checks the request',
    text: `The request handler checks that B1 really is P0's leader, that the batch is intact (CRC) and not too large, and reads acks=${acks}. A wrong leader would get NOT_LEADER_OR_FOLLOWER and the producer would refresh its metadata.`,
    observe: 'The handler ticks its checks: leader ✓ CRC ✓ size ✓.',
    async run(s, v) { hit(v, 'hand'); await swap(s, v.handT, `✓ leader  ✓ CRC  ✓ size  · acks=${acks}`, GREEN); },
  }),
  offset: {
    phase: 'Leader write', on: ['hand', 'marks'],
    title: 'B1 assigns offset 100',
    text: 'P0 already holds offsets 0 to 99, and the log end offset (LEO) is 100: the next free offset. The leader stamps the record with offset 100. Offsets are assigned by the leader, never by the producer.',
    observe: 'The record gets the number 100, taken from LEO.',
    async run(s, v) {
      await s.pulse(v.n.marks);
      v.rec.label.textContent = '100';
      await s.pulse(v.rec);
    },
  },
  append: {
    phase: 'Leader write', on: ['log', 'hand'], wire: 'hand-log',
    title: 'Append to the .log file at byte 8500',
    text: 'The batch is appended to the end of the active segment file, 00000000000000000000.log, at byte position 8500. It goes into the OS page cache; Kafka relies on replicas, not an fsync per write, for safety.',
    observe: 'Record 100 slides into the end of the .log row, at byte 8500.',
    async run(s, v) {
      await ride(s, v, v.rec, 'hand-log', 900);
      v.n.log.append(v.rec);
      v.hole.setAttribute('opacity', 0);
      hit(v, 'log');
      v.byteT.textContent = '@ 8500'; await s.show(v.byteT, 250);
    },
  },
  leo: {
    phase: 'Leader write', on: ['marks', 'log'],
    title: 'LEO moves from 100 to 101',
    text: 'The log end offset is now 101: the offset the next record will get. B1 also tracks each follower\'s LEO, which it learns from their fetches.',
    observe: 'LEO 100 → 101 on B1. HW stays at 100 for now.',
    async run(s, v) { await swap(s, v.leoT, 'LEO 101', BLUE); hit(v, 'marks'); },
  },
  index: {
    phase: 'Leader write', on: ['idx'],
    title: 'Add an entry to .index',
    text: '.index maps offset → byte position, so a read can jump close to the right place. It is sparse: an entry only about every 4 KB of log (index.interval.bytes). This write crossed that mark, so 100 → 8500 is added.',
    observe: 'A new entry 100 → 8500 appears at the end of .index.',
    async run(s, v) {
      v.idxNew = entry(s, v.n.idx, 568, IDX_Y, '100 → 8500', 92);
      v.idxNew.rect.setAttribute('stroke', P0);
      await s.pop(v.idxNew, 350); hit(v, 'idx');
    },
  },
  timeindex: {
    phase: 'Leader write', on: ['tix'],
    title: 'Add an entry to .timeindex',
    text: '.timeindex maps timestamp → offset. It powers "read from 18:00" (offsetsForTimes) and time-based retention. Like .index it is sparse.',
    observe: 'A new entry 18:00:00 → 100 appears in .timeindex.',
    async run(s, v) {
      v.tixNew = entry(s, v.n.tix, 540, TIX_Y, '18:00:00 → 100', 130);
      v.tixNew.rect.setAttribute('stroke', P0);
      await s.pop(v.tixNew, 350); hit(v, 'tix');
    },
  },
  park: {
    phase: 'Leader write', on: ['purg', 'hand'], wire: 'hand-purg',
    title: 'acks=all: the request waits in purgatory',
    text: 'The record is written, but only on B1. With acks=all the leader does not reply yet. It parks the request in "purgatory" until every replica in the ISR has offset 100, or until the request times out.',
    observe: 'Purgatory now holds "P0 @ 100, waiting for B2, B3".',
    async run(s, v) {
      await packet(s, v, 'hand-purg', 'park', AMBER, { ms: 500 });
      hit(v, 'purg');
      await swap(s, v.purgT[0], 'P0 @ 100', INK);
      v.purgT[1].textContent = 'waiting for'; v.purgT[2].textContent = 'B2, B3';
      await Promise.all([s.show(v.purgT[1], 200), s.show(v.purgT[2], 200)]);
    },
  },
  fetchReq: {
    phase: 'Replication', on: ['b2', 'b3', 'hand'], wires: ['b2-hand', 'b3-hand'],
    title: 'Followers ask: "fetch from offset 100"',
    text: 'Followers are not pushed to. Each one runs a fetcher that keeps sending FetchRequests to the leader: "I have everything up to 99, give me from 100".',
    observe: 'B2 and B3 each send Fetch(100) up to B1.',
    async run(s, v) {
      await Promise.all(FOL.map(f => packet(s, v, `${f.key}-hand`, 'Fetch(100)', BLUE, { ms: 800 })));
      hit(v, 'hand');
    },
  },
  fetchRes: {
    phase: 'Replication', on: ['log', 'hand', 'b2', 'b3'], wires: ['log-hand', 'hand-b2', 'hand-b3'],
    title: 'B1 reads .log and sends record 100',
    text: 'B1 reads from offset 100 in its .log and returns the batch in each FetchResponse. Followers get exactly the same bytes, with the same offset.',
    observe: 'Copies of record 100 travel from B1\'s log down to B2 and B3.',
    async run(s, v) {
      const c = s.block(logX(100), LOG_Y, '100', P0, { ...SBLK, parent: v.packs });
      await along(s, v, c, 'log-hand', 700);
      c.remove();
      v.flying = await Promise.all(FOL.map(async f => {
        const b = s.block(f.res, HAND_Y, '100', P0, { ...SBLK, parent: v.packs });
        const p = packet(s, v, `hand-${f.key}`, 'records', GREEN, { ms: 800 });
        await Promise.all([p, along(s, v, b, `hand-${f.key}`, 800)]);
        return b;
      }));
    },
  },
  folAppend: {
    phase: 'Replication', on: ['b2', 'b3'],
    title: 'Each follower appends to its own .log',
    text: 'B2 and B3 append record 100 to their own orders-0 segment and update their own .index and .timeindex. Each broker keeps its own files. Their LEO becomes 101.',
    observe: 'Record 100 lands in each follower\'s log and LEO turns 101.',
    async run(s, v) {
      await Promise.all(v.fol.map(async (f, i) => {
        const b = v.flying?.[i];
        if (b) { await s.move(b, f.x + fSlot(100), FY, 500); b.remove(); }
        f.hole.setAttribute('opacity', 0);
        f.blocks.push(s.block(fSlot(100), 0, '100', P0, { ...SBLK, parent: f }));
        hit(v, f.key);
        await swap(s, f.leo, 'LEO 101', BLUE);
      }));
    },
  },
  nextFetch: {
    phase: 'Replication', on: ['b2', 'b3', 'hand', 'isr'], wires: ['b2-hand', 'b3-hand'],
    title: 'Their next fetch tells B1 they have 100',
    text: 'A follower does not send a separate ack. Its next FetchRequest says "from 101", which tells the leader it now has everything up to 100. B1 records each follower\'s LEO as 101.',
    observe: 'Fetch(101) from both followers; the ISR line now says B2 and B3 are at 101.',
    async run(s, v) {
      await Promise.all(FOL.map(f => packet(s, v, `${f.key}-hand`, 'Fetch(101)', BLUE, { ms: 800 })));
      hit(v, 'hand');
      await swap(s, v.isrT, 'ISR {B1, B2, B3} · B1 sees B2 at 101, B3 at 101', '#3d4a55');
    },
  },
  hw: {
    phase: 'Replication', on: ['marks', 'isr'],
    title: 'The high watermark moves to 101',
    text: 'The high watermark (HW) is the smallest LEO among the ISR. All three are at 101, so HW moves from 100 to 101. Offset 100 is now committed: on every in-sync replica, and visible to consumers.',
    observe: 'HW 100 → 101 on B1.',
    async run(s, v) { await swap(s, v.hwT, 'HW 101', GREEN); hit(v, 'marks'); },
  },
  release: {
    phase: 'Acknowledge', on: ['purg', 'hand'], wire: 'purg-hand',
    title: 'Purgatory releases the request',
    text: 'The waiting ProduceRequest only needed the HW to pass offset 100. It does now, so purgatory completes the request and hands it back to the request handler to answer.',
    observe: 'Purgatory empties and its request goes back to the handler.',
    async run(s, v) {
      await swap(s, v.purgT[1], '✓ all ISR', GREEN);
      v.purgT[2].textContent = '';
      await packet(s, v, 'purg-hand', 'done', GREEN, { ms: 500 });
      await swap(s, v.purgT[0], '(empty)', MUTED);
      v.purgT[1].textContent = '';
      hit(v, 'hand');
    },
  },
  produceRes: {
    phase: 'Acknowledge', on: ['hand', 'sender'], wire: 'hand-sender',
    title: 'ProduceResponse back to the producer',
    text: 'B1 sends the ProduceResponse: topic orders, partition 0, base offset 100, no error. It goes to the producer\'s sender thread, over the same connection the request came on.',
    observe: 'A green ProduceResponse (P0 @ 100) travels back to the sender thread.',
    async run(s, v) { await packet(s, v, 'hand-sender', 'ProduceResponse P0 @100', GREEN, { ms: 1200 }); hit(v, 'sender'); },
  },
  future: {
    phase: 'Acknowledge', on: ['sender', 'app'], wire: 'sender-app',
    title: 'The Future completes: SendResult',
    text: 'The sender completes the Future that send() returned. In Spring you get a SendResult whose RecordMetadata says orders, partition 0, offset 100, and your callback (whenComplete) runs.',
    observe: 'send() turns green: SendResult P0 @ 100.',
    async run(s, v) {
      await packet(s, v, 'sender-app', 'SendResult', GREEN, { ms: 900 });
      hit(v, 'app');
      await swap(s, v.n.app.s, '✓ SendResult P0 @ 100', GREEN);
    },
  },
  poll: {
    phase: 'Consumer', on: ['poll', 'hand'], wire: 'cons-hand',
    title: 'The consumer polls: Fetch(P0, 100)',
    text: 'A consumer in group orders-app owns P0 and its position is 100. poll() sends a FetchRequest for orders-0 from offset 100 to the leader, B1.',
    observe: 'A FetchRequest goes from poll() to B1.',
    async run(s, v) { hit(v, 'poll'); await packet(s, v, 'cons-hand', 'Fetch(P0, 100)', BLUE, { ms: 1100 }); hit(v, 'hand'); },
  },
  lookup: {
    phase: 'Consumer', on: ['hand', 'idx', 'marks'],
    title: 'B1 checks the HW, then looks up .index',
    text: 'Consumers may only read below the high watermark: 100 < HW 101, so it is allowed (before replication it would have waited). B1 finds the nearest .index entry at or below 100: 100 → 8500.',
    observe: 'HW is checked, then the entry 100 → 8500 lights up.',
    async run(s, v) {
      await swap(s, v.handT, '100 < HW 101 ✓  → .index', GREEN);
      await s.pulse(v.idxNew);
      hit(v, 'idx');
    },
  },
  read: {
    phase: 'Consumer', on: ['log', 'hand'], wire: 'log-hand',
    title: 'B1 reads .log from byte 8500',
    text: 'B1 jumps to byte 8500 of the segment and sends the bytes from there. They go from the page cache straight to the network socket (zero-copy), without being copied through the JVM.',
    observe: 'Record 100 is copied out of the .log at byte 8500.',
    async run(s, v) {
      await s.pulse(v.rec);
      v.out = s.block(logX(100), LOG_Y, '100', P0, { ...BLK, parent: v.packs });
      await along(s, v, v.out, 'log-hand', 800);
    },
  },
  fetchBack: {
    phase: 'Consumer', on: ['hand', 'poll'], wire: 'hand-cons',
    title: 'FetchResponse back to the consumer',
    text: 'The FetchResponse carries record 100 (and anything after it, up to the size limits). poll() hands the records to the consumer.',
    observe: 'Record 100 travels to poll().',
    async run(s, v) {
      await ride(s, v, v.out, 'hand-cons', 0, 350);
      await Promise.all([packet(s, v, 'hand-cons', 'records', GREEN, { ms: 1100 }), along(s, v, v.out, 'hand-cons', 1100)]);
      hit(v, 'poll');
    },
  },
  deserialize: {
    phase: 'Consumer', on: ['deser'], wire: 'poll-deser',
    title: 'Deserialize back into an order',
    text: 'The key and value deserializers turn the bytes back into ORD101 and the order object. They must match the producer\'s serializers.',
    observe: 'The bytes become ORD101 again.',
    async run(s, v) {
      await s.move(v.out, CX, 144 + 26, 500); hit(v, 'deser');
      shape(v.out, 84, 28); await swap(s, v.out.label, 'ORD101');
    },
  },
  process: {
    phase: 'Consumer', on: ['listen'], wire: 'deser-listen',
    title: 'Your listener processes the order',
    text: 'Your @KafkaListener method runs with the order: save it, call a service, and so on. Nothing has been committed to Kafka yet; a crash now would mean reading offset 100 again.',
    observe: '"listener: process order" turns to "✓ order processed".',
    async run(s, v) {
      await s.move(v.out, CX, 198 + 30, 500);
      await s.fade(v.out, 0, 200); v.out.remove();
      hit(v, 'listen');
      await swap(s, v.n.listen.t, '✓ order processed', GREEN);
    },
  },
  position: {
    phase: 'Consumer', on: ['pos'],
    title: 'The position moves to 101 (in memory)',
    text: 'The consumer\'s position is now 101: the next offset it will fetch. This lives only in the consumer\'s memory until it is committed.',
    observe: 'position: 100 → 101.',
    async run(s, v) { await swap(s, v.posT, 'position: 101', BLUE); hit(v, 'pos'); },
  },
  commit: {
    phase: 'Consumer', on: ['pos', 'coord'], wire: 'cons-coord',
    title: 'OffsetCommit(101) to the group coordinator',
    text: 'The consumer commits 101, not 100: a committed offset is the next one to read. The OffsetCommit goes to the group\'s coordinator broker, which is not necessarily P0\'s leader.',
    observe: 'An OffsetCommit(101) travels down to the coordinator.',
    async run(s, v) { await packet(s, v, 'cons-coord', 'OffsetCommit(101)', BLUE, { ms: 800 }); hit(v, 'coord'); },
  },
  committed: {
    phase: 'Consumer', on: ['coord', 'pos'], wire: 'coord-cons',
    title: 'Stored in __consumer_offsets',
    text: 'The coordinator writes "orders-app, orders-0 → 101" to the internal topic __consumer_offsets (itself replicated) and replies OK. After a restart, this consumer group resumes from 101.',
    observe: 'The stored offset changes from 100 to 101, and an OK comes back.',
    async run(s, v) {
      await swap(s, v.committedT, 'orders-0 → 101', GREEN);
      await packet(s, v, 'coord-cons', 'OK', GREEN, { ms: 700 });
    },
  },
};

// acks=1: the leader replies as soon as its own write is done.
const ack1 = {
  phase: 'Acknowledge', on: ['hand', 'sender', 'log'], wire: 'hand-sender',
  title: 'acks=1: B1 replies right away',
  text: 'With acks=1 there is no purgatory: the leader answers as soon as offset 100 is in its own log. At this moment B2 and B3 do not have the record yet.',
  observe: 'The ProduceResponse leaves before any follower has record 100; record 100 is outlined in red.',
  async run(s, v) {
    v.rec.rect.setAttribute('stroke', RED); v.rec.rect.setAttribute('stroke-width', 3);
    await packet(s, v, 'hand-sender', 'ProduceResponse P0 @100', GREEN, { ms: 1100 });
    hit(v, 'sender');
  },
};
const risk1 = {
  phase: 'Replication', on: ['isr', 'log'],
  title: 'The risk window',
  text: 'The producer was told "done", but only B1 has offset 100. If B1 crashed now, B2 or B3 could become leader without it, and an acknowledged record would be lost. The next events close this window.',
  observe: 'The ISR line warns: only B1 has offset 100.',
  async run(s, v) { await swap(s, v.isrT, '⚠ only B1 has offset 100 · B2, B3 at 100', RED); },
};
const hw1 = {
  ...E.hw,
  title: 'HW moves to 101: the window closes',
  text: 'Once both followers report 101, the HW moves to 101 and offset 100 is committed. With acks=1 the producer had already moved on; it never learns whether this step happened.',
  async run(s, v) { await E.hw.run(s, v); v.rec.rect.removeAttribute('stroke'); },
};
// acks=0: fire and forget.
const sent0 = {
  phase: 'Producer', on: ['app', 'sender'],
  title: 'acks=0: the producer counts it as sent',
  text: 'With acks=0 the producer completes the Future as soon as the request is written to the socket. RecordMetadata has offset -1 (unknown), and the producer will never retry.',
  observe: 'send() shows "sent · offset -1" before B1 has done anything.',
  async run(s, v) { hit(v, 'app'); await swap(s, v.n.app.s, '✓ "sent" · offset -1', MUTED); },
};
const noReply = {
  phase: 'Acknowledge', on: ['hand', 'sender'],
  title: 'No ProduceResponse is sent',
  text: 'B1 stored the record exactly as with the other settings, but with acks=0 it sends nothing back. Had B1 been down or the request lost, the producer would never have known.',
  observe: 'The handler notes "acks=0 → no reply"; nothing travels back.',
  async run(s, v) { await swap(s, v.handT, 'acks=0 → no reply', RED); await s.shake(v.n.hand); },
};

const flowOf = (acks, steps) => {
  const track = { continuous: true, phases: true, build: s => { const v = scene(s, { acks }); v.track = track; return v; }, enter, steps };
  return track;
};
const prelude = [E.send, E.metaCheck, E.metaReq, E.metaRes, E.serialize, E.partition, E.accumulate, E.drain];
const write = acks => [E.produceReq(acks), E.validate(acks), E.offset, E.append, E.leo, E.index, E.timeindex];
const replicate = [E.fetchReq, E.fetchRes, E.folAppend, E.nextFetch];
const consume = [E.poll, E.lookup, E.read, E.fetchBack, E.deserialize, E.process, E.position, E.commit, E.committed];
const flowAll = flowOf('all', [...prelude, ...write('all'), E.park, ...replicate, E.hw, E.release, E.produceRes, E.future, ...consume]);
const flowOne = flowOf('1', [...prelude, ...write('1'), ack1, E.future, risk1, ...replicate, hw1]);
const flowZero = flowOf('0', [...prelude, E.produceReq('0'), sent0, ...write('0').slice(1), noReply, ...replicate, E.hw]);

// ---- try it: preset to the moment the sender holds the batch, then run the broker side with any acks ----
const ACK_FLOWS = { all: flowAll, 1: flowOne, 0: flowZero };
async function runFrom(s, v, track, first) {
  const was = s.clock.instant;
  s.clock.instant = true;
  for (const st of track.steps.slice(0, first)) await st.run(s, v);
  s.clock.instant = was;
  const end = track === flowAll ? track.steps.indexOf(E.future) + 1 : track.steps.length;
  let heard = null;
  for (let i = first; i < end; i++) {
    enter(s, v, i);
    await track.steps[i].run(s, v);
    if (heard == null && [E.future, sent0].includes(track.steps[i])) heard = { at: i - first + 1, hw: v.hwT.textContent };
    await s.wait(250);
  }
  return { heard, total: end - first };
}

export default {
  id: 'journey', n: 13, title: 'Journey of one message', tagline: 'From send() to commit, event by event',
  docked: true,
  guide: {
    what: 'One record, ORD101, followed event by event: metadata, serializing and partitioning, the leader\'s .log and index files, followers fetching, the high watermark, the acknowledgement, and finally a consumer reading and committing it.',
    fits: 'Every atom working together, on one map. Compare the acks flows; crash flows come next. Turn on 🔁 Loop to watch the whole route again and again.',
  },
  flows: [
    { id: 'all', short: 'acks=all', label: 'Happy path · acks=all', about: 'The producer waits until every in-sync replica has the record.', track: flowAll },
    { id: 'one', short: 'acks=1', label: 'acks=1', about: 'The leader replies after its own write; followers copy later.', track: flowOne },
    { id: 'zero', short: 'acks=0', label: 'acks=0', about: 'Fire and forget: no reply at all.', track: flowZero },
    { id: 'crash', label: 'Leader crash', about: 'Coming soon', soon: true },
    { id: 'consumer-crash', label: 'Consumer crash', about: 'Coming soon', soon: true },
  ],
  watch: flowAll,
  tryIt: {
    intro: 'The producer\'s batch for P0 is ready to go. Pick acks and press send() to play the broker side, then compare when the producer hears back.',
    observe: 'acks=all hears back after HW moves; acks=1 right after B1\'s write; acks=0 before B1 has done anything.',
    controls: [
      { type: 'choice', name: 'acks', label: 'acks', options: ['all', '1', '0'] },
      { type: 'button', label: 'send()', primary: true, run: 'one' },
    ],
    build(s, input) {
      const acks = input?.acks ?? 'all', v = scene(s, { acks });
      v.track = ACK_FLOWS[acks];
      v.message = 'Press send(). Each run starts from the same ready batch, so you can compare the three settings.';
      return v;
    },
    async one(s, v, input) {
      s.reset();
      const track = ACK_FLOWS[input.acks];
      Object.assign(v, scene(s, { acks: input.acks }), { track });
      const first = track.steps.findIndex(st => st.title.startsWith('ProduceRequest'));
      const { heard, total } = await runFrom(s, v, track, first);
      unfocus(v);
      v.message = input.acks === 'all' ? `acks=all: the producer heard back after ${heard.at} of ${total} broker-side events, once ${heard.hw} covered offset 100. Slowest, safest.`
        : input.acks === '1' ? `acks=1: the producer heard back after ${heard.at} of ${total} events, before the followers had offset 100 (${heard.hw} at the time). Fast, with a loss window.`
          : `acks=0: the producer marked it "sent" (offset -1) at event ${heard.at} of ${total}, before B1 had even written it. Fastest, no guarantee.`;
    },
    readout: v => `B1: <b>${v.leoT.textContent}</b> · <b>${v.hwT.textContent}</b> · Producer: <b>${v.n.app.s.textContent}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Sparse index lookups, segments, and LEO vs high watermark.',
    continuous: true,
    async build(s) {
      // The picture right after B1 has written offset 100 and updated its indexes.
      const v = scene(s, { acks: 'all' });
      v.track = this;
      const was = s.clock.instant;
      s.clock.instant = true;
      for (const st of flowAll.steps.slice(0, flowAll.steps.indexOf(E.timeindex) + 1)) await st.run(s, v);
      s.clock.instant = was;
      return v;
    },
    enter(s, v, i) { focus(v, v.track.steps[i].on); },
    steps: [
      {
        on: ['idx'],
        title: 'Reading offset 75: binary search the sparse index',
        text: 'There is no .index entry for 75. Kafka binary-searches for the largest entry at or below it, 52 → 4410. The index is small enough to stay in memory, so this is fast.',
        observe: 'Entry 52 → 4410 lights up as the closest one below 75.',
        async run(s, v) { await s.pulse(v.idx[1], 2); v.idx[1].rect.setAttribute('stroke', AMBER); },
      },
      {
        on: ['log', 'idx'],
        title: 'Jump to byte 4410, then scan forward to 75',
        text: 'B1 jumps to byte 4410 in the .log and scans forward through a few batches until it reaches offset 75. At most about 4 KB is scanned: that is the trade-off of a sparse index.',
        observe: 'The scan note shows the short walk from 52 to 75.',
        async run(s, v) { await swap(s, v.byteT, 'scan 52→75', AMBER); },
      },
      {
        on: ['log', 'b1'],
        title: 'The log is split into segments',
        text: 'A partition folder holds segments, each a .log plus its .index and .timeindex, named by its first offset. At segment.bytes (1 GB) or segment.ms a new one starts, e.g. 00000000000000000150.log. Retention deletes whole old segments.',
        observe: 'The note shows the next segment\'s name, taken from its first offset.',
        async run(s, v) { await swap(s, v.byteT, 'next: …150.log', AMBER); },
      },
      {
        on: ['marks', 'b2', 'b3', 'isr'],
        title: 'LEO is per replica; HW is the slowest in-sync one',
        text: 'B1 is at LEO 101, the followers at 100, so HW stays at 100. A follower that stays behind longer than replica.lag.time.max.ms (30 s) is dropped from the ISR, so it no longer holds the HW back.',
        observe: 'LEO 101 on B1 against LEO 100 on B2 and B3; HW 100.',
        async run(s, v) { await Promise.all(v.fol.map(f => s.pulse(f))); },
      },
      {
        on: ['isr', 'hand'],
        title: 'min.insync.replicas: refusing writes with too few copies',
        text: 'acks=all waits for the whole current ISR. min.insync.replicas (here 2) is a floor: if the ISR shrinks below it, the leader rejects acks=all writes with NOT_ENOUGH_REPLICAS instead of accepting them with too few copies.',
        observe: 'The handler shows the rule that guards acks=all writes.',
        async run(s, v) { await swap(s, v.handT, 'ISR < 2 → NOT_ENOUGH_REPLICAS', RED); },
      },
    ],
  },
  takeaway: 'Metadata → serialize → partition → batch → ProduceRequest to the leader → offset, .log, LEO, sparse indexes → followers fetch → HW moves → ack. The consumer reads below the HW and commits the next offset. acks only changes when the producer hears back.',
  recap: {
    points: [
      'send(): metadata first, then serialize, partition (murmur2 of the key) and batch; send() returns a Future.',
      'The sender thread finds the leader and sends a ProduceRequest; the leader assigns the offset from its LEO.',
      'The leader appends to .log; .index and .timeindex are sparse.',
      'Followers pull with fetches; their next fetch moves the high watermark.',
      'acks=all: reply after the ISR has it · acks=1: after the leader’s write · acks=0: never.',
      'Consumers read below the HW and commit the next offset to __consumer_offsets.',
    ],
    interview: [
      { q: 'Walk me through what happens when a producer sends a message.', a: 'send() first makes sure it has **metadata** for the topic (a MetadataRequest to a bootstrap broker if not). It **serializes** key and value, the **partitioner** picks the partition (murmur2 of the key), and the record joins that partition\'s **batch**; send() returns a Future. The **sender thread** sends the batch to the partition\'s **leader**, which **assigns the offset** (its LEO), **appends to the active segment** and updates the sparse indexes. **Followers fetch** it; their next fetch moves the **high watermark**, and with **acks=all** the leader then replies with partition and offset.' },
      { q: 'What is the difference between acks=0, 1 and all?', a: '**acks=0**: no reply, offset unknown, no retries, possible silent loss. **acks=1**: reply after the **leader\'s** write; lost if the leader dies before followers copy it. **acks=all**: reply after **all in-sync replicas** have it; with **min.insync.replicas=2** it survives a broker failure. Replication itself is the same in all three.' },
      { q: 'Does acks=all wait for min.insync.replicas replicas?', a: 'No. It waits for **every replica currently in the ISR**. **min.insync.replicas** is a floor: if the ISR shrinks below it, the leader **rejects the write** with NOT_ENOUGH_REPLICAS.' },
      { q: 'How does Kafka find an offset quickly in a huge log?', a: 'Segments are named by their **base offset**, so Kafka first picks the segment. Its **sparse .index** maps offsets to byte positions (an entry every ~4 KB); Kafka **binary-searches** the nearest entry below the target, **jumps** there and scans forward a little. **.timeindex** does the same for timestamps.' },
      { q: 'Why does the consumer commit 101 after reading 100?', a: 'The committed offset is the **next offset to read**. After a restart the group resumes from **101**. It is stored in **__consumer_offsets** via the **group coordinator**.' },
    ],
  },
  quiz: {
    q: 'With acks=all, when does the leader send the ProduceResponse?',
    options: ['As soon as the record is in its own .log', 'When min.insync.replicas brokers have it, ignoring the rest of the ISR', 'When every in-sync replica has the record (the HW passes it)', 'When a consumer has read the record'],
    answer: 2,
    why: 'acks=all waits for the whole current ISR. min.insync.replicas only sets how small the ISR may get before writes are refused.',
  },
  related: ['producer', 'replica', 'commit-lag'],
};
