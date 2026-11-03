// Level 3: the journey of one message across a small cluster, event by event, drawn with the Level 1 pieces.
// Producers left, three brokers side by side, consumer groups right. Every wire is drawn from the start (faint);
// the current event's wire flows in the topic's colour and the current components glow. Nothing is blurred.
// Travelled wires stay as a soft trail, so the whole route is visible at the end.
//   orders   (2 partitions, RF 3): Producer A → read by groups billing and analytics
//   payments (1 partition,  RF 2): Producer B → read by group shipping
import { el, place, partitionFor } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { INK, MONO, swap } from './flowmap.js';

const ORD = ['#1f5fd1', '#5b9cf0'], PAY = '#e0761c', COMMIT = '#8a4fc2', PROD = '#7a4aa3', CONS = '#13968a';
const KEY = 'ORD102', PKEY = 'PAY7';
const P_ORD = partitionFor(KEY, 2);                     // 0: orders-0, led by B1
const BLK = { w: 30, h: 26, size: 13 };

// ---- layout (960 × 460) ----
const BX = [288, 460, 632];                             // broker centres
const PORT = [336, 508, 680];                           // each broker's network port: also its next-offset slot
const BUS = 20, BUS2 = 300;                             // the network: orders traffic above, payments below
const ROW = [104, 172, 240];                            // lane rows: orders-0, orders-1, payments-0
const LANE_TOP = r => ROW[r] - 30, BLOCK_Y = r => ROW[r] + 10;
const slot = i => -54 + i * 34;                         // block slot inside a lane; 3 = the next offset
const A_Y = [80, 110, 140, 170, 200, 230];              // Producer A chips
const B_Y = [354, 380, 406, 432];                       // Producer B chips
const GROUP = { bill: 40, ana: 156, ship: 322 };        // consumer frame tops
const PORT_X = { bill: 740, ana: 726, ship: 733 };      // where each consumer's cable runs up or down

// Orthogonal path through points with rounded corners.
function rpath(pts, r = 9) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
    const a = Math.min(r, l1 / 2), b = Math.min(r, l2 / 2);
    d += ` L${x1 - (x1 - x0) / l1 * a},${y1 - (y1 - y0) / l1 * a} Q${x1},${y1} ${x1 + (x2 - x1) / l2 * b},${y1 + (y2 - y1) / l2 * b}`;
  }
  const [x, y] = pts.at(-1);
  return `${d} L${x},${y}`;
}
const cons = (g, r, bus, to) => [[762, GROUP[g] + 38], [PORT_X[g], GROUP[g] + 38], [PORT_X[g], bus], [to, bus], [to, r]];
const WIRES = {
  'a-meta': [[174, A_Y[1]], [190, A_Y[1]], [190, BUS], [PORT[0], BUS], [PORT[0], 44]],
  'a-send': [[174, A_Y[5]], [198, A_Y[5]], [198, BUS], [PORT[0], BUS], [PORT[0], LANE_TOP(0)]],
  'b2-b1': [[PORT[1], LANE_TOP(0)], [PORT[1], BUS], [PORT[0], BUS], [PORT[0], LANE_TOP(0)]],
  'b3-b1': [[PORT[2], LANE_TOP(0)], [PORT[2], BUS], [PORT[0], BUS], [PORT[0], LANE_TOP(0)]],
  'b3-b2': [[PORT[2], LANE_TOP(0)], [PORT[2], BUS], [PORT[1], BUS], [PORT[1], LANE_TOP(0)]],
  'bill-b1': cons('bill', LANE_TOP(0), BUS, PORT[0]),
  'ana-b1': cons('ana', LANE_TOP(0), BUS, PORT[0]),
  'bill-b2': cons('bill', LANE_TOP(0), BUS, PORT[1]),
  'b-meta': [[174, B_Y[1]], [190, B_Y[1]], [190, BUS2], [PORT[0], BUS2], [PORT[0], 282]],
  'b-send': [[174, B_Y[3]], [198, B_Y[3]], [198, BUS2], [PORT[0], BUS2], [PORT[0], ROW[2] + 30]],
  'b2p-b1': [[PORT[1], ROW[2] + 30], [PORT[1], BUS2], [PORT[0], BUS2], [PORT[0], ROW[2] + 30]],
  'ship-b1': cons('ship', ROW[2] + 30, BUS2, PORT[0]),
  'bill-co': cons('bill', 322, BUS2, PORT[2]),
  'ana-co': cons('ana', 322, BUS2, PORT[2]),
  'ship-co': cons('ship', 322, BUS2, PORT[2]),
};

// ---- drawing ----
function frame(s, v, key, x, y, w, h, title, { color = INK, fill = '#fff', stroke = '#c9ced2', right } = {}) {
  const g = s.box(x, y, w, h, '', { fill, stroke, rx: 12 });
  g.classList.add('gn');
  g.title = s.text(g, -w / 2 + 12, -h / 2 + 15, title, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: color });
  if (right != null) g.right = s.text(g, w / 2 - 12, -h / 2 + 15, right, { 'text-anchor': 'end', 'font-size': 13.5, 'font-weight': 700, fill: MUTED });
  v.n[key] = g;
  return g;
}
function chip(s, v, key, x, y, w, label, { h = 24, size = 15 } = {}) {
  const g = s.box(x, y, w, h, label, { size, rx: 6 });
  g.classList.add('gn');
  v.n[key] = g;
  return g;
}
// One copy of a partition, like the Level 1 lanes: name top-left, role top-right, the last records and the next free slot.
function lane(s, v, key, b, r, name, color, leader, first) {
  const g = s.g(BX[b], ROW[r]);
  g.classList.add('gn');
  g.rect = el('rect', { x: -74, y: -30, width: 148, height: 60, rx: 7, fill: '#fff', stroke: color, 'stroke-width': leader ? 2.6 : 1.4 }, g);
  s.text(g, -66, -16, name, { 'text-anchor': 'start', 'font-size': 13.5, 'font-weight': 700, 'font-family': MONO, fill: color });
  g.roleT = s.text(g, 66, -16, leader ? '★ leader' : 'follower', { 'text-anchor': 'end', 'font-size': 12.5, 'font-weight': 700, fill: leader ? AMBER : MUTED });
  for (let i = 0; i < 3; i++) s.block(slot(i), 10, `${first + i}`, color, { ...BLK, parent: g });
  g.hole = s.box(slot(3), 10, BLK.w, BLK.h, '', { parent: g, dash: '4 3', stroke: color, rx: 3 });
  Object.assign(g, { b, r, color });
  v.n[key] = g;
  return g;
}
function row(s, parent, y, label, value) {
  s.text(parent, -129, y, label, { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, 'font-family': MONO, fill: INK });
  return s.text(parent, -40, y, value, { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: MUTED });
}

