// Level 3: the journey of one message, from send() to the consumer's commit, request by request.
// Three flows share one scene: acks=all (the happy path), acks=1 and acks=0.
import { PARTITION_COLORS as PC } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';

const P0 = PC[0], INK = '#203347', MONO = 'Consolas, monospace';
const REQ = { fill: '#edf3fe', stroke: '#2f6fe0', color: '#1f56b8' };   // requests: blue
const RES = { fill: '#eef7e8', stroke: GREEN, color: '#2a6b38' };       // responses: green
const BLK = { w: 44, h: 30, size: 14 };
const SBLK = { w: 32, h: 26, size: 13 };

// Producer column
const PX = 100;
// Leader B1
const B1 = { x: 478, y: 155, w: 448, h: 230 };
const LOG_X = 352, LOG_DX = 50, LOG_Y = 124, IDX_Y = 170, TIX_Y = 212, TAG_Y = 250;
// Followers
const FOL = [{ x: 365, name: 'B2' }, { x: 591, name: 'B3' }], FY = 346, F_LOG_X = -40, F_DX = 36;
const fSlot = off => F_LOG_X + (off - 99) * F_DX;
// Consumer column
const CX = 844;

const logX = off => LOG_X + (off - 96) * LOG_DX;

function scene(s, { acks = 'all' } = {}) {
  const v = { acks, off: 100, sends: 0 };

  // ---- producer ----
  v.prod = s.box(PX, 240, 172, 400, '', { stroke: '#d8b7e9', rx: 12, fill: '#fcfaff' });
  s.text(v.prod, 0, -178, 'Producer', { 'font-size': 17, 'font-weight': 700, fill: '#7a4aa3' });
  v.acksT = s.text(v.prod, 0, -157, `acks=${acks}`, { 'font-size': 14, 'font-family': MONO, fill: MUTED });
  v.send = s.box(PX, 118, 152, 52, '', { size: 14 });
  s.text(v.send, 0, -10, 'send("orders",', { 'font-size': 14, 'font-family': MONO });
  s.text(v.send, 0, 10, '"ORD101", order)', { 'font-size': 14, 'font-family': MONO });
  v.meta = s.box(PX, 236, 152, 112, '', { stroke: '#c9ced2', rx: 8 });
  s.text(v.meta, 0, -40, 'metadata cache', { 'font-size': 15, 'font-weight': 650 });
  v.metaEmpty = s.text(v.meta, 0, 8, '(empty)', { 'font-size': 15, fill: MUTED });
  v.metaRows = ['P0 → B1', 'P1 → B2', 'P2 → B3'].map((t, i) => {
    const r = s.text(v.meta, 0, -12 + i * 24, t, { 'font-size': 15, 'font-family': MONO, fill: PC[i], 'font-weight': 700, opacity: 0 });
    return r;
  });
  v.part = s.box(PX, 352, 152, 64, '', { stroke: '#c9ced2', rx: 8 });
  s.text(v.part, 0, -16, 'partitioner', { 'font-size': 15, 'font-weight': 650 });
  v.hash = s.text(v.part, 0, 12, 'hash(key) % 3', { 'font-size': 14, 'font-family': MONO, fill: MUTED });
  v.status = s.text(s.root, PX, 412, '', { 'font-size': 15, 'font-weight': 700 });
  v.prodParts = [v.prod, v.send, v.meta, v.part, v.acksT, ...v.metaRows];

  // ---- leader B1 ----
  v.b1 = s.box(B1.x, B1.y, B1.w, B1.h, '', { stroke: INK, rx: 10 });
  const L = -B1.w / 2 + 14;
  s.text(v.b1, L, -94, 'Broker B1', { 'text-anchor': 'start', 'font-size': 17, 'font-weight': 700 });
  s.text(v.b1, L + 92, -94, '★ leader of orders-0', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: AMBER });
  v.b1Marks = s.text(s.g(B1.x + B1.w / 2 - 14, B1.y - 94), 0, 0, '', { 'text-anchor': 'end', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  s.text(v.b1, L, -66, 'orders-0/  segment 00000000000000000000', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: MUTED });
  s.text(s.root, B1.x + L, LOG_Y, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.log = [96, 97, 98, 99].map(o => s.block(logX(o), LOG_Y, `${o}`, P0, BLK));
  v.slot = s.box(logX(100), LOG_Y, BLK.w, BLK.h, '', { dash: '4 3', stroke: P0, rx: 3 });
  v.byteT = s.text(s.root, logX(100) + 30, LOG_Y, '', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, fill: MUTED });
  s.text(s.root, B1.x + L, IDX_Y, '.index', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.idx = ['0 → 0', '52 → 4410'].map((t, i) => entry(s, 372 + i * 106, IDX_Y, t));
  s.text(s.root, B1.x + L, TIX_Y, '.timeindex', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.tix = [entry(s, 420, TIX_Y, '17:59:58 → 52', 128)];

  // ---- followers ----
  v.fol = FOL.map(({ x, name }) => {
    const b = s.box(x, FY, 214, 104, '', { stroke: INK, rx: 10 });
    s.text(b, -93, -32, `Broker ${name}`, { 'text-anchor': 'start', 'font-size': 17, 'font-weight': 700 });
    s.text(b, 93, -32, 'follower', { 'text-anchor': 'end', 'font-size': 15, fill: MUTED });
    s.text(b, -93, 4, '.log', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.log = [s.block(fSlot(99), 4, '99', P0, { ...SBLK, parent: b })];
    b.hole = s.box(fSlot(100), 4, SBLK.w, SBLK.h, '', { parent: b, dash: '4 3', stroke: P0, rx: 3 });
    b.leo = s.text(b, -93, 34, '', { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
    b.x = x; b.name = name; b.end = 100;
    return b;
  });
  v.isr = s.text(s.root, B1.x, 428, '', { 'font-size': 15, 'font-weight': 650, fill: '#3d4a55' });

  // ---- consumer side (appears when the consumer steps start) ----
  v.cons = s.box(CX, 155, 196, 230, '', { stroke: '#bfe4df', rx: 12, fill: '#f7fcfb' });
  s.text(v.cons, 0, -94, 'Consumer', { 'font-size': 17, 'font-weight': 700, fill: '#13968a' });
  s.text(v.cons, 0, -72, 'group orders-app', { 'font-size': 14, fill: MUTED });
  v.pos = s.text(v.cons, 0, -40, 'position: 100', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  v.work = s.box(0, 44, 160, 50, 'process order', { parent: v.cons, size: 15 });
  v.consSlot = [CX, 150];
  v.offsets = s.box(CX, FY, 196, 104, '', { stroke: '#c9ced2', rx: 10 });
  s.text(v.offsets, 0, -32, '__consumer_offsets', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
  s.text(v.offsets, 0, -10, 'on the group coordinator', { 'font-size': 14, fill: MUTED });
  v.committed = s.text(v.offsets, 0, 22, 'orders-0 → 100', { 'font-size': 15, 'font-family': MONO, 'font-weight': 700, fill: MUTED });
  for (const n of [v.cons, v.offsets]) n.setAttribute('opacity', 0);

  v.leo = 100; v.hw = 100;
  marks(v);
  return v;
}

// A small index entry ("offset → position") drawn as a light tag.
function entry(s, x, y, t, w = 96) {
  const e = s.box(x, y, w, 28, t, { size: 14, fill: '#f6f7fb', stroke: '#d5d9dc', rx: 5, weight: 600 });
  e.label.setAttribute('font-family', MONO);
  return e;
}
function marks(v) {
  v.b1Marks.textContent = `LEO ${v.leo} · HW ${v.hw}`;
  for (const f of v.fol) f.leo.textContent = `LEO ${f.end}`;
  v.isr.textContent = `ISR {B1, B2, B3} · min.insync.replicas = 2 · HW ${v.hw}`;
}
function setStatus(v, str, color = INK) { v.status.textContent = str; v.status.setAttribute('fill', color); }

// A request or response travelling between two points: a labelled pill that is removed on arrival.
const pill = (s, at, label, kind) => s.box(...at, Math.max(96, label.length * 8.2 + 22), 28, label, { size: 14, rx: 14, ...kind, weight: 650 });
async function packet(s, from, to, label, kind = REQ, ms = 900, { keep = false } = {}) {
  const p = pill(s, from, label, kind);
  await s.pop(p, 180);
  await s.move(p, ...to, ms);
  if (keep) return p;
  await s.fade(p, 0, 200);
  p.remove();
}
const atB1 = [B1.x - 120, B1.y - 22];
const prodOut = [PX + 40, 175];

// ---- steps shared by the flows ----
const S = {
  send: {
    title: 'Your code calls send()',
    text: 'kafkaTemplate.send("orders", "ORD101", order). The producer wraps it into a record (key ORD101, the order as the value, a timestamp, optional headers) and the serializers turn key and value into bytes.',
    observe: 'The record ORD101 appears in the producer.',
    focus: v => [v.send, v.rec],
    async run(s, v) {
      v.rec = s.block(PX, 175, 'ORD101', '#9aa3a9', { w: 96, h: 30, size: 14 });
      await s.pop(v.rec, 300);
      await s.pulse(v.send);
    },
  },
  metaReq: {
    title: 'Ask the cluster for metadata',
    text: 'The producer knows only bootstrap.servers, for example B1:9092. Before it can send, it asks that broker for metadata: which brokers exist, which partitions orders has, and who leads each one. Any broker can answer.',
    observe: 'A MetadataRequest travels from the producer to B1.',
    focus: v => [v.meta, v.b1],
    async run(s, v) {
      await packet(s, [PX, 236], atB1, 'MetadataRequest →', REQ);
      await s.pulse(v.b1);
    },
  },
  metaRes: {
    title: 'The metadata comes back',
    text: 'B1 replies: topic orders has P0, P1 and P2 on brokers B1, B2 and B3, and each partition has a leader. The producer caches this and only asks again when something changes (a new leader, a timeout, or metadata.max.age.ms).',
    observe: 'The metadata cache fills in: one leader per partition.',
    focus: v => [v.meta],
    async run(s, v) {
      await packet(s, atB1, [PX, 236], '← MetadataResponse', RES);
      v.metaEmpty.setAttribute('opacity', 0);
      for (const r of v.metaRows) await s.show(r, 200);
    },
  },
  partition: {
    title: 'The partitioner picks P0, so the target is B1',
    text: 'This happens inside the producer, not on a broker. With a key, Kafka computes murmur2(key) & 0x7fffffff % partitions: for ORD101 that is 0, so P0. The metadata says P0\'s leader is B1, so that is where the record goes.',
    observe: 'hash("ORD101") % 3 = 0 → P0, and P0 → B1 lights up.',
    focus: v => [v.part, v.metaRows[0]],
    async run(s, v) {
      await s.move(v.rec, PX, 300, 500);
      await s.pulse(v.part);
      v.hash.textContent = 'hash(ORD101)%3 = 0';
      v.hash.setAttribute('fill', P0);
      v.hash.setAttribute('font-weight', 700);
      v.rec.rect.setAttribute('fill', P0);
      v.rec.label.textContent = 'ORD101→P0';
      for (const [i, r] of v.metaRows.entries()) r.setAttribute('opacity', i ? .3 : 1);
      await s.pulse(v.meta);
    },
  },
  produce: acks => ({
    title: 'Send a ProduceRequest straight to the leader',
    text: `The producer sends the record (in a batch, see Batching) to B1 only: writes always go to the partition leader. The request names the topic, the partition and acks=${acks}, which says how long the producer is willing to wait.`,
    observe: `ProduceRequest (P0, acks=${acks}) travels to B1 carrying ORD101.`,
    focus: v => [v.b1],
    async run(s, v) {
      v.rec.label.textContent = 'ORD101';
      const p = pill(s, [PX + 40, 300], `ProduceRequest P0 acks=${acks}`, REQ);
      await s.pop(p, 180);
      await Promise.all([s.move(p, B1.x - 70, B1.y + 70, 1000), s.move(v.rec, logX(100), LOG_Y + 40, 1000)]);
      await s.fade(p, 0, 200); p.remove();
    },
  }),
  append: {
    title: 'B1 assigns offset 100 and appends to .log',
    text: 'P0 already holds offsets 0 to 99, so the leader gives this record the next one: 100. It appends the record to the active segment file 00000000000000000000.log, here at byte 8500. Real files hold binary record batches, not readable text.',
    observe: 'The record lands in slot 100 of the .log row, and LEO moves from 100 to 101.',
    focus: v => [v.rec, v.byteT],
    async run(s, v) {
      await s.move(v.rec, logX(100), LOG_Y, 450);
      v.rec.label.textContent = '100';
      v.rec.rect.setAttribute('width', BLK.w); v.rec.rect.setAttribute('x', -BLK.w / 2);
      v.slot.setAttribute('opacity', 0);
      v.byteT.textContent = '@ byte 8500';
      await s.show(v.byteT, 250);
      v.leo = 101; marks(v);
      await s.pulse(v.b1Marks);
    },
  },
  index: {
    title: 'B1 updates .index and .timeindex',
    text: '.index maps offset → byte position and .timeindex maps time → offset, so reads can jump close to the right byte. Both are sparse: an entry about every 4 KB of log (index.interval.bytes), not one per record. The write sits in the OS page cache; Kafka relies on replicas, not fsync, for safety.',
    observe: 'New entries 100 → 8500 and 18:00:00 → 100 appear.',
    focus: v => [v.idxNew, v.tixNew],
    async run(s, v) {
      v.idxNew = entry(s, 584, IDX_Y, '100 → 8500', 112);
      v.idxNew.rect.setAttribute('stroke', P0);
      await s.pop(v.idxNew, 300);
      v.tixNew = entry(s, 566, TIX_Y, '18:00:00 → 100', 140);
      v.tixNew.rect.setAttribute('stroke', P0);
      await s.pop(v.tixNew, 300);
    },
  },
  park: {
    title: 'acks=all: B1 parks the request and waits',
    text: 'The record is written, but only on B1. With acks=all the leader does not answer yet: it holds the request (in "purgatory") until every replica in the ISR has the record. The producer is still waiting, up to request.timeout.ms.',
    observe: 'A "waiting for ISR" tag on B1; the producer shows "waiting for ack".',
    focus: v => [v.wait],
    async run(s, v) {
      v.wait = s.box(B1.x + 120, TAG_Y, 170, 28, '⏳ waiting for ISR', { size: 14, rx: 14, fill: '#fdf4e7', stroke: AMBER, color: '#8a5a12', weight: 650 });
      await s.pop(v.wait, 250);
      setStatus(v, '⏳ waiting for ack', AMBER);
      await s.show(v.status, 250);
    },
  },
  fetch: {
    title: 'B2 and B3 fetch from the leader',
    text: 'Followers are not pushed to. Each one keeps sending FetchRequests to B1 saying "I have up to 99, give me from 100". B1 answers with the new record, and each follower appends it to its own orders-0 .log and updates its own index files.',
    observe: 'FetchRequest(100) goes up from each follower, record 100 comes back down, and each LEO becomes 101.',
    focus: v => v.fol,
    async run(s, v) {
      await Promise.all(v.fol.map(f => packet(s, [f.x, FY - 30], [f.x, B1.y + 80], 'Fetch from 100 ↑', REQ, 700)));
      await Promise.all(v.fol.map(async f => {
        const b = s.block(logX(100), LOG_Y, '100', P0, SBLK);
        await s.move(b, f.x + fSlot(100), FY + 4, 900);
        b.remove();
        f.hole.setAttribute('opacity', 0);
        f.log.push(s.block(fSlot(100), 4, '100', P0, { ...SBLK, parent: f }));
        f.end = 101;
      }));
      marks(v);
    },
  },
  hw: {
    title: 'The next fetch moves the high watermark',
    text: 'The leader learns what a follower has from its next fetch: "give me from 101" means "I have 100". Once every ISR member is at 101, B1 moves the high watermark (HW) to 101. Offset 100 is now committed: safe on all in-sync replicas, and visible to consumers.',
    observe: 'Fetch(101) from both followers, then B1\'s HW goes 100 → 101.',
    focus: v => [v.b1Marks, v.isr],
    async run(s, v) {
      await Promise.all(v.fol.map(f => packet(s, [f.x, FY - 30], [f.x, B1.y + 80], 'Fetch from 101 ↑', REQ, 600)));
      v.hw = 101; marks(v);
      await s.pulse(v.b1Marks);
      if (v.wait) { v.wait.label.textContent = '✓ all ISR have it'; v.wait.rect.setAttribute('stroke', GREEN); v.wait.rect.setAttribute('fill', '#eef7e8'); v.wait.label.setAttribute('fill', '#2a6b38'); }
    },
  },
  ack: {
    title: 'B1 answers the producer',
    text: 'Now B1 sends the ProduceResponse: partition 0, offset 100. In the producer that completes the future: Spring\'s SendResult carries RecordMetadata (topic orders, partition 0, offset 100), and your callback runs.',
    observe: 'A green ProduceResponse travels back and the producer shows ✓ SendResult.',
    focus: v => [v.status],
    async run(s, v) {
      if (v.wait) { await s.fade(v.wait, 0, 200); v.wait.remove(); v.wait = null; }
      await packet(s, [B1.x - 120, B1.y + 70], [PX, 380], '← ProduceResponse P0 @100', RES, 1000);
      setStatus(v, '✓ SendResult P0 @ 100', GREEN);
      await s.pulse(v.send);
      // The producer's part is done: fade it back (keeping the result) so the consumer side gets the attention.
      await Promise.all(v.prodParts.map(n => s.fade(n, .12, 400)));
    },
  },
  poll: {
    title: 'The consumer fetches from offset 100',
    text: 'A consumer in group orders-app was assigned P0. Its position is 100, so its poll() sends FetchRequest(orders-0, offset 100) to the leader B1. Consumers only get records below the high watermark, which is why offset 100 became readable only after replication.',
    observe: 'The consumer appears and its FetchRequest goes to B1.',
    focus: v => [v.cons],
    async run(s, v) {
      await Promise.all([s.show(v.cons, 350), s.show(v.offsets, 350), s.fade(v.status, .12, 350)]);
      await packet(s, [CX, 60], [B1.x + 150, B1.y - 22], '← Fetch P0 from 100', REQ, 800);
    },
  },
  read: {
    title: 'B1 finds offset 100 with the index',
    text: 'B1 does not scan the whole log. It looks up 100 in .index (nearest entry at or below it: 100 → 8500), jumps to byte 8500 of the .log file and returns the batch from there, straight from the page cache to the network (zero-copy).',
    observe: 'The index entry lights up, then record 100 travels to the consumer.',
    focus: v => [v.idxNew, v.rec],
    async run(s, v) {
      await s.pulse(v.idxNew);
      await s.pulse(v.rec);
      const b = s.block(logX(100), LOG_Y, '100', P0, BLK);
      await s.move(b, ...v.consSlot, 1000);
      v.got = b;
      v.pos.textContent = 'position: 101';
    },
  },
  process: {
    title: 'The application processes the order',
    text: 'poll() returns the record and your listener handles it: save the order, call a service, and so on. The consumer\'s position is already 101 in memory, but nothing is saved to Kafka yet. If it crashed now, it would read 100 again.',
    observe: 'Record 100 goes into "process order".',
    focus: v => [v.work],
    async run(s, v) {
      await s.move(v.got, CX, 155 + 44, 600);
      v.got.remove();
      v.work.rect.setAttribute('stroke', '#13968a');
      v.work.label.textContent = '✓ order processed';
      await s.pulse(v.work);
    },
  },
  commit: {
    title: 'Commit offset 101 to __consumer_offsets',
    text: 'Finally the consumer commits 101, not 100: a committed offset is the next one to read. The OffsetCommit goes to the group coordinator broker (not necessarily the leader of P0), which writes it to the internal topic __consumer_offsets.',
    observe: 'OffsetCommit(101) travels down; the stored offset changes from 100 to 101.',
    focus: v => [v.offsets],
    async run(s, v) {
      await packet(s, [CX, 240], [CX, FY - 10], 'OffsetCommit 101 ↓', REQ, 700);
      v.committed.textContent = 'orders-0 → 101';
      v.committed.setAttribute('fill', GREEN);
      await s.pulse(v.offsets);
    },
  },
};

// acks=1: the leader answers as soon as its own write is done.
const ack1 = {
  title: 'acks=1: B1 answers right away',
  text: 'With acks=1 the leader replies as soon as the record is in its own log. The producer gets SendResult (P0, offset 100) quickly, but at this moment only B1 has the record: B2 and B3 have not fetched it yet.',
  observe: 'The ProduceResponse goes back before any follower has record 100. Only B1\'s copy is outlined in red.',
  focus: v => [v.status, v.rec],
  async run(s, v) {
    await packet(s, [B1.x - 120, B1.y + 70], [PX, 380], '← ProduceResponse P0 @100', RES, 900);
    setStatus(v, '✓ SendResult P0 @ 100', GREEN);
    await s.show(v.status, 200);
    v.rec.rect.setAttribute('stroke', RED); v.rec.rect.setAttribute('stroke-width', 3);
    v.risk = s.box(B1.x + 120, TAG_Y, 190, 28, '⚠ only on B1 so far', { size: 14, rx: 14, fill: '#fff4f4', stroke: RED, color: RED, weight: 650 });
    await s.pop(v.risk, 250);
  },
};
const risk1 = {
  title: 'The risk window closes once followers catch up',
  text: 'The followers fetch record 100 a moment later and the HW moves to 101. If B1 had crashed in between, a follower without record 100 could have become leader and the acknowledged record would be lost. acks=all closes that window.',
  observe: 'The red risk tag clears once B2 and B3 have record 100 and HW reaches 101.',
  focus: v => [v.b1Marks, v.isr],
  async run(s, v) {
    await S.hw.run(s, v);
    v.rec.rect.removeAttribute('stroke');
    v.risk.label.textContent = '✓ now on all 3';
    v.risk.rect.setAttribute('stroke', GREEN); v.risk.rect.setAttribute('fill', '#eef7e8'); v.risk.label.setAttribute('fill', '#2a6b38');
    await s.pulse(v.risk);
  },
};

// acks=0: fire and forget.
const produce0 = {
  ...S.produce('0'),
  title: 'acks=0: send and move on',
  text: 'With acks=0 the producer sends the ProduceRequest and counts the record as sent the moment it leaves. It never waits for a reply, so it is the fastest setting, and the producer cannot know if the write worked.',
  observe: 'The producer shows "sent" as soon as the request leaves, before B1 has written anything.',
  focus: v => [v.status, v.b1],
  async run(s, v) {
    setStatus(v, '✓ "sent" · offset -1', MUTED);
    await s.show(v.status, 200);
    await S.produce('0').run(s, v);
  },
};
const noReply = {
  title: 'No reply ever comes back',
  text: 'B1 writes the record exactly as before, but sends no ProduceResponse. The RecordMetadata the producer got has offset -1 (unknown). If B1 had been down or the request had been lost, the producer would never find out, and it never retries.',
  observe: 'A crossed-out "no ProduceResponse" tag: nothing travels back to the producer.',
  focus: v => [v.noReply, v.status],
  async run(s, v) {
    v.noReply = s.box(B1.x - 100, TAG_Y, 190, 28, '✕ no ProduceResponse', { size: 14, rx: 14, fill: '#fff4f4', stroke: RED, color: RED, weight: 650, dash: '5 4' });
    await s.pop(v.noReply, 300);
    await s.shake(v.noReply);
  },
};
const same = flow => ({
  title: 'From here on it is the same journey',
  text: `Replication is the same as with acks=all: followers fetch, the HW moves to 101, and only then can a consumer read offset 100. The acks setting only changes when the producer hears back${flow === '0' ? ' (here: never)' : ''}, not how the broker stores or replicates the record.`,
  observe: 'Followers fetch record 100 and HW reaches 101, though the producer was told much earlier.',
  focus: v => [v.b1Marks, v.isr],
  async run(s, v) { await S.fetch.run(s, v); await S.hw.run(s, v); },
});

const flowAll = { build: s => scene(s, { acks: 'all' }), steps: [S.send, S.metaReq, S.metaRes, S.partition, S.produce('all'), S.append, S.index, S.park, S.fetch, S.hw, S.ack, S.poll, S.read, S.process, S.commit] };
const flowOne = { build: s => scene(s, { acks: '1' }), steps: [S.send, S.metaReq, S.metaRes, S.partition, S.produce('1'), S.append, S.index, ack1, S.fetch, risk1] };
const flowZero = { build: s => scene(s, { acks: '0' }), steps: [S.send, S.metaReq, S.metaRes, S.partition, produce0, S.append, S.index, noReply, same('0')] };

// ---- try it: send records with any acks setting and compare when the producer hears back ----
async function trySend(s, v, acks) {
  const off = v.off;
  const rec = s.block(PX, 175, `ORD${101 + v.sends}`, '#9aa3a9', { w: 96, h: 30, size: 14 });
  await s.pop(rec, 200);
  if (!v.metaCached) {
    await packet(s, [PX, 236], atB1, 'MetadataRequest →', REQ, 600);
    await packet(s, atB1, [PX, 236], '← MetadataResponse', RES, 600);
    v.metaEmpty.setAttribute('opacity', 0);
    for (const r of v.metaRows) r.setAttribute('opacity', 1);
    v.metaCached = true;
  }
  rec.rect.setAttribute('fill', P0);
  v.hash.textContent = 'hash(ORD101)%3 = 0'; v.hash.setAttribute('fill', P0);
  setStatus(v, acks === '0' ? '✓ "sent" · offset -1' : '⏳ waiting for ack', acks === '0' ? MUTED : AMBER);
  const p = pill(s, [PX + 40, 300], `ProduceRequest acks=${acks}`, REQ);
  await Promise.all([s.move(p, B1.x - 70, B1.y + 70, 700), s.move(rec, logX(off), LOG_Y, 700)]);
  p.remove();
  if (off === 100) v.slot.setAttribute('opacity', 0);
  rec.label.textContent = `${off}`; rec.rect.setAttribute('width', BLK.w); rec.rect.setAttribute('x', -BLK.w / 2);
  v.log.push(rec);
  v.leo = off + 1; marks(v);
  const reply = async () => {
    await packet(s, [B1.x - 120, B1.y + 70], [PX, 380], `← ProduceResponse @${off}`, RES, 700);
    setStatus(v, `✓ SendResult P0 @ ${off}`, GREEN);
  };
  if (acks === '1') await reply();
  await Promise.all(v.fol.map(async f => {
    await packet(s, [f.x, FY - 30], [f.x, B1.y + 80], `Fetch from ${off} ↑`, REQ, 450);
    const b = s.block(logX(off), LOG_Y, `${off}`, P0, SBLK);
    await s.move(b, f.x + fSlot(off), FY + 4, 600);
    b.remove();
    if (off === 100) f.hole.setAttribute('opacity', 0);
    f.log.push(s.block(fSlot(off), 4, `${off}`, P0, { ...SBLK, parent: f }));
    f.end = off + 1;
  }));
  marks(v);
  await Promise.all(v.fol.map(f => packet(s, [f.x, FY - 30], [f.x, B1.y + 80], `Fetch from ${off + 1} ↑`, REQ, 400)));
  v.hw = off + 1; marks(v);
  if (acks === 'all') await reply();
  v.off++; v.sends++;
  v.message = acks === 'all' ? `acks=all: the producer heard back only after B2 and B3 had offset ${off} (HW ${off + 1}). Slowest, but nothing acknowledged can be lost.`
    : acks === '1' ? `acks=1: the producer heard back right after B1's own write, before the followers copied offset ${off}. Fast, with a small loss window.`
      : `acks=0: the producer never heard back (offset -1), even though B1 stored offset ${off}. Fastest, no guarantee.`;
  if (v.sends === 1) v.message += ' The metadata is now cached, so the next send goes straight to B1.';
}

export default {
  id: 'journey', n: 13, title: 'Journey of one message', tagline: 'From send() to commit, every request',
  guide: {
    what: 'One record, ORD101, followed request by request: metadata, partitioning, the leader\'s log and index files, replication to the followers, the acknowledgement, and finally a consumer reading and committing it.',
    fits: 'Every atom working together. Compare the acks flows here; crash flows come next. Then try it live in the Visualizer.',
  },
  flows: [
    { id: 'all', short: 'acks=all', label: 'Happy path · acks=all', about: 'The producer waits until every in-sync replica has the record.', track: flowAll },
    { id: 'one', short: 'acks=1', label: 'acks=1', about: 'The leader answers after its own write; followers copy later.', track: flowOne },
    { id: 'zero', short: 'acks=0', label: 'acks=0', about: 'Fire and forget: no reply at all.', track: flowZero },
    { id: 'crash', label: 'Leader crash', about: 'Coming soon', soon: true },
    { id: 'consumer-crash', label: 'Consumer crash', about: 'Coming soon', soon: true },
  ],
  watch: flowAll,
  tryIt: {
    intro: 'Pick an acks setting and press send(). Compare when the producer hears back with when the followers have the record.',
    observe: 'With acks=all the reply comes after the HW moves; with acks=1 right after B1\'s write; with acks=0 never.',
    controls: [
      { type: 'choice', name: 'acks', label: 'acks', options: ['all', '1', '0'] },
      { type: 'button', label: 'send()', primary: true, run: 'one' },
    ],
    build(s, input) {
      const v = scene(s, { acks: input?.acks ?? 'all' });
      v.message = 'Press send(). The first send fetches metadata; later ones use the cache.';
      return v;
    },
    async one(s, v, input) {
      if (v.sends >= 3) { v.message = 'The sandbox holds three sends. Switch to another tab and back to start again.'; return; }
      v.acksT.textContent = `acks=${input.acks}`;
      await trySend(s, v, input.acks);
    },
    readout: v => `Leader B1: <b>LEO ${v.leo}</b> · <b>HW ${v.hw}</b> · Followers: ${v.fol.map(f => `<b>${f.name}</b> LEO ${f.end}`).join(' · ')} · Producer: <b>${v.status.textContent || 'idle'}</b><br>${v.message}`,
  },
  deeper: {
    note: 'Sparse index lookups, segments, and LEO vs high watermark.',
    build(s) {
      // The picture right after B1 has written offset 100 (end of Watch step 7).
      const v = scene(s, { acks: 'all' });
      v.metaEmpty.setAttribute('opacity', 0);
      for (const r of v.metaRows) r.setAttribute('opacity', 1);
      v.hash.textContent = 'hash(ORD101)%3 = 0';
      v.hash.setAttribute('fill', P0);
      v.slot.setAttribute('opacity', 0);
      v.rec = s.block(logX(100), LOG_Y, '100', P0, BLK);
      v.byteT.textContent = '@ byte 8500';
      v.idxNew = entry(s, 584, IDX_Y, '100 → 8500', 112);
      v.tixNew = entry(s, 566, TIX_Y, '18:00:00 → 100', 140);
      for (const n of [v.idxNew, v.tixNew]) n.rect.setAttribute('stroke', P0);
      v.leo = 101; marks(v);
      return v;
    },
    steps: [
      {
        title: 'Reading offset 75: index, then a short scan',
        text: 'There is no entry for 75 in the sparse .index. Kafka binary-searches for the largest entry at or below it (52 → 4410), jumps to byte 4410 and scans forward through a few batches to reach 75. A tiny index stays in memory and still makes any read fast.',
        observe: 'Entry 52 → 4410 lights up, then the scan walks forward to 75.',
        focus: v => [v.idx[1]],
        async run(s, v) {
          await s.pulse(v.idx[1], 2);
          v.scan = s.box(B1.x - 60, TAG_Y, 270, 28, 'scan 52 → 75 from byte 4410', { size: 14, rx: 14, fill: '#fdf4e7', stroke: AMBER, color: '#8a5a12' });
          await s.pop(v.scan, 300);
        },
      },
      {
        title: 'The log is split into segments',
        text: 'A partition is a folder of segments. Each segment is a .log plus its .index and .timeindex, named by its first offset. When the active one reaches segment.bytes (1 GB) or segment.ms, Kafka starts a new one, for example 00000000000000000150.log. Retention deletes whole old segments.',
        observe: 'A new segment named after its first offset appears next to the active one.',
        focus: v => [v.seg],
        async run(s, v) {
          if (v.scan) await s.fade(v.scan, 0, 200);
          v.seg = s.box(B1.x + 60, TAG_Y, 260, 28, '+ 00000000000000000150.log', { size: 14, rx: 6, fill: '#f6f7fb', stroke: '#9aa3a9', weight: 650 });
          v.seg.label.setAttribute('font-family', MONO);
          await s.pop(v.seg, 300);
        },
      },
      {
        title: 'LEO is per replica; HW is the slowest in-sync one',
        text: 'Each replica has its own log end offset (LEO). The leader sets the high watermark to the smallest LEO among the ISR. A follower that falls behind for longer than replica.lag.time.max.ms (30 s) is dropped from the ISR, so it no longer holds the HW back.',
        observe: 'B1 is at LEO 101 while the followers are at 100, so HW stays at 100.',
        focus: v => [v.b1Marks, ...v.fol],
        async run(s, v) {
          if (v.seg) await s.fade(v.seg, 0, 200);
          await Promise.all(v.fol.map(f => s.pulse(f)));
          await s.pulse(v.b1Marks);
        },
      },
    ],
  },
  takeaway: 'Metadata → partition → the leader’s log → followers fetch → HW moves → ack → the consumer reads below the HW and commits the next offset. acks only changes when the producer hears back.',
  recap: {
    points: [
      'The producer gets metadata once, picks the partition (murmur2 of the key) and sends to its leader.',
      'The leader assigns the offset and appends to .log; .index and .timeindex are sparse.',
      'Followers pull with fetches; their next fetch moves the high watermark.',
      'acks=all: reply after the ISR has it · acks=1: after the leader’s write ·acks=0: never.',
      'Consumers read below the HW and commit the next offset to __consumer_offsets.',
    ],
    interview: [
      { q: 'Walk me through what happens when a producer sends a message.', a: 'The producer **fetches metadata** from a bootstrap broker, **serializes** the record, and the **partitioner** picks a partition (murmur2 hash of the key). It sends a **ProduceRequest to that partition\'s leader**. The leader **assigns the next offset** and **appends to the active segment** (.log, plus sparse .index/.timeindex). **Followers fetch** the record; once the ISR has it the **high watermark** advances and, with **acks=all**, the leader replies with the partition and offset.' },
      { q: 'What is the difference between acks=0, 1 and all?', a: '**acks=0**: no reply, offset unknown, no retries, possible silent loss. **acks=1**: reply after the **leader\'s** write; lost if the leader dies before followers copy it. **acks=all**: reply after **all in-sync replicas** have it; combined with **min.insync.replicas=2** it survives a broker failure. Replication itself is the same in all three.' },
      { q: 'Does acks=all wait for min.insync.replicas replicas?', a: 'No. It waits for **every replica currently in the ISR**. **min.insync.replicas** is a floor: if the ISR shrinks below it, the leader **rejects the write** with NOT_ENOUGH_REPLICAS instead of accepting it with too few copies.' },
      { q: 'How does Kafka find an offset quickly in a huge log?', a: 'Each segment is named by its **base offset**, so Kafka first picks the segment. Its **sparse .index** maps offsets to byte positions (an entry every ~4 KB); Kafka **binary-searches** the nearest entry below the target, **jumps** there and scans forward a little. **.timeindex** does the same for timestamps (offsetsForTimes).' },
      { q: 'Why does the consumer commit 101 after reading 100?', a: 'The committed offset is the **next offset to read**, not the last one processed. After a restart the consumer resumes from **101**. It is stored in the internal topic **__consumer_offsets** via the **group coordinator**.' },
    ],
  },
  quiz: {
    q: 'With acks=all, when does the leader send the ProduceResponse?',
    options: ['As soon as the record is in its own .log', 'When min.insync.replicas brokers have it, ignoring the rest of the ISR', 'When every in-sync replica has the record (and the HW covers it)', 'When a consumer has read the record'],
    answer: 2,
    why: 'acks=all waits for the whole current ISR. min.insync.replicas only sets how small the ISR may get before writes are refused.',
  },
  related: ['producer', 'replica', 'commit-lag'],
};
