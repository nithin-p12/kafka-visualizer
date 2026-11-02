// Lesson 3: the partition, an ordered append-only log inside a topic.
import { el, PARTITION_COLORS as PC, partitionFor } from '../scene.js';

const GREY = '#9aa3a9', CX = 570, SLOT0 = 368, SLOT = 48, MAX = 10, MONO = 'Consolas, monospace';
const BLK = { w: 42, h: 32, size: 14 };
const short = key => key.replace('user-', '');

function topic(s, n, { hidden = false } = {}) {
  const v = { lanes: [], logs: [], n };
  v.producer = s.box(100, 236, 170, 76, 'Producer', { sub: 'OrderService', size: 17, subSize: 14 });
  v.frame = s.box(570, 240, 600, 370, '', { stroke: '#1677ff', dash: '6 5', rx: 12 });
  s.text(v.frame, -282, -163, 'topic: orders', { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700, fill: '#1677ff' });
  const gap = n === 3 ? 96 : 76, top = 252 - gap * (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const lane = s.box(CX, top + i * gap, 540, n === 3 ? 62 : 56, '', { stroke: PC[i], rx: 8 });
    s.text(lane, -246, 0, `P${i}`, { 'font-size': 18, 'font-weight': 800, fill: PC[i] });
    v.lanes.push(lane); v.logs.push([]);
    if (hidden) lane.setAttribute('opacity', 0);
  }
  if (hidden) v.frame.setAttribute('opacity', 0);
  v.formula = s.text(s.root, 570, 30, '', { 'font-size': 16, 'font-family': MONO, 'font-weight': 700, fill: '#614373' });
  return v;
}
const slotOf = (v, p, i) => [SLOT0 + i * SLOT, v.lanes[p]._y];
async function append(s, v, p, label, { via } = {}) {
  const log = v.logs[p];
  if (log.length >= MAX) return null;
  const b = s.block(v.producer._x + 80, v.producer._y, label, GREY, BLK);
  if (via) await s.move(b, ...via, 520);
  await s.move(b, ...slotOf(v, p, log.length), 620);
  b.rect.setAttribute('fill', PC[p]);
  log.push(b);
  return b;
}
async function sendKeyed(s, v, key) {
  const p = partitionFor(key, v.n);
  v.formula.textContent = `murmur2("${key}") % ${v.n} = ${p}  →  P${p}`;
  const b = await append(s, v, p, short(key));
  if (b) b.key = key;
  return b;
}