function scene(s, { acks = 'all', topic = 'orders' } = {}) {
  const v = { acks, topic, n: {}, w: {}, tc: topic === 'orders' ? ORD[0] : PAY };
  s.root.classList.add('glowmap');
  v.wires = s.g(0, 0);
  for (const [k, pts] of Object.entries(WIRES)) v.w[k] = el('path', { d: rpath(pts), class: 'gw' }, v.wires);

  // ---- producers ----
  frame(s, v, 'prodA', 98, 151, 172, 222, 'Producer A', { color: PROD, fill: '#fcfaff', stroke: '#d8b7e9', right: 'orders' });
  v.n.prodA.right.setAttribute('fill', ORD[0]);
  ['send()', 'metadata', 'serializer', 'partitioner', 'accumulator', 'sender thread']
    .forEach((t, i) => chip(s, v, ['aSend', 'aMeta', 'aSer', 'aPart', 'aAcc', 'aSender'][i], 98, A_Y[i], 152, t));
  frame(s, v, 'prodB', 98, 384, 172, 136, 'Producer B', { color: PROD, fill: '#fcfaff', stroke: '#d8b7e9', right: 'payments' });
  v.n.prodB.right.setAttribute('fill', PAY);
  ['send()', 'metadata', 'serialize · partition', 'accumulator · sender']
    .forEach((t, i) => chip(s, v, ['bSend', 'bMeta', 'bPart', 'bSender'][i], 98, B_Y[i], 152, t, { h: 22, size: 14 }));

  // ---- brokers: orders-0 (RF 3, leader B1), orders-1 (RF 3, leader B2), payments-0 (RF 2, leader B1) ----
  for (const b of [0, 1, 2]) frame(s, v, `b${b + 1}`, BX[b], 163, 164, 238, `Broker B${b + 1}`);
  lane(s, v, 'o0b1', 0, 0, 'orders-0', ORD[0], true, 97);
  lane(s, v, 'o0b2', 1, 0, 'orders-0', ORD[0], false, 97);
  lane(s, v, 'o0b3', 2, 0, 'orders-0', ORD[0], false, 97);
  lane(s, v, 'o1b1', 0, 1, 'orders-1', ORD[1], false, 54);
  lane(s, v, 'o1b2', 1, 1, 'orders-1', ORD[1], true, 54);
  lane(s, v, 'o1b3', 2, 1, 'orders-1', ORD[1], false, 54);
  lane(s, v, 'p0b1', 0, 2, 'payments-0', PAY, true, 37);
  lane(s, v, 'p0b2', 1, 2, 'payments-0', PAY, false, 37);
  s.text(s.root, BX[2], ROW[2], 'group coordinator ↓', { 'font-size': 14, fill: MUTED });

  // ---- inside the leader (pops out at the write) ----
  v.inWrap = s.g(0, 0, s.root, { opacity: 0 });
  const ins = frame(s, v, 'inB1', 347, 385, 282, 126, `Inside B1 · ${topic}-0 (leader)`, { color: v.tc, fill: '#fbfcfe' });
  v.inWrap.append(ins);
  const o = topic === 'orders';
  v.rows = {
    log: row(s, ins, -31, '.log', o ? 'offsets 0 … 99' : 'offsets 0 … 39'),
    idx: row(s, ins, -15, '.index', o ? '… 52 → 4410' : '… 36 → 2900'),
    tix: row(s, ins, 1, '.timeindex', o ? '… 17:59:58 → 52' : '… 17:59:41 → 36'),
    leo: row(s, ins, 17, 'LEO · HW', o ? '100 · 100' : '40 · 40'),
    fol: row(s, ins, 33, 'followers', o ? 'B2 at 100 · B3 at 100' : 'B2 at 40'),
    purg: row(s, ins, 49, 'purgatory', '(empty)'),
  };

  // ---- group coordinator on B3 ----
  const co = frame(s, v, 'coord', 607, 385, 214, 126, 'B3 · group coordinator', { color: COMMIT, fill: '#fdfaff', stroke: '#dcc8ec' });
  s.text(co, -95, -26, '__consumer_offsets', { 'text-anchor': 'start', 'font-size': 13, 'font-family': MONO, fill: MUTED });
  const crow = (y, g, p, off) => { s.text(co, -95, y, `${g} · ${p}`, { 'text-anchor': 'start', 'font-size': 14, fill: INK }); return s.text(co, 95, y, `→ ${off}`, { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, 'font-family': MONO, fill: MUTED }); };
  v.co = { bill: crow(-4, 'billing', 'orders-0', 100), ana: crow(17, 'analytics', 'orders-0', 98), ship: crow(38, 'shipping', 'payments-0', 40) };
  v.coNote = s.text(co, 0, 56, '', { 'font-size': 13, fill: MUTED });

  // ---- consumer groups (one consumer each) ----
  const group = (g, name, pos) => {
    const f = frame(s, v, g, 850, GROUP[g] + 53, 196, 106, `group ${name}`, { color: CONS, fill: '#f7fcfb', stroke: '#bfe4df', right: `pos ${pos}` });
    ['poll()', 'deserializer', 'process'].forEach((t, i) => chip(s, v, g + 'PDX'[i], 850, GROUP[g] + 38 + i * 24, 176, t, { h: 21, size: 14 }));
    return f;
  };
  group('bill', 'billing', 100); group('ana', 'analytics', 98); group('ship', 'shipping', 40);

  v.packs = s.g(0, 0);
  return v;
}

// ---- lighting: no blur; current components glow, current wires flow, travelled wires stay as a trail ----
const wiresOf = st => [st.wire, ...(st.wires ?? [])].filter(Boolean).map(w => ({ k: w.replace(/^~/, ''), rev: w[0] === '~' }));
function light(s, v, i) {
  const steps = v.track.steps, st = steps[i], on = new Set(st.on ?? []), color = st.color ?? v.tc;
  s.root.style.setProperty('--nc', color);
  for (const [k, n] of Object.entries(v.n)) n.classList.toggle('on', on.has(k));
  for (const p of Object.values(v.w)) p.classList.remove('live', 'rev', 'trail');
  for (const past of steps.slice(0, i)) for (const w of wiresOf(past)) { v.w[w.k].classList.add('trail'); v.w[w.k].style.setProperty('--tc', past.color ?? v.tc); }
  for (const w of wiresOf(st)) {
    const p = v.w[w.k];
    p.classList.remove('trail'); p.classList.add('live'); p.classList.toggle('rev', w.rev);
    p.style.setProperty('--tc', color);
    p.parentNode.append(p);                               // the flowing wire on top of the faint ones
  }
}
const enter = (s, v, i) => light(s, v, i);
function hit(v, key) { const n = v.n[key]; if (!n?.isConnected) return; n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit'); }

// ---- motion: smooth glides along the wires ----
function glide(s, v, nodes, key, { rev = false, ms } = {}) {
  const p = v.w[key], L = p.getTotalLength();
  ms ??= Math.max(800, Math.min(1800, L * 2.4));
  return s.clock.tween(ms, t => { const q = p.getPointAtLength(L * (rev ? 1 - t : t)); for (const n of nodes) place(n, q.x, q.y); });
}
function pill(s, v, label, color) {
  const g = s.g(0, 0, v.packs), w = label.length * 7.4 + 18;
  el('rect', { x: -w / 2, y: -36, width: w, height: 24, rx: 12, fill: '#fff', stroke: color, 'stroke-width': 1.5 }, g);
  s.text(g, 0, -24, label, { 'font-size': 13.5, 'font-weight': 700, fill: color });
  return g;
}
// A message on a wire: a labelled pill with a dot (or a record block when it carries one).
async function msg(s, v, key, label, color, { rev = false, ms, carry } = {}) {
  const g = pill(s, v, label, color);
  const body = carry ?? el('circle', { r: 6.5, fill: color, stroke: '#fff', 'stroke-width': 2 }, g);
  await glide(s, v, carry ? [g, carry] : [g], key, { rev, ms });
  await s.fade(g, 0, 160);
  g.remove();
  return body;
}
const rec = (s, v, label, color, x = 0, y = 0) => s.block(x, y, label, color, { ...BLK, parent: v.packs });
// A small bead hopping between two chips inside a producer or a consumer.
async function bead(s, v, from, to, color) {
  const a = v.n[from], b = v.n[to];
  const d = el('circle', { r: 6, fill: color, stroke: '#fff', 'stroke-width': 2 }, v.packs);
  place(d, a._x + 62, a._y);
  await s.move(d, b._x + 62, b._y, 520);
  await s.fade(d, 0, 140);
  d.remove();
  hit(v, to);
}
const label = (v, k) => v.n[k].label;
const say = (s, v, k, str, color = INK) => swap(s, label(v, k), str, color);
const showInside = async (s, v) => { if (+v.inWrap.getAttribute('opacity') < 1) await s.fade(v.inWrap, 1, 350); };

// ---- orders · Producer A ----
const E = {
  send: {
    phase: 'Producer A', on: ['aSend'],
    title: 'Producer A calls send()',
    text: `Your code calls send("orders", "${KEY}", order). Producer A builds a record: topic orders, key ${KEY}, the order as the value, a timestamp and optional headers.`,
    observe: `The send() box now holds ${KEY}.`,
    async run(s, v) { hit(v, 'aSend'); await say(s, v, 'aSend', `send(${KEY})`); },
  },
  metaCheck: {
    phase: 'Producer A', on: ['aSend', 'aMeta'],
    title: 'First: where does orders live?',
    text: 'Before anything else, send() checks its metadata cache for topic orders: how many partitions it has and which broker leads each one. Right after start-up the cache is empty, so send() must wait for metadata.',
    observe: 'The metadata box shakes: empty.',
    async run(s, v) { await bead(s, v, 'aSend', 'aMeta', '#9aa3a9'); await s.shake(v.n.aMeta); await say(s, v, 'aMeta', 'metadata: empty', AMBER); },
  },
  metaReq: {
    phase: 'Producer A', on: ['aMeta', 'b1'], wire: 'a-meta',
    title: 'MetadataRequest to a bootstrap broker',
    text: 'Producer A only knows bootstrap.servers, here B1. It asks B1 for the metadata of topic orders. Any broker can answer this; it does not have to lead anything.',
    observe: 'A MetadataRequest flows along the network to B1.',
    async run(s, v) { await msg(s, v, 'a-meta', 'MetadataRequest(orders)', v.tc); hit(v, 'b1'); },
  },
  metaRes: {
    phase: 'Producer A', on: ['b1', 'aMeta', 'o0b1', 'o1b2'], wire: '~a-meta',
    title: 'B1 replies: 2 partitions and their leaders',
    text: 'The MetadataResponse lists the brokers and, for orders: 2 partitions, orders-0 led by B1 and orders-1 led by B2, each with 3 replicas. Producer A caches it and only refreshes it when something changes.',
    observe: 'The answer flows back; the two leader lanes glow; metadata shows cached ✓.',
    async run(s, v) { await msg(s, v, 'a-meta', 'orders-0 → B1 · orders-1 → B2', GREEN, { rev: true }); await say(s, v, 'aMeta', 'metadata ✓ cached', GREEN); hit(v, 'aMeta'); },
  },
  serialize: {
    phase: 'Producer A', on: ['aSer'],
    title: 'Serialize the key and the value',
    text: `Kafka only moves bytes. The key and value serializers you configured (String, JSON, Avro…) turn ${KEY} and the order object into byte arrays.`,
    observe: 'The record hops into the serializer and becomes bytes.',
    async run(s, v) { await bead(s, v, 'aMeta', 'aSer', '#65727a'); await say(s, v, 'aSer', 'serializer → bytes'); },
  },
  partition: {
    phase: 'Producer A', on: ['aPart', 'aMeta'],
    title: 'The partitioner picks orders-0',
    text: `The metadata says orders has 2 partitions. With a key, the default partitioner computes murmur2(key) & 0x7fffffff % 2. For ${KEY} that is ${P_ORD}, so the record goes to orders-${P_ORD}. This runs in the producer, not on a broker.`,
    observe: `The partitioner shows → orders-${P_ORD}, in dark blue.`,
    async run(s, v) { await bead(s, v, 'aSer', 'aPart', '#65727a'); await say(s, v, 'aPart', `hash % 2 → orders-${P_ORD}`, ORD[P_ORD]); },
  },
  accumulate: {
    phase: 'Producer A', on: ['aAcc', 'aSend'],
    title: 'It joins orders-0\'s batch; send() returns',
    text: 'The record is added to the batch for orders-0 in the accumulator, the producer\'s buffer. send() returns a Future straight away: your code does not wait for the network.',
    observe: 'The accumulator holds 1 record for orders-0; send() shows ⏳ Future.',
    async run(s, v) {
      await bead(s, v, 'aPart', 'aAcc', ORD[0]);
      await say(s, v, 'aAcc', 'batch orders-0: 1');
      await say(s, v, 'aSend', '⏳ returned a Future', AMBER);
    },
  },
  drain: {
    phase: 'Producer A', on: ['aSender', 'aMeta', 'o0b1'],
    title: 'The sender thread takes the batch to B1',
    text: 'A background sender thread drains ready batches (full, or after linger.ms). From the metadata it knows orders-0\'s leader is B1, so the batch goes into a ProduceRequest for B1.',
    observe: 'The batch moves to the sender thread, aimed at B1.',
    async run(s, v) { await bead(s, v, 'aAcc', 'aSender', ORD[0]); await Promise.all([say(s, v, 'aAcc', 'batch orders-0: sent'), say(s, v, 'aSender', 'sender → B1')]); },
  },
  produceReq: acks => ({
    phase: 'Producer A', on: ['aSender', 'b1', 'o0b1'], wire: 'a-send',
    title: 'ProduceRequest to the leader, B1',
    text: `The sender sends one ProduceRequest to B1 with the batch for orders-0, acks=${acks} and a timeout. Writes always go to the partition leader; the followers get the record later, from B1.`,
    observe: 'The record rides the network into B1\'s orders-0 lane and stops at the free slot.',
    async run(s, v) {
      v.rec = rec(s, v, '', ORD[0], 174, A_Y[5]);
      await msg(s, v, 'a-send', `Produce orders-0 · acks=${acks}`, v.tc, { carry: v.rec });
      await s.move(v.rec, PORT[0], BLOCK_Y(0), 380);
      hit(v, 'o0b1');
    },
  }),
  offset: acks => ({
    phase: 'Leader write', on: ['o0b1', 'inB1'],
    title: 'B1 checks the request and assigns offset 100',
    text: `B1 checks that it really leads orders-0, that the batch is intact (CRC) and not too large, and reads acks=${acks}. orders-0 holds offsets 0 to 99, so the log end offset (LEO) is 100: the record gets offset 100. Offsets come from the leader, never from the producer.`,
    observe: 'A panel opens with what is inside B1; the record is stamped 100.',
    async run(s, v) {
      await showInside(s, v);
      v.n.o0b1.hole.setAttribute('opacity', 0);
      v.rec.label.textContent = '100';
      await s.pulse(v.rec);
    },
  }),
  append: {
    phase: 'Leader write', on: ['o0b1', 'inB1'],
    title: 'Append to the .log file at byte 8500',
    text: 'The batch is appended to the end of the active segment file, 00000000000000000000.log, at byte 8500. It goes to the OS page cache; Kafka relies on replicas, not an fsync per write, to keep it safe.',
    observe: 'The .log row now ends with 100 @ byte 8500.',
    async run(s, v) { await swap(s, v.rows.log, '99 · 100 @ byte 8500', ORD[0]); hit(v, 'inB1'); },
  },
  leo: {
    phase: 'Leader write', on: ['inB1'],
    title: 'LEO moves from 100 to 101',
    text: 'B1\'s log end offset is now 101, the offset the next record will get. The high watermark (HW) stays at 100: consumers can not see offset 100 yet, because the followers do not have it.',
    observe: 'LEO · HW reads 101 · 100.',
    async run(s, v) { await swap(s, v.rows.leo, '101 · 100', ORD[0]); },
  },
  index: {
    phase: 'Leader write', on: ['inB1'],
    title: 'Add an entry to .index',
    text: '.index maps offset → byte position, so a read can jump near the right spot. It is sparse: one entry about every 4 KB of log (index.interval.bytes). This write crossed that mark, so 100 → 8500 is added.',
    observe: 'The .index row gains 100 → 8500.',
    async run(s, v) { await swap(s, v.rows.idx, '… 52→4410 · 100→8500', ORD[0]); },
  },
  timeindex: {
    phase: 'Leader write', on: ['inB1'],
    title: 'Add an entry to .timeindex',
    text: '.timeindex maps timestamp → offset. It powers "read from 18:00" (offsetsForTimes) and time-based retention. Like .index, it is sparse.',
    observe: 'The .timeindex row gains 18:00:00 → 100.',
    async run(s, v) { await swap(s, v.rows.tix, '… 18:00:00 → 100', ORD[0]); },
  },
  park: {
    phase: 'Leader write', on: ['inB1', 'aSender'],
    title: 'acks=all: the request waits in purgatory',
    text: 'The record is written, but only on B1. With acks=all the leader does not answer yet: it parks the request in "purgatory" until every in-sync replica has offset 100, or the request times out. Producer A is still waiting.',
    observe: 'purgatory: waiting for B2, B3.',
    async run(s, v) { await swap(s, v.rows.purg, 'waiting for B2, B3', AMBER); await say(s, v, 'aSender', '⏳ waiting for B1', AMBER); },
  },
  fetchReq: {
    phase: 'Replication', on: ['o0b2', 'o0b3', 'o0b1'], wires: ['b2-b1', 'b3-b1'],
    title: 'Followers ask B1: "fetch from 100"',
    text: 'Nobody pushes to followers. B2 and B3 each run a fetcher that keeps sending FetchRequests to the leader: "I have everything up to 99, give me from 100".',
    observe: 'B2 and B3 each send Fetch(100) over the network to B1.',
    async run(s, v) { await Promise.all([msg(s, v, 'b2-b1', 'Fetch(100)', v.tc), msg(s, v, 'b3-b1', 'Fetch(100)', v.tc, { ms: 1500 })]); hit(v, 'o0b1'); },
  },
  fetchRes: {
    phase: 'Replication', on: ['o0b1', 'o0b2', 'o0b3'], wires: ['~b2-b1', '~b3-b1'],
    title: 'B1 sends record 100 to both followers',
    text: 'B1 reads from offset 100 in its .log and returns the batch in each FetchResponse. The followers get exactly the same bytes, with the same offset.',
    observe: 'Two copies of record 100 flow from B1 to B2 and B3.',
    async run(s, v) {
      v.copies = [rec(s, v, '100', ORD[0], PORT[0], LANE_TOP(0)), rec(s, v, '100', ORD[0], PORT[0], LANE_TOP(0))];
      await Promise.all([
        msg(s, v, 'b2-b1', 'records', GREEN, { rev: true, carry: v.copies[0] }),
        msg(s, v, 'b3-b1', 'records', GREEN, { rev: true, carry: v.copies[1], ms: 1500 }),
      ]);
    },
  },
  folAppend: {
    phase: 'Replication', on: ['o0b2', 'o0b3'],
    title: 'Each follower appends to its own .log',
    text: 'B2 and B3 each append record 100 to their own orders-0 segment and update their own .index and .timeindex. Every broker keeps its own files. Their LEO becomes 101.',
    observe: 'Record 100 settles into the free slot on B2 and on B3.',
    async run(s, v) {
      await Promise.all(['o0b2', 'o0b3'].map(async (k, i) => {
        const l = v.n[k];
        await s.move(v.copies[i], PORT[l.b], BLOCK_Y(0), 420);
        l.hole.setAttribute('opacity', 0);
        hit(v, k);
      }));
    },
  },
  nextFetch: {
    phase: 'Replication', on: ['o0b2', 'o0b3', 'inB1'], wires: ['b2-b1', 'b3-b1'],
    title: 'Their next fetch tells B1 they have 100',
    text: 'A follower does not send a separate ack. Its next FetchRequest says "from 101", which tells the leader it now has everything up to 100. B1 notes each follower\'s LEO as 101.',
    observe: 'Fetch(101) from both; the followers row reads B2 at 101 · B3 at 101.',
    async run(s, v) {
      await Promise.all([msg(s, v, 'b2-b1', 'Fetch(101)', v.tc), msg(s, v, 'b3-b1', 'Fetch(101)', v.tc, { ms: 1500 })]);
      await swap(s, v.rows.fol, 'B2 at 101 · B3 at 101', ORD[0]);
    },
  },
  hw: {
    phase: 'Replication', on: ['inB1', 'o0b1'],
    title: 'The high watermark moves to 101',
    text: 'The HW is the smallest LEO among the in-sync replicas (ISR). All three are at 101, so HW moves from 100 to 101. Offset 100 is now committed: on every in-sync replica, and visible to consumers.',
    observe: 'LEO · HW reads 101 · 101, in green.',
    async run(s, v) { await swap(s, v.rows.leo, '101 · 101 ✓ committed', GREEN); hit(v, 'o0b1'); },
  },
  release: {
    phase: 'Acknowledge', on: ['inB1'],
    title: 'Purgatory releases the request',
    text: 'The parked ProduceRequest only needed the HW to pass offset 100. It does now, so purgatory completes it and B1 can answer.',
    observe: 'purgatory: ✓ released.',
    async run(s, v) { await swap(s, v.rows.purg, '✓ released', GREEN); },
  },
  produceRes: {
    phase: 'Acknowledge', on: ['o0b1', 'aSender'], wire: '~a-send',
    title: 'ProduceResponse back to Producer A',
    text: 'B1 sends the ProduceResponse: topic orders, partition 0, base offset 100, no error. It travels back over the same connection to the sender thread.',
    observe: 'A green ProduceResponse flows back to the sender thread.',
    async run(s, v) {
      await msg(s, v, 'a-send', 'ProduceResponse · orders-0 @ 100', GREEN, { rev: true });
      await Promise.all([say(s, v, 'aSender', 'sender ✓ acked', GREEN), swap(s, v.rows.purg, '(empty)', MUTED)]);
    },
  },
  future: {
    phase: 'Acknowledge', on: ['aSender', 'aSend'],
    title: 'The Future completes: SendResult',
    text: 'The sender completes the Future that send() returned. In Spring you get a SendResult whose RecordMetadata says orders, partition 0, offset 100, and your callback runs.',
    observe: 'send() turns green: ✓ SendResult @ 100.',
    async run(s, v) { await bead(s, v, 'aSender', 'aSend', GREEN); await say(s, v, 'aSend', '✓ SendResult @ 100', GREEN); },
  },
  polls: {
    phase: 'Two groups read', on: ['billP', 'anaP', 'o0b1'], wires: ['bill-b1', 'ana-b1'], color: CONS,
    title: 'Two groups fetch, each from its own position',
    text: 'Two consumer groups read orders. Each keeps its own position: billing is up to date at 100, analytics is behind at 98. Both send a FetchRequest for orders-0 to its leader, B1.',
    observe: 'billing sends Fetch(orders-0, 100); analytics sends Fetch(orders-0, 98).',
    async run(s, v) {
      await Promise.all([msg(s, v, 'bill-b1', 'Fetch(orders-0, 100)', CONS), msg(s, v, 'ana-b1', 'Fetch(orders-0, 98)', CONS, { ms: 1700 })]);
      hit(v, 'o0b1');
    },
  },
  lookup: {
    phase: 'Two groups read', on: ['o0b1', 'inB1'], color: CONS,
    title: 'B1 checks the HW and looks up .index',
    text: 'Consumers may only read below the high watermark. Both ask for offsets under HW 101, so B1 serves them. It finds where to start in the sparse .index: 100 → 8500 for billing, and for 98 it starts at 52 → 4410 and scans forward.',
    observe: 'The .index row lights up: B1 finds the byte positions.',
    async run(s, v) { await swap(s, v.rows.idx, '98, 100 < HW 101 ✓', GREEN); await s.pulse(v.rows.idx); },
  },
  fetchBack: {
    phase: 'Two groups read', on: ['o0b1', 'billP', 'anaP'], wires: ['~bill-b1', '~ana-b1'], color: CONS,
    title: 'Records flow back: 1 to billing, 3 to analytics',
    text: 'B1 sends the bytes straight from the page cache to the network (zero-copy). billing gets record 100; analytics gets 98, 99 and 100 in one FetchResponse. The same record now goes to two groups, independently.',
    observe: 'Record 100 flows to billing; a train of 98, 99, 100 flows to analytics.',
    async run(s, v) {
      const one = rec(s, v, '100', ORD[0], PORT[0], LANE_TOP(0));
      const three = [98, 99, 100].map(o => rec(s, v, `${o}`, ORD[0], PORT[0], LANE_TOP(0)));
      await Promise.all([
        msg(s, v, 'bill-b1', 'records', GREEN, { rev: true, carry: one }),
        ...three.map((b, i) => s.wait(i * 170).then(() => i ? glide(s, v, [b], 'ana-b1', { rev: true, ms: 1700 }) : msg(s, v, 'ana-b1', 'records', GREEN, { rev: true, carry: b, ms: 1700 }))),
      ]);
      await Promise.all([one, ...three].map(async b => { await Promise.all([s.move(b, 850, b._y, 380), s.fade(b, 0, 380)]); b.remove(); }));
      await Promise.all([say(s, v, 'billP', 'poll() → 1 record'), say(s, v, 'anaP', 'poll() → 3 records')]);
    },
  },
  deserialize: {
    phase: 'Two groups read', on: ['billD', 'anaD'], color: CONS,
    title: 'Deserialize back into orders',
    text: 'In each consumer the key and value deserializers turn the bytes back into keys and order objects. They must match the producer\'s serializers.',
    observe: 'Both deserializers show the records as orders again.',
    async run(s, v) {
      await Promise.all([bead(s, v, 'billP', 'billD', ORD[0]), bead(s, v, 'anaP', 'anaD', ORD[0])]);
      await Promise.all([say(s, v, 'billD', `→ ${KEY}`), say(s, v, 'anaD', '→ 3 orders')]);
    },
  },
  process: {
    phase: 'Two groups read', on: ['billX', 'anaX'], color: CONS,
    title: 'Each group processes the order',
    text: 'billing charges the order; analytics updates its dashboards with three orders. Neither has committed anything yet: a crash now means reading the same offsets again.',
    observe: 'process turns to ✓ in both groups.',
    async run(s, v) {
      await Promise.all([bead(s, v, 'billD', 'billX', ORD[0]), bead(s, v, 'anaD', 'anaX', ORD[0])]);
      await Promise.all([say(s, v, 'billX', '✓ charged order 100', GREEN), say(s, v, 'anaX', '✓ processed 98 – 100', GREEN)]);
    },
  },
  position: {
    phase: 'Two groups read', on: ['bill', 'ana'], color: CONS,
    title: 'Both positions move to 101 (in memory)',
    text: 'Each consumer\'s position is now 101, the next offset it will fetch. analytics caught up in one fetch. These positions live only in memory until they are committed.',
    observe: 'pos 100 → 101 in billing, pos 98 → 101 in analytics.',
    async run(s, v) { await Promise.all([swap(s, v.n.bill.right, 'pos 101', CONS), swap(s, v.n.ana.right, 'pos 101', CONS)]); },
  },
  commit: {
    phase: 'Two groups read', on: ['bill', 'ana', 'coord'], wires: ['bill-co', 'ana-co'], color: COMMIT,
    title: 'Both commit 101 to the group coordinator',
    text: 'Each consumer commits 101, not 100: a committed offset is the next one to read. The commits go to the group coordinator, here B3, which is not the partition\'s leader. Each group commits separately.',
    observe: 'Two Commit(101) messages flow down to B3\'s coordinator.',
    async run(s, v) { await Promise.all([msg(s, v, 'bill-co', 'Commit(101)', COMMIT), msg(s, v, 'ana-co', 'Commit(101)', COMMIT, { ms: 1500 })]); hit(v, 'coord'); },
  },
  committed: {
    phase: 'Two groups read', on: ['coord'], wires: ['~bill-co', '~ana-co'], color: COMMIT,
    title: 'Stored in __consumer_offsets',
    text: 'The coordinator writes "billing, orders-0 → 101" and "analytics, orders-0 → 101" to the internal topic __consumer_offsets (itself replicated) and replies OK. After a restart, each group resumes from its own committed offset.',
    observe: 'Both rows turn → 101 and an OK flows back to each group.',
    async run(s, v) {
      await Promise.all([swap(s, v.co.bill, '→ 101', GREEN), swap(s, v.co.ana, '→ 101', GREEN)]);
      await Promise.all([msg(s, v, 'bill-co', 'OK', GREEN, { rev: true, ms: 900 }), msg(s, v, 'ana-co', 'OK', GREEN, { rev: true, ms: 1000 })]);
    },
  },
};

// acks=1: the leader replies as soon as its own write is done.
const ack1 = {
  phase: 'Acknowledge', on: ['o0b1', 'aSender'], wire: '~a-send',
  title: 'acks=1: B1 replies right away',
  text: 'With acks=1 there is no purgatory: B1 answers as soon as offset 100 is in its own log. At this moment B2 and B3 do not have the record yet.',
  observe: 'The ProduceResponse leaves while only B1 has record 100 (outlined in red).',
  async run(s, v) {
    v.rec.rect.setAttribute('stroke', RED); v.rec.rect.setAttribute('stroke-width', 3);
    await msg(s, v, 'a-send', 'ProduceResponse · orders-0 @ 100', GREEN, { rev: true });
    await say(s, v, 'aSender', 'sender ✓ acked', GREEN);
  },
};
const risk1 = {
  phase: 'Replication', on: ['o0b1', 'inB1'],
  title: 'The risk window',
  text: 'Producer A was told "done", but only B1 has offset 100. If B1 crashed now, B2 or B3 would become leader without it, and an acknowledged record would be lost. The next events close this window.',
  observe: 'The followers row warns: only B1 has offset 100.',
  async run(s, v) { await swap(s, v.rows.fol, '⚠ only B1 has 100', RED); },
};
const hw1 = {
  ...E.hw,
  title: 'HW moves to 101: the window closes',
  text: 'Once both followers report 101, the HW moves to 101 and offset 100 is committed. With acks=1 the producer had already moved on; it never learns whether this happened.',
  async run(s, v) { await E.hw.run(s, v); v.rec.rect.removeAttribute('stroke'); },
};
// acks=0: fire and forget.
const sent0 = {
  phase: 'Producer A', on: ['aSend', 'aSender'],
  title: 'acks=0: Producer A counts it as sent',
  text: 'With acks=0 the producer completes the Future as soon as the request is written to the socket. RecordMetadata has offset -1 (unknown), and the producer will never retry.',
  observe: 'send() shows "sent · offset -1" before B1 has done anything.',
  async run(s, v) { hit(v, 'aSend'); await say(s, v, 'aSend', '✓ "sent" · offset -1', MUTED); },
};
const noReply = {
  phase: 'Acknowledge', on: ['inB1', 'o0b1'],
  title: 'No ProduceResponse is sent',
  text: 'B1 stored the record exactly as with the other settings, but with acks=0 it sends nothing back. Had B1 been down or the request lost, Producer A would never have known.',
  observe: 'purgatory reads "acks=0 → no reply"; nothing flows back.',
  async run(s, v) { await swap(s, v.rows.purg, 'acks=0 → no reply', RED); await s.shake(v.n.o0b1); },
};

// ---- payments · Producer B · RF 2 · one group ----
const P = {
  send: {
    phase: 'Producer B', on: ['bSend'], color: PAY,
    title: 'Producer B calls send()',
    text: `A second application, Producer B, sends a payment: send("payments", "${PKEY}", payment). It is a separate producer with its own metadata cache, buffer and sender thread.`,
    observe: `Producer B's send() holds ${PKEY}.`,
    async run(s, v) { hit(v, 'bSend'); await say(s, v, 'bSend', `send(${PKEY})`); },
  },
  meta: {
    phase: 'Producer B', on: ['bMeta', 'b1'], wire: 'b-meta', color: PAY,
    title: 'Metadata for payments',
    text: 'Producer B\'s cache is empty too, so it asks a bootstrap broker, B1, about topic payments. Requests from Producer B take the lower part of the network in this picture.',
    observe: 'A MetadataRequest flows from Producer B to B1.',
    async run(s, v) { await bead(s, v, 'bSend', 'bMeta', '#9aa3a9'); await msg(s, v, 'b-meta', 'MetadataRequest(payments)', PAY); hit(v, 'b1'); },
  },
  metaRes: {
    phase: 'Producer B', on: ['b1', 'bMeta', 'p0b1', 'p0b2'], wire: '~b-meta', color: PAY,
    title: '1 partition, 2 replicas, leader B1',
    text: 'payments has one partition, payments-0, with replication factor 2: one copy on B1 (the leader) and one on B2. B3 holds no copy of payments.',
    observe: 'The reply flows back; the two payments-0 lanes glow.',
    async run(s, v) { await msg(s, v, 'b-meta', 'payments-0 → B1 (RF 2)', GREEN, { rev: true }); await say(s, v, 'bMeta', 'metadata ✓ cached', GREEN); },
  },
  part: {
    phase: 'Producer B', on: ['bPart', 'bSender'], color: PAY,
    title: 'Serialize, partition, batch',
    text: `The same pipeline as Producer A: serialize ${PKEY} and the payment, then partition. With one partition every key lands in payments-0. The record joins the batch, send() returns a Future and the sender thread takes it.`,
    observe: 'Producer B\'s record hops through its boxes to the sender.',
    async run(s, v) {
      await bead(s, v, 'bMeta', 'bPart', PAY); await say(s, v, 'bPart', '→ payments-0', PAY);
      await bead(s, v, 'bPart', 'bSender', PAY); await say(s, v, 'bSender', 'sender → B1');
    },
  },
  produce: {
    phase: 'Producer B', on: ['bSender', 'p0b1'], wire: 'b-send', color: PAY,
    title: 'ProduceRequest to B1, acks=all',
    text: 'The batch travels to payments-0\'s leader, B1. B1 now handles writes for two topics: each partition is its own log, so they never mix.',
    observe: 'The orange record rides into B1\'s payments-0 lane.',
    async run(s, v) {
      v.prec = rec(s, v, '', PAY, 174, B_Y[3]);
      await msg(s, v, 'b-send', 'Produce payments-0 · acks=all', PAY, { carry: v.prec });
      await s.move(v.prec, PORT[0], BLOCK_Y(2), 380);
      hit(v, 'p0b1');
    },
  },
  write: {
    phase: 'Leader write', on: ['p0b1', 'inB1'], color: PAY,
    title: 'Offset 40, appended to payments-0\'s .log',
    text: 'payments-0 has offsets 0 to 39, so the record gets offset 40 and is appended at byte 3120. LEO becomes 41. This small write did not cross the 4 KB mark, so there is no new .index entry: the index is sparse.',
    observe: 'The record is stamped 40; .log and LEO update; .index stays the same.',
    async run(s, v) {
      await showInside(s, v);
      v.n.p0b1.hole.setAttribute('opacity', 0);
      v.prec.label.textContent = '40';
      await s.pulse(v.prec);
      await swap(s, v.rows.log, '39 · 40 @ byte 3120', PAY);
      await swap(s, v.rows.leo, '41 · 40', PAY);
    },
  },
  park: {
    phase: 'Leader write', on: ['inB1'], color: PAY,
    title: 'Purgatory: waiting for one follower',
    text: 'acks=all again waits for every in-sync replica. With replication factor 2 the ISR is just {B1, B2}, so it only waits for B2.',
    observe: 'purgatory: waiting for B2.',
    async run(s, v) { await swap(s, v.rows.purg, 'waiting for B2', AMBER); },
  },
  fetch: {
    phase: 'Replication', on: ['p0b2', 'p0b1'], wire: 'b2p-b1', color: PAY,
    title: 'B2 fetches payments-0 from 40',
    text: 'B2\'s fetcher asks B1 for payments-0 from offset 40. One broker runs fetchers for every partition it follows: B2 also fetches orders-0 in the same loop.',
    observe: 'Fetch(40) flows from B2 to B1.',
    async run(s, v) { await msg(s, v, 'b2p-b1', 'Fetch(40)', PAY); },
  },
  copy: {
    phase: 'Replication', on: ['p0b1', 'p0b2'], wire: '~b2p-b1', color: PAY,
    title: 'Record 40 copied to B2',
    text: 'B1 returns record 40 and B2 appends it to its own payments-0 log. Its LEO becomes 41.',
    observe: 'Record 40 flows to B2 and settles into its free slot.',
    async run(s, v) {
      const c = rec(s, v, '40', PAY, PORT[0], ROW[2] + 30);
      await msg(s, v, 'b2p-b1', 'records', GREEN, { rev: true, carry: c });
      await s.move(c, PORT[1], BLOCK_Y(2), 380);
      v.n.p0b2.hole.setAttribute('opacity', 0);
      hit(v, 'p0b2');
    },
  },
  hw: {
    phase: 'Replication', on: ['p0b2', 'inB1'], wire: 'b2p-b1', color: PAY,
    title: 'Next fetch → HW 41',
    text: 'B2\'s next fetch says "from 41", so B1 knows B2 has 40. Both ISR members are at 41, so the high watermark moves to 41: offset 40 is committed with 2 copies.',
    observe: 'Fetch(41); LEO · HW reads 41 · 41.',
    async run(s, v) {
      await msg(s, v, 'b2p-b1', 'Fetch(41)', PAY);
      await swap(s, v.rows.fol, 'B2 at 41', PAY);
      await swap(s, v.rows.leo, '41 · 41 ✓ committed', GREEN);
    },
  },
  ack: {
    phase: 'Acknowledge', on: ['p0b1', 'bSend', 'bSender'], wire: '~b-send', color: PAY,
    title: 'ProduceResponse → SendResult',
    text: 'Purgatory releases the request, B1 answers with payments-0 @ 40, and Producer B\'s Future completes. RF 2 means fewer copies to wait for than orders\' RF 3, but it survives only one broker failure.',
    observe: 'A green response flows back; Producer B shows ✓ SendResult @ 40.',
    async run(s, v) {
      await swap(s, v.rows.purg, '✓ released', GREEN);
      await msg(s, v, 'b-send', 'ProduceResponse · payments-0 @ 40', GREEN, { rev: true });
      await say(s, v, 'bSend', '✓ SendResult @ 40', GREEN);
    },
  },
  poll: {
    phase: 'One group reads', on: ['shipP', 'p0b1'], wire: 'ship-b1', color: CONS,
    title: 'shipping fetches payments-0 from 40',
    text: 'One group, shipping, reads payments with a single consumer that owns payments-0. Its position is 40, so it fetches from 40 at the leader, B1.',
    observe: 'Fetch(payments-0, 40) flows from shipping to B1.',
    async run(s, v) { await msg(s, v, 'ship-b1', 'Fetch(payments-0, 40)', CONS); },
  },
  back: {
    phase: 'One group reads', on: ['p0b1', 'shipP'], wire: '~ship-b1', color: CONS,
    title: 'Record 40 flows to shipping',
    text: '40 is below HW 41, so B1 serves it. The FetchResponse carries record 40 to the shipping consumer.',
    observe: 'Record 40 flows to shipping\'s poll().',
    async run(s, v) {
      const c = rec(s, v, '40', PAY, PORT[0], ROW[2] + 30);
      await msg(s, v, 'ship-b1', 'records', GREEN, { rev: true, carry: c });
      await Promise.all([s.move(c, 850, c._y, 380), s.fade(c, 0, 380)]); c.remove();
      await say(s, v, 'shipP', 'poll() → 1 record');
    },
  },
  process: {
    phase: 'One group reads', on: ['shipD', 'shipX', 'ship'], color: CONS,
    title: 'Deserialize and ship it',
    text: `shipping deserializes ${PKEY} and books the delivery. Its position moves to 41 in memory.`,
    observe: 'process shows ✓; pos 41.',
    async run(s, v) {
      await bead(s, v, 'shipP', 'shipD', PAY); await say(s, v, 'shipD', `→ ${PKEY}`);
      await bead(s, v, 'shipD', 'shipX', PAY); await say(s, v, 'shipX', '✓ shipped', GREEN);
      await swap(s, v.n.ship.right, 'pos 41', CONS);
    },
  },
  commit: {
    phase: 'One group reads', on: ['ship', 'coord'], wires: ['ship-co'], color: COMMIT,
    title: 'Commit(41) to the coordinator',
    text: 'shipping commits 41 to the same group coordinator on B3. One coordinator serves many groups; each group\'s offsets are separate rows in __consumer_offsets.',
    observe: 'Commit(41) flows to B3; the shipping row turns → 41.',
    async run(s, v) {
      await msg(s, v, 'ship-co', 'Commit(41)', COMMIT);
      await swap(s, v.co.ship, '→ 41', GREEN);
      await msg(s, v, 'ship-co', 'OK', GREEN, { rev: true, ms: 800 });
    },
  },
};

const flowOf = (steps, opts = {}, pre) => {
  const track = { continuous: true, phases: true, async build(s) { const v = scene(s, opts); v.track = track; if (pre) await pre(s, v); return v; }, enter, steps };
  return track;
};
const prelude = [E.send, E.metaCheck, E.metaReq, E.metaRes, E.serialize, E.partition, E.accumulate, E.drain];
const write = acks => [E.produceReq(acks), E.offset(acks), E.append, E.leo, E.index, E.timeindex];
const replicate = [E.fetchReq, E.fetchRes, E.folAppend, E.nextFetch];
const consume = [E.polls, E.lookup, E.fetchBack, E.deserialize, E.process, E.position, E.commit, E.committed];
const flowAll = flowOf([...prelude, ...write('all'), E.park, ...replicate, E.hw, E.release, E.produceRes, E.future, ...consume], { acks: 'all' });
const flowOne = flowOf([...prelude, ...write('1'), ack1, E.future, risk1, ...replicate, hw1], { acks: '1' });
const flowZero = flowOf([...prelude, E.produceReq('0'), sent0, ...write('0').slice(1), noReply, ...replicate, E.hw], { acks: '0' });
const flowPay = flowOf(Object.values(P), { topic: 'payments' });

// ---- crash flows: they replay the orders happy path up to a point, instantly ----
const upTo = step => async (s, v) => {
  const steps = flowAll.steps, end = steps.indexOf(step) + 1;
  for (const st of steps.slice(0, end)) await st.run(s, v);
  v.track = { steps: [...steps.slice(0, end), ...v.track.steps] };   // keep the replayed wires as a trail
  v.offset = end;
};
const crashEnter = (s, v, i) => light(s, v, i + (v.offset ?? 0));
const crashFlow = (steps, step) => { const t = flowOf(steps, { acks: 'all' }, upTo(step)); t.enter = crashEnter; return t; };
const down = (s, v, b) => {
  const f = v.n[`b${b + 1}`];
  f.rect.setAttribute('stroke', RED); f.rect.setAttribute('fill', '#fff4f4');
  f.title.textContent = `Broker B${b + 1} ✕ down`; f.title.setAttribute('fill', RED);
};
const LC = {
  safe: {
    phase: 'Before the crash', on: ['o0b1', 'o0b2', 'o0b3', 'aSend'],
    title: 'Offset 100 is committed and acknowledged',
    text: 'This picks up the acks=all flow after Producer A got its SendResult: offset 100 is on B1, B2 and B3, and the HW is 101. The consumer groups have not read it yet.',
    observe: 'Record 100 in all three orders-0 lanes; send() shows ✓ SendResult.',
    async run(s, v) { await s.wait(300); },
  },
  crash: {
    phase: 'Leader crash', on: ['b1'], color: RED,
    title: 'B1, the leader, crashes',
    text: 'The machine running B1 dies. orders-0 and payments-0 have lost their leader, and everything inside B1 is unreachable.',
    observe: 'B1 turns red and its lanes fade.',
    async run(s, v) {
      down(s, v, 0);
      await Promise.all([s.fade(v.inWrap, 0, 300), ...['o0b1', 'o1b1', 'p0b1'].map(k => s.fade(v.n[k], .4, 300)), s.fade(v.rec, .4, 300)]);
      await s.shake(v.n.b1);
    },
  },
  elect: {
    phase: 'Leader crash', on: ['o0b2', 'p0b2', 'o0b3'],
    title: 'The controller makes B2 the leader',
    text: 'After broker.session.timeout.ms without heartbeats, the controller fences B1 and picks a live in-sync replica as the new leader, in a new leader epoch: B2 for orders-0, and B2 for payments-0 too. (Leader election shows each step.)',
    observe: 'B2\'s orders-0 and payments-0 lanes show ★ leader.',
    async run(s, v) {
      for (const k of ['o0b2', 'p0b2']) { v.n[k].rect.setAttribute('stroke-width', 2.6); await swap(s, v.n[k].roleT, '★ leader', AMBER); }
      await swap(s, v.n.o0b3.roleT, 'follows B2', MUTED);
    },
  },
  refollow: {
    phase: 'Leader crash', on: ['o0b3', 'o0b2'], wire: 'b3-b2',
    title: 'B3 now fetches from B2',
    text: 'B3 learns the new leader from the controller and points its fetcher at B2. orders-0 keeps two in-sync copies: ISR {B2, B3}.',
    observe: 'B3\'s Fetch(101) flows to B2 instead of B1.',
    async run(s, v) { await msg(s, v, 'b3-b2', 'Fetch(101)', v.tc); hit(v, 'o0b2'); },
  },
  fail: {
    phase: 'Clients move', on: ['billP', 'b1'], wire: 'bill-b1', color: RED,
    title: 'billing\'s fetch to B1 fails',
    text: 'billing polls orders-0 from 100 and sends it to B1, the leader it knew. The connection fails, so the consumer refreshes its metadata and learns that B2 now leads orders-0. (Producers do the same on their next send.)',
    observe: 'A red Fetch fails at B1; poll() now points at B2.',
    async run(s, v) { await msg(s, v, 'bill-b1', 'Fetch(orders-0, 100)', RED); await s.shake(v.n.billP); await say(s, v, 'billP', 'poll() · orders-0 → B2', AMBER); },
  },
  fetchB2: {
    phase: 'Clients move', on: ['billP', 'o0b2'], wire: 'bill-b2', color: CONS,
    title: 'Fetch(orders-0, 100) from the new leader',
    text: 'billing sends the same fetch to B2. Its position is still 100: the leader changed, the group\'s place in the log did not.',
    observe: 'A FetchRequest flows from billing to B2.',
    async run(s, v) { await msg(s, v, 'bill-b2', 'Fetch(orders-0, 100)', CONS); hit(v, 'o0b2'); },
  },
  serve: {
    phase: 'Clients move', on: ['o0b2', 'billP'], wire: '~bill-b2', color: CONS,
    title: 'B2 has offset 100: nothing was lost',
    text: 'B2 copied offset 100 before Producer A was acknowledged; that is what acks=all waited for. It serves the record from its own log, exactly as B1 would have.',
    observe: 'Record 100 flows from B2 to billing.',
    async run(s, v) {
      const c = rec(s, v, '100', ORD[0], PORT[1], LANE_TOP(0));
      await msg(s, v, 'bill-b2', 'records', GREEN, { rev: true, carry: c });
      await Promise.all([s.move(c, 850, c._y, 380), s.fade(c, 0, 380)]); c.remove();
      await say(s, v, 'billP', 'poll() → 1 record');
    },
  },
  process: {
    phase: 'After', on: ['billX', 'bill', 'coord'], wire: 'bill-co', color: COMMIT,
    title: 'Processed and committed, via B2',
    text: 'billing processes order 100 and commits 101 as usual; the coordinator on B3 was not affected. With acks=1 the producer could have been told "success" before B2 had it, and this crash would have lost it. When B1 returns, it rejoins as a follower of B2.',
    observe: '✓ charged order 100; Commit(101) flows to B3.',
    async run(s, v) {
      await say(s, v, 'billX', '✓ charged order 100', GREEN);
      await msg(s, v, 'bill-co', 'Commit(101)', COMMIT);
      await swap(s, v.co.bill, '→ 101', GREEN);
    },
  },
};
const CC = {
  done: {
    phase: 'Before the crash', on: ['billX', 'anaX', 'coord'], color: CONS,
    title: 'Both groups processed; nothing committed yet',
    text: 'This picks up the acks=all flow just after both groups processed the order. Their positions are 101 in memory, but __consumer_offsets still says billing → 100 and analytics → 98.',
    observe: 'Both show ✓ processed; the coordinator rows have not changed.',
    async run(s, v) { await E.position.run(s, v); },
  },
  crash: {
    phase: 'Consumer crash', on: ['bill'], color: RED,
    title: 'billing\'s consumer crashes before committing',
    text: 'The billing consumer dies right after charging the order, before its commit was sent. Its in-memory position 101 is gone.',
    observe: 'The billing group turns red; pos is lost.',
    async run(s, v) {
      v.n.bill.rect.setAttribute('stroke', RED); v.n.bill.rect.setAttribute('fill', '#fff4f4');
      await swap(s, v.n.bill.right, 'pos lost', RED);
      await s.shake(v.n.bill);
    },
  },
  other: {
    phase: 'Consumer crash', on: ['ana', 'coord'], wire: 'ana-co', color: COMMIT,
    title: 'analytics is not affected',
    text: 'analytics is a different group with its own consumer and its own offsets. It commits 101 as usual. A crash in one group never moves another group\'s position.',
    observe: 'analytics\' Commit(101) flows to B3; its row turns → 101.',
    async run(s, v) { await msg(s, v, 'ana-co', 'Commit(101)', COMMIT); await swap(s, v.co.ana, '→ 101', GREEN); },
  },
  timeout: {
    phase: 'Consumer crash', on: ['coord'], color: COMMIT,
    title: 'The coordinator waits for billing\'s session to time out',
    text: 'No LeaveGroup was sent, so the coordinator only notices missing heartbeats. After session.timeout.ms (45 s) it removes the member and rebalances orders to whoever joins next.',
    observe: 'The coordinator: billing · no heartbeat 45 s.',
    async run(s, v) { for (const t of ['15 s', '30 s', '45 s → rebalance']) { await swap(s, v.coNote, `billing · no heartbeat ${t}`, t.length > 5 ? RED : AMBER); await s.wait(200); } },
  },
  back: {
    phase: 'Restart', on: ['bill', 'coord'], wire: 'bill-co', color: COMMIT,
    title: 'billing restarts and asks where to start',
    text: 'The restarted consumer joins billing, is assigned the orders partitions and fetches the group\'s committed offset for orders-0: 100. That is the only position that survived.',
    observe: 'OffsetFetch → "committed 100"; pos 100.',
    async run(s, v) {
      v.n.bill.rect.setAttribute('stroke', '#bfe4df'); v.n.bill.rect.setAttribute('fill', '#f7fcfb');
      await msg(s, v, 'bill-co', 'OffsetFetch', COMMIT);
      await msg(s, v, 'bill-co', 'committed 100', GREEN, { rev: true });
      await Promise.all([swap(s, v.n.bill.right, 'pos 100', CONS), swap(s, v.coNote, 'billing rejoined', MUTED)]);
    },
  },
  again: {
    phase: 'Restart', on: ['billP', 'o0b1'], wire: 'bill-b1', color: CONS,
    title: 'Offset 100 is delivered again',
    text: 'billing fetches orders-0 from 100 and B1 returns record 100: the same record it already processed before the crash.',
    observe: 'Fetch(100) to B1, record 100 back to billing.',
    async run(s, v) {
      await msg(s, v, 'bill-b1', 'Fetch(orders-0, 100)', CONS);
      const c = rec(s, v, '100', ORD[0], PORT[0], LANE_TOP(0));
      await msg(s, v, 'bill-b1', 'records', GREEN, { rev: true, carry: c });
      await Promise.all([s.move(c, 850, c._y, 380), s.fade(c, 0, 380)]); c.remove();
    },
  },
  twice: {
    phase: 'Restart', on: ['billX'], color: RED,
    title: 'Order 100 is charged a second time',
    text: 'The listener runs again for order 100. Unless processing is idempotent (a unique order id, an upsert), the customer is charged twice. This is at-least-once delivery.',
    observe: 'process shows ✕ charged AGAIN.',
    async run(s, v) { await bead(s, v, 'billP', 'billX', ORD[0]); await say(s, v, 'billX', '✕ charged AGAIN', RED); },
  },
  lesson: {
    phase: 'After', on: ['coord', 'bill'], wire: 'bill-co', color: COMMIT,
    title: 'Then it commits 101 as usual',
    text: 'This time the commit goes through and billing moves on. Kafka delivered offset 100 twice to billing, and once to analytics. Avoiding a double effect is the application\'s job (see Commit & restart).',
    observe: 'Commit(101); the billing row turns → 101.',
    async run(s, v) { await msg(s, v, 'bill-co', 'Commit(101)', COMMIT); await swap(s, v.co.bill, '→ 101', GREEN); await swap(s, v.n.bill.right, 'pos 101', CONS); },
  },
};
const flowLeaderCrash = crashFlow(Object.values(LC), E.future);
const flowConsumerCrash = crashFlow(Object.values(CC), E.process);

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
    light(s, v, i);
    await track.steps[i].run(s, v);
    if (heard == null && [E.future, sent0].includes(track.steps[i])) heard = { at: i - first + 1, hw: v.rows.leo.textContent };
    await s.wait(250);
  }
  return { heard, total: end - first };
}