export default {
  id: 'partition', n: 3, title: 'Partition', tagline: 'An ordered, append-only log inside a topic',
  guide: {
    what: 'A topic is split into partitions. Each partition is an ordered log that only grows at the end. Partitions are how Kafka keeps order and how it scales.',
    fits: 'A topic is the name; partitions hold the records. Next: the number each record gets inside its partition (offset).',
  },
  watch: {
    build(s) { return topic(s, 3, { hidden: true }); },
    steps: [
      {
        title: 'A topic is split into partitions',
        text: 'The orders topic has 3 partitions: P0, P1 and P2. Each one is a separate log. You choose the partition count when you create the topic.',
        observe: 'Three lanes appear inside the topic. Each lane is one partition.',
        focus: v => v.lanes,
        async run(s, v) { await s.show(v.frame, 300); for (const l of v.lanes) await s.show(l, 260); },
      },
      {
        title: 'Each partition is an append-only log',
        text: 'A new record is always added to the end of the partition. Existing records never move. For now, all records go to P0.',
        observe: 'Each new block lands right after the previous one. Its colour changes to P0\'s green on arrival.',
        focus: v => [v.lanes[0]],
        async run(s, v) { for (let i = 1; i <= 4; i++) await append(s, v, 0, `${i}`); },
      },
      {
        title: 'No inserting, no editing',
        text: 'You cannot squeeze a record into the middle of a partition or change one. The only allowed operation is "append to the end". This is what makes Kafka fast and predictable.',
        observe: 'Record 5 tries to cut in, is pushed back, and goes to the end.',
        focus: v => [v.logs[0].at(-1)],
        async run(s, v) {
          const b = s.block(180, 236, '5', GREY, BLK);
          await s.move(b, SLOT0 + 1.5 * SLOT, v.lanes[0]._y - 40, 700);
          b.rect.setAttribute('stroke', '#ce3434'); b.rect.setAttribute('stroke-width', 2.5);
          await s.shake(b);
          b.rect.removeAttribute('stroke');
          await s.move(b, ...slotOf(v, 0, v.logs[0].length), 600);
          b.rect.setAttribute('fill', PC[0]);
          v.logs[0].push(b);
        },
      },
      {
        title: 'The key picks the partition',
        text: 'With a key, the producer computes murmur2(key) % 3, which is Kafka\'s real default formula. The same key always gives the same number, so it always lands in the same partition. (Key → partition goes into the details.)',
        observe: 'The formula at the top. Every "42" (user-42) goes to P1.',
        focus: v => [v.formula],
        async run(s, v) {
          v.order = [];
          for (const key of ['user-42', 'user-7', 'user-8', 'user-42', 'user-7', 'user-42']) v.order.push(await sendKeyed(s, v, key));
        },
      },
      {
        title: 'Same key, same partition, same order',
        text: 'This is Kafka\'s ordering guarantee: order holds inside one partition. All events for user-42 sit in P1 in the exact order they were sent, so they are read in that order.',
        observe: 'The three user-42 records, numbered 1st, 2nd and 3rd.',
        focus: v => v.logs[1].filter(b => b.key === 'user-42'),
        async run(s, v) {
          const mine = v.logs[1].filter(b => b.key === 'user-42');
          await Promise.all(mine.map(async (b, i) => {
            const t = s.text(s.root, b._x, b._y - 44, ['1st', '2nd', '3rd'][i], { 'font-size': 15, 'font-weight': 700, fill: '#614373' });
            await s.show(t, 300);
            await s.pulse(b);
          }));
        },
      },
      {
        title: 'No order across partitions',
        text: 'There is no global order across P0, P1 and P2. The numbers under the blocks show the send order. A reader of P2 may process the 5th record before a reader of P1 processes the 4th.',
        observe: 'The send numbers are scattered across lanes. Order only exists left to right within one lane.',
        focus: v => v.order,
        async run(s, v) {
          await Promise.all(v.order.map((b, i) => {
            const t = s.text(s.root, b._x, b._y + 42, `#${i + 1}`, { 'font-size': 15, 'font-weight': 700, fill: '#7b878f' });
            return s.show(t, 400);
          }));
        },
      },
      {
        title: 'Why partitions? Parallel work',
        text: 'Different consumers can read different partitions at the same time. 3 partitions allow up to 3 readers in a group working in parallel. More partitions means more parallelism, which is how Kafka scales.',
        observe: 'Three readers each consume their own partition, all at once.',
        focus: v => v.readers,
        async run(s, v) {
          v.readers = v.lanes.map((l, i) => s.box(904, l._y, 100, 56, `Reader ${i + 1}`, { size: 15, stroke: PC[i] }));
          await Promise.all(v.readers.map(r => s.pop(r)));
          await Promise.all(v.logs.map(async (log, p) => {
            for (const b of log.slice(0, 3)) {
              const c = s.block(b._x, b._y, b.label.textContent, PC[p], BLK);
              await s.move(c, 852, b._y, 520);
              c.remove();
              await s.pulse(v.readers[p]);
            }
          }));
        },
      },
    ],
  },
  tryIt: {
    intro: 'Pick a key and send it. The real Kafka formula decides the partition. Then switch to 4 partitions and send user-42 again.',
    observe: 'Changing the partition count changes the formula\'s result: user-42 moves from P1 to P0.',
    controls: [
      { type: 'choice', name: 'key', label: 'Key', options: ['user-42', 'user-7', 'user-8', 'no key'] },
      { type: 'choice', name: 'partitions', label: 'Partitions', options: ['3', '4'], rebuild: true },
      { type: 'button', label: 'Send record', primary: true, run: 'send' },
    ],
    build(s, input) {
      const v = topic(s, +input.partitions);
      v.seen = {}; v.message = 'Nothing sent yet.'; v.sticky = { p: 0, left: 3 };
      return v;
    },
    async send(s, v, input) {
      if (input.key === 'no key') {
        if (v.sticky.left === 0) v.sticky = { p: (v.sticky.p + 1) % v.n, left: 3 };
        v.sticky.left--;
        v.formula.textContent = `no key  →  sticky partition P${v.sticky.p}`;
        const b = await append(s, v, v.sticky.p, '∅');
        v.message = b ? `No key: the producer keeps filling P${v.sticky.p} until its batch is sent, then switches partition. Unkeyed records have no ordering by key.` : 'That partition is full in this sandbox.';
        return;
      }
      const b = await sendKeyed(s, v, input.key);
      const p = partitionFor(input.key, v.n);
      v.seen[input.key] = p;
      v.message = b ? `${input.key} → P${p}. Send it again and it will go to P${p} again.` : 'That partition is full in this sandbox.';
    },
    readout: v => `${Object.entries(v.seen).map(([k, p]) => `<b>${k}</b> → P${p}`).join(' · ') || 'No keyed records yet.'}<br>${v.message}`,
  },
  deeper: {
    note: 'Partitions on disk, and why you should pick the count carefully.',
    build(s) {
      const v = {};
      v.folder = s.box(290, 150, 520, 210, '', { stroke: PC[0], rx: 10 });
      s.text(v.folder, -244, -82, '📁 /var/kafka-logs/orders-0/', { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700, 'font-family': MONO });
      v.files = [['00000000000000000000.log', 'the records'], ['00000000000000000000.index', 'offset → byte position'], ['00000000000000000000.timeindex', 'time → offset']].map(([f, d], i) => {
        const r = s.g(-244, -36 + i * 46, v.folder);
        s.text(r, 0, 0, f, { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO });
        s.text(r, 488, 0, d, { 'text-anchor': 'end', 'font-size': 15, fill: '#65727a' });
        r.setAttribute('opacity', 0);
        return r;
      });
      return v;
    },
    steps: [
      {
        title: 'A partition is a folder of segment files',
        text: 'On the broker\'s disk, each partition is a directory. Records are written to .log files, and small index files let Kafka jump straight to any offset or timestamp.',
        observe: 'The files that make up partition orders-0.',
        focus: v => [v.folder],
        async run(s, v) { for (const f of v.files) await s.show(f, 300); },
      },
      {
        title: 'Segments roll over and expire as a whole',
        text: 'A partition\'s log is split into segments (1 GB each by default). Only the newest, active segment is written to. Retention deletes whole old segments, never single records.',
        observe: 'The active segment fills up, a new one starts, and the oldest segment is deleted.',
        focus: v => v.segs,
        async run(s, v) {
          const seg = (x, label, fill) => s.box(x, 342, 196, 56, label, { size: 15, fill, stroke: PC[0], rx: 8 });
          v.segs = [seg(130, 'segment 0–999', '#eef7e8'), seg(340, 'segment 1000–1999', '#eef7e8')];
          const active = seg(550, 'active · 2000…', '#fff');
          v.segs.push(active);
          await Promise.all(v.segs.map(g => s.show(g, 300)));
          const fill = el('rect', { x: -98, y: -28, width: 0, height: 56, rx: 8, fill: '#5bb12f33' }, active);
          await s.clock.tween(1200, t => fill.setAttribute('width', 196 * t));
          const next = seg(760, 'active · 3000…', '#fff');
          active.label.textContent = 'segment 2000–2999';
          v.segs.push(next);
          await s.show(next, 300);
          await s.fade(v.segs[0], .15, 700);
          v.segs[0].label.textContent = 'deleted by retention';
        },
      },
      {
        title: 'You can add partitions, not remove them',
        text: 'Going from 3 to 4 partitions changes the formula. New user-42 records go to P0 while the old ones stay in P1, so ordering for that key breaks across the change. Kafka never lets you reduce partitions. Pick the count up front.',
        observe: 'The same key gives a different partition when the count changes.',
        focus: v => [v.f3, v.f4],
        async run(s, v) {
          v.f3 = s.text(s.root, 790, 110, `murmur2("user-42") % 3 = ${partitionFor('user-42', 3)}`, { 'font-size': 16, 'font-family': MONO, 'font-weight': 700 });
          v.f4 = s.text(s.root, 790, 160, `murmur2("user-42") % 4 = ${partitionFor('user-42', 4)}`, { 'font-size': 16, 'font-family': MONO, 'font-weight': 700, fill: '#ce3434' });
          await s.show(v.f3, 400);
          await s.wait(400);
          await s.show(v.f4, 400);
          await s.pulse(v.f4);
        },
      },
    ],
  },
  takeaway: 'A partition is an ordered, append-only log. The key picks the partition (hash % count). Order is guaranteed only within a partition, and more partitions means more parallel readers.',
  recap: {
    points: [
      'A topic is split into a fixed number of partitions, chosen at creation.',
      'Each partition is an append-only log: records go to the end and never change.',
      'The key decides the partition: same key, same partition.',
      'Order is guaranteed within a partition, never across partitions.',
      'Partitions are the unit of parallelism: one reader per partition per group.',
      'On disk a partition is a folder of segment files; partitions can be added, never removed.',
    ],
    interview: [
      { q: 'What is a partition and why does Kafka have them?', a: 'A partition is an **ordered, append-only log** that holds part of a topic\'s records. Partitions let a topic **scale**: they are spread over brokers, and consumers in a group read **different partitions in parallel**. They are also the unit of **ordering** and **replication**.' },
      { q: 'Does Kafka guarantee message order?', a: '**Only within a partition.** Records with the **same key** go to the same partition, so they are read in the order they were written. Across partitions there is **no global order**. If you need total order, you need a single partition (and give up parallelism).' },
      { q: 'How do you choose the number of partitions?', a: 'From the **throughput** you need per consumer and producer (partitions ≥ peak consumers in a group), plus **headroom**, because you can only **add** partitions later, and adding them **remaps keys**. Too many partitions cost broker memory, open files and slower recovery.' },
      { q: 'Can you change a record in a partition?', a: '**No.** Partitions are append-only; records are immutable. To "update" you write a **new record** with the same key; log **compaction** can later keep only the latest value per key. Records are removed only by **retention** or compaction.' },
    ],
  },
  quiz: {
    q: 'Several records are sent with key "user-42". What does Kafka guarantee?',
    options: ['They are copied to every partition', 'They land in the same partition, in the order they were sent', 'They are ordered with all other records in the topic', 'They are spread evenly across partitions'],
    answer: 1,
    why: 'Same key, same hash, same partition. A partition keeps append order, so records for one key are always read in order. There is no order across partitions.',
  },
  related: ['record', 'offset', 'key-routing'],
};