export default {
  id: 'journey', n: 21, title: 'Journey of one message', tagline: 'From send() to commit, event by event',
  docked: true,
  guide: {
    what: `A small cluster: 3 brokers, topic orders (2 partitions, RF 3) written by Producer A and read by two groups, and topic payments (1 partition, RF 2) written by Producer B and read by one group. Follow one record, ${KEY}, from send() to commit.`,
    fits: 'Every atom working together, drawn with the same pieces as the Level 1 lessons. The wire in use flows in the topic\'s colour; travelled wires stay. Turn on 🔁 Loop to watch the route again and again.',
  },
  flows: [
    { id: 'all', short: 'orders · acks=all', label: 'orders · acks=all · two groups', about: 'Producer A writes; B2 and B3 copy; billing and analytics each read and commit.', track: flowAll },
    { id: 'payments', short: 'payments · RF 2', label: 'payments · RF 2 · one group', about: 'Producer B writes to one partition with two copies; shipping reads it.', track: flowPay },
    { id: 'one', short: 'acks=1', label: 'orders · acks=1', about: 'B1 replies after its own write; the followers copy later.', track: flowOne },
    { id: 'zero', short: 'acks=0', label: 'orders · acks=0', about: 'Fire and forget: no reply at all.', track: flowZero },
    { id: 'crash', short: 'leader crash', label: 'Leader crash', about: 'B1 dies after the ack; B2 serves offset 100.', track: flowLeaderCrash },
    { id: 'consumer-crash', short: 'consumer crash', label: 'Consumer crash', about: 'billing crashes before committing: offset 100 comes back; analytics is unaffected.', track: flowConsumerCrash },
  ],
  watch: flowAll,
  tryIt: {
    intro: 'Producer A\'s batch for orders-0 is ready. Pick acks and press send() to play the broker side, then compare when the producer hears back.',
    observe: 'acks=all hears back after the HW moves; acks=1 right after B1\'s write; acks=0 before B1 has done anything.',
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
      for (const n of Object.values(v.n)) n.classList.remove('on');
      v.message = input.acks === 'all' ? `acks=all: Producer A heard back after ${heard.at} of ${total} broker-side events, once LEO · HW was ${heard.hw}. Slowest, safest.`
        : input.acks === '1' ? `acks=1: Producer A heard back after ${heard.at} of ${total} events, before the followers had offset 100 (LEO · HW ${heard.hw}). Fast, with a loss window.`
          : `acks=0: Producer A marked it "sent" (offset -1) at event ${heard.at} of ${total}, before B1 had even written it. Fastest, no guarantee.`;
    },
    readout: v => `B1 orders-0 LEO · HW: <b>${v.rows.leo.textContent}</b> · Producer A: <b>${v.n.aSend.label.textContent}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Sparse index lookups, segments, LEO vs high watermark, and why the two topics have different RF.',
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
    enter(s, v, i) { light(s, v, i); },
    steps: [
      {
        on: ['inB1'],
        title: 'Reading offset 75: binary search the sparse index',
        text: 'There is no .index entry for 75. Kafka binary-searches for the largest entry at or below it, 52 → 4410. The index is small enough to stay in memory, so this is fast.',
        observe: 'The .index row shows the entry it picks for 75.',
        async run(s, v) { await swap(s, v.rows.idx, '75? → use 52 → 4410', AMBER); },
      },
      {
        on: ['inB1'],
        title: 'Jump to byte 4410, then scan forward to 75',
        text: 'B1 jumps to byte 4410 in the .log and scans forward through a few batches until it reaches offset 75. At most about 4 KB is scanned: the trade-off of a sparse index.',
        observe: 'The .log row shows the short scan from 52 to 75.',
        async run(s, v) { await swap(s, v.rows.log, '@4410: scan 52 → 75', AMBER); },
      },
      {
        on: ['inB1', 'o0b1'],
        title: 'The log is split into segments',
        text: 'A partition folder holds segments, each a .log plus its .index and .timeindex, named by its first offset. At segment.bytes (1 GB) or segment.ms a new one starts, e.g. 00000000000000000150.log. Retention deletes whole old segments.',
        observe: 'The .log row shows the next segment\'s name.',
        async run(s, v) { await swap(s, v.rows.log, 'next: …0150.log', AMBER); },
      },
      {
        on: ['inB1', 'o0b2', 'o0b3'],
        title: 'LEO is per replica; HW is the slowest in-sync one',
        text: 'B1 is at LEO 101, the followers at 100, so HW stays at 100. A follower that stays behind longer than replica.lag.time.max.ms (30 s) is dropped from the ISR, so it no longer holds the HW back.',
        observe: 'LEO · HW 101 · 100 inside B1; the followers still show the free slot.',
        async run(s, v) { await Promise.all(['o0b2', 'o0b3'].map(k => s.pulse(v.n[k].hole))); },
      },
      {
        on: ['inB1'],
        title: 'min.insync.replicas: refusing writes with too few copies',
        text: 'acks=all waits for the whole current ISR. min.insync.replicas (here 2) is a floor: if the ISR shrinks below it, the leader rejects acks=all writes with NOT_ENOUGH_REPLICAS instead of accepting them with too few copies.',
        observe: 'The purgatory row shows the rule that guards acks=all writes.',
        async run(s, v) { await swap(s, v.rows.purg, 'ISR < 2 → rejected', RED); },
      },
      {
        on: ['o0b1', 'o0b2', 'o0b3', 'p0b1', 'p0b2'],
        title: 'RF 3 vs RF 2: how many failures a topic survives',
        text: 'orders has 3 copies of each partition, so it survives 2 broker failures (and with min.insync.replicas=2 keeps taking writes after 1). payments has 2 copies: it survives 1 failure, and with min.insync.replicas=2 it stops taking acks=all writes as soon as one copy is down.',
        observe: 'Three blue orders-0 lanes against two orange payments-0 lanes.',
        async run(s, v) { await Promise.all(['p0b1', 'p0b2'].map(k => s.pulse(v.n[k]))); },
      },
    ],
  },
  takeaway: 'Metadata → serialize → partition → batch → ProduceRequest to the leader → offset, .log, LEO, sparse indexes → followers fetch → HW moves → ack. Each consumer group reads below the HW at its own position and commits the next offset. acks only changes when the producer hears back.',
  recap: {
    points: [
      'send(): metadata first, then serialize, partition (murmur2 of the key) and batch; send() returns a Future.',
      'The sender thread sends the batch to the partition leader, which assigns the offset from its LEO.',
      'The leader appends to .log; .index and .timeindex are sparse.',
      'Followers pull with fetches; their next fetch moves the high watermark.',
      'acks=all: reply after the ISR has it · acks=1: after the leader’s write · acks=0: never.',
      'Each group reads below the HW at its own position and commits to __consumer_offsets on its coordinator.',
    ],
    interview: [
      { q: 'Walk me through what happens when a producer sends a message.', a: 'send() first makes sure it has **metadata** for the topic (a MetadataRequest to a bootstrap broker if not). It **serializes** key and value, the **partitioner** picks the partition (murmur2 of the key), and the record joins that partition\'s **batch**; send() returns a Future. The **sender thread** sends the batch to the partition\'s **leader**, which **assigns the offset** (its LEO), **appends to the active segment** and updates the sparse indexes. **Followers fetch** it; their next fetch moves the **high watermark**, and with **acks=all** the leader then replies with partition and offset.' },
      { q: 'What is the difference between acks=0, 1 and all?', a: '**acks=0**: no reply, offset unknown, no retries, possible silent loss. **acks=1**: reply after the **leader\'s** write; lost if the leader dies before followers copy it. **acks=all**: reply after **all in-sync replicas** have it; with **min.insync.replicas=2** it survives a broker failure. Replication itself is the same in all three.' },
      { q: 'Two consumer groups read the same topic. How do they interfere?', a: 'They **don\'t**. Each group has its **own position and committed offsets** (separate rows in __consumer_offsets), so each gets **every record**. One group being slow or crashing never moves the other\'s offsets.' },
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
  related: ['producer', 'replica', 'multi-group'],
};
